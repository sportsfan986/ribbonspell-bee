import React, { useState } from 'react';
import { Delete, RotateCcw, CheckCircle2, Space } from 'lucide-react';

interface TouchTileKeypadProps {
  onCharPress: (char: string) => void;
  onBackspace: () => void;
  onClear: () => void;
  onSubmit: () => void;
  disabled?: boolean;
  canSubmit: boolean;
}

const QWERTY_ROWS = [
  ['q', 'w', 'e', 'r', 't', 'y', 'u', 'i', 'o', 'p'],
  ['a', 's', 'd', 'f', 'g', 'h', 'j', 'k', 'l'],
  ['z', 'x', 'c', 'v', 'b', 'n', 'm'],
];

const SPECIAL_TILES = [
  { label: 'Hyphen (-)', char: '-' },
  { label: 'Space', char: ' ' },
  { label: 'ñ', char: 'ñ' },
  { label: 'é', char: 'é' },
];

export const TouchTileKeypad: React.FC<TouchTileKeypadProps> = ({
  onCharPress,
  onBackspace,
  onClear,
  onSubmit,
  disabled = false,
  canSubmit,
}) => {
  const [uppercaseView, setUppercaseView] = useState(false);

  return (
    <div
      className="w-full select-none space-y-2.5 pt-2"
      role="group"
      aria-label="On-screen spelling letter tile keypad"
    >
      {/* Special characters & case bar for multi-word / accented Scripps words */}
      <div className="flex flex-wrap items-center justify-between gap-2 pb-1">
        <div className="flex flex-wrap items-center gap-1.5">
          {SPECIAL_TILES.map((item) => (
            <button
              key={item.char}
              type="button"
              disabled={disabled}
              onClick={() => onCharPress(uppercaseView ? item.char.toUpperCase() : item.char)}
              className="min-h-[42px] px-3 py-1.5 rounded-xl bg-sky-50/90 hover:bg-sky-100 active:scale-95 border border-sky-200 text-xs font-semibold text-sky-900 transition-all cursor-pointer disabled:opacity-40 whitespace-nowrap shrink-0 flex items-center gap-1"
            >
              {item.char === ' ' && <Space className="w-3.5 h-3.5 text-sky-600" />}
              <span>{item.label}</span>
            </button>
          ))}
        </div>

        <div className="flex items-center gap-1.5">
          <button
            type="button"
            disabled={disabled}
            onClick={() => setUppercaseView((prev) => !prev)}
            className={`min-h-[42px] px-3 py-1.5 rounded-xl border text-xs font-semibold transition-all cursor-pointer whitespace-nowrap shrink-0 ${
              uppercaseView
                ? 'bg-pink-600 text-white border-pink-600 shadow-xs'
                : 'bg-white/90 text-[#1E1B4B] border-pink-200 hover:bg-pink-50'
            }`}
          >
            {uppercaseView ? 'ABC Tiles' : 'abc Tiles'}
          </button>
          <button
            type="button"
            disabled={disabled}
            onClick={onClear}
            className="min-h-[42px] px-3 py-1.5 rounded-xl bg-white/90 hover:bg-rose-50 active:scale-95 border border-pink-200 text-xs font-semibold text-rose-700 transition-all cursor-pointer disabled:opacity-40 whitespace-nowrap shrink-0 flex items-center gap-1"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            <span>Clear</span>
          </button>
        </div>
      </div>

      {/* Main QWERTY Touch Letter Tiles */}
      <div className="space-y-2">
        {QWERTY_ROWS.map((row, rowIndex) => (
          <div
            key={rowIndex}
            className="flex items-center justify-center gap-1.5 sm:gap-2"
          >
            {row.map((letter) => {
              const displayLetter = uppercaseView
                ? letter.toUpperCase()
                : letter.toLowerCase();
              return (
                <button
                  key={letter}
                  type="button"
                  disabled={disabled}
                  onClick={() => onCharPress(displayLetter)}
                  className="flex-1 max-w-[56px] min-h-[48px] sm:min-h-[54px] rounded-xl bg-white hover:bg-pink-50/90 active:bg-pink-100 active:scale-95 border border-pink-200/90 shadow-2xs text-lg sm:text-xl font-display font-bold text-[#1E1B4B] transition-all cursor-pointer disabled:opacity-40 flex items-center justify-center"
                >
                  {displayLetter}
                </button>
              );
            })}

            {rowIndex === 2 && (
              <button
                type="button"
                disabled={disabled}
                onClick={onBackspace}
                aria-label="Delete last letter"
                className="px-3.5 min-h-[48px] sm:min-h-[54px] rounded-xl bg-pink-50 hover:bg-pink-100 active:scale-95 border border-pink-200 text-sm font-semibold text-pink-900 transition-all cursor-pointer disabled:opacity-40 flex items-center justify-center gap-1.5 shrink-0"
              >
                <Delete className="w-4 h-4 text-pink-700" />
                <span className="hidden sm:inline text-xs">Delete</span>
              </button>
            )}
          </div>
        ))}
      </div>

      {/* Primary Submit Spelling Action */}
      <div className="pt-2">
        <button
          type="button"
          disabled={disabled || !canSubmit}
          onClick={onSubmit}
          className="w-full min-h-[50px] px-6 py-3 rounded-2xl bg-pink-600 hover:bg-pink-700 active:scale-[0.99] disabled:bg-pink-200 disabled:text-pink-500 text-white font-display font-semibold text-base shadow-sm transition-all cursor-pointer flex items-center justify-center gap-2 whitespace-nowrap"
        >
          <CheckCircle2 className="w-5 h-5" />
          <span>Check My Spelling</span>
        </button>
      </div>
    </div>
  );
};
