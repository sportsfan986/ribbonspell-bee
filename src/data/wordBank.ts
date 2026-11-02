import { BeeLevel, WordEntry, WordMasteryRecord, WordSource } from '../types/spelling';
import { ONE_BEE_WORDS } from './oneBeeWords';
import { TWO_BEE_WORDS } from './twoBeeWords';
import { THREE_BEE_WORDS } from './threeBeeWords';

export const ALL_WORDS: WordEntry[] = [
  ...ONE_BEE_WORDS,
  ...TWO_BEE_WORDS,
  ...THREE_BEE_WORDS,
];

export type SourceFilterOption = 'all' | WordSource | 'missed-only';
export type LevelFilterOption = 'all' | BeeLevel;

export function filterWordPool(
  levelFilter: LevelFilterOption,
  sourceFilter: SourceFilterOption,
  masteryMap: Record<string, WordMasteryRecord>
): WordEntry[] {
  return ALL_WORDS.filter((entry) => {
    if (levelFilter !== 'all' && entry.level !== levelFilter) {
      return false;
    }
    if (sourceFilter === 'school-pdf' && entry.source !== 'school-pdf') {
      return false;
    }
    if (sourceFilter === 'scripps-extra' && entry.source !== 'scripps-extra') {
      return false;
    }
    if (sourceFilter === 'missed-only') {
      const stats = masteryMap[entry.id];
      return Boolean(stats && stats.missedCount > 0 && stats.streak < 2);
    }
    return true;
  });
}

/**
 * Selects the next word using weighted spaced repetition:
 * - Words in the short-term missed re-queue that are due get immediate priority
 * - Otherwise, words are sampled proportionally to their weight:
 *   - Missed words carry weight 4.5 + (missedCount * 1.5), making them 5x–10x more likely to appear
 *   - Unseen words carry weight 1.3
 *   - Mastered words (streak >= 2) drop to weight 0.25
 */
export function selectNextWordWeighted(
  pool: WordEntry[],
  masteryMap: Record<string, WordMasteryRecord>,
  currentWordId: string | null,
  shortTermRetryQueue: { wordId: string; dueInCount: number }[]
): { nextWord: WordEntry; updatedQueue: { wordId: string; dueInCount: number }[] } {
  if (pool.length === 0) {
    return { nextWord: ALL_WORDS[0], updatedQueue: [] };
  }

  // Decrement counters in short-term retry queue
  const tickedQueue = shortTermRetryQueue.map((item) => ({
    ...item,
    dueInCount: item.dueInCount - 1,
  }));

  // Check if any due word in the retry queue is in the current filtered pool
  const dueIdx = tickedQueue.findIndex(
    (item) =>
      item.dueInCount <= 0 &&
      item.wordId !== currentWordId &&
      pool.some((w) => w.id === item.wordId)
  );

  if (dueIdx !== -1) {
    const dueItem = tickedQueue[dueIdx];
    const matched = pool.find((w) => w.id === dueItem.wordId)!;
    const remainingQueue = tickedQueue.filter((_, idx) => idx !== dueIdx);
    return { nextWord: matched, updatedQueue: remainingQueue };
  }

  const candidates =
    pool.length > 1 ? pool.filter((w) => w.id !== currentWordId) : pool;

  const weights = candidates.map((entry) => {
    const rec = masteryMap[entry.id];
    if (!rec) return 1.35; // Unseen words slightly prioritized over already-correct words
    if (rec.missedCount > 0 && rec.streak < 2) {
      return Math.min(12, Math.max(4.5, rec.weight));
    }
    return Math.max(0.2, rec.weight);
  });

  const totalWeight = weights.reduce((acc, w) => acc + w, 0);
  let rand = Math.random() * totalWeight;

  for (let i = 0; i < candidates.length; i++) {
    rand -= weights[i];
    if (rand <= 0) {
      return { nextWord: candidates[i], updatedQueue: tickedQueue };
    }
  }

  return {
    nextWord: candidates[candidates.length - 1],
    updatedQueue: tickedQueue,
  };
}
