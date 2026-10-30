export type BeeLevel = 1 | 2 | 3;

export type WordSource = 'school-pdf' | 'scripps-extra';

export type PracticeMode = 'verbal' | 'touchscreen';

export type VerbalPhase =
  | 'awaiting_start_word'
  | 'spelling_letters'
  | 'awaiting_end_word'
  | 'feedback';

export interface WordEntry {
  id: string;
  word: string;
  altSpellings?: string[];
  level: BeeLevel;
  source: WordSource;
  phonetic: string;
  partOfSpeech: string;
  definition: string;
  sentence: string;
}

export interface WordMasteryRecord {
  wordId: string;
  attempts: number;
  correctCount: number;
  missedCount: number;
  streak: number;
  lastAttemptAt: number;
  lastMisspelledAs?: string;
  weight: number; // Spaced repetition weight (default 1.0, missed boosts to 4.5+, mastered drops to 0.25)
}

export interface SessionAttempt {
  word: WordEntry;
  userSpelling: string;
  isCorrect: boolean;
  mode: PracticeMode;
  timestamp: number;
}
