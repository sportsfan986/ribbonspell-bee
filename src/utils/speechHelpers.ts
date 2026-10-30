import { WordEntry } from '../types/spelling';

interface AndroidSpeechBridgeLike {
  speak?: (text: string) => void;
  stopSpeaking?: () => void;
  startListening?: () => void;
  stopListening?: () => void;
}

// Speak text aloud using native Android TTS bridge (if in APK) or browser SpeechSynthesis
export function speakText(
  text: string,
  options?: { rate?: number; pitch?: number; onEnd?: () => void }
) {
  if (typeof window === 'undefined') {
    options?.onEnd?.();
    return;
  }

  const androidBridge = (
    window as unknown as { AndroidSpeechBridge?: AndroidSpeechBridgeLike }
  ).AndroidSpeechBridge;

  if (androidBridge && typeof androidBridge.speak === 'function') {
    try {
      androidBridge.speak(text);
      if (options?.onEnd) {
        setTimeout(() => options.onEnd?.(), 1200);
      }
      return;
    } catch {
      // Fall through to browser speechSynthesis
    }
  }

  if (!('speechSynthesis' in window)) {
    options?.onEnd?.();
    return;
  }

  window.speechSynthesis.cancel();
  const utterance = new SpeechSynthesisUtterance(text);
  utterance.lang = 'en-US';
  utterance.rate = options?.rate ?? 0.92;
  utterance.pitch = options?.pitch ?? 1.04;

  // Prefer high-clarity US English voices if available
  const voices = window.speechSynthesis.getVoices();
  const preferredVoice =
    voices.find(
      (v) =>
        v.lang.startsWith('en-US') &&
        (v.name.includes('Natural') ||
          v.name.includes('Samantha') ||
          v.name.includes('Google US English') ||
          v.name.includes('Aria'))
    ) || voices.find((v) => v.lang.startsWith('en'));

  if (preferredVoice) {
    utterance.voice = preferredVoice;
  }

  if (options?.onEnd) {
    utterance.onend = () => options.onEnd?.();
    utterance.onerror = () => options.onEnd?.();
  }

  window.speechSynthesis.speak(utterance);
}

// Normalize strings for comparison (strip diacritics if needed)
export function normalizeBaseText(str: string): string {
  return str
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ');
}

// Compute Levenshtein edit distance between two strings
export function levenshteinDistance(a: string, b: string): number {
  const m = a.length;
  const n = b.length;
  const dp: number[][] = Array.from({ length: m + 1 }, () =>
    Array(n + 1).fill(0)
  );

  for (let i = 0; i <= m; i++) dp[i][0] = i;
  for (let j = 0; j <= n; j++) dp[0][j] = j;

  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      dp[i][j] = Math.min(
        dp[i - 1][j] + 1,
        dp[i][j - 1] + 1,
        dp[i - 1][j - 1] + cost
      );
    }
  }
  return dp[m][n];
}

// Phonetic skeleton for fuzzy spoken word matching (handles homophones and silent letters)
function phoneticSkeleton(word: string): string {
  return normalizeBaseText(word)
    .replace(/[^a-z]/g, '')
    .replace(/^kn/, 'n')
    .replace(/^wr/, 'r')
    .replace(/^wh/, 'w')
    .replace(/ph/g, 'f')
    .replace(/gh/g, '')
    .replace(/ck/g, 'k')
    .replace(/qu/g, 'kw')
    .replace(/c(?=[eiy])/g, 's')
    .replace(/c/g, 'k')
    .replace(/z/g, 's')
    .replace(/[aeiouy]+/g, 'a')
    .replace(/(.)\1+/g, '$1');
}

