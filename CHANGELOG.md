# Changelog

## [v1.14] — 2026-11-02

### Fixed
- **Eliminated Aggressive Beeping**:
  - Silenced all automatic WebAudio mode-transition and microphone-ready beeps (`playMicReadyBeep`, `playLetterModeStart`, `playCommandModeStart`, `playStepAdvance`) and removed per-letter voice recognition ticks.
  - Stopped continuous background `SpeechRecognizer` restart loops between words so Android's native OS recognition beep never fires while listening to the pronouncer or waiting between words.
- **Restored `v1.00` Letter Identification Accuracy (Plus Partial-Rescue & Homophone Unpacking)**:
  - Removed multi-letter English words (`"an"`, `"in"`, `"as"`, `"is"`, `"us"`, `"am"`, `"if"`, `"al"`, `"ok"`, `"age"`, `"each"`, `"our"`, `"ice"`) from `SPOKEN_LETTER_MAP` so two-letter combinations spoken while spelling (e.g. `A - N` -> `"an"`, `I - N` -> `"in"`) preserve both letters instead of collapsing into a single letter.
  - Restored `v1.00` character unpacking (`decomposeSpokenLetterToken`) for multi-letter speech chunks in Letter Mode while still filtering out start/end target word pronunciations.
  - Removed custom `EXTRA_SPEECH_INPUT_*` silence overrides in `MainActivity.kt` to restore crisp `v1.00` native Android endpointing, and added automatic rescue of `lastPartialText` when Android ends a quick single-letter utterance via `onError`.
  - Prevented premature 1-second auto-submit on unfinalized `!isFinal` partial transcripts.
- **Strict Button-Triggered Letter Mode Per Word**:
  - Removed automatic speech promotion from Command Mode into Letter Mode.
  - Every new word (`loadWordOnStage`), graded word (`evaluateCurrentSpelling`), and restarted word (`handleStartOverWord`) cleanly exits Letter Mode and stops the microphone until the user explicitly presses **"Tap to Start Spelling (Letter Recognition Mode)"** for that word.

## [v1.12] — 2026-10-30

### Added
- **Expanded Scripps Vocabulary (700+ Words)**: Added over 135 additional official Scripps National Spelling Bee competition words across One Bee, Two Bee, and Three Bee difficulty levels with complete phonetic respellings, parts of speech, definitions, and kid-friendly competition sentences.
- **Hybrid Voice Engine with Unblocked Command Listening**: The verbal mode engine now runs in seamless hybrid mode:
  - Spoken commands (*"again"*, *"try again"*, *"next word"*, *"next"*, *"start over"*, *"repeat"*, *"sentence"*, *"definition"*, *"clear"*) are always heard and executed immediately, whether actively spelling or viewing word results.
  - Spoken words at the start or end are recognized as framing pronunciations without leaking into the spelling.
  - Only spoken letters (and NATO phonetics/homophones) enter the active letter tiles.
- **Continuous Microphone Active During Feedback**: The microphone is never disabled after a word is evaluated. The student can navigate 100% hands-free by speaking *"Next Word"* or *"Try Again"*.
- **5-Second Auto-Advance Countdown**: Upon spelling a word correctly, the app reads the congratulations and spelling aloud, keeps the microphone active, and displays an animated 5-second auto-advance countdown. Saying *"Next Word"* or tapping the button advances immediately without waiting.
- **Automatic Verbal Prompt for "Try Again"**: If a student misses a word, the pronouncer constructively reviews the spelling and verbally prompts aloud: *"Say 'try again' to practice this word, or say 'next word' to continue"*. Saying *"try again"* or *"again"* immediately restarts practice on that word.

