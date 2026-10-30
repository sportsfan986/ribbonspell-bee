import React from 'react';
import {
  Award,
  CheckCircle2,
  AlertTriangle,
  RotateCcw,
  Play,
  Volume2,
} from 'lucide-react';
import {
  SessionAttempt,
  WordEntry,
  WordMasteryRecord,
} from '../types/spelling';
import { speakText } from '../utils/speechHelpers';

interface MasteryDashboardViewProps {
  words: WordEntry[];
  masteryMap: Record<string, WordMasteryRecord>;
  sessionHistory: SessionAttempt[];
  onPracticeWord: (word: WordEntry) => void;
  onResetStats: () => void;
}

export const MasteryDashboardView: React.FC<MasteryDashboardViewProps> = ({
  words,
  masteryMap,
  sessionHistory,
  onPracticeWord,
  onResetStats,
}) => {
  const records = Object.values(masteryMap);
  const totalAttempts = records.reduce((sum, r) => sum + r.attempts, 0);
  const totalCorrect = records.reduce((sum, r) => sum + r.correctCount, 0);
  const totalMissed = records.reduce((sum, r) => sum + r.missedCount, 0);
  const overallAccuracy =
    totalAttempts > 0 ? Math.round((totalCorrect / totalAttempts) * 100) : 100;

  const masteredWordsCount = records.filter(
    (r) => r.correctCount > 0 && r.streak >= 1
  ).length;
  const highPriorityMissedWords = words
    .filter((w) => {
      const r = masteryMap[w.id];
      return r && r.missedCount > 0 && r.streak < 2;
    })
    .sort((a, b) => (masteryMap[b.id]?.weight ?? 1) - (masteryMap[a.id]?.weight ?? 1));

  // Breakdown by Bee level
  const levelStats = ([1, 2, 3] as const).map((lvl) => {
    const levelWords = words.filter((w) => w.level === lvl);
    const practicedInLevel = levelWords.filter((w) => masteryMap[w.id]?.attempts > 0);
    const masteredInLevel = levelWords.filter(
      (w) => (masteryMap[w.id]?.correctCount ?? 0) > 0 && (masteryMap[w.id]?.streak ?? 0) >= 1
    );
    return {
      level: lvl,
      label: lvl === 1 ? 'One Bee' : lvl === 2 ? 'Two Bee' : 'Three Bee',
      totalWords: levelWords.length,
      practiced: practicedInLevel.length,
      mastered: masteredInLevel.length,
    };
  });

  return (
    <div className="space-y-6">
      {/* Top Summary Banner */}
      <div className="bg-white/60 backdrop-blur-xs border border-pink-200/80 rounded-2xl p-6 shadow-2xs flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-display font-bold text-[#1E1B4B]">
            Speller Mastery & Spaced-Repetition Tracker
          </h1>
          <p className="text-sm text-slate-600 mt-1">
            Your progress is automatically saved across sessions. Missed words receive boosted weight so they reappear more frequently until mastered.
          </p>
        </div>

        {totalAttempts > 0 && (
          <button
            type="button"
            onClick={onResetStats}
            className="min-h-[40px] px-4 py-2 rounded-xl bg-rose-50 hover:bg-rose-100 border border-rose-200 text-xs font-semibold text-rose-800 transition-colors cursor-pointer flex items-center gap-1.5 whitespace-nowrap shrink-0 self-start md:self-auto"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            <span>Reset All Progress</span>
          </button>
        )}
      </div>

      {/* 4-Column Quantitative KPI Strip */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white/60 backdrop-blur-xs border border-pink-200/80 rounded-2xl p-5">
          <p className="text-xs font-semibold text-slate-500">Overall Accuracy</p>
          <p className="text-3xl font-display font-bold text-[#1E1B4B] font-mono-tabular mt-1">
            {overallAccuracy}%
          </p>
          <p className="text-xs text-slate-500 mt-1 font-mono-tabular">
            {totalCorrect} correct of {totalAttempts} attempts
          </p>
        </div>

        <div className="bg-white/60 backdrop-blur-xs border border-pink-200/80 rounded-2xl p-5">
          <p className="text-xs font-semibold text-slate-500">Words Mastered</p>
          <p className="text-3xl font-display font-bold text-emerald-700 font-mono-tabular mt-1">
            {masteredWordsCount}
          </p>
          <p className="text-xs text-slate-500 mt-1 font-mono-tabular">
            Out of {words.length} total study words
          </p>
        </div>

        <div className="bg-white/60 backdrop-blur-xs border border-pink-200/80 rounded-2xl p-5">
          <p className="text-xs font-semibold text-slate-500">Priority Review Queue</p>
          <p className="text-3xl font-display font-bold text-rose-700 font-mono-tabular mt-1">
            {highPriorityMissedWords.length}
          </p>
          <p className="text-xs text-slate-500 mt-1 font-mono-tabular">
            {totalMissed} total missed attempts logged
          </p>
        </div>

        <div className="bg-white/60 backdrop-blur-xs border border-pink-200/80 rounded-2xl p-5">
          <p className="text-xs font-semibold text-slate-500">Current Session Words</p>
          <p className="text-3xl font-display font-bold text-sky-700 font-mono-tabular mt-1">
            {sessionHistory.length}
          </p>
          <p className="text-xs text-slate-500 mt-1 font-mono-tabular">
            Completed in this sitting
          </p>
        </div>
      </div>

      {/* Tier Progress Breakdown */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {levelStats.map((tier) => {
          const pct = Math.round((tier.mastered / tier.totalWords) * 100);
          return (
            <div
              key={tier.level}
              className="bg-white/60 backdrop-blur-xs border border-pink-200/80 rounded-2xl p-5 space-y-3"
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Award className="w-5 h-5 text-pink-600" />
                  <h3 className="text-base font-display font-bold text-[#1E1B4B]">
                    {tier.label} Difficulty
                  </h3>
                </div>
                <span className="text-xs font-mono-tabular text-slate-600">
                  {tier.mastered} / {tier.totalWords} words
                </span>
              </div>

              <div className="w-full h-2.5 bg-pink-100/80 rounded-full overflow-hidden">
                <div
                  className="h-full bg-gradient-to-r from-pink-500 to-sky-500 rounded-full transition-all"
                  style={{ width: `${Math.max(pct, tier.mastered > 0 ? 4 : 0)}%` }}
                />
              </div>

              <p className="text-xs text-slate-500 font-mono-tabular">
                {tier.practiced} practiced · {pct}% mastered
              </p>
            </div>
          );
        })}
      </div>

      {/* High-Priority Missed Words & Recent Session Log */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Adaptive Spaced Repetition Queue */}
        <div className="bg-white/60 backdrop-blur-xs border border-pink-200/80 rounded-2xl p-5 space-y-4">
          <div>
            <h2 className="text-lg font-display font-bold text-[#1E1B4B]">
              Boosted Spaced-Repetition Words
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              These missed words carry a higher selection probability in your current and future practice sessions.
            </p>
          </div>

          {highPriorityMissedWords.length === 0 ? (
            <div className="py-8 text-center text-sm text-slate-500">
              No words currently waiting in the missed review queue. Great job!
            </div>
          ) : (
            <div className="divide-y divide-pink-100">
              {highPriorityMissedWords.slice(0, 10).map((word) => {
                const rec = masteryMap[word.id];
                return (
                  <div
                    key={word.id}
                    className="py-3 flex items-center justify-between gap-3"
                  >
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-display font-bold text-base text-[#1E1B4B]">
                          {word.word}
                        </span>
                        <span className="text-xs text-slate-500 font-mono-tabular">
                          /{word.phonetic}/
                        </span>
                      </div>
                      <p className="text-xs text-rose-700 font-mono-tabular mt-0.5">
                        Missed {rec.missedCount}× · Priority weight: {rec.weight.toFixed(1)}×
                        {rec.lastMisspelledAs
                          ? ` · Last typed: "${rec.lastMisspelledAs}"`
                          : ''}
                      </p>
                    </div>

                    <div className="flex items-center gap-2 shrink-0">
                      <button
                        type="button"
                        onClick={() => speakText(word.word)}
                        className="min-h-[36px] min-w-[36px] rounded-xl bg-sky-50 hover:bg-sky-100 text-sky-700 flex items-center justify-center cursor-pointer"
                        aria-label={`Pronounce ${word.word}`}
                      >
                        <Volume2 className="w-4 h-4" />
                      </button>
                      <button
                        type="button"
                        onClick={() => onPracticeWord(word)}
                        className="min-h-[36px] px-3 py-1.5 rounded-xl bg-pink-600 hover:bg-pink-700 text-white text-xs font-semibold flex items-center gap-1 cursor-pointer whitespace-nowrap"
                      >
                        <Play className="w-3.5 h-3.5" />
                        <span>Practice Now</span>
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Recent Session Attempts Log */}
        <div className="bg-white/60 backdrop-blur-xs border border-pink-200/80 rounded-2xl p-5 space-y-4">
          <div>
            <h2 className="text-lg font-display font-bold text-[#1E1B4B]">
              Recent Practice Log
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Side-by-side record of words attempted during your current session.
            </p>
          </div>

          {sessionHistory.length === 0 ? (
            <div className="py-8 text-center text-sm text-slate-500">
              Complete your first word on the Practice Stage to see your live session log here.
            </div>
          ) : (
            <div className="divide-y divide-pink-100 max-h-[360px] overflow-y-auto pr-1">
              {sessionHistory.map((item, idx) => (
                <div
                  key={`${item.word.id}-${idx}`}
                  className="py-3 flex items-center justify-between gap-3"
                >
                  <div className="flex items-start gap-2.5">
                    {item.isCorrect ? (
                      <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-1" />
                    ) : (
                      <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0 mt-1" />
                    )}
                    <div>
                      <p className="text-sm font-display font-bold text-[#1E1B4B]">
                        {item.word.word}
                      </p>
                      <p className="text-xs text-slate-500 font-mono-tabular">
                        {item.isCorrect
                          ? `Spelled correctly (${item.mode})`
                          : `Entered "${item.userSpelling}" → Official: "${item.word.word}"`}
                      </p>
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={() => onPracticeWord(item.word)}
                    className="min-h-[34px] px-2.5 py-1 rounded-lg bg-pink-50 hover:bg-pink-100 text-pink-800 text-xs font-semibold cursor-pointer whitespace-nowrap shrink-0"
                  >
                    Retry
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