// Fuzzy match whether a spoken transcript contains or matches the target word
export function isFuzzyWordMatch(transcript: string, wordEntry: WordEntry): boolean {
  const cleanedTranscript = normalizeBaseText(transcript).replace(/[.,!?]/g, '');
  if (!cleanedTranscript) return false;

  const targets = [
    normalizeBaseText(wordEntry.word),
    ...(wordEntry.altSpellings?.map(normalizeBaseText) ?? []),
  ];

  for (const target of targets) {
    if (cleanedTranscript === target || cleanedTranscript.includes(target)) {
      return true;
    }

    // Check individual words or multi-word windows in the transcript
    const words = cleanedTranscript.split(' ').filter(Boolean);
    for (const spokenWord of words) {
      if (spokenWord === target) return true;
      const dist = levenshteinDistance(spokenWord, target);
      const maxAllowed = target.length <= 4 ? 1 : target.length <= 7 ? 2 : 3;
      if (dist <= maxAllowed && spokenWord.length >= 2) {
        return true;
      }
      if (
        phoneticSkeleton(spokenWord) === phoneticSkeleton(target) &&
        phoneticSkeleton(target).length >= 2
      ) {
        return true;
      }
    }

    // Also compare full cleaned transcript if target has spaces or hyphens
    const compactTranscript = cleanedTranscript.replace(/[\s-]/g, '');
    const compactTarget = target.replace(/[\s-]/g, '');
    const fullDist = levenshteinDistance(compactTranscript, compactTarget);
    if (fullDist <= (compactTarget.length <= 5 ? 1 : 2)) {
      return true;
    }
  }

  return false;
}

// Detect voice prompts for repeat, sentence, definition, start over, or next word
export type VoicePromptIntent =
  | 'repeat'
  | 'sentence'
  | 'definition'
  | 'phonetic'
  | 'start_over'
  | 'next_word'
  | 'clear'
  | 'done'
  | null;

export function detectVoicePromptIntent(transcript: string): VoicePromptIntent {
  const lower = transcript.toLowerCase().trim();
  if (!lower) return null;

  // Start Over / Restart Word
  if (
    lower.includes('start over') ||
    lower.includes('start again') ||
    lower.includes('try again') ||
    lower.includes('restart word') ||
    lower.includes('restart') ||
    lower.includes('reset word') ||
    lower.includes('begin again')
  ) {
    return 'start_over';
  }

  // Next Word / Skip Word
  if (
    lower.includes('next word') ||
    lower === 'next' ||
    lower.includes('skip word') ||
    lower === 'skip' ||
    lower === 'pass' ||
    lower.includes('pass word')
  ) {
    return 'next_word';
  }

  // Repeat Word
  if (
    lower.includes('repeat') ||
    lower.includes('say it again') ||
    lower.includes('say that again') ||
    lower.includes('hear the word') ||
    lower.includes('what was the word') ||
    lower.includes('what is the word')
  ) {
    return 'repeat';
  }

  // Sentence
  if (
    lower.includes('sentence') ||
    lower.includes('use it in a') ||
    lower.includes('example') ||
    lower.includes('give me a sentence')
  ) {
    return 'sentence';
  }

  // Definition
  if (
    lower.includes('definition') ||
    lower.includes('what does it mean') ||
    lower.includes('meaning') ||
    lower.includes('define') ||
    lower.includes('give me the definition')
  ) {
    return 'definition';
  }

  // Phonetic Guide
  if (
    lower.includes('phonetic') ||
    lower.includes('pronunciation') ||
    lower.includes('how do you pronounce')
  ) {
    return 'phonetic';
  }

  // Clear typed letters
  if (
    lower === 'clear' ||
    lower === 'clear letters' ||
    lower === 'erase' ||
    lower === 'backspace all'
  ) {
    return 'clear';
  }

  // Finish spelling
  if (
    lower === 'done' ||
    lower === 'submit' ||
    lower === 'finished' ||
    lower === 'check spelling' ||
    lower === 'check my spelling'
  ) {
    return 'done';
  }

  return null;
}

