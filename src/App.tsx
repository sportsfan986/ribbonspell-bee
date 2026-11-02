import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import {
  Mic,
  MicOff,
  Volume2,
  VolumeX,
  BookOpen,
  MessageSquareQuote,
  Sparkles,
  ArrowRight,
  RotateCcw,
  CheckCircle2,
  AlertCircle,
  Hand,
  Award,
  Delete,
} from 'lucide-react';
import {
  PracticeMode,
  SessionAttempt,
  VerbalListeningSubMode,
  VerbalPhase,
  WordEntry,
  WordMasteryRecord,
} from './types/spelling';
import {
  ALL_WORDS,
  filterWordPool,
  LevelFilterOption,
  selectNextWordWeighted,
  SourceFilterOption,
} from './data/wordBank';
import { SylveonWatermark, SylveonBowEmblem } from './components/SylveonWatermark';
import { TouchTileKeypad } from './components/TouchTileKeypad';
import { WordExplorerView } from './components/WordExplorerView';
import { MasteryDashboardView } from './components/MasteryDashboardView';
import { soundEngine } from './utils/soundEffects';
import {
  detectVoicePromptIntent,
  extractLettersFromNBest,
  getAcousticAlternatives,
  maskTargetWordInTranscript,
  speakText,
  SpellingValidationResult,
  validateSpelling,
} from './utils/speechHelpers';

type ActiveTab = 'practice' | 'explorer' | 'missed' | 'stats';

const STORAGE_KEY_MASTERY = 'ribbonspell_sylveon_mastery_v1';
const ALPHABET_KEYS = 'abcdefghijklmnopqrstuvwxyz'.split('');

// Browser SpeechRecognition type shim
interface SpeechRecognitionEventLike {
  resultIndex: number;
  results: {
    length: number;
    [index: number]: {
      isFinal: boolean;
      length?: number;
      [altIndex: number]: { transcript: string };
    };
  };
}

interface SpeechRecognitionInstance {
  continuous: boolean;
  interimResults: boolean;
  maxAlternatives?: number;
  lang: string;
  onstart?: (() => void) | null;
  onresult: ((event: SpeechRecognitionEventLike) => void) | null;
  onerror: ((event: { error: string }) => void) | null;
  onend: (() => void) | null;
  start: () => void;
  stop: () => void;
  abort: () => void;
}

