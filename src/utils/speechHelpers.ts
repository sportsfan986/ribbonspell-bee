import { WordEntry } from '../types/spelling';

interface AndroidSpeechBridgeLike {
  speak?: (text: string) => void;
  stopSpeaking?: () => void;
  startListening?: (mode?: string) => void;
  startListeningMode?: (mode: string) => void;
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

  // Hook for native android TTS onDone callback
  let fallbackTimer: NodeJS.Timeout | null = null;
  const onDoneHandler = () => {
    if (fallbackTimer) {
      clearTimeout(fallbackTimer);
      fallbackTimer = null;
    }
    (window as unknown as { onAndroidTTSDone?: (() => void) | null }).onAndroidTTSDone = null;
    options?.onEnd?.();
  };

  (window as unknown as { onAndroidTTSDone?: (() => void) | null }).onAndroidTTSDone = onDoneHandler;

  const androidBridge = (
    window as unknown as { AndroidSpeechBridge?: AndroidSpeechBridgeLike }
  ).AndroidSpeechBridge;

  if (androidBridge && typeof androidBridge.speak === 'function') {
    try {
      androidBridge.speak(text);
      if (options?.onEnd) {
        // Fallback timer just in case utterance listener isn't fired
        const estimatedMs = Math.max(
          1100,
          Math.round((text.trim().split(/\s+/).length / 2.2) * 1000)
        );
        fallbackTimer = setTimeout(onDoneHandler, estimatedMs);
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

// Check if a single token or short phrase is a close match for the target word
export function isWordMatch(tokenOrPhrase: string, wordEntry: WordEntry): boolean {
  const cleaned = normalizeBaseText(tokenOrPhrase).replace(/[.,!?]/g, '').trim();
  if (!cleaned) return false;

  const targets = [
    normalizeBaseText(wordEntry.word),
    ...(wordEntry.altSpellings?.map(normalizeBaseText) ?? []),
  ];

  for (const target of targets) {
    if (cleaned === target) return true;

    const compactTarget = target.replace(/[\s-]/g, '');
    const compactCleaned = cleaned.replace(/[\s-]/g, '');
    if (compactCleaned === compactTarget) return true;

    // Word count sanity check: don't match a multi-word phrase against a 1-word target
    const cleanedWords = cleaned.split(/\s+/).filter(Boolean);
    const targetWords = target.split(/\s+/).filter(Boolean);
    if (cleanedWords.length > targetWords.length) {
      continue;
    }

    // Crucial check: length difference MUST NOT exceed 1 character!
    // Prevents matching phrases that have extra letters spoken after the word (e.g. "sauntered s" or "boat b")
    if (Math.abs(compactCleaned.length - compactTarget.length) > 1) {
      continue;
    }

    const dist = levenshteinDistance(compactCleaned, compactTarget);
    const maxAllowed = compactTarget.length <= 4 ? 1 : 2;
    if (dist <= maxAllowed && compactCleaned.length >= 2) {
      return true;
    }

    if (
      compactCleaned.length >= 3 &&
      Math.abs(compactCleaned.length - compactTarget.length) <= 1 &&
      phoneticSkeleton(compactCleaned) === phoneticSkeleton(compactTarget) &&
      phoneticSkeleton(compactTarget).length >= 2
    ) {
      return true;
    }
  }

  return false;
}

// Fuzzy match whether a spoken transcript contains or matches the target word
export function isFuzzyWordMatch(transcript: string, wordEntry: WordEntry): boolean {
  return isWordMatch(transcript, wordEntry);
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

  // Start Over / Restart Word / Try Again
  if (
    lower.includes('start over') ||
    lower.includes('start again') ||
    lower.includes('try again') ||
    lower.includes('try it again') ||
    lower.includes('practice again') ||
    lower.includes('practice word again') ||
    lower.includes('retry') ||
    lower.includes('restart word') ||
    lower.includes('restart') ||
    lower.includes('reset word') ||
    lower.includes('begin again') ||
    lower === 'again'
  ) {
    return 'start_over';
  }

  // Next Word / Skip Word / Continue
  if (
    lower.includes('next word') ||
    lower === 'next' ||
    lower === 'continue' ||
    lower.includes('move on') ||
    lower.includes('advance') ||
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
  aye: 'a',
  hey: 'a',
  ai: 'a',
  ey: 'a',
  eh: 'a',
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
  if: 'f',
  off: 'f',
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
  '8': 'h',
  eight: 'h',
  age: 'h',
  etch: 'h',
  ait: 'h',
  // I
  i: 'i',
  eye: 'i',
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
  ok: 'k',
  kilo: 'k',
  // L
  l: 'l',
  el: 'l',
  ell: 'l',
  al: 'l',
  lima: 'l',
  // M
  m: 'm',
  em: 'm',
  emm: 'm',
  am: 'm',
  um: 'm',
  mike: 'm',
  // N
  n: 'n',
  en: 'n',
  enn: 'n',
  an: 'n',
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
  kew: 'q',
  quebec: 'q',
  // R
  r: 'r',
  ar: 'r',
  are: 'r',
  arr: 'r',
  our: 'r',
  hour: 'r',
  romeo: 'r',
  // S
  s: 's',
  es: 's',
  ess: 's',
  as: 's',
  us: 's',
  is: 's',
  ice: 's',
  yes: 's',
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
  axe: 'x',
  // Y
  y: 'y',
  why: 'y',
  wye: 'y',
  wi: 'y',
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

// Extract strictly spoken letters, single characters, or NATO/homophone tokens,
// completely ignoring any spoken words (such as saying the target word or fillers).
export function extractSpokenLettersOnly(
  transcript: string,
  wordEntry: WordEntry
): string[] {
  const normalized = transcript
    .toLowerCase()
    .replace(/\b(letter|capital)\s+([a-z0-9])/g, '$2')
    .replace(/double\s+u/g, 'doubleu')
    .replace(/double\s+you/g, 'doubleu')
    .replace(/x\s+ray/g, 'xray')
    .replace(/n\s+tilde/g, 'ñ')
    .replace(/e\s+acute/g, 'é')
    .replace(/[.,!?]/g, ' ')
    .trim();

  if (!normalized) return [];

  // Split tokens by spaces and hyphens if hyphenated like "b-o-a-t"
  const rawTokens: string[] = [];
  for (const part of normalized.split(/\s+/).filter(Boolean)) {
    const stripped = part.replace(/[^a-z0-9ñé-]/g, '');
    if (!stripped) continue;
    if (stripped.includes('-') && stripped.length > 2) {
      rawTokens.push(...stripped.split('-').filter(Boolean));
    } else {
      rawTokens.push(stripped);
    }
  }

  const extracted: string[] = [];
  const targetLower = wordEntry.word.toLowerCase();
  const altLowers = (wordEntry.altSpellings ?? []).map((s) => s.toLowerCase());

  for (const tok of rawTokens) {
    const cleanTok = tok.trim();
    if (!cleanTok) continue;

    // If the token matches the whole target word (e.g. saying "mute" at start or end),
    // IGNORE it completely so it is never unpacked or counted as letters!
    if (
      cleanTok === targetLower ||
      altLowers.includes(cleanTok) ||
      isWordMatch(cleanTok, wordEntry)
    ) {
      continue;
    }

    // Check if token is in SPOKEN_LETTER_MAP
    if (SPOKEN_LETTER_MAP[cleanTok]) {
      extracted.push(SPOKEN_LETTER_MAP[cleanTok]);
      continue;
    }

    // Direct single letter character (a-z, ñ, é, -)
    if (/^[a-zñé-]$/.test(cleanTok)) {
      extracted.push(cleanTok);
      continue;
    }

    // Common two-letter contractions/fillers are ignored
  }

  return extracted;
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
    .replace(/\b(letter|capital)\s+([a-z0-9])/g, '$2')
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
    const stripped = part.replace(/[^a-z0-9ñé-]/g, '');
    if (!stripped) continue;
    if (stripped.includes('-') && stripped.length > 2 && !isFuzzyWordMatch(stripped, wordEntry)) {
      rawTokens.push(...stripped.split('-').filter(Boolean));
    } else {
      rawTokens.push(stripped);
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
    // Any other arbitrary non-letter words are deliberately ignored!
  }

  return {
    saidStartWord,
    letters: extractedLetters,
    saidEndWord,
  };
}

// Acoustic lookalike groups for E-set, A-set, nasal, and fricative letters
export const ACOUSTIC_CONFUSION_MAP: Record<string, string[]> = {
  a: ['h', 'j', 'k', 'e', 'i'],
  b: ['v', 'p', 'd', 'e', 't', 'c', 'g'],
  c: ['z', 's', 't', 'b', 'd', 'e', 'v'],
  d: ['t', 'b', 'p', 'v', 'e', 'g', 'c'],
  e: ['b', 'd', 'p', 't', 'v', 'c', 'g', 'i'],
  f: ['s', 'x', 'l', 'm', 'n', 'v'],
  g: ['j', 'd', 'b', 't', 'c', 'e', 'z'],
  h: ['a', 'j', 'k', 'f', 's'],
  i: ['y', 'a', 'e', 'r'],
  j: ['g', 'a', 'k', 'h', 'z'],
  k: ['a', 'j', 'h', 'c', 'q', 't'],
  l: ['m', 'n', 'r', 'f', 'o'],
  m: ['n', 'l', 'f', 'b'],
  n: ['m', 'l', 'f', 'd', 'a'],
  o: ['u', 'l', 'r', 'w'],
  p: ['b', 't', 'd', 'v', 'e', 'c'],
  q: ['u', 'k', 'c', 't'],
  r: ['i', 'o', 'l', 'a'],
  s: ['f', 'x', 'c', 'z'],
  t: ['d', 'p', 'b', 'c', 'e', 'g'],
  u: ['q', 'o', 'w', 'y'],
  v: ['b', 'z', 'd', 'p', 'e', 'f', 'c'],
  w: ['u', 'o', 'doubleu' === 'w' ? 'v' : 'v'],
  x: ['s', 'f', 'z', 'c', 'k'],
  y: ['i', 'u', 'w', 'a'],
  z: ['v', 'c', 's', 'b', 'd', 'g'],
};

// Return top acoustic alternatives for a recognized letter, prioritizing any N-best STT disagreements
export function getAcousticAlternatives(
  letter: string,
  nBestDisagreements: string[] = [],
  maxCount: number = 5
): string[] {
  const lower = letter.toLowerCase();
  const seen = new Set<string>([lower]);
  const result: string[] = [];

  for (const alt of nBestDisagreements) {
    const clean = alt.toLowerCase();
    if (/^[a-z]$/.test(clean) && !seen.has(clean)) {
      seen.add(clean);
      result.push(clean);
    }
  }

  const group = ACOUSTIC_CONFUSION_MAP[lower] ?? [];
  for (const neighbor of group) {
    if (/^[a-z]$/.test(neighbor) && !seen.has(neighbor)) {
      seen.add(neighbor);
      result.push(neighbor);
      if (result.length >= maxCount) break;
    }
  }

  return result.slice(0, maxCount);
}

// Mask the target word and its alternate spellings in any live transcript preview
// so the UI NEVER leaks the spelling of the target word before submission
export function maskTargetWordInTranscript(
  transcript: string,
  wordEntry: WordEntry
): string {
  if (!transcript.trim()) return '';
  const tokens = transcript.trim().split(/\s+/);
  const masked = tokens.map((tok) => {
    const clean = tok.replace(/[^a-zA-ZñÑéÉ-]/g, '');
    if (clean.length >= 2 && isWordMatch(clean, wordEntry)) {
      return '[word spoken]';
    }
    return tok;
  });
  return masked.join(' ');
}

export interface NBestLetterExtractionResult {
  letters: string[];
  nBestDisagreements: string[];
  saidStartWord: boolean;
  saidEndWord: boolean;
}

// Evaluate all N-best speech recognition hypotheses to extract the clearest letter sequence
export function extractLettersFromNBest(
  candidates: string[],
  wordEntry: WordEntry,
  alreadySaidStartWord: boolean,
  currentSpelledCount: number,
  strictLetterMode: boolean
): NBestLetterExtractionResult {
  const validCandidates = candidates.map((c) => c.trim()).filter(Boolean);
  if (validCandidates.length === 0) {
    return {
      letters: [],
      nBestDisagreements: [],
      saidStartWord: false,
      saidEndWord: false,
    };
  }

  // Parse each candidate with standard parseSpokenSpelling
  const parsedList = validCandidates.map((cand) =>
    parseSpokenSpelling(cand, wordEntry, alreadySaidStartWord, currentSpelledCount)
  );

  // Choose the candidate that extracted the most explicit spoken letters
  let bestIdx = 0;
  let bestScore = -1;

  for (let i = 0; i < parsedList.length; i++) {
    const p = parsedList[i];
    // Favor earlier N-best rank slightly via tie-breaker, but strongly prefer candidates that parsed explicit letters
    const score = p.letters.length * 10 - i;
    if (score > bestScore) {
      bestScore = score;
      bestIdx = i;
    }
  }

  let chosen = parsedList[bestIdx];

  // Fallback for strict Letter Recognition Mode:
  // If STT merged a short sequence of spoken letters into a single short non-command, non-target word
  // (e.g. user said "B E D" and all candidates only contain "bed"), unpack short 2-3 char tokens if safe
  if (strictLetterMode && chosen.letters.length === 0) {
    const topRaw = validCandidates[0].toLowerCase().trim();
    if (!detectVoicePromptIntent(topRaw) && !isFuzzyWordMatch(topRaw, wordEntry)) {
      const words = topRaw.split(/\s+/).filter(Boolean);
      const fallbackLetters: string[] = [];
      for (const w of words) {
        const cleanW = w.replace(/[^a-z]/g, '');
        if (!cleanW || isWordMatch(cleanW, wordEntry)) continue;
        if (SPOKEN_LETTER_MAP[cleanW]) {
          fallbackLetters.push(SPOKEN_LETTER_MAP[cleanW]);
        } else if (cleanW.length >= 2 && cleanW.length <= 3) {
          // Unpack 2-3 letter merged syllable in strict Letter Mode (e.g. "be", "bed", "cat")
          fallbackLetters.push(...cleanW.split(''));
        }
      }
      if (fallbackLetters.length > 0) {
        chosen = {
          ...chosen,
          letters: fallbackLetters,
        };
      }
    }
  }

  // Collect any N-best disagreements on the last letter spoken
  const disagreements: string[] = [];
  if (chosen.letters.length > 0) {
    const lastChosen = chosen.letters[chosen.letters.length - 1];
    for (let i = 0; i < parsedList.length; i++) {
      if (i === bestIdx) continue;
      const otherLetters = parsedList[i].letters;
      if (otherLetters.length > 0) {
        const otherLast = otherLetters[otherLetters.length - 1];
        if (
          otherLast &&
          otherLast !== lastChosen &&
          /^[a-z]$/.test(otherLast) &&
          !disagreements.includes(otherLast)
        ) {
          disagreements.push(otherLast);
        }
      }
    }
  }

  return {
    letters: chosen.letters,
    nBestDisagreements: disagreements,
    saidStartWord: chosen.saidStartWord,
    saidEndWord: chosen.saidEndWord,
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