// Map spoken letter homophones and NATO alphabet to single characters
const SPOKEN_LETTER_MAP: Record<string, string> = {
  // A
  a: 'a',
  ay: 'a',
  hey: 'a',
  ai: 'a',
  alpha: 'a',
  // B
  b: 'b',
  bee: 'b',
  be: 'b',
  bea: 'b',
  bravo: 'b',
  // C
  c: 'c',
  see: 'c',
  sea: 'c',
  si: 'c',
  charlie: 'c',
  // D
  d: 'd',
  dee: 'd',
  de: 'd',
  delta: 'd',
  // E
  e: 'e',
  ee: 'e',
  ea: 'e',
  echo: 'e',
  // F
  f: 'f',
  ef: 'f',
  eff: 'f',
  foxtrot: 'f',
  // G
  g: 'g',
  gee: 'g',
  ge: 'g',
  ji: 'g',
  golf: 'g',
  // H
  h: 'h',
  aitch: 'h',
  ach: 'h',
  each: 'h',
  ha: 'h',
  heche: 'h',
  hotel: 'h',
  // I
  i: 'i',
  eye: 'i',
  aye: 'i',
  india: 'i',
  // J
  j: 'j',
  jay: 'j',
  je: 'j',
  juliet: 'j',
  // K
  k: 'k',
  kay: 'k',
  ka: 'k',
  okay: 'k',
  kilo: 'k',
  // L
  l: 'l',
  el: 'l',
  ell: 'l',
  lima: 'l',
  // M
  m: 'm',
  em: 'm',
  emm: 'm',
  am: 'm',
  mike: 'm',
  // N
  n: 'n',
  en: 'n',
  enn: 'n',
  and: 'n',
  in: 'n',
  november: 'n',
  // O
  o: 'o',
  oh: 'o',
  owe: 'o',
  eau: 'o',
  oscar: 'o',
  // P
  p: 'p',
  pee: 'p',
  pea: 'p',
  pe: 'p',
  papa: 'p',
  // Q
  q: 'q',
  cue: 'q',
  queue: 'q',
  kyu: 'q',
  quebec: 'q',
  // R
  r: 'r',
  ar: 'r',
  are: 'r',
  arr: 'r',
  our: 'r',
  romeo: 'r',
  // S
  s: 's',
  es: 's',
  ess: 's',
  as: 's',
  sierra: 's',
  // T
  t: 't',
  tee: 't',
  tea: 't',
  te: 't',
  ti: 't',
  tango: 't',
  // U
  u: 'u',
  you: 'u',
  yew: 'u',
  yu: 'u',
  uniform: 'u',
  // V
  v: 'v',
  vee: 'v',
  ve: 'v',
  victor: 'v',
  // W
  w: 'w',
  doubleu: 'w',
  'double-u': 'w',
  'double u': 'w',
  whiskey: 'w',
  // X
  x: 'x',
  ex: 'x',
  ecks: 'x',
  xray: 'x',
  'x-ray': 'x',
  // Y
  y: 'y',
  why: 'y',
  wye: 'y',
  yankee: 'y',
  // Z
  z: 'z',
  zee: 'z',
  zed: 'z',
  zulu: 'z',
  // Punctuation & Diacritics
  hyphen: '-',
  dash: '-',
  minus: '-',
  space: ' ',
};

export interface ParsedVerbalUtterance {
  saidStartWord: boolean;
  letters: string[];
  saidEndWord: boolean;
}

