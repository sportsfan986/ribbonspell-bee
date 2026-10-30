# Changelog

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