export default function App() {
  // Navigation & Mode State
  const [activeTab, setActiveTab] = useState<ActiveTab>('practice');
  const [practiceMode, setPracticeMode] = useState<PracticeMode>('touchscreen');
  const [levelFilter, setLevelFilter] = useState<LevelFilterOption>('all');
  const [sourceFilter, setSourceFilter] = useState<SourceFilterOption>('school-pdf');
  const [soundMuted, setSoundMuted] = useState(false);

  // Persistent Mastery & Spaced Repetition State
  const [masteryMap, setMasteryMap] = useState<Record<string, WordMasteryRecord>>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY_MASTERY);
      return saved ? JSON.parse(saved) : {};
    } catch {
      return {};
    }
  });
  const [sessionHistory, setSessionHistory] = useState<SessionAttempt[]>([]);
  const [shortTermRetryQueue, setShortTermRetryQueue] = useState<
    { wordId: string; dueInCount: number }[]
  >([]);

  // Current Active Word & Stage State (Randomized on launch)
  const [currentWord, setCurrentWord] = useState<WordEntry>(() => {
    const randomIndex = Math.floor(Math.random() * ALL_WORDS.length);
    return ALL_WORDS[randomIndex];
  });
  const [userLetters, setUserLetters] = useState<string[]>([]);
  const userLettersRef = useRef<string[]>([]);
  // Letters finalized across completed speech cycles or manual touch edits
  const committedLettersRef = useRef<string[]>([]);
  // Letters streamed live from the current ongoing speech utterance
  const segmentLettersRef = useRef<string[]>([]);

  const finishTimerRef = useRef<NodeJS.Timeout | null>(null);
  const inactivityTimerRef = useRef<NodeJS.Timeout | null>(null);

  const [validationResult, setValidationResult] =
    useState<SpellingValidationResult | null>(null);

  // Clue Cards Visibility
  const [revealedClues, setRevealedClues] = useState<{
    phonetic: boolean;
    definition: boolean;
    sentence: boolean;
  }>({
    phonetic: false,
    definition: false,
    sentence: false,
  });

  // Verbal Mode State Machine:
  // 'command' = Hands-Free Command Mode (before & after spelling: Repeat, Sentence, Definition, Try Again, Next Word)
  // 'letters' = Touch-Triggered Dedicated Letter Recognition Mode (auto-stops when word finishes)
  const [verbalSubMode, setVerbalSubMode] = useState<VerbalListeningSubMode>('command');
  const verbalSubModeRef = useRef<VerbalListeningSubMode>('command');
  const [, setVerbalPhase] = useState<VerbalPhase>('spelling_letters');
  const [saidStartWord, setSaidStartWord] = useState(false);
  const [, setSaidEndWord] = useState(false);
  const [isMicListening, setIsMicListening] = useState(false);
  const [liveTranscript, setLiveTranscript] = useState('');
  const [activeCommandBadge, setActiveCommandBadge] = useState<string>('');
  const [verbalCoachBanner, setVerbalCoachBanner] = useState<string>(
    'Tap "Start Spelling (Letter Mode)" below when you are ready to spell this word!'
  );
  const [speechSupported, setSpeechSupported] = useState(true);

  // Backup Helpers State in Verbal Mode:
  // 1) Tap any recognized letter tile to fix or delete it
  const [selectedTileIndex, setSelectedTileIndex] = useState<number | null>(null);
  // 2) Live N-best / acoustic ambiguity suggestions for the most recently recognized letter
  const [lastLetterDisagreements, setLastLetterDisagreements] = useState<string[]>([]);

  const recognitionRef = useRef<SpeechRecognitionInstance | null>(null);
  const shouldKeepListeningRef = useRef(false);

  // Auto-advance countdown and callback refs for hands-free speech flow
  const [autoAdvanceSeconds, setAutoAdvanceSeconds] = useState<number | null>(null);
  const autoAdvanceIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const startListeningRef = useRef<(modeOverride?: VerbalListeningSubMode) => void>(() => {});
  const handleNextWordRef = useRef<() => void>(() => {});
  const handleStartOverWordRef = useRef<() => void>(() => {});

  const clearAutoAdvance = useCallback(() => {
    if (autoAdvanceIntervalRef.current) {
      clearInterval(autoAdvanceIntervalRef.current);
      autoAdvanceIntervalRef.current = null;
    }
    setAutoAdvanceSeconds(null);
  }, []);

  // Setup / Teardown Web Speech API or Native Android SpeechBridge Recognition
  const stopListening = useCallback(() => {
    shouldKeepListeningRef.current = false;
    setIsMicListening(false);
    const androidBridge = (
      window as unknown as {
        AndroidSpeechBridge?: { stopListening?: () => void };
      }
    ).AndroidSpeechBridge;
    if (androidBridge?.stopListening) {
      try {
        androidBridge.stopListening();
      } catch {
        // Ignore
      }
    }
    if (recognitionRef.current) {
      try {
        recognitionRef.current.stop();
      } catch {
        // Ignore stop errors
      }
    }
  }, []);

  // Sync masteryMap to localStorage
  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY_MASTERY, JSON.stringify(masteryMap));
    } catch {
      // Ignore storage quota errors
    }
  }, [masteryMap]);

  // Filtered pool of words
  const activePool = useMemo(() => {
    const pool = filterWordPool(levelFilter, sourceFilter, masteryMap);
    return pool.length > 0 ? pool : filterWordPool(levelFilter, 'all', masteryMap);
  }, [levelFilter, sourceFilter, masteryMap]);

  // Count missed words needing review
  const missedWordsCount = useMemo(() => {
    return Object.values(masteryMap).filter(
      (r) => r.missedCount > 0 && r.streak < 2
    ).length;
  }, [masteryMap]);

  // Session accuracy calculation
  const sessionStats = useMemo(() => {
    const total = sessionHistory.length;
    const correct = sessionHistory.filter((a) => a.isCorrect).length;
    const missed = total - correct;
    const accuracy = total > 0 ? Math.round((correct / total) * 100) : 100;
    return { total, correct, missed, accuracy };
  }, [sessionHistory]);

  // Load a specific or weighted-random word onto the stage
  const loadWordOnStage = useCallback(
    (targetWord?: WordEntry, announceAloud: boolean = true) => {
      let chosenWord = targetWord;
      let nextQueue = shortTermRetryQueue;

      if (!chosenWord) {
        const selection = selectNextWordWeighted(
          activePool,
          masteryMap,
          currentWord?.id ?? null,
          shortTermRetryQueue
        );
        chosenWord = selection.nextWord;
        nextQueue = selection.updatedQueue;
        setShortTermRetryQueue(nextQueue);
      }

      clearAutoAdvance();
      stopListening();
      if (finishTimerRef.current) {
        clearTimeout(finishTimerRef.current);
        finishTimerRef.current = null;
      }
      if (inactivityTimerRef.current) {
        clearTimeout(inactivityTimerRef.current);
        inactivityTimerRef.current = null;
      }

      setCurrentWord(chosenWord);
      committedLettersRef.current = [];
      segmentLettersRef.current = [];
      userLettersRef.current = [];
      setUserLetters([]);
      setSelectedTileIndex(null);
      setLastLetterDisagreements([]);
      setValidationResult(null);
      setRevealedClues({
        phonetic: false,
        definition: false,
        sentence: false,
      });
      verbalSubModeRef.current = 'command';
      setVerbalSubMode('command');
      setVerbalPhase('spelling_letters');
      setSaidStartWord(false);
      setSaidEndWord(false);
      setLiveTranscript('');
      setActiveCommandBadge('Tap to Spell');
      setVerbalCoachBanner(
        'Tap "Start Spelling (Letter Mode)" below when you are ready to spell this word!'
      );

      if (announceAloud && !soundEngine.muted) {
        speakText(`Your word is ${chosenWord.word}.`);
      }
    },
    [activePool, clearAutoAdvance, currentWord?.id, masteryMap, shortTermRetryQueue, stopListening]
  );

  // Trigger initial pronunciation when switching to Practice Stage
  useEffect(() => {
    const timer = setTimeout(() => {
      if (!soundEngine.muted) {
        speakText(`Your word is ${currentWord.word}.`);
      }
    }, 350);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Finalize and grade the student's spelling (auto-stops Letter Mode and returns to idle state)
  const evaluateCurrentSpelling = useCallback(
    (lettersToGrade?: string[]) => {
      clearAutoAdvance();
      if (finishTimerRef.current) {
        clearTimeout(finishTimerRef.current);
        finishTimerRef.current = null;
      }
      if (inactivityTimerRef.current) {
        clearTimeout(inactivityTimerRef.current);
        inactivityTimerRef.current = null;
      }
      setActiveCommandBadge('');
      setSelectedTileIndex(null);
      setLiveTranscript('');

      const letters = lettersToGrade ?? userLettersRef.current;
      const joinedSpelling = letters.join('').trim();
      if (!joinedSpelling) return;

      // Auto-stop Letter Recognition Mode and stop microphone so next word requires button press
      verbalSubModeRef.current = 'command';
      setVerbalSubMode('command');
      stopListening();

      const result = validateSpelling(joinedSpelling, currentWord);
      setValidationResult(result);
      setVerbalPhase('feedback');

      const spellAloud = currentWord.word.split('').join(' ');

      // Play positive or constructive Web Audio tone & voice synthesis
      if (result.isCorrect) {
        soundEngine.playCorrectChime();
        setVerbalCoachBanner(`✓ Correct! Auto-advancing in 5s... (Tap "Next Word" to skip)`);

        const handleCorrectSpeakingDone = () => {
          // Start 5s countdown timer
          clearAutoAdvance();
          let count = 5;
          setAutoAdvanceSeconds(count);
          autoAdvanceIntervalRef.current = setInterval(() => {
            count -= 1;
            if (count <= 0) {
              clearAutoAdvance();
              handleNextWordRef.current();
            } else {
              setAutoAdvanceSeconds(count);
            }
          }, 1000);
        };

        if (!soundEngine.muted) {
          speakText(`Correct! ${currentWord.word} is spelled ${spellAloud}.`, {
            onEnd: handleCorrectSpeakingDone,
          });
        } else {
          handleCorrectSpeakingDone();
        }
      } else {
        soundEngine.playConstructiveReviewTone();
        setVerbalCoachBanner(
          `Tap "Practice Word Again" to retry this word, or tap "Next Word" to continue.`
        );

        if (!soundEngine.muted) {
          speakText(
            `Nice try! Let's check the pattern for ${currentWord.word}: ${spellAloud}.`,
          );
        }
      }

      // Update persistent Mastery & Spaced Repetition weight
      setMasteryMap((prev) => {
        const existing = prev[currentWord.id] ?? {
          wordId: currentWord.id,
          attempts: 0,
          correctCount: 0,
          missedCount: 0,
          streak: 0,
          lastAttemptAt: Date.now(),
          weight: 1.0,
        };

        const attempts = existing.attempts + 1;
        const correctCount = existing.correctCount + (result.isCorrect ? 1 : 0);
        const missedCount = existing.missedCount + (result.isCorrect ? 0 : 1);
        const streak = result.isCorrect ? existing.streak + 1 : 0;

        const updatedWeight = result.isCorrect
          ? streak >= 2
            ? 0.25
            : Math.max(0.8, existing.weight * 0.6)
          : Math.min(12.0, 4.5 + missedCount * 1.5);

        return {
          ...prev,
          [currentWord.id]: {
            wordId: currentWord.id,
            attempts,
            correctCount,
            missedCount,
            streak,
            lastAttemptAt: Date.now(),
            lastMisspelledAs: result.isCorrect ? existing.lastMisspelledAs : joinedSpelling,
            weight: updatedWeight,
          },
        };
      });

      if (!result.isCorrect) {
        setShortTermRetryQueue((prev) => {
          const filtered = prev.filter((item) => item.wordId !== currentWord.id);
          return [...filtered, { wordId: currentWord.id, dueInCount: 3 }];
        });
      }

      setSessionHistory((prev) => [
        {
          word: currentWord,
          userSpelling: joinedSpelling,
          isCorrect: result.isCorrect,
          mode: practiceMode,
          timestamp: Date.now(),
        },
        ...prev,
      ]);
    },
    [clearAutoAdvance, currentWord, practiceMode, stopListening]
  );

  // Schedule auto-submit timers whenever letters change in Verbal Mode
  const scheduleVerbalAutoSubmit = useCallback(
    (updatedLetters: string[], saidEndWordNow: boolean = false) => {
      if (finishTimerRef.current) {
        clearTimeout(finishTimerRef.current);
        finishTimerRef.current = null;
      }
      if (inactivityTimerRef.current) {
        clearTimeout(inactivityTimerRef.current);
        inactivityTimerRef.current = null;
      }

      if (updatedLetters.length === 0) {
        setActiveCommandBadge(
          verbalSubModeRef.current === 'letters' ? 'Letter Mode Active' : 'Hands-Free Commands'
        );
        return;
      }

      const targetCount = currentWord.word.replace(/[\s-]/g, '').length;

      if (saidEndWordNow || updatedLetters.length >= targetCount) {
        setVerbalCoachBanner(
          saidEndWordNow
            ? '✓ Word repeated to finish! Grading now...'
            : `✓ All ${targetCount} letters captured! Auto-stopping & submitting in 1s...`
        );
        setActiveCommandBadge(saidEndWordNow ? 'Finished' : 'Auto-Stop in 1s...');
        finishTimerRef.current = setTimeout(() => {
          setActiveCommandBadge('');
          evaluateCurrentSpelling(userLettersRef.current);
        }, saidEndWordNow ? 350 : 1000);
      } else {
        setVerbalCoachBanner(
          `Captured ${updatedLetters.length} of ${targetCount} letters. Keep spelling (or tap any tile to edit)...`
        );
        setActiveCommandBadge(`${updatedLetters.length}/${targetCount} Letters`);
        inactivityTimerRef.current = setTimeout(() => {
          setVerbalCoachBanner('10-second pause reached. Auto-stopping & submitting now...');
          setActiveCommandBadge('10s Pause Submit');
          evaluateCurrentSpelling(userLettersRef.current);
        }, 10000);
      }
    },
    [currentWord.word, evaluateCurrentSpelling]
  );

  // Enter dedicated Letter Recognition Mode via touch interaction
  const enterLetterRecognitionMode = useCallback(() => {
    if (validationResult) return;
    clearAutoAdvance();
    verbalSubModeRef.current = 'letters';
    setVerbalSubMode('letters');
    setSelectedTileIndex(null);
    setActiveCommandBadge('Letter Mode Active');
    const targetCount = currentWord.word.replace(/[\s-]/g, '').length;
    setVerbalCoachBanner(
      `Letter Recognition Mode active! Speak ${targetCount} letters clearly—auto-stops 1s after final letter.`
    );
    soundEngine.playLetterModeStart();
    startListeningRef.current('letters');
  }, [clearAutoAdvance, currentWord.word, validationResult]);

  // Exit Letter Recognition Mode back to idle state without submitting
  const switchToCommandMode = useCallback(() => {
    if (finishTimerRef.current) {
      clearTimeout(finishTimerRef.current);
      finishTimerRef.current = null;
    }
    if (inactivityTimerRef.current) {
      clearTimeout(inactivityTimerRef.current);
      inactivityTimerRef.current = null;
    }
    // Commit any in-flight partial letters
    if (segmentLettersRef.current.length > 0) {
      const merged = [
        ...committedLettersRef.current,
        ...segmentLettersRef.current,
      ];
      committedLettersRef.current = merged;
      segmentLettersRef.current = [];
      userLettersRef.current = merged;
      setUserLetters(merged);
    }
    verbalSubModeRef.current = 'command';
    setVerbalSubMode('command');
    stopListening();
    setActiveCommandBadge('Letter Mode Paused');
    setVerbalCoachBanner(
      'Letter Mode paused. Tap "Start Spelling (Letter Mode)" when ready to resume spelling.'
    );
  }, [stopListening]);

  // Backup Helper: Replace a specific letter tile at `index` (from Tile Popover or N-Best Chip Bar)
  const handleReplaceLetterAt = useCallback(
    (index: number, newChar: string) => {
      if (validationResult) return;
      const base = [...userLettersRef.current];
      if (index < 0 || index >= base.length) return;
      base[index] = newChar;
      committedLettersRef.current = base;
      segmentLettersRef.current = [];
      userLettersRef.current = base;
      setUserLetters(base);
      setSelectedTileIndex(null);
      setLastLetterDisagreements([]);
      soundEngine.playTileTap();
      scheduleVerbalAutoSubmit(base, false);
    },
    [scheduleVerbalAutoSubmit, validationResult]
  );

  // Backup Helper: Delete a specific letter tile at `index`
  const handleDeleteLetterAt = useCallback(
    (index: number) => {
      if (validationResult) return;
      const base = userLettersRef.current.filter((_, idx) => idx !== index);
      committedLettersRef.current = base;
      segmentLettersRef.current = [];
      userLettersRef.current = base;
      setUserLetters(base);
      setSelectedTileIndex(null);
      setLastLetterDisagreements([]);
      soundEngine.playTileTap();
      scheduleVerbalAutoSubmit(base, false);
    },
    [scheduleVerbalAutoSubmit, validationResult]
  );

  // Backup Helper: Append a letter via the On-Screen A-Z Backup Mini-Bar in Verbal Mode
  const handleBackupMiniBarTap = useCallback(
    (char: string) => {
      if (validationResult) return;
      const next = [...userLettersRef.current, char];
      committedLettersRef.current = next;
      segmentLettersRef.current = [];
      userLettersRef.current = next;
      setUserLetters(next);
      setSelectedTileIndex(null);
      setLastLetterDisagreements([]);
      soundEngine.playTileTap();
      scheduleVerbalAutoSubmit(next, false);
    },
    [scheduleVerbalAutoSubmit, validationResult]
  );

  // Handle clue triggers (both button clicks and voice prompts)
  const triggerClue = useCallback(
    (type: 'repeat' | 'sentence' | 'definition' | 'phonetic') => {
      const wasInLettersMode =
        isMicListening && verbalSubModeRef.current === 'letters';
      stopListening();
      const onClueDone = () => {
        if (practiceMode === 'verbal' && wasInLettersMode) {
          startListeningRef.current('letters');
        }
      };

      if (type === 'repeat') {
        speakText(`${currentWord.word}.`, { onEnd: onClueDone });
        setVerbalCoachBanner('Pronouncer repeated the word.');
      } else if (type === 'sentence') {
        setRevealedClues((prev) => ({ ...prev, sentence: true }));
        speakText(currentWord.sentence, { onEnd: onClueDone });
        setVerbalCoachBanner('Pronouncer read the example sentence.');
      } else if (type === 'definition') {
        setRevealedClues((prev) => ({ ...prev, definition: true }));
        speakText(`${currentWord.partOfSpeech}. ${currentWord.definition}`, {
          onEnd: onClueDone,
        });
        setVerbalCoachBanner('Pronouncer read the official definition.');
      } else if (type === 'phonetic') {
        setRevealedClues((prev) => ({ ...prev, phonetic: true }));
        speakText(`${currentWord.word}. Pronounced ${currentWord.phonetic}.`, {
          onEnd: onClueDone,
        });
        setVerbalCoachBanner(`Phonetic respelling: /${currentWord.phonetic}/`);
      }
    },
    [currentWord, isMicListening, practiceMode, stopListening]
  );

  // Start Over on Current Word (resets to idle so user presses button to enter Letter Mode)
  const handleStartOverWord = useCallback(() => {
    clearAutoAdvance();
    stopListening();
    if (finishTimerRef.current) {
      clearTimeout(finishTimerRef.current);
      finishTimerRef.current = null;
    }
    if (inactivityTimerRef.current) {
      clearTimeout(inactivityTimerRef.current);
      inactivityTimerRef.current = null;
    }
    committedLettersRef.current = [];
    segmentLettersRef.current = [];
    userLettersRef.current = [];
    setUserLetters([]);
    setSelectedTileIndex(null);
    setLastLetterDisagreements([]);
    setValidationResult(null);
    setSaidStartWord(false);
    setSaidEndWord(false);
    verbalSubModeRef.current = 'command';
    setVerbalSubMode('command');
    setVerbalPhase('spelling_letters');
    setLiveTranscript('');
    setActiveCommandBadge('Tap to Spell');
    setVerbalCoachBanner(
      'Word reset! Tap "Start Spelling (Letter Mode)" when you are ready to spell.'
    );

    if (!soundEngine.muted) {
      speakText(`Starting over. Your word is ${currentWord.word}.`);
    }
  }, [clearAutoAdvance, currentWord, stopListening]);

  // Advance to Next Word
  const handleNextWord = useCallback(() => {
    clearAutoAdvance();
    if (finishTimerRef.current) {
      clearTimeout(finishTimerRef.current);
      finishTimerRef.current = null;
    }
    if (inactivityTimerRef.current) {
      clearTimeout(inactivityTimerRef.current);
      inactivityTimerRef.current = null;
    }
    loadWordOnStage(undefined, true);
  }, [clearAutoAdvance, loadWordOnStage]);

  // Process both Partial (live preview) and Final speech recognition results
  const handleSpeechRecognitionUpdate = useCallback(
    (topText: string, isFinal: boolean, candidatesList?: string[]) => {
      const clean = topText.trim();
      if (!clean) return;

      const allCandidates =
        candidatesList && candidatesList.length > 0 ? candidatesList : [clean];

      // 1. Check for utility voice commands across top transcript
      const intent = detectVoicePromptIntent(clean);

      // If viewing validation feedback after a word:
      if (validationResult) {
        if (!isFinal) {
          setLiveTranscript(maskTargetWordInTranscript(clean, currentWord));
          return;
        }
        setLiveTranscript('');
        if (intent === 'start_over') {
          clearAutoAdvance();
          handleStartOverWord();
          return;
        }
        if (intent === 'next_word') {
          clearAutoAdvance();
          handleNextWord();
          return;
        }
        if (intent === 'repeat') {
          triggerClue('repeat');
          return;
        }
        return;
      }

      // If user spoke a clear command ("start over", "next word", "repeat", "sentence", "definition", "clear", "done")
      if (intent) {
        if (!isFinal) {
          setLiveTranscript(maskTargetWordInTranscript(clean, currentWord));
          return;
        }
        setLiveTranscript('');
        segmentLettersRef.current = [];

        if (intent === 'start_over') {
          clearAutoAdvance();
          handleStartOverWord();
          return;
        }
        if (intent === 'next_word') {
          clearAutoAdvance();
          handleNextWord();
          return;
        }
        if (
          intent === 'repeat' ||
          intent === 'sentence' ||
          intent === 'definition' ||
          intent === 'phonetic'
        ) {
          if (finishTimerRef.current) {
            clearTimeout(finishTimerRef.current);
            finishTimerRef.current = null;
          }
          if (inactivityTimerRef.current) {
            clearTimeout(inactivityTimerRef.current);
            inactivityTimerRef.current = null;
          }
          const badgeLabel =
            intent === 'repeat'
              ? 'Repeat'
              : intent === 'sentence'
              ? 'Sentence'
              : intent === 'definition'
              ? 'Definition'
              : 'Phonetic';
          setActiveCommandBadge(badgeLabel);
          triggerClue(intent);
          return;
        }
        if (intent === 'clear') {
          if (finishTimerRef.current) {
            clearTimeout(finishTimerRef.current);
            finishTimerRef.current = null;
          }
          if (inactivityTimerRef.current) {
            clearTimeout(inactivityTimerRef.current);
            inactivityTimerRef.current = null;
          }
          committedLettersRef.current = [];
          segmentLettersRef.current = [];
          userLettersRef.current = [];
          setUserLetters([]);
          setSelectedTileIndex(null);
          setLastLetterDisagreements([]);
          setActiveCommandBadge('Cleared');
          setVerbalCoachBanner('Cleared letters. Speak each letter clearly to spell.');
          return;
        }
        if (intent === 'done') {
          if (userLettersRef.current.length > 0) {
            evaluateCurrentSpelling(userLettersRef.current);
          }
          return;
        }
      }

      // STRICT RULE: Never extract letters or auto-promote to Letter Mode unless the user
      // explicitly pressed the "Tap to Start Spelling (Letter Mode)" button for this word!
      if (verbalSubModeRef.current !== 'letters') {
        setLiveTranscript('');
        return;
      }

      // Extract letters using v1.00-compatible N-best candidates
      const extracted = extractLettersFromNBest(
        allCandidates,
        currentWord,
        saidStartWord,
        committedLettersRef.current.length,
        true
      );

      // Update masked live transcript preview (never leaks target word spelling!)
      if (!isFinal) {
        setLiveTranscript(maskTargetWordInTranscript(clean, currentWord));
      } else {
        setLiveTranscript('');
      }

      // If the student pronounced the word at the start:
      if (extracted.saidStartWord && !saidStartWord) {
        setSaidStartWord(true);
        setActiveCommandBadge('Word Stated');
        setVerbalCoachBanner('Word acknowledged! Now speak each letter clearly.');
      }

      // Real-time partial preview while user is actively speaking in Letter Mode:
      // Shows in-flight tiles without beeping and without starting the 1s auto-submit prematurely!
      if (!isFinal) {
        if (extracted.letters.length > 0) {
          segmentLettersRef.current = extracted.letters;
          const combined = [...committedLettersRef.current, ...extracted.letters];
          userLettersRef.current = combined;
          setUserLetters(combined);

          if (extracted.nBestDisagreements.length > 0) {
            setLastLetterDisagreements(extracted.nBestDisagreements);
          }

          // Keep the 10-second inactivity timer fresh while speaking, but wait for isFinal before 1s auto-submit
          if (inactivityTimerRef.current) {
            clearTimeout(inactivityTimerRef.current);
          }
          inactivityTimerRef.current = setTimeout(() => {
            setVerbalCoachBanner('10-second pause reached. Auto-stopping & submitting now...');
            setActiveCommandBadge('10s Pause Submit');
            evaluateCurrentSpelling(userLettersRef.current);
          }, 10000);
        }
        return;
      }

      // Finalized utterance result (`isFinal === true`):
      if (extracted.letters.length > 0) {
        const nextCommitted = [...committedLettersRef.current, ...extracted.letters];
        committedLettersRef.current = nextCommitted;
        segmentLettersRef.current = [];
        userLettersRef.current = nextCommitted;
        setUserLetters(nextCommitted);
        setLastLetterDisagreements(extracted.nBestDisagreements);

        scheduleVerbalAutoSubmit(nextCommitted, extracted.saidEndWord);
        return;
      }

      // If final result had 0 letters, fold any streamed partial segment letters so nothing is lost
      if (segmentLettersRef.current.length > 0) {
        const nextCommitted = [
          ...committedLettersRef.current,
          ...segmentLettersRef.current,
        ];
        committedLettersRef.current = nextCommitted;
        segmentLettersRef.current = [];
        userLettersRef.current = nextCommitted;
        setUserLetters(nextCommitted);
        scheduleVerbalAutoSubmit(nextCommitted, extracted.saidEndWord);
        return;
      }

      // If user ONLY pronounced the word to finish after having already spelled letters:
      if (extracted.saidEndWord && userLettersRef.current.length > 0) {
        setSaidEndWord(true);
        setActiveCommandBadge('Finished');
        evaluateCurrentSpelling(userLettersRef.current);
      }
    },
    [
      clearAutoAdvance,
      currentWord,
      evaluateCurrentSpelling,
      handleNextWord,
      handleStartOverWord,
      saidStartWord,
      scheduleVerbalAutoSubmit,
      triggerClue,
      validationResult,
    ]
  );

  // Keep latest handler ref for SpeechRecognition callback
  const handleSpeechUpdateRef = useRef(handleSpeechRecognitionUpdate);
  useEffect(() => {
    handleSpeechUpdateRef.current = handleSpeechRecognitionUpdate;
    (
      window as unknown as {
        onAndroidSpeechReady?: () => void;
      }
    ).onAndroidSpeechReady = () => {
      setIsMicListening(true);
    };

    (
      window as unknown as {
        onAndroidSpeechResult?: (
          text: string,
          isFinal: boolean,
          alternativesJson?: string
        ) => void;
      }
    ).onAndroidSpeechResult = (
      text: string,
      isFinal: boolean,
      alternativesJson?: string
    ) => {
      let candidates: string[] = [text];
      if (alternativesJson) {
        try {
          const parsed = JSON.parse(alternativesJson);
          if (Array.isArray(parsed) && parsed.length > 0) {
            candidates = parsed.filter((item): item is string => typeof item === 'string');
          }
        } catch {
          // Ignore malformed JSON
        }
      }
      handleSpeechUpdateRef.current(text, isFinal, candidates);
    };
  }, [handleSpeechRecognitionUpdate]);

  const startListening = useCallback((modeOverride?: VerbalListeningSubMode) => {
    if (typeof window === 'undefined') return;

    const targetMode = modeOverride ?? verbalSubModeRef.current;
    verbalSubModeRef.current = targetMode;
    setVerbalSubMode(targetMode);

    const androidBridge = (
      window as unknown as {
        AndroidSpeechBridge?: {
          startListening?: () => void;
          startListeningMode?: (mode: string) => void;
        };
      }
    ).AndroidSpeechBridge;

    if (androidBridge?.startListeningMode || androidBridge?.startListening) {
      try {
        shouldKeepListeningRef.current = true;
        if (androidBridge.startListeningMode) {
          androidBridge.startListeningMode(targetMode);
        } else if (androidBridge.startListening) {
          androidBridge.startListening();
        }
        setIsMicListening(true);
        return;
      } catch {
        // Fall back to Web Speech API
      }
    }

    const SpeechRec =
      (window as unknown as { SpeechRecognition?: new () => SpeechRecognitionInstance })
        .SpeechRecognition ||
      (
        window as unknown as {
          webkitSpeechRecognition?: new () => SpeechRecognitionInstance;
        }
      ).webkitSpeechRecognition;

    if (!SpeechRec) {
      setSpeechSupported(false);
      setVerbalCoachBanner(
        'Browser voice recognition is unavailable here—use the on-screen A–Z bar below!'
      );
      return;
    }

    if (recognitionRef.current) {
      try {
        recognitionRef.current.abort();
      } catch {
        // Ignore
      }
    }

    const rec = new SpeechRec();
    rec.continuous = true;
    rec.interimResults = true;
    rec.maxAlternatives = 5;
    rec.lang = 'en-US';

    rec.onstart = () => {
      setIsMicListening(true);
    };

    rec.onresult = (event: SpeechRecognitionEventLike) => {
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const res = event.results[i];
        const topText = res[0]?.transcript ?? '';
        const candidates: string[] = [];
        const altCount = typeof res.length === 'number' ? res.length : 1;
        for (let a = 0; a < altCount; a++) {
          const altTranscript = res[a]?.transcript;
          if (altTranscript) candidates.push(altTranscript);
        }
        if (topText) {
          handleSpeechUpdateRef.current(topText, Boolean(res.isFinal), candidates);
        }
      }
    };

    rec.onerror = (event: { error: string }) => {
      if (event.error === 'not-allowed' || event.error === 'service-not-allowed') {
        shouldKeepListeningRef.current = false;
        setIsMicListening(false);
        setVerbalCoachBanner(
          'Microphone permission was declined. Use the on-screen A–Z backup bar below to spell.'
        );
      }
    };

    rec.onend = () => {
      // Fold any uncommitted partial letters before restarting cycle
      if (segmentLettersRef.current.length > 0) {
        const merged = [
          ...committedLettersRef.current,
          ...segmentLettersRef.current,
        ];
        committedLettersRef.current = merged;
        segmentLettersRef.current = [];
        userLettersRef.current = merged;
        setUserLetters(merged);
      }
      if (shouldKeepListeningRef.current) {
        try {
          rec.start();
        } catch {
          setIsMicListening(false);
        }
      } else {
        setIsMicListening(false);
      }
    };

    recognitionRef.current = rec;
    shouldKeepListeningRef.current = true;
    try {
      rec.start();
      setIsMicListening(true);
    } catch {
      setIsMicListening(false);
    }
  }, []);

  // Sync latest callback references for timers and async callbacks
  useEffect(() => {
    startListeningRef.current = startListening;
    handleNextWordRef.current = handleNextWord;
    handleStartOverWordRef.current = handleStartOverWord;
  });

  // Cleanup autoAdvance countdown on component unmount
  useEffect(() => {
    return () => {
      clearAutoAdvance();
    };
  }, [clearAutoAdvance]);

  // Automatically stop mic and clear auto-advance if leaving Verbal mode or Practice tab
  useEffect(() => {
    if (practiceMode !== 'verbal' || activeTab !== 'practice') {
      stopListening();
      clearAutoAdvance();
    }
  }, [practiceMode, activeTab, stopListening, clearAutoAdvance]);

  // Toggle sound mute
  const handleToggleMute = () => {
    const nextMuted = !soundMuted;
    setSoundMuted(nextMuted);
    soundEngine.muted = nextMuted;
    if (nextMuted && typeof window !== 'undefined' && 'speechSynthesis' in window) {
      window.speechSynthesis.cancel();
    }
  };

  // Switch word when filters change
  const handleFilterChange = (
    newLevel: LevelFilterOption,
    newSource: SourceFilterOption
  ) => {
    clearAutoAdvance();
    setLevelFilter(newLevel);
    setSourceFilter(newSource);
    const nextPool = filterWordPool(newLevel, newSource, masteryMap);
    if (nextPool.length > 0) {
      const { nextWord } = selectNextWordWeighted(
        nextPool,
        masteryMap,
        currentWord.id,
        shortTermRetryQueue
      );
      loadWordOnStage(nextWord, true);
    }
  };

  const currentMastery = masteryMap[currentWord.id];

  return (
    <div className="min-h-screen flex flex-col relative bg-[#FFF9FB] text-[#1E1B4B]">
      {/* Fixed Sylveon Background Watermark Layer */}
      <SylveonWatermark />

      {/* Top Navigation Bar (Strict 3-Zone Contract) */}
      <header className="sticky top-0 z-30 flex items-center justify-between gap-8 px-6 py-3.5 bg-white/88 backdrop-blur-md border-b border-pink-200/80">
        {/* Zone 1: Brand Wordmark (single text element) */}
        <a
          href="#practice"
          onClick={(e) => {
            e.preventDefault();
            setActiveTab('practice');
          }}
          className="text-lg font-display font-bold tracking-tight text-[#1E1B4B] whitespace-nowrap shrink-0"
        >
          RibbonSpell Bee
        </a>

        {/* Zone 2: 4 Single-line Navigation Links */}
        <nav className="flex items-center gap-6 text-sm font-medium text-slate-600 overflow-x-auto">
          <button
            type="button"
            onClick={() => setActiveTab('practice')}
            className={`py-1 border-b-2 transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
              activeTab === 'practice'
                ? 'border-pink-600 text-[#1E1B4B] font-semibold'
                : 'border-transparent hover:text-[#1E1B4B]'
            }`}
          >
            Practice Stage
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('explorer')}
            className={`py-1 border-b-2 transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
              activeTab === 'explorer'
                ? 'border-pink-600 text-[#1E1B4B] font-semibold'
                : 'border-transparent hover:text-[#1E1B4B]'
            }`}
          >
            Word Explorer ({ALL_WORDS.length})
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('missed')}
            className={`py-1 border-b-2 transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
              activeTab === 'missed'
                ? 'border-pink-600 text-[#1E1B4B] font-semibold'
                : 'border-transparent hover:text-[#1E1B4B]'
            }`}
          >
            Missed Deck ({missedWordsCount})
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('stats')}
            className={`py-1 border-b-2 transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
              activeTab === 'stats'
                ? 'border-pink-600 text-[#1E1B4B] font-semibold'
                : 'border-transparent hover:text-[#1E1B4B]'
            }`}
          >
            Mastery Stats
          </button>
        </nav>

        {/* Zone 3: 1 Primary Action */}
        <div className="flex items-center shrink-0">
          <button
            type="button"
            onClick={() => {
              setActiveTab('practice');
              loadWordOnStage(undefined, true);
            }}
            className="px-4 py-2 text-xs font-semibold text-white bg-pink-600 rounded-xl hover:bg-pink-700 transition-colors whitespace-nowrap shrink-0 cursor-pointer shadow-2xs"
          >
            Next Word
          </button>
        </div>
      </header>

      {/* Main Content Container */}
      <main className="relative z-10 flex-1 w-full max-w-7xl mx-auto px-4 sm:px-6 py-6 space-y-6">
        {activeTab === 'explorer' && (
          <WordExplorerView
            words={ALL_WORDS}
            masteryMap={masteryMap}
            onPracticeWord={(word) => {
              setActiveTab('practice');
              loadWordOnStage(word, true);
            }}
          />
        )}

        {activeTab === 'missed' && (
          <WordExplorerView
            words={ALL_WORDS}
            masteryMap={masteryMap}
            initialFilterMissed={true}
            onPracticeWord={(word) => {
              setActiveTab('practice');
              loadWordOnStage(word, true);
            }}
          />
        )}

        {activeTab === 'stats' && (
          <MasteryDashboardView
            words={ALL_WORDS}
            masteryMap={masteryMap}
            sessionHistory={sessionHistory}
            onPracticeWord={(word) => {
              setActiveTab('practice');
              loadWordOnStage(word, true);
            }}
            onResetStats={() => {
              setMasteryMap({});
              setSessionHistory([]);
              setShortTermRetryQueue([]);
              localStorage.removeItem(STORAGE_KEY_MASTERY);
            }}
          />
        )}

        {activeTab === 'practice' && (
          <>
            {/* Workspace Control Strip: Mode Selector, Bee Level Filter, Word List Source */}
            <section
              aria-label="Practice Mode and Study List Controls"
              className="bg-white/55 backdrop-blur-xs border border-pink-200/75 rounded-2xl p-4 shadow-2xs flex flex-col lg:flex-row items-stretch lg:items-center justify-between gap-4"
            >
              {/* Mode Toggle: Verbal Only vs Touchscreen Only */}
              <div className="flex items-center gap-2">
                <SylveonBowEmblem className="w-8 h-6 shrink-0 hidden sm:block" />
                <div className="flex items-center gap-1 p-1 bg-pink-50/90 border border-pink-200/80 rounded-xl w-full sm:w-auto">
                  <button
                    type="button"
                    onClick={() => {
                      setPracticeMode('touchscreen');
                      stopListening();
                    }}
                    className={`flex-1 sm:flex-initial min-h-[38px] px-3.5 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer flex items-center justify-center gap-1.5 whitespace-nowrap shrink-0 ${
                      practiceMode === 'touchscreen'
                        ? 'bg-pink-600 text-white shadow-2xs'
                        : 'text-[#1E1B4B]/80 hover:text-[#1E1B4B]'
                    }`}
                  >
                    <Hand className="w-3.5 h-3.5" />
                    <span>Touchscreen Mode</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      setPracticeMode('verbal');
                      loadWordOnStage(currentWord, true);
                    }}
                    className={`flex-1 sm:flex-initial min-h-[38px] px-3.5 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer flex items-center justify-center gap-1.5 whitespace-nowrap shrink-0 ${
                      practiceMode === 'verbal'
                        ? 'bg-sky-600 text-white shadow-2xs'
                        : 'text-[#1E1B4B]/80 hover:text-[#1E1B4B]'
                    }`}
                  >
                    <Mic className="w-3.5 h-3.5" />
                    <span>Verbal Mode (Say-Spell-Say)</span>
                  </button>
                </div>
              </div>

              {/* Difficulty & Word List Filters */}
              <div className="flex flex-wrap items-center gap-2.5">
                {/* 1 Bee / 2 Bee / 3 Bee Filter */}
                <div className="flex items-center gap-1 p-1 bg-slate-100/90 rounded-xl">
                  {(
                    [
                      { id: 'all', label: 'All Levels' },
                      { id: 1, label: 'One Bee' },
                      { id: 2, label: 'Two Bee' },
                      { id: 3, label: 'Three Bee' },
                    ] as const
                  ).map((item) => (
                    <button
                      key={String(item.id)}
                      type="button"
                      onClick={() => handleFilterChange(item.id, sourceFilter)}
                      className={`min-h-[34px] px-2.5 py-1 rounded-lg text-xs font-semibold transition-colors cursor-pointer whitespace-nowrap shrink-0 ${
                        levelFilter === item.id
                          ? 'bg-white text-[#1E1B4B] shadow-2xs'
                          : 'text-slate-600 hover:text-slate-900'
                      }`}
                    >
                      {item.label}
                    </button>
                  ))}
                </div>

                {/* Source Filter: School PDF vs Augmented Scripps vs Missed */}
                <div className="flex items-center gap-1 p-1 bg-sky-50/90 border border-sky-200/70 rounded-xl">
                  {(
                    [
                      { id: 'school-pdf', label: '2026 School PDF (450)' },
                      { id: 'all', label: 'PDF + Extra Scripps (525)' },
                      { id: 'scripps-extra', label: 'Extra Scripps (75)' },
                      { id: 'missed-only', label: `Missed Only (${missedWordsCount})` },
                    ] as const
                  ).map((src) => (
                    <button
                      key={src.id}
                      type="button"
                      onClick={() => handleFilterChange(levelFilter, src.id)}
                      className={`min-h-[34px] px-2.5 py-1 rounded-lg text-xs font-semibold transition-colors cursor-pointer whitespace-nowrap shrink-0 ${
                        sourceFilter === src.id
                          ? 'bg-sky-600 text-white shadow-2xs'
                          : 'text-sky-950/75 hover:text-sky-950'
                      }`}
                    >
                      {src.label}
                    </button>
                  ))}
                </div>

                {/* Sound Mute Toggle */}
                <button
                  type="button"
                  onClick={handleToggleMute}
                  aria-label={soundMuted ? 'Unmute audio' : 'Mute audio'}
                  className="min-h-[38px] px-3 py-1.5 rounded-xl bg-white border border-pink-200 text-xs font-semibold text-[#1E1B4B] hover:bg-pink-50 transition-colors cursor-pointer flex items-center gap-1.5 whitespace-nowrap shrink-0"
                >
                  {soundMuted ? (
                    <>
                      <VolumeX className="w-4 h-4 text-rose-600" />
                      <span>Muted</span>
                    </>
                  ) : (
                    <>
                      <Volume2 className="w-4 h-4 text-pink-600" />
                      <span>Audio On</span>
                    </>
                  )}
                </button>
              </div>
            </section>

            {/* Two-Zone Sandbox Layout: Left Interactive Stage (7 cols) + Right Pronouncer & Clue Deck (5 cols) */}
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-stretch">
              {/* LEFT ZONE: Interactive Spelling Bee Stage */}
              <div className="lg:col-span-7 bg-white/55 backdrop-blur-xs border border-pink-200/80 rounded-3xl p-5 sm:p-7 shadow-xs flex flex-col justify-between space-y-6">
                {/* Stage Top Metadata Row (Clean Unboxed Typography) */}
                <div className="flex flex-wrap items-center justify-between gap-2 border-b border-pink-100 pb-4">
                  <div className="flex items-center gap-2 text-xs text-slate-600">
                    <span className="font-semibold text-pink-700">
                      {currentWord.level === 1
                        ? 'One Bee Difficulty'
                        : currentWord.level === 2
                        ? 'Two Bee Difficulty'
                        : 'Three Bee Difficulty'}
                    </span>
                    <span aria-hidden="true">·</span>
                    <span>
                      {currentWord.source === 'school-pdf'
                        ? '2026–2027 School Study List'
                        : 'Official Scripps Supplement'}
                    </span>
                    <span aria-hidden="true">·</span>
                    <span className="font-mono-tabular">
                      {currentWord.word.length} letters
                    </span>
                    <span aria-hidden="true">·</span>
                    <span className="font-mono-tabular text-slate-400">v1.14</span>
                  </div>

                  {currentMastery && currentMastery.missedCount > 0 && (
                    <div className="text-xs font-semibold text-rose-700 flex items-center gap-1">
                      <Sparkles className="w-3.5 h-3.5" />
                      <span>
                        Spaced-Repetition Review (Missed {currentMastery.missedCount}×)
                      </span>
                    </div>
                  )}
                </div>

                {/* Verbal Mode Progress Strip & Timing Indicators */}
                {practiceMode === 'verbal' && (
                  <div className="space-y-3">
                    <div className="grid grid-cols-3 gap-2">
                      <div className="p-3 rounded-2xl border border-sky-300 bg-sky-50/80 text-center transition-all">
                        <p className="text-xs font-bold font-display text-sky-950">
                          1. Target Length
                        </p>
                        <p className="text-[11px] mt-0.5 font-mono-tabular text-sky-800">
                          {currentWord.word.replace(/[\s-]/g, '').length} Letters
                        </p>
                      </div>

                      <button
                        type="button"
                        onClick={() => {
                          if (!validationResult) {
                            if (verbalSubMode === 'letters') {
                              switchToCommandMode();
                            } else {
                              enterLetterRecognitionMode();
                            }
                          }
                        }}
                        className={`p-3 rounded-2xl border text-center transition-all cursor-pointer ${
                          verbalSubMode === 'letters' && !validationResult
                            ? 'bg-pink-600 border-pink-600 text-white shadow-xs'
                            : userLetters.length > 0
                            ? 'bg-pink-50 border-pink-400 text-pink-950 shadow-2xs'
                            : 'bg-white border-pink-300 text-[#1E1B4B] hover:bg-pink-50/80'
                        }`}
                      >
                        <p className="text-xs font-bold font-display">
                          {verbalSubMode === 'letters' && !validationResult
                            ? '2. Letter Mode ON'
                            : '2. Tap to Spell'}
                        </p>
                        <p className="text-[11px] mt-0.5 font-mono-tabular">
                          {userLetters.length > 0
                            ? `${userLetters.length} / ${currentWord.word.replace(/[\s-]/g, '').length} Spelled`
                            : verbalSubMode === 'letters'
                            ? 'Speak letters now...'
                            : 'Tap to start Letter Mode'}
                        </p>
                      </button>

                      <div
                        className={`p-3 rounded-2xl border text-center transition-all ${
                          validationResult
                            ? 'bg-emerald-50/90 border-emerald-400 text-emerald-950'
                            : userLetters.length >= currentWord.word.replace(/[\s-]/g, '').length
                            ? 'bg-emerald-50/90 border-emerald-400 text-emerald-950'
                            : 'bg-slate-50 border-slate-200 text-slate-500'
                        }`}
                      >
                        <p className="text-xs font-bold font-display">
                          3. Auto-Stop
                        </p>
                        <p className="text-[11px] mt-0.5 font-mono-tabular">
                          {userLetters.length >= currentWord.word.replace(/[\s-]/g, '').length
                            ? 'Submitting in 1s'
                            : '1s on last letter'}
                        </p>
                      </div>
                    </div>

                    {/* Verbal Coach Guidance Callout (Zero Spelling Leaks) */}
                    <div className="px-4 py-2.5 rounded-xl bg-sky-50/80 border border-sky-200/80 flex items-center justify-between gap-3">
                      <p className="text-xs font-medium text-sky-950">
                        {verbalCoachBanner}
                      </p>
                      {activeCommandBadge && (
                        <span className="text-xs font-mono-tabular font-semibold text-pink-700 bg-white px-2.5 py-1 rounded-lg border border-pink-200 shrink-0 shadow-2xs">
                          {activeCommandBadge}
                        </span>
                      )}
                    </div>
                  </div>
                )}

                {/* Center Stage: Live Letter Tile Slots (No Autocorrect / No Native Input) */}
                <div className="my-auto py-3 flex flex-col items-center justify-center space-y-3.5">
                  <div className="flex flex-wrap items-center justify-center gap-3">
                    <button
                      type="button"
                      onClick={() => triggerClue('repeat')}
                      className="min-h-[46px] px-5 py-2.5 rounded-2xl bg-gradient-to-r from-pink-600 to-sky-600 hover:from-pink-700 hover:to-sky-700 text-white font-display font-semibold text-sm shadow-xs transition-all cursor-pointer flex items-center gap-2 whitespace-nowrap"
                    >
                      <Volume2 className="w-4 h-4" />
                      <span>Hear Pronouncer Read Word</span>
                    </button>

                    {currentWord.altSpellings && currentWord.altSpellings.length > 0 && (
                      <span className="text-xs text-slate-500">
                        (Accepts US or British spelling)
                      </span>
                    )}
                  </div>

                  {/* Interactive Letter Tiles Display (Tap empty box to start Letter Mode, or tap any placed tile to fix/delete) */}
                  <div
                    aria-live="polite"
                    onClick={() => {
                      if (
                        practiceMode === 'verbal' &&
                        !validationResult &&
                        userLetters.length === 0 &&
                        verbalSubMode !== 'letters'
                      ) {
                        enterLetterRecognitionMode();
                      }
                    }}
                    className={`w-full min-h-[92px] p-4 rounded-2xl backdrop-blur-2xs border flex flex-wrap items-center justify-center gap-2 transition-all ${
                      practiceMode === 'verbal' &&
                      verbalSubMode === 'letters' &&
                      !validationResult
                        ? 'bg-pink-50/65 border-pink-400 ring-2 ring-pink-300/70'
                        : 'bg-white/40 border-pink-200/70'
                    } ${
                      practiceMode === 'verbal' &&
                      !validationResult &&
                      userLetters.length === 0 &&
                      verbalSubMode !== 'letters'
                        ? 'cursor-pointer hover:border-pink-400 hover:bg-pink-50/40'
                        : ''
                    }`}
                  >
                    {userLetters.length === 0 ? (
                      <div className="text-center space-y-1">
                        <p className="text-sm text-slate-500 font-medium">
                          {practiceMode === 'verbal'
                            ? verbalSubMode === 'letters'
                              ? 'Listening for letters! Speak each letter clearly (e.g. "S - A - U - N...")...'
                              : 'Tap here or tap "Start Spelling (Letter Mode)" below when ready to spell...'
                            : 'Tap the letter tiles below to spell the word (no autocorrect)...'}
                        </p>
                        {practiceMode === 'verbal' && !validationResult && (
                          <p className="text-[11px] text-slate-400">
                            {verbalSubMode === 'letters'
                              ? 'Tiles appear live as you speak · Auto-stops 1s after last letter'
                              : 'Hands-free voice commands ("Repeat", "Sentence", "Definition") are active now'}
                          </p>
                        )}
                      </div>
                    ) : (
                      userLetters.map((ch, idx) => {
                        const isSelected = selectedTileIndex === idx && !validationResult;
                        return (
                          <button
                            key={`${idx}-${ch}`}
                            type="button"
                            disabled={Boolean(validationResult)}
                            onClick={(e) => {
                              e.stopPropagation();
                              if (!validationResult) {
                                setSelectedTileIndex((prev) => (prev === idx ? null : idx));
                              }
                            }}
                            title={
                              validationResult
                                ? undefined
                                : `Tap to fix or delete letter #${idx + 1} (${ch.toUpperCase()})`
                            }
                            className={`min-w-[44px] h-[52px] px-2.5 rounded-xl font-display font-bold text-xl flex flex-col items-center justify-center border shadow-2xs transition-all ${
                              validationResult
                                ? validationResult.isCorrect
                                  ? 'bg-emerald-50 border-emerald-400 text-emerald-900'
                                  : 'bg-pink-50 border-pink-300 text-[#1E1B4B]'
                                : isSelected
                                ? 'bg-pink-600 border-pink-700 text-white ring-2 ring-pink-300 scale-105 cursor-pointer'
                                : 'bg-white hover:bg-pink-50 border-pink-300 text-[#1E1B4B] cursor-pointer'
                            }`}
                          >
                            <span>{ch === ' ' ? '␣' : ch}</span>
                            {!validationResult && (
                              <span
                                className={`text-[9px] font-mono-tabular leading-none mt-0.5 ${
                                  isSelected ? 'text-pink-100' : 'text-slate-400'
                                }`}
                              >
                                {idx + 1}
                              </span>
                            )}
                          </button>
                        );
                      })
                    )}
                  </div>

                  {/* Helper A: Inline Popover when a placed letter tile is tapped to Fix or Delete */}
                  {selectedTileIndex !== null &&
                    !validationResult &&
                    userLetters[selectedTileIndex] !== undefined && (
                      <div className="w-full p-3.5 rounded-2xl bg-white border-2 border-pink-400 shadow-sm space-y-2.5">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <span className="text-xs font-display font-bold text-[#1E1B4B]">
                            Fix Letter Tile #{selectedTileIndex + 1} (&ldquo;
                            {userLetters[selectedTileIndex].toUpperCase()}&rdquo;)
                          </span>
                          <div className="flex items-center gap-2">
                            <button
                              type="button"
                              onClick={() => handleDeleteLetterAt(selectedTileIndex)}
                              className="min-h-[36px] px-3 py-1 rounded-xl bg-rose-50 hover:bg-rose-100 border border-rose-200 text-rose-800 text-xs font-semibold cursor-pointer flex items-center gap-1"
                            >
                              <Delete className="w-3.5 h-3.5" />
                              <span>Delete Tile</span>
                            </button>
                            <button
                              type="button"
                              onClick={() => setSelectedTileIndex(null)}
                              className="min-h-[36px] px-2.5 py-1 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold cursor-pointer"
                            >
                              Done
                            </button>
                          </div>
                        </div>

                        {/* Acoustic Lookalike Quick-Swap Row */}
                        <div className="flex flex-wrap items-center gap-1.5">
                          <span className="text-[11px] font-semibold text-pink-700 mr-1">
                            Sounds Like:
                          </span>
                          {getAcousticAlternatives(
                            userLetters[selectedTileIndex],
                            lastLetterDisagreements,
                            6
                          ).map((alt) => (
                            <button
                              key={alt}
                              type="button"
                              onClick={() => handleReplaceLetterAt(selectedTileIndex, alt)}
                              className="min-w-[40px] min-h-[38px] px-2.5 py-1 rounded-xl bg-pink-50 hover:bg-pink-600 hover:text-white border border-pink-300 text-[#1E1B4B] font-display font-bold text-sm transition-colors cursor-pointer"
                            >
                              {alt}
                            </button>
                          ))}
                        </div>

                        {/* Full A-Z Replacement Grid */}
                        <div className="pt-1.5 border-t border-pink-100 flex flex-wrap gap-1">
                          {ALPHABET_KEYS.map((letter) => (
                            <button
                              key={letter}
                              type="button"
                              onClick={() => handleReplaceLetterAt(selectedTileIndex, letter)}
                              className={`min-w-[34px] min-h-[34px] px-1.5 rounded-lg font-display font-semibold text-xs border transition-colors cursor-pointer ${
                                userLetters[selectedTileIndex] === letter
                                  ? 'bg-pink-600 text-white border-pink-600'
                                  : 'bg-slate-50 hover:bg-pink-50 text-[#1E1B4B] border-slate-200'
                              }`}
                            >
                              {letter}
                            </button>
                          ))}
                        </div>
                      </div>
                    )}

                  {/* Helper B: Live N-Best / Acoustic Ambiguity Suggestion Bar for the last spoken letter */}
                  {practiceMode === 'verbal' &&
                    userLetters.length > 0 &&
                    !validationResult &&
                    selectedTileIndex === null && (
                      <div className="w-full px-3.5 py-2 rounded-xl bg-amber-50/90 border border-amber-200 flex flex-wrap items-center justify-between gap-2">
                        <div className="flex flex-wrap items-center gap-1.5">
                          <span className="text-xs font-semibold text-amber-950">
                            Heard &ldquo;{userLetters[userLetters.length - 1].toUpperCase()}&rdquo; — Did you say:
                          </span>
                          {getAcousticAlternatives(
                            userLetters[userLetters.length - 1],
                            lastLetterDisagreements,
                            5
                          ).map((alt) => (
                            <button
                              key={alt}
                              type="button"
                              onClick={() =>
                                handleReplaceLetterAt(userLetters.length - 1, alt)
                              }
                              className="min-w-[38px] min-h-[36px] px-2.5 py-1 rounded-lg bg-white hover:bg-amber-600 hover:text-white border border-amber-300 text-amber-950 font-display font-bold text-xs transition-colors cursor-pointer shadow-2xs"
                            >
                              {alt.toUpperCase()}
                            </button>
                          ))}
                        </div>
                        <span className="text-[11px] text-amber-800">
                          Tap any tile above to edit or delete
                        </span>
                      </div>
                    )}

                  {/* Real-Time Live Hearing Speech Feedback Indicator (Target word masked!) */}
                  {practiceMode === 'verbal' && liveTranscript && !validationResult && (
                    <div className="flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-sky-100/90 border border-sky-300 text-sky-950 text-xs font-semibold shadow-2xs">
                      <Mic className="w-3.5 h-3.5 text-sky-700 shrink-0" />
                      <span>Live Hearing: &ldquo;{liveTranscript}&rdquo;</span>
                    </div>
                  )}

                  {/* Constructive Feedback Banner & Side-by-Side Pattern Comparison */}
                  {validationResult && (
                    <div
                      className={`w-full rounded-2xl p-5 border space-y-3 transition-all ${
                        validationResult.isCorrect
                          ? 'bg-emerald-50/95 border-emerald-300 text-emerald-950'
                          : 'bg-rose-50/95 border-rose-200 text-rose-950'
                      }`}
                    >
                      <div className="flex flex-wrap items-center justify-between gap-3">
                        <div className="flex items-center gap-2">
                          {validationResult.isCorrect ? (
                            <CheckCircle2 className="w-6 h-6 text-emerald-600 shrink-0" />
                          ) : (
                            <AlertCircle className="w-6 h-6 text-rose-600 shrink-0" />
                          )}
                          <div>
                            <h3 className="text-base font-display font-bold">
                              {validationResult.isCorrect
                                ? '✓ Correct! Official Championship Spelling!'
                                : '▲ Constructive Pattern Review — Keep Going!'}
                            </h3>
                            <p className="text-xs opacity-85">
                              {validationResult.isCorrect
                                ? `Awesome job mastering "${currentWord.word}"!`
                                : `We scheduled "${currentWord.word}" to reappear soon so you can lock in this pattern.`}
                            </p>
                          </div>
                        </div>

                        <div className="flex flex-wrap items-center gap-2">
                          {validationResult.isCorrect && autoAdvanceSeconds !== null && (
                            <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-emerald-100 border border-emerald-300 text-emerald-950 text-xs font-semibold">
                              <span className="font-mono-tabular">
                                Auto-advancing in {autoAdvanceSeconds}s...
                              </span>
                            </div>
                          )}

                          {!validationResult.isCorrect && (
                            <div className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl bg-rose-100 border border-rose-300 text-rose-950 text-xs font-semibold">
                              <span>Say &ldquo;Try Again&rdquo; or tap below</span>
                            </div>
                          )}

                          {!validationResult.isCorrect && (
                            <button
                              type="button"
                              onClick={handleStartOverWord}
                              className="min-h-[44px] px-3.5 py-2 rounded-xl bg-white hover:bg-rose-100 border border-rose-300 text-rose-900 text-xs font-semibold transition-colors cursor-pointer flex items-center gap-1.5 whitespace-nowrap"
                            >
                              <RotateCcw className="w-3.5 h-3.5" />
                              <span>Practice Word Again</span>
                            </button>
                          )}

                          <button
                            type="button"
                            onClick={handleNextWord}
                            className="min-h-[44px] px-4 py-2 rounded-xl bg-[#1E1B4B] hover:bg-slate-800 text-white text-xs font-semibold transition-colors cursor-pointer flex items-center gap-1.5 whitespace-nowrap"
                          >
                            <span>Next Word</span>
                            <ArrowRight className="w-4 h-4" />
                          </button>
                        </div>
                      </div>

                      {/* Constructive Letter-by-Letter Pattern Comparison when Missed */}
                      {!validationResult.isCorrect && (
                        <div className="pt-2 border-t border-rose-200/80 grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                          <div className="bg-white/90 rounded-xl p-3 border border-rose-200">
                            <p className="font-semibold text-slate-500 mb-1.5">
                              Your Attempt:
                            </p>
                            <div className="flex flex-wrap gap-1 font-mono-tabular text-sm font-semibold">
                              {validationResult.diff.map((item, idx) => (
                                <span
                                  key={idx}
                                  className={`px-1.5 py-0.5 rounded ${
                                    item.status === 'correct'
                                      ? 'bg-emerald-100 text-emerald-900'
                                      : 'bg-rose-100 text-rose-800 underline decoration-wavy'
                                  }`}
                                >
                                  {item.char}
                                </span>
                              ))}
                            </div>
                          </div>

                          <div className="bg-white/90 rounded-xl p-3 border border-emerald-200">
                            <p className="font-semibold text-slate-500 mb-1.5">
                              Official Scripps Spelling:
                            </p>
                            <p className="font-mono-tabular text-base font-bold text-emerald-900 tracking-wider">
                              {currentWord.word}
                            </p>
                            {currentWord.altSpellings && (
                              <p className="text-[11px] text-slate-500 mt-1">
                                Alternate accepted: {currentWord.altSpellings.join(', ')}
                              </p>
                            )}
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </div>

                {/* Mode-Specific Interactive Input Surface */}
                {practiceMode === 'touchscreen' ? (
                  <TouchTileKeypad
                    disabled={Boolean(validationResult)}
                    canSubmit={userLetters.length > 0}
                    onCharPress={(char) => {
                      soundEngine.playTileTap();
                      setUserLetters((prev) => [...prev, char]);
                    }}
                    onBackspace={() => {
                      soundEngine.playTileTap();
                      setUserLetters((prev) => prev.slice(0, -1));
                    }}
                    onClear={() => {
                      setUserLetters([]);
                    }}
                    onSubmit={() => evaluateCurrentSpelling()}
                  />
                ) : (
                  /* Verbal Mode: Touch-Triggered Letter Recognition Mode + Hands-Free Command Mode + Backup A-Z Bar */
                  <div className="space-y-3.5 pt-2 border-t border-pink-100">
                    {/* Primary Action Row: Touch Trigger for Dedicated Letter Recognition Mode */}
                    <div className="flex flex-wrap items-center justify-between gap-2.5">
                      {!validationResult ? (
                        verbalSubMode !== 'letters' ? (
                          <button
                            type="button"
                            onClick={enterLetterRecognitionMode}
                            className="flex-1 min-h-[54px] px-5 py-3 rounded-2xl bg-pink-600 hover:bg-pink-700 text-white font-display font-bold text-sm transition-all cursor-pointer flex items-center justify-center gap-2.5 shadow-xs whitespace-nowrap"
                          >
                            <Mic className="w-5 h-5 text-white shrink-0" />
                            <span>Tap to Start Spelling (Letter Recognition Mode)</span>
                          </button>
                        ) : (
                          <button
                            type="button"
                            onClick={switchToCommandMode}
                            className="flex-1 min-h-[54px] px-5 py-3 rounded-2xl bg-emerald-600 hover:bg-emerald-700 text-white font-display font-bold text-sm transition-all cursor-pointer flex items-center justify-center gap-2.5 shadow-xs ring-2 ring-emerald-300 ring-offset-1 whitespace-nowrap"
                          >
                            <Mic className="w-5 h-5 text-white shrink-0" />
                            <span>
                              Letter Mode Listening ({userLetters.length}/
                              {currentWord.word.replace(/[\s-]/g, '').length} Letters) — Tap to Pause
                            </span>
                          </button>
                        )
                      ) : (
                        <button
                          type="button"
                          onClick={() =>
                            isMicListening ? stopListening() : startListening('command')
                          }
                          className={`flex-1 min-h-[52px] px-5 py-3 rounded-2xl font-display font-semibold text-sm transition-all cursor-pointer flex items-center justify-center gap-2.5 shadow-xs whitespace-nowrap ${
                            isMicListening
                              ? 'bg-sky-600 hover:bg-sky-700 text-white'
                              : 'bg-pink-600 hover:bg-pink-700 text-white'
                          }`}
                        >
                          {isMicListening ? (
                            <>
                              <Mic className="w-5 h-5 text-white" />
                              <span>
                                Command Mic Active — Say &ldquo;Try Again&rdquo; or &ldquo;Next Word&rdquo;
                              </span>
                            </>
                          ) : (
                            <>
                              <MicOff className="w-5 h-5" />
                              <span>Resume Hands-Free Command Mic</span>
                            </>
                          )}
                        </button>
                      )}

                      {/* Secondary Controls: Hands-Free Mic Toggle, Start Over, Next Word */}
                      {!validationResult && (
                        <div className="flex flex-wrap items-center gap-2">
                          <button
                            type="button"
                            onClick={() =>
                              isMicListening
                                ? stopListening()
                                : startListening(verbalSubMode)
                            }
                            className={`min-h-[54px] px-3.5 py-2.5 rounded-2xl border text-xs font-semibold transition-colors cursor-pointer flex items-center gap-1.5 whitespace-nowrap ${
                              isMicListening
                                ? 'bg-sky-50 hover:bg-sky-100 border-sky-300 text-sky-950'
                                : 'bg-slate-100 hover:bg-slate-200 border-slate-300 text-slate-700'
                            }`}
                            title={
                              isMicListening
                                ? 'Tap to mute microphone'
                                : 'Tap to turn microphone on'
                            }
                          >
                            {isMicListening ? (
                              <>
                                <Mic className="w-4 h-4 text-sky-600" />
                                <span>
                                  {verbalSubMode === 'letters'
                                    ? 'Mic On (Letters)'
                                    : 'Mic On (Commands)'}
                                </span>
                              </>
                            ) : (
                              <>
                                <MicOff className="w-4 h-4 text-slate-500" />
                                <span>Mic Muted</span>
                              </>
                            )}
                          </button>

                          <button
                            type="button"
                            onClick={handleStartOverWord}
                            className="min-h-[54px] px-3.5 py-2.5 rounded-2xl bg-rose-50 hover:bg-rose-100 border border-rose-200 text-rose-900 text-xs font-semibold transition-colors cursor-pointer flex items-center gap-1.5 whitespace-nowrap"
                            title="Say 'Start Over' or tap to restart this word"
                          >
                            <RotateCcw className="w-3.5 h-3.5 text-rose-600" />
                            <span>Start Over</span>
                          </button>

                          <button
                            type="button"
                            onClick={handleNextWord}
                            className="min-h-[54px] px-3.5 py-2.5 rounded-2xl bg-sky-50 hover:bg-sky-100 border border-sky-200 text-sky-900 text-xs font-semibold transition-colors cursor-pointer flex items-center gap-1.5 whitespace-nowrap"
                            title="Say 'Next Word' or tap to advance"
                          >
                            <span>Next Word</span>
                            <ArrowRight className="w-3.5 h-3.5 text-sky-600" />
                          </button>
                        </div>
                      )}

                      {userLetters.length > 0 && !validationResult && (
                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            onClick={() => handleDeleteLetterAt(userLetters.length - 1)}
                            className="min-h-[48px] px-3.5 py-2 rounded-2xl bg-pink-50 hover:bg-pink-100 border border-pink-200 text-pink-900 text-xs font-semibold transition-colors cursor-pointer flex items-center gap-1 whitespace-nowrap"
                          >
                            <Delete className="w-4 h-4" />
                            <span>Undo Last</span>
                          </button>

                          <button
                            type="button"
                            onClick={() => {
                              stopListening();
                              evaluateCurrentSpelling(userLettersRef.current);
                            }}
                            className="min-h-[48px] px-4 py-2 rounded-2xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold transition-colors cursor-pointer flex items-center gap-1.5 whitespace-nowrap"
                          >
                            <CheckCircle2 className="w-4 h-4" />
                            <span>Submit Now</span>
                          </button>
                        </div>
                      )}
                    </div>

                    {/* Helper C: Compact On-Screen A-Z Backup Mini-Bar (Always available during Verbal Mode) */}
                    {!validationResult && (
                      <div className="p-3 rounded-2xl bg-white/75 border border-pink-200/80 space-y-2">
                        <div className="flex items-center justify-between text-[11px] text-slate-600">
                          <span className="font-semibold text-[#1E1B4B]">
                            Backup Touch A–Z Bar (Tap any stubborn letter anytime)
                          </span>
                          <span className="font-mono-tabular text-slate-500">
                            {speechSupported
                              ? 'Voice + Touch Hybrid Active'
                              : 'Touch Fallback Active'}
                          </span>
                        </div>
                        <div className="flex flex-wrap justify-center gap-1.5">
                          {ALPHABET_KEYS.map((letter) => (
                            <button
                              key={letter}
                              type="button"
                              onClick={() => handleBackupMiniBarTap(letter)}
                              className="min-w-[38px] min-h-[42px] px-2 rounded-xl bg-white hover:bg-pink-50 active:bg-pink-100 border border-pink-200/90 text-[#1E1B4B] font-display font-bold text-sm shadow-2xs transition-all cursor-pointer"
                            >
                              {letter}
                            </button>
                          ))}
                          <button
                            type="button"
                            onClick={() => handleBackupMiniBarTap('-')}
                            className="min-w-[38px] min-h-[42px] px-2 rounded-xl bg-sky-50 hover:bg-sky-100 border border-sky-200 text-sky-950 font-display font-bold text-sm transition-all cursor-pointer"
                            title="Hyphen"
                          >
                            -
                          </button>
                          <button
                            type="button"
                            disabled={userLetters.length === 0}
                            onClick={() => handleDeleteLetterAt(userLetters.length - 1)}
                            className="min-w-[46px] min-h-[42px] px-2.5 rounded-xl bg-rose-50 hover:bg-rose-100 disabled:opacity-40 border border-rose-200 text-rose-900 font-display font-semibold text-xs transition-all cursor-pointer flex items-center justify-center gap-1"
                            title="Backspace"
                          >
                            <Delete className="w-4 h-4" />
                          </button>
                        </div>
                      </div>
                    )}

                    <p className="text-xs text-slate-500 text-center">
                      Tap <span className="font-semibold text-pink-700">Start Spelling</span> for Letter Mode (auto-stops 1s after last letter) · Hands-free commands:{' '}
                      <span className="font-semibold text-[#1E1B4B]">“Repeat”</span> ·{' '}
                      <span className="font-semibold text-[#1E1B4B]">“Sentence”</span> ·{' '}
                      <span className="font-semibold text-[#1E1B4B]">“Definition”</span> ·{' '}
                      <span className="font-semibold text-[#1E1B4B]">“Try Again”</span> ·{' '}
                      <span className="font-semibold text-[#1E1B4B]">“Next Word”</span>
                    </p>
                  </div>
                )}
              </div>

              {/* RIGHT ZONE: Official Pronouncer Clue Deck & Session Accuracy */}
              <div className="lg:col-span-5 flex flex-col justify-between gap-6">
                {/* Pronouncer Clue Buttons & Cards */}
                <div className="bg-white/55 backdrop-blur-xs border border-pink-200/80 rounded-3xl p-5 sm:p-6 shadow-xs space-y-5 flex-1">
                  <div>
                    <h2 className="text-lg font-display font-bold text-[#1E1B4B]">
                      Official Pronouncer Clue Deck
                    </h2>
                    <p className="text-xs text-slate-600 mt-0.5">
                      {practiceMode === 'verbal'
                        ? 'Ask aloud ("Repeat", "Sentence", "Definition", "Start Over", "Next Word") or tap buttons below.'
                        : 'Tap any clue button below to hear and view official word guidance.'}
                    </p>
                  </div>

                  {/* 4 Clue Action Buttons */}
                  <div className="grid grid-cols-2 gap-2.5">
                    <button
                      type="button"
                      onClick={() => triggerClue('repeat')}
                      className="min-h-[46px] px-3.5 py-2.5 rounded-xl bg-pink-50/90 hover:bg-pink-100 border border-pink-200 text-xs font-semibold text-pink-950 transition-colors cursor-pointer flex items-center gap-2 whitespace-nowrap"
                    >
                      <Volume2 className="w-4 h-4 text-pink-600 shrink-0" />
                      <span>Repeat Word</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => triggerClue('phonetic')}
                      className="min-h-[46px] px-3.5 py-2.5 rounded-xl bg-sky-50/90 hover:bg-sky-100 border border-sky-200 text-xs font-semibold text-sky-950 transition-colors cursor-pointer flex items-center gap-2 whitespace-nowrap"
                    >
                      <Sparkles className="w-4 h-4 text-sky-600 shrink-0" />
                      <span>Phonetic Guide</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => triggerClue('definition')}
                      className="min-h-[46px] px-3.5 py-2.5 rounded-xl bg-pink-50/90 hover:bg-pink-100 border border-pink-200 text-xs font-semibold text-pink-950 transition-colors cursor-pointer flex items-center gap-2 whitespace-nowrap"
                    >
                      <BookOpen className="w-4 h-4 text-pink-600 shrink-0" />
                      <span>Definition</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => triggerClue('sentence')}
                      className="min-h-[46px] px-3.5 py-2.5 rounded-xl bg-sky-50/90 hover:bg-sky-100 border border-sky-200 text-xs font-semibold text-sky-950 transition-colors cursor-pointer flex items-center gap-2 whitespace-nowrap"
                    >
                      <MessageSquareQuote className="w-4 h-4 text-sky-600 shrink-0" />
                      <span>Use in a Sentence</span>
                    </button>
                  </div>

                  {/* Clue Display Cards (Word spelling is masked until graded!) */}
                  <div className="space-y-3 pt-1">
                    {/* Phonetic Pronunciation Card */}
                    <div className="p-4 rounded-2xl bg-white/45 backdrop-blur-2xs border border-pink-200/70">
                      <div className="flex items-center justify-between text-xs text-slate-500 mb-1">
                        <span className="font-semibold text-sky-800">
                          Phonetic Pronunciation & Part of Speech
                        </span>
                        <span>{currentWord.partOfSpeech}</span>
                      </div>
                      {revealedClues.phonetic || validationResult ? (
                        <p className="text-base font-mono-tabular font-bold text-[#1E1B4B]">
                          \ {currentWord.phonetic} \
                        </p>
                      ) : (
                        <p className="text-xs text-slate-500">
                          Tap <span className="font-semibold">Phonetic Guide</span> to reveal syllable breakdown without spoiling the spelling.
                        </p>
                      )}
                    </div>

                    {/* Definition Card */}
                    <div className="p-4 rounded-2xl bg-white/45 backdrop-blur-2xs border border-pink-200/70">
                      <p className="text-xs font-semibold text-pink-800 mb-1">
                        Official Elementary Definition
                      </p>
                      {revealedClues.definition || validationResult ? (
                        <p className="text-sm text-[#1E1B4B] leading-relaxed">
                          {currentWord.definition}
                        </p>
                      ) : (
                        <p className="text-xs text-slate-500">
                          Tap <span className="font-semibold">Definition</span> or say{' '}
                          <span className="font-semibold">“Definition”</span> to hear and view the meaning.
                        </p>
                      )}
                    </div>

                    {/* Sentence Card (Target word masked as _____ before submission so it never spoils Touchscreen spelling!) */}
                    <div className="p-4 rounded-2xl bg-white/45 backdrop-blur-2xs border border-pink-200/70">
                      <p className="text-xs font-semibold text-sky-800 mb-1">
                        Example Sentence in Context
                      </p>
                      {revealedClues.sentence || validationResult ? (
                        <p className="text-sm text-[#1E1B4B] leading-relaxed italic">
                          “
                          {validationResult
                            ? currentWord.sentence
                            : currentWord.sentence.replace(
                                new RegExp(
                                  '\\b(' +
                                    [currentWord.word, ...(currentWord.altSpellings || [])]
                                      .map((w) => w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
                                      .join('|') +
                                    ')\\b',
                                  'gi'
                                ),
                                '_____'
                              )}
                          ”
                        </p>
                      ) : (
                        <p className="text-xs text-slate-500">
                          Tap <span className="font-semibold">Use in a Sentence</span> or say{' '}
                          <span className="font-semibold">“Can you use it in a sentence?”</span>
                        </p>
                      )}
                    </div>
                  </div>
                </div>

                {/* Live Session Accuracy & Spaced-Repetition Summary Card */}
                <div className="bg-white/55 backdrop-blur-xs border border-pink-200/80 rounded-3xl p-5 shadow-xs space-y-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Award className="w-5 h-5 text-pink-600" />
                      <h3 className="text-sm font-display font-bold text-[#1E1B4B]">
                        Session Accuracy & Mastery
                      </h3>
                    </div>
                    <button
                      type="button"
                      onClick={() => setActiveTab('stats')}
                      className="text-xs font-semibold text-pink-700 hover:underline cursor-pointer"
                    >
                      View Full Stats →
                    </button>
                  </div>

                  <div className="grid grid-cols-3 gap-2.5 text-center">
                    <div className="p-3 rounded-2xl bg-white/50 border border-pink-200/70">
                      <p className="text-xl font-display font-bold font-mono-tabular text-[#1E1B4B]">
                        {sessionStats.accuracy}%
                      </p>
                      <p className="text-[11px] text-slate-500">Accuracy</p>
                    </div>

                    <div className="p-3 rounded-2xl bg-emerald-50/80 border border-emerald-200">
                      <p className="text-xl font-display font-bold font-mono-tabular text-emerald-800">
                        {sessionStats.correct}
                      </p>
                      <p className="text-[11px] text-emerald-800">Correct</p>
                    </div>

                    <div className="p-3 rounded-2xl bg-rose-50/80 border border-rose-200">
                      <p className="text-xl font-display font-bold font-mono-tabular text-rose-800">
                        {sessionStats.missed}
                      </p>
                      <p className="text-[11px] text-rose-800">Missed</p>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </>
        )}
      </main>
    </div>
  );
}
