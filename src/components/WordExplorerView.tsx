import React, { useState, useMemo } from 'react';
import {
  Search,
  Volume2,
  Play,
  FileText,
  X,
  CheckCircle2,
  AlertCircle,
} from 'lucide-react';
import { BeeLevel, WordEntry, WordMasteryRecord, WordSource } from '../types/spelling';
import { speakText } from '../utils/speechHelpers';

interface WordExplorerViewProps {
  words: WordEntry[];
  masteryMap: Record<string, WordMasteryRecord>;
  onPracticeWord: (word: WordEntry) => void;
  initialFilterMissed?: boolean;
}

export const WordExplorerView: React.FC<WordExplorerViewProps> = ({
  words,
  masteryMap,
  onPracticeWord,
  initialFilterMissed = false,
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [levelFilter, setLevelFilter] = useState<'all' | BeeLevel>('all');
  const [sourceFilter, setSourceFilter] = useState<'all' | WordSource>('all');
  const [statusFilter, setStatusFilter] = useState<'all' | 'missed' | 'mastered'>(
    initialFilterMissed ? 'missed' : 'all'
  );
  const [showPdfModal, setShowPdfModal] = useState(false);

  const filteredWords = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return words.filter((w) => {
      if (levelFilter !== 'all' && w.level !== levelFilter) return false;
      if (sourceFilter !== 'all' && w.source !== sourceFilter) return false;

      const rec = masteryMap[w.id];
      if (statusFilter === 'missed') {
        if (!rec || rec.missedCount === 0) return false;
      } else if (statusFilter === 'mastered') {
        if (!rec || rec.correctCount === 0 || rec.streak === 0) return false;
      }

      if (q) {
        return (
          w.word.toLowerCase().includes(q) ||
          w.definition.toLowerCase().includes(q) ||
          (w.altSpellings && w.altSpellings.some((a) => a.toLowerCase().includes(q)))
        );
      }
      return true;
    });
  }, [words, searchQuery, levelFilter, sourceFilter, statusFilter, masteryMap]);

  return (
    <div className="space-y-6">
      {/* Header & Filter Bar */}
      <div className="bg-white/60 backdrop-blur-xs border border-pink-200/80 rounded-2xl p-5 sm:p-6 shadow-2xs space-y-4">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-display font-bold text-[#1E1B4B] text-balance">
              {statusFilter === 'missed'
                ? 'Missed Words Review Deck'
                : '2026–2027 Scripps & School Study Word Bank'}
            </h1>
            <p className="text-sm text-slate-600 mt-1">
              Showing <span className="font-mono-tabular font-semibold text-pink-700">{filteredWords.length}</span> of{' '}
              <span className="font-mono-tabular font-semibold">{words.length}</span> official words · Click any word to hear pronunciation or launch direct stage practice.
            </p>
          </div>

          <button
            type="button"
            onClick={() => setShowPdfModal(true)}
            className="px-4 py-2.5 rounded-xl bg-sky-50 hover:bg-sky-100 border border-sky-200 text-xs font-semibold text-sky-900 transition-colors cursor-pointer flex items-center gap-2 whitespace-nowrap shrink-0 self-start md:self-auto"
          >
            <FileText className="w-4 h-4 text-sky-600" />
            <span>View Official 2026–2027 School PDF</span>
          </button>
        </div>

        {/* Search & Segmented Filters */}
        <div className="grid grid-cols-1 md:grid-cols-12 gap-3 pt-2">
          <div className="md:col-span-4 relative">
            <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              type="search"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search words or definitions..."
              className="w-full pl-10 pr-4 py-2 rounded-xl bg-white border border-pink-200 text-sm text-[#1E1B4B] focus:outline-none focus:ring-2 focus:ring-pink-400"
            />
          </div>

          {/* Bee Difficulty Filter */}
          <div className="md:col-span-3 flex items-center gap-1 p-1 bg-pink-50/80 border border-pink-200/70 rounded-xl">
            {(['all', 1, 2, 3] as const).map((lvl) => (
              <button
                key={String(lvl)}
                type="button"
                onClick={() => setLevelFilter(lvl)}
                className={`flex-1 py-1.5 px-2 text-xs font-semibold rounded-lg transition-colors cursor-pointer whitespace-nowrap shrink-0 ${
                  levelFilter === lvl
                    ? 'bg-pink-600 text-white shadow-2xs'
                    : 'text-[#1E1B4B]/75 hover:text-[#1E1B4B]'
                }`}
              >
                {lvl === 'all' ? 'All Bees' : `${lvl} Bee`}
              </button>
            ))}
          </div>

          {/* Source Filter */}
          <div className="md:col-span-3 flex items-center gap-1 p-1 bg-sky-50/80 border border-sky-200/70 rounded-xl">
            {(
              [
                { id: 'all', label: 'All Lists' },
                { id: 'school-pdf', label: 'School PDF (450)' },
                { id: 'scripps-extra', label: 'Extra Scripps' },
              ] as const
            ).map((src) => (
              <button
                key={src.id}
                type="button"
                onClick={() => setSourceFilter(src.id)}
                className={`flex-1 py-1.5 px-2 text-xs font-semibold rounded-lg transition-colors cursor-pointer whitespace-nowrap shrink-0 ${
                  sourceFilter === src.id
                    ? 'bg-sky-600 text-white shadow-2xs'
                    : 'text-sky-950/75 hover:text-sky-950'
                }`}
              >
                {src.label}
              </button>
            ))}
          </div>

          {/* Mastery Filter */}
          <div className="md:col-span-2 flex items-center gap-1 p-1 bg-slate-100 rounded-xl">
            {(
              [
                { id: 'all', label: 'All' },
                { id: 'missed', label: 'Missed' },
                { id: 'mastered', label: 'Correct' },
              ] as const
            ).map((st) => (
              <button
                key={st.id}
                type="button"
                onClick={() => setStatusFilter(st.id)}
                className={`flex-1 py-1.5 px-2 text-xs font-semibold rounded-lg transition-colors cursor-pointer whitespace-nowrap shrink-0 ${
                  statusFilter === st.id
                    ? 'bg-white text-[#1E1B4B] shadow-2xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                {st.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Word Cards Grid */}
      {filteredWords.length === 0 ? (
        <div className="bg-white/85 backdrop-blur-md border border-pink-200/80 rounded-2xl p-10 text-center space-y-3">
          <p className="text-base font-semibold text-[#1E1B4B]">
            {statusFilter === 'missed'
              ? 'No missed words in this filter yet!'
              : 'No words match your current filter.'}
          </p>
          <p className="text-sm text-slate-600 max-w-md mx-auto">
            {statusFilter === 'missed'
              ? 'Any words missed during Verbal or Touchscreen practice are automatically added here with boosted spaced-repetition priority.'
              : 'Try clearing your search text or switching difficulty tiers.'}
          </p>
          <button
            type="button"
            onClick={() => {
              setSearchQuery('');
              setLevelFilter('all');
              setSourceFilter('all');
              setStatusFilter('all');
            }}
            className="px-4 py-2 rounded-xl bg-pink-600 text-white text-xs font-semibold hover:bg-pink-700 transition-colors cursor-pointer"
          >
            Reset Filters
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredWords.map((entry) => {
            const stats = masteryMap[entry.id];
            const isMissed = Boolean(stats && stats.missedCount > 0 && stats.streak === 0);
            const isMastered = Boolean(stats && stats.correctCount > 0 && stats.streak > 0);

            return (
              <div
                key={entry.id}
                className="bg-white/60 backdrop-blur-2xs border border-pink-200/80 rounded-2xl p-4 flex flex-col justify-between gap-3 hover:border-pink-400 transition-colors"
              >
                <div className="space-y-2">
                  {/* Quiet unboxed metadata line */}
                  <div className="flex items-center justify-between gap-2 text-xs text-slate-500">
                    <div className="flex items-center gap-1.5">
                      <span className="font-semibold text-pink-700">
                        {entry.level === 1
                          ? 'One Bee'
                          : entry.level === 2
                          ? 'Two Bee'
                          : 'Three Bee'}
                      </span>
                      <span aria-hidden="true">·</span>
                      <span>{entry.partOfSpeech}</span>
                      <span aria-hidden="true">·</span>
                      <span>
                        {entry.source === 'school-pdf' ? 'School PDF' : 'Scripps Extra'}
                      </span>
                    </div>

                    {isMissed && (
                      <span className="inline-flex items-center gap-1 text-rose-700 font-semibold">
                        <AlertCircle className="w-3.5 h-3.5" />
                        <span>Needs Review ({stats.missedCount})</span>
                      </span>
                    )}
                    {isMastered && !isMissed && (
                      <span className="inline-flex items-center gap-1 text-emerald-700 font-semibold">
                        <CheckCircle2 className="w-3.5 h-3.5" />
                        <span>Streak {stats.streak}</span>
                      </span>
                    )}
                  </div>

                  {/* Word & Phonetics */}
                  <div className="flex items-baseline justify-between gap-2">
                    <div>
                      <h3 className="text-xl font-display font-bold text-[#1E1B4B]">
                        {entry.word}
                      </h3>
                      {entry.altSpellings && entry.altSpellings.length > 0 && (
                        <p className="text-xs text-slate-500">
                          Also accepted: {entry.altSpellings.join(', ')}
                        </p>
                      )}
                    </div>
                    <span className="text-xs font-mono-tabular text-sky-800">
                      /{entry.phonetic}/
                    </span>
                  </div>

                  <p className="text-sm text-slate-700 leading-relaxed">
                    {entry.definition}
                  </p>
                  <p className="text-xs text-slate-500 italic">
                    “{entry.sentence}”
                  </p>

                  {stats?.lastMisspelledAs && isMissed && (
                    <p className="text-xs text-rose-700 font-mono-tabular pt-1">
                      Last spelled as: “{stats.lastMisspelledAs}”
                    </p>
                  )}
                </div>

                <div className="flex items-center justify-between gap-2 pt-2 border-t border-pink-100">
                  <button
                    type="button"
                    onClick={() => speakText(`${entry.word}. ${entry.sentence}`)}
                    className="min-h-[38px] px-3 py-1.5 rounded-xl bg-sky-50 hover:bg-sky-100 text-sky-900 text-xs font-semibold transition-colors cursor-pointer flex items-center gap-1.5 whitespace-nowrap shrink-0"
                  >
                    <Volume2 className="w-3.5 h-3.5 text-sky-600" />
                    <span>Hear Word</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => onPracticeWord(entry)}
                    className="min-h-[38px] px-3.5 py-1.5 rounded-xl bg-pink-600 hover:bg-pink-700 text-white text-xs font-semibold transition-colors cursor-pointer flex items-center gap-1.5 whitespace-nowrap shrink-0"
                  >
                    <Play className="w-3.5 h-3.5" />
                    <span>Practice on Stage</span>
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Embedded Modal for Official Uploaded 2026-2027 School PDF */}
      {showPdfModal && (
        <div
          className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4"
          role="dialog"
          aria-modal="true"
          aria-label="Official 2026–2027 School Spelling Bee Study List PDF"
        >
          <div className="bg-white rounded-3xl border border-pink-200 w-full max-w-5xl h-[85vh] flex flex-col overflow-hidden shadow-xl">
            <div className="flex items-center justify-between px-6 py-4 border-b border-pink-100">
              <div>
                <h2 className="text-lg font-display font-bold text-[#1E1B4B]">
                  2026–2027 School Spelling Bee Study List (Official PDF)
                </h2>
                <p className="text-xs text-slate-500">
                  All 450 words from this 6-page list are loaded in your interactive practice deck.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setShowPdfModal(false)}
                className="min-h-[40px] min-w-[40px] rounded-xl bg-pink-50 hover:bg-pink-100 text-pink-900 flex items-center justify-center cursor-pointer"
                aria-label="Close PDF viewer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="flex-1 bg-slate-100">
              <iframe
                src={`${import.meta.env.BASE_URL}assets/aistudio/Spelling_Bee_Words_-_2026_c7f016d0.pdf`}
                title="2026-2027 School Spelling Bee Study List PDF"
                className="w-full h-full border-0"
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
