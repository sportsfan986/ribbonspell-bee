# RibbonSpell Bee — Sylveon Scripps 2026–2027 Spelling Studio (`v1.00`)

An elementary and middle school spelling bee practice studio themed around the Fairy-type Pokémon **Sylveon**, featuring all **450 words** from the official **2026–2027 School Spelling Bee Study List** PDF plus **75 augmented official Scripps words** across **One Bee**, **Two Bee**, and **Three Bee** difficulty levels.

## Live Web Simulator & Android APK (`v1.00`)

- **Live Web Simulator**: [https://sportsfan986.github.io/ribbonspell-bee/](https://sportsfan986.github.io/ribbonspell-bee/)
- **Android APK (`v1.00`)**: [Download `ribbonspell-bee-v1.00.apk` from Releases](https://github.com/sportsfan986/ribbonspell-bee/releases/tag/v1.00)

## Key Features

1. **Verbal Mode (Structured Say–Spell–Say Flow)**:
   - Reads words aloud with natural pronunciation (supporting both browser Web Speech API and native Android Text-to-Speech).
   - Listens for voice prompts (*"Repeat"*, *"Can you use it in a sentence?"*, and *"Definition"*).
   - Guides spellers through the 3-step competitive habit: **1. Say the Word** (fuzzy matched) → **2. Spell Each Letter** (validated after finishing) → **3. Repeat the Word to Finish**.
2. **Touchscreen Mode (Anti-Autocorrect Tile Keypad)**:
   - Dedicated clue buttons for **Repeat Word**, **Phonetic Guide**, **Definition**, and **Use in a Sentence**.
   - Custom on-screen QWERTY + diacritic/hyphen tile keypad (`a–z`, `-`, `Space`, `ñ`, `é`) with zero OS keyboard autocorrect or spellcheck interference.
3. **Adaptive Spaced Repetition & Constructive Feedback**:
   - Tracks overall accuracy, streaks, and missed words across sessions, automatically boosting the probability of missed words reappearing in current and future sessions.
   - Plays a sparkling Fairy-type harmonic chime for correct answers and a warm constructive review tone with a side-by-side character diff for missed words.