### Added
- **Letter-Only Verbal Mode Engine**: The voice pipeline now listens exclusively for spelled letters (`extractSpokenLettersOnly`) and valid commands, completely eliminating whole-word leaks or duplicate word token dumping.
- **Auto-Stop 1 Second After Last Letter**: As soon as the student speaks the final expected letter of the word (`userLetters.length >= targetLetterCount`), the app waits 1 second, automatically stops the microphone, and submits the spelling for instant evaluation.
- **10-Second Pause Auto-Submit**: If a student pauses for more than 10 seconds while spelling, the app automatically concludes the word and evaluates the attempt.
- **Zero Raw Transcript Displays**: Removed the `Heard: “...”` badge that inadvertently printed recognized speech (e.g. *"mute m u t e mute"*) on screen. The badge now strictly displays clean command labels (such as `Repeat`, `Sentence`, `Definition`) and real-time timing indicators (`Submitting in 1s...`).
- **Streamlined Verbal Mode Action Strip**: Replaced redundant Step 1 confirmation buttons with direct controls: `↺ Start Over`, `⌫ Undo Letter`, `Submit Spelling Now`, and `Next Word ➔`.

## [v1.01] — 2026-10-30

### Added
- **"Start Over" Spoken Command & Button**: Spoken command ("start over", "reset word", "try again", "clear letters") resets the current word's spoken letters and Say-Spell-Say phase without counting as a missed attempt. Dedicated on-screen `↺ Start Over` button also added.
- **"Next Word" Spoken Command & Button**: Spoken command ("next word", "skip word", "advance word") and on-screen `Next Word ➔` button allow jumping directly to the next randomized word at any point.
- **Independent Spoken Word and Letter Tokenization**: Completely decoupled spoken words from spoken letters in the speech recognition engine. Saying *"Boat ... B - O - A - T ... Boat"* rapidly or without long pauses will no longer dump duplicated words (e.g. *"boatboat"*); the target word at the beginning and end is cleanly extracted as the opening and closing Say-Spell-Say tokens, while intermediate sounds and NATO phonetics are mapped strictly to letters.
- **Full NATO Phonetic Alphabet & Homophone Map**: Added Alpha, Bravo, Charlie, Delta, etc., and common misrecognitions (bee/sea/dee/gee/jay/kay/cue/tea/you/why/ex/oh).
- **Startup Word Randomization**: Practice sessions now automatically pick a random word on initial launch across all 525 words instead of defaulting to the first word in the list.

### Fixed
- **Zero Spelling Leaks in Audio Mode**: Removed the button label `✓ Confirm Step 1 (“{currentWord.word}”)` that previously exposed the secret word's spelling on screen; replaced with `✓ Confirm Step 1 (I Said the Word)`. Pre-spelling clue/coach announcements no longer reveal the spelling of the target word.
- **Sylveon Watermark Visibility**: Boosted watermark illustration opacity and replaced opaque cards with translucent glassmorphism (`bg-white/55 backdrop-blur-xs` and `bg-white/60`) so Sylveon shows cleanly through all practice cards, clue decks, dashboard stats, and word explorer lists.

## [v1.00] — 2026-10-30

### Added
- **2026–2027 School Spelling Bee Study List (450 Words) + Augmented Scripps Collection (75 Words)**:
  - Complete extraction of all 150 One Bee, 150 Two Bee, and 150 Three Bee words from the 6-page 2026–2027 School Spelling Bee Study List PDF, including British/preferred alternate spellings, phonetic respellings, parts of speech, definitions, and example sentences.
- **Verbal Mode (Say–Spell–Say)**:
  - Natural pronunciation playback and continuous voice command recognition for *"Repeat"*, *"Can you use it in a sentence?"*, and *"Definition"*.
  - Fuzzy word matching for opening/closing word repetition and phonetic letter disambiguation.
- **Touchscreen Mode (Anti-Autocorrect Keypad)**:
  - Custom on-screen letter tile keypad preventing OS keyboard popups, predictive text bars, and spellcheck underlines.
- **Adaptive Spaced Repetition & Mastery Tracker**:
  - Automatic weighting and short-term retry scheduling for missed words, plus dedicated Missed Deck and Mastery Stats views.
- **Sylveon Fairy-Type Theme & Watermark**:
  - Pearl-cream, pastel ribbon pink, and cerulean blue color palette with a custom Sylveon background illustration watermark.
- **Android APK (`ribbonspell-bee-v1.00.apk`) & Web Simulator**:
  - Offline-ready Android APK with `WebViewAssetLoader` and native `AndroidSpeechBridge` (`TextToSpeech` + `SpeechRecognizer`), plus automated GitHub Pages Web Simulator deployment.