// Parse a spoken utterance for letters and start/end word confirmations
// Treating spoken words and spoken letters independently so saying "Boat B-O-A-T Boat"
// cleanly recognizes: Start Word ("Boat"), Letters (['b', 'o', 'a', 't']), End Word ("Boat")
export function parseSpokenSpelling(
  transcript: string,
  wordEntry: WordEntry,
  alreadySaidStartWord: boolean,
  currentSpelledCount: number
): ParsedVerbalUtterance {
  const normalized = transcript
    .toLowerCase()
    .replace(/double\s+u/g, 'doubleu')
    .replace(/double\s+you/g, 'doubleu')
    .replace(/x\s+ray/g, 'xray')
    .replace(/n\s+tilde/g, 'ñ')
    .replace(/e\s+acute/g, 'é')
    .replace(/[.,!?]/g, ' ')
    .trim();

  if (!normalized) {
    return { saidStartWord: false, letters: [], saidEndWord: false };
  }

  // Pre-split tokens, handling hyphenated letter sequences like "b-o-a-t"
  const rawTokens: string[] = [];
  for (const part of normalized.split(/\s+/).filter(Boolean)) {
    if (part.includes('-') && part.length > 2 && !isFuzzyWordMatch(part, wordEntry)) {
      rawTokens.push(...part.split('-').filter(Boolean));
    } else {
      rawTokens.push(part);
    }
  }

  let saidStartWord = false;
  let saidEndWord = false;
  let tokens = [...rawTokens];

  // Case 1: Entire utterance is purely the target word
  if (tokens.length >= 1 && isFuzzyWordMatch(normalized, wordEntry)) {
    if (!alreadySaidStartWord || currentSpelledCount === 0) {
      return { saidStartWord: true, letters: [], saidEndWord: false };
    } else {
      return { saidStartWord: true, letters: [], saidEndWord: true };
    }
  }

  // Case 2: Multi-token utterance (e.g. "Boat B O A T Boat" or "Boat B O A T")
  // Check leading token(s) for start word
  if (tokens.length >= 1) {
    if (isFuzzyWordMatch(tokens[0], wordEntry) && tokens[0].length > 1) {
      saidStartWord = true;
      tokens = tokens.slice(1);
    } else if (
      tokens.length >= 2 &&
      isFuzzyWordMatch(`${tokens[0]} ${tokens[1]}`, wordEntry)
    ) {
      saidStartWord = true;
      tokens = tokens.slice(2);
    }
  }

  // Check trailing token(s) for end word after letters
  if (tokens.length >= 1) {
    const lastTok = tokens[tokens.length - 1];
    if (
      lastTok.length > 1 &&
      !SPOKEN_LETTER_MAP[lastTok] &&
      isFuzzyWordMatch(lastTok, wordEntry)
    ) {
      saidEndWord = true;
      tokens = tokens.slice(0, -1);
    } else if (tokens.length >= 2) {
      const lastTwo = `${tokens[tokens.length - 2]} ${tokens[tokens.length - 1]}`;
      if (isFuzzyWordMatch(lastTwo, wordEntry)) {
        saidEndWord = true;
        tokens = tokens.slice(0, -2);
      }
    }
  }

  // Case 3: Parse remaining middle tokens strictly as letters
  // Spoken words are never dumped as letters!
  const extractedLetters: string[] = [];

  for (const tok of tokens) {
    if (SPOKEN_LETTER_MAP[tok]) {
      extractedLetters.push(SPOKEN_LETTER_MAP[tok]);
    } else if (tok === 'ñ' || tok === 'é') {
      extractedLetters.push(tok);
    } else if (/^[a-z-]$/.test(tok)) {
      extractedLetters.push(tok);
    } else if (isFuzzyWordMatch(tok, wordEntry)) {
      // It's the target word repeated in speech - consume as word, not letters!
      if (!alreadySaidStartWord && !saidStartWord && extractedLetters.length === 0) {
        saidStartWord = true;
      } else {
        saidEndWord = true;
      }
    }
    // Any other arbitrary non-letter words (e.g. "uh", "the", "um") are deliberately ignored!
  }

  return {
    saidStartWord,
    letters: extractedLetters,
    saidEndWord,
  };
}

export interface LetterDiffItem {
  char: string;
  expectedChar?: string;
  status: 'correct' | 'wrong' | 'missing' | 'extra';
}

export interface SpellingValidationResult {
  isCorrect: boolean;
  matchedSpelling: string;
  diff: LetterDiffItem[];
}

// Validate a student's spelling against official spelling and accepted alternates
export function validateSpelling(
  userSpelling: string,
  wordEntry: WordEntry
): SpellingValidationResult {
  const cleanUser = userSpelling.trim().replace(/\s+/g, ' ');
  const candidates = [wordEntry.word, ...(wordEntry.altSpellings ?? [])];

  // Check exact case-insensitive match or diacritic-normalized match
  for (const candidate of candidates) {
    if (
      cleanUser.toLowerCase() === candidate.toLowerCase() ||
      normalizeBaseText(cleanUser) === normalizeBaseText(candidate)
    ) {
      const diff: LetterDiffItem[] = candidate.split('').map((ch) => ({
        char: ch,
        expectedChar: ch,
        status: 'correct',
      }));
      return {
        isCorrect: true,
        matchedSpelling: candidate,
        diff,
      };
    }
  }

  // Constructive character-by-character alignment with the primary spelling
  const target = wordEntry.word;
  const maxLen = Math.max(cleanUser.length, target.length);
  const diff: LetterDiffItem[] = [];

  for (let i = 0; i < maxLen; i++) {
    const uChar = cleanUser[i];
    const tChar = target[i];

    if (uChar !== undefined && tChar !== undefined) {
      const isMatch =
        uChar.toLowerCase() === tChar.toLowerCase() ||
        normalizeBaseText(uChar) === normalizeBaseText(tChar);
      diff.push({
        char: uChar,
        expectedChar: tChar,
        status: isMatch ? 'correct' : 'wrong',
      });
    } else if (uChar === undefined && tChar !== undefined) {
      diff.push({
        char: '_',
        expectedChar: tChar,
        status: 'missing',
      });
    } else if (uChar !== undefined && tChar === undefined) {
      diff.push({
        char: uChar,
        status: 'extra',
      });
    }
  }

  return {
    isCorrect: false,
    matchedSpelling: target,
    diff,
  };
}
