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

// Detect voice prompts for repeat, sentence, or definition
export type VoicePromptIntent =
  | 'repeat'
  | 'sentence'
  | 'definition'
  | 'phonetic'
  | 'clear'
  | 'done'
  | null;

export function detectVoicePromptIntent(transcript: string): VoicePromptIntent {
  const lower = transcript.toLowerCase().trim();
  if (!lower) return null;

  if (
    lower.includes('repeat') ||
    lower.includes('say it again') ||
    lower.includes('say that again') ||
    lower.includes('hear the word') ||
    lower.includes('what was the word')
  ) {
    return 'repeat';
  }

  if (
    lower.includes('sentence') ||
    lower.includes('use it in a') ||
    lower.includes('example')
  ) {
    return 'sentence';
  }

  if (
    lower.includes('definition') ||
    lower.includes('what does it mean') ||
    lower.includes('meaning') ||
    lower.includes('define')
  ) {
    return 'definition';
  }

  if (lower.includes('phonetic') || lower.includes('pronunciation')) {
    return 'phonetic';
  }

  if (lower === 'clear' || lower === 'start over' || lower === 'reset') {
    return 'clear';
  }

  if (lower === 'done' || lower === 'submit' || lower === 'finished') {
    return 'done';
  }

  return null;
}

// Map spoken letter homophones to single characters
const SPOKEN_LETTER_MAP: Record<string, string> = {
  a: 'a',
  ay: 'a',
  hey: 'a',
  b: 'b',
  bee: 'b',
  be: 'b',
  c: 'c',
  see: 'c',
  sea: 'c',
  si: 'c',
  d: 'd',
  dee: 'd',
  de: 'd',
  e: 'e',
  ee: 'e',
  f: 'f',
  ef: 'f',
  eff: 'f',
  g: 'g',
  gee: 'g',
  ji: 'g',
  h: 'h',
  aitch: 'h',
  ach: 'h',
  each: 'h',
  i: 'i',
  eye: 'i',
  aye: 'i',
  j: 'j',
  jay: 'j',
  k: 'k',
  kay: 'k',
  okay: 'k',
  l: 'l',
  el: 'l',
  ell: 'l',
  m: 'm',
  em: 'm',
  am: 'm',
  n: 'n',
  en: 'n',
  and: 'n',
  in: 'n',
  o: 'o',
  oh: 'o',
  owe: 'o',
  p: 'p',
  pee: 'p',
  pea: 'p',
  q: 'q',
  cue: 'q',
  queue: 'q',
  kyu: 'q',
  r: 'r',
  ar: 'r',
  are: 'r',
  our: 'r',
  s: 's',
  es: 's',
  ess: 's',
  as: 's',
  t: 't',
  tee: 't',
  tea: 't',
  ti: 't',
  u: 'u',
  you: 'u',
  yew: 'u',
  v: 'v',
  vee: 'v',
  w: 'w',
  doubleu: 'w',
  x: 'x',
  ex: 'x',
  y: 'y',
  why: 'y',
  wye: 'y',
  z: 'z',
  zee: 'z',
  zed: 'z',
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
    .replace(/n\s+tilde/g, 'ñ')
    .replace(/e\s+acute/g, 'é')
    .replace(/[.,!?]/g, ' ')
    .trim();

  if (!normalized) {
    return { saidStartWord: false, letters: [], saidEndWord: false };
  }

  const rawTokens = normalized.split(/\s+/).filter(Boolean);
  const targetBase = normalizeBaseText(wordEntry.word).replace(/[\s-]/g, '');

  let saidStartWord = false;
  let saidEndWord = false;
  const extractedLetters: string[] = [];

  let startIndex = 0;
  let endIndex = rawTokens.length;

  // Check if first token(s) match the full target word
  if (!alreadySaidStartWord && rawTokens.length >= 1) {
    const firstToken = rawTokens[0];
    if (isFuzzyWordMatch(firstToken, wordEntry) && firstToken.length > 1) {
      saidStartWord = true;
      startIndex = 1;
    } else if (
      rawTokens.length >= 2 &&
      isFuzzyWordMatch(`${rawTokens[0]} ${rawTokens[1]}`, wordEntry)
    ) {
      saidStartWord = true;
      startIndex = 2;
    }
  }

  // Check if the final token matches the target word after letters have been spoken
  if (rawTokens.length > startIndex) {
    const lastToken = rawTokens[rawTokens.length - 1];
    const hasEnoughLetters =
      currentSpelledCount + (rawTokens.length - startIndex - 1) >=
      Math.max(2, targetBase.length - 1);

    if (
      lastToken.length >= 2 &&
      !SPOKEN_LETTER_MAP[lastToken] &&
      isFuzzyWordMatch(lastToken, wordEntry) &&
      (alreadySaidStartWord || saidStartWord) &&
      (hasEnoughLetters || currentSpelledCount >= Math.max(2, targetBase.length - 1))
    ) {
      saidEndWord = true;
      endIndex = rawTokens.length - 1;
    }
  }

  // Extract letters from the remaining middle tokens
  for (let i = startIndex; i < endIndex; i++) {
    const tok = rawTokens[i];
    if (SPOKEN_LETTER_MAP[tok]) {
      extractedLetters.push(SPOKEN_LETTER_MAP[tok]);
    } else if (tok === 'ñ' || tok === 'é') {
      extractedLetters.push(tok);
    } else if (/^[a-z-]$/.test(tok)) {
      extractedLetters.push(tok);
    } else if (/^[a-z]{2,8}$/.test(tok)) {
      // Sometimes browser ASR groups rapid letters like "r a n" or "c a t" into "ran" or "cat"
      // If we are already in the spelling letters phase, split into letters unless it is the closing word
      const isTargetMatch = isFuzzyWordMatch(tok, wordEntry);
      if (isTargetMatch && !alreadySaidStartWord && !saidStartWord && i === 0) {
        saidStartWord = true;
      } else if (
        isTargetMatch &&
        (alreadySaidStartWord || saidStartWord) &&
        currentSpelledCount + extractedLetters.length >= Math.max(2, targetBase.length - 1)
      ) {
        saidEndWord = true;
      } else {
        for (const ch of tok) {
          extractedLetters.push(ch);
        }
      }
    }
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
