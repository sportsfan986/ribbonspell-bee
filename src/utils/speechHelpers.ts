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

// Map strictly true spoken single-letter homophones and NATO alphabet to single characters.
// Multi-letter words like "an", "in", "as", "is", "us", "am", "if", "al", "ok" are intentionally NOT mapped
// to a single letter so that when a student spells "A - N" ("an") or "I - N" ("in"), both letters are preserved!
const SPOKEN_LETTER_MAP: Record<string, string> = {
  // A
  a: 'a',
  ay: 'a',
  aye: 'a',
  hey: 'a',
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
  cee: 'c',
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
  jee: 'g',
  ji: 'g',
  golf: 'g',
  // H
  h: 'h',
  aitch: 'h',
  ach: 'h',
  ha: 'h',
  heche: 'h',
  etch: 'h',
  hotel: 'h',
  // I
  i: 'i',
  eye: 'i',
  igh: 'i',
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
  kei: 'k',
  kilo: 'k',
  // L
  l: 'l',
  el: 'l',
  ell: 'l',
  elle: 'l',
  lima: 'l',
  // M
  m: 'm',
  em: 'm',
  emm: 'm',
  mike: 'm',
  // N
  n: 'n',
  en: 'n',
  enn: 'n',
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
  romeo: 'r',
  // S
  s: 's',
  es: 's',
  ess: 's',
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

// Non-letter conversational filler tokens to ignore during spelling
const IGNORED_FILLER_TOKENS = new Set([
  'uh',
  'um',
  'umm',
  'hmm',
  'hm',
  'er',
  'erm',
  'the',
  'word',
  'is',
  'spelled',
  'spelling',
  'please',
  'Wait',
  'wait',
]);

// Decompose a single normalized token into one or more letters (v1.00 + homophone decomposition)
function decomposeSpokenLetterToken(tok: string): string[] {
  if (!tok || IGNORED_FILLER_TOKENS.has(tok)) return [];

  if (SPOKEN_LETTER_MAP[tok]) {
    return [SPOKEN_LETTER_MAP[tok]];
  }
  if (tok === 'ñ' || tok === 'é') {
    return [tok];
  }
  if (/^[a-z-]$/.test(tok)) {
    return [tok];
  }

  // Check if token is two concatenated letter homophones (e.g. "beedee" -> b, d; "esstee" -> s, t)
  const homophoneKeys = [
    'doubleu',
    'aitch',
    'queue',
    'bee',
    'see',
    'sea',
    'cee',
    'dee',
    'eff',
    'gee',
    'eye',
    'jay',
    'kay',
    'ell',
    'emm',
    'enn',
    'owe',
    'pee',
    'pea',
    'cue',
    'are',
    'ess',
    'tee',
    'tea',
    'you',
    'vee',
    'why',
    'wye',
    'zee',
    'zed',
    'ay',
    'ee',
    'ef',
    'el',
    'em',
    'en',
    'oh',
    'ar',
    'es',
    'ex',
  ];

  for (const k1 of homophoneKeys) {
    if (tok.startsWith(k1) && tok.length > k1.length) {
      const rem = tok.slice(k1.length);
      if (SPOKEN_LETTER_MAP[rem]) {
        return [SPOKEN_LETTER_MAP[k1], SPOKEN_LETTER_MAP[rem]];
      }
    }
  }

  // Classic v1.00 character unpacking: when Google STT joins spoken letters into a short chunk
  // (e.g. "saun", "ter", "ed", "an", "in", "st"), split it cleanly into individual characters!
  if (/^[a-zñé]+$/.test(tok)) {
    return tok.split('');
  }

  return [];
}

export interface ParsedVerbalUtterance {
  saidStartWord: boolean;
  letters: string[];
  saidEndWord: boolean;
}

// Normalize raw transcript and split into clean tokens
function tokenizeSpellingTranscript(
  transcript: string,
  wordEntry: WordEntry
): { normalized: string; rawTokens: string[] } {
  const normalized = transcript
    .toLowerCase()
    .replace(/\b(letter|capital)\s+([a-z0-9])/g, '$2')
    .replace(/double\s+u/g, 'doubleu')
    .replace(/double\s+you/g, 'doubleu')
    .replace(/x\s+ray/g, 'xray')
    .replace(/n\s+tilde/g, 'ñ')
    .replace(/e\s+acute/g, 'é')
    .replace(/[.,!?;:/\\]/g, ' ')
    .trim();

  if (!normalized) {
    return { normalized: '', rawTokens: [] };
  }

  const rawTokens: string[] = [];
  for (const part of normalized.split(/\s+/).filter(Boolean)) {
    const stripped = part.replace(/[^a-z0-9ñé-]/g, '');
    if (!stripped) continue;
    if (
      stripped.includes('-') &&
      stripped.length > 2 &&
      !isFuzzyWordMatch(stripped, wordEntry)
    ) {
      rawTokens.push(...stripped.split('-').filter(Boolean));
    } else {
      rawTokens.push(stripped);
    }
  }

  return { normalized, rawTokens };
}

export function extractSpokenLettersOnly(
  transcript: string,
  wordEntry: WordEntry
): string[] {
  const parsed = parseSpokenSpelling(transcript, wordEntry, true, 0);
  return parsed.letters;
}

// Parse a spoken utterance in Letter Mode into letters and optional start/end word framing
export function parseSpokenSpelling(
  transcript: string,
  wordEntry: WordEntry,
  alreadySaidStartWord: boolean,
  currentSpelledCount: number
): ParsedVerbalUtterance {
  const { normalized, rawTokens } = tokenizeSpellingTranscript(transcript, wordEntry);

  if (!normalized || rawTokens.length === 0) {
    return { saidStartWord: false, letters: [], saidEndWord: false };
  }

  let saidStartWord = false;
  let saidEndWord = false;
  let tokens = [...rawTokens];

  // Case 1: Single-word utterance that matches the target word (e.g. saying the word at start or end)
  if (tokens.length === 1 && isFuzzyWordMatch(normalized, wordEntry)) {
    if (!alreadySaidStartWord || currentSpelledCount === 0) {
      return { saidStartWord: true, letters: [], saidEndWord: false };
    } else {
      return { saidStartWord: true, letters: [], saidEndWord: true };
    }
  }

  // Case 2: Multi-token utterance where leading token(s) are the target word ("Boat B O A T")
  if (tokens.length >= 2) {
    if (
      tokens[0].length > 1 &&
      !SPOKEN_LETTER_MAP[tokens[0]] &&
      isFuzzyWordMatch(tokens[0], wordEntry)
    ) {
      saidStartWord = true;
      tokens = tokens.slice(1);
    } else if (
      tokens.length >= 3 &&
      isFuzzyWordMatch(`${tokens[0]} ${tokens[1]}`, wordEntry)
    ) {
      saidStartWord = true;
      tokens = tokens.slice(2);
    }
  }

  // Check trailing token(s) for end word after letters ("B O A T Boat")
  if (tokens.length >= 2) {
    const lastTok = tokens[tokens.length - 1];
    if (
      lastTok.length > 1 &&
      !SPOKEN_LETTER_MAP[lastTok] &&
      isFuzzyWordMatch(lastTok, wordEntry)
    ) {
      saidEndWord = true;
      tokens = tokens.slice(0, -1);
    } else if (tokens.length >= 3) {
      const lastTwo = `${tokens[tokens.length - 2]} ${tokens[tokens.length - 1]}`;
      if (isFuzzyWordMatch(lastTwo, wordEntry)) {
        saidEndWord = true;
        tokens = tokens.slice(0, -2);
      }
    }
  }

  // Case 3: Extract letters from all remaining tokens (using v1.00 character unpacking + homophones)
  const extractedLetters: string[] = [];

  for (const tok of tokens) {
    if (tok.length > 1 && !SPOKEN_LETTER_MAP[tok] && isFuzzyWordMatch(tok, wordEntry)) {
      if (!alreadySaidStartWord && !saidStartWord && extractedLetters.length === 0) {
        saidStartWord = true;
      } else {
        saidEndWord = true;
      }
      continue;
    }

    const lettersFromTok = decomposeSpokenLetterToken(tok);
    if (lettersFromTok.length > 0) {
      extractedLetters.push(...lettersFromTok);
    }
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
  w: ['u', 'o', 'v'],
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
  _strictLetterMode: boolean
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

  // Parse each candidate with v1.00-compatible parseSpokenSpelling
  const parsedList = validCandidates.map((cand) => {
    const { rawTokens } = tokenizeSpellingTranscript(cand, wordEntry);
    const explicitSingleOrHomophoneCount = rawTokens.filter(
      (t) => t.length === 1 || Boolean(SPOKEN_LETTER_MAP[t])
    ).length;
    const parsed = parseSpokenSpelling(
      cand,
      wordEntry,
      alreadySaidStartWord,
      currentSpelledCount
    );
    return {
      parsed,
      explicitSingleOrHomophoneCount,
    };
  });

  // Prefer the N-best candidate that has the most explicit individual letters/homophones,
  // falling back to the top candidate (index 0) when tied
  let bestIdx = 0;
  let bestScore = -1;

  for (let i = 0; i < parsedList.length; i++) {
    const item = parsedList[i];
    const score =
      item.explicitSingleOrHomophoneCount * 15 +
      item.parsed.letters.length * 5 -
      i * 2;
    if (score > bestScore) {
      bestScore = score;
      bestIdx = i;
    }
  }

  const chosen = parsedList[bestIdx].parsed;

  // Collect any N-best disagreements on the last letter spoken
  const disagreements: string[] = [];
  if (chosen.letters.length > 0) {
    const lastChosen = chosen.letters[chosen.letters.length - 1];
    for (let i = 0; i < parsedList.length; i++) {
      if (i === bestIdx) continue;
      const otherLetters = parsedList[i].parsed.letters;
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
