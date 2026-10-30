# RibbonSpell Bee — Sylveon-Themed Scripps 2026–2027 Spelling Bee Studio

An interactive spelling bee training studio for elementary and middle school students themed around the Fairy-type Pokémon **Sylveon**, built with the complete 450-word **2026–2027 School Spelling Bee Study List** (from the provided PDF) augmented with additional official Scripps One Bee, Two Bee, and Three Bee words. It offers a hands-free **Verbal Mode** that enforces the official competitive *"Say Word → Spell Word → Say Word"* protocol with voice prompt recognition, and a **Touchscreen Mode** with a dedicated on-screen letter tile keypad that prevents OS autocorrect interference.

---

## User Review & Critical Decisions

> [!IMPORTANT]
> The following architectural and UX choices incorporate your confirmed preferences and Sylveon theming update:

- **Sylveon Aesthetic & Background Watermark (Updated)**: The entire interface is styled around **Sylveon's signature Fairy-type palette**—creamy pearl-white backgrounds, pastel ribbon pink, luminous sky-blue accents, bow-inspired geometric flourishes, and a delicate **Sylveon watermark illustration** anchored gracefully in the background canvas.
- **Voice & Audio Engine (Confirmed)**: Uses the browser's native **Web Speech API** (`SpeechSynthesis` for natural pronunciation, definitions, and sentences; continuous/interim `SpeechRecognition` for zero-latency voice commands and letter-by-letter parsing) paired with a manual push-to-talk / step fallback bar if microphone permissions are unavailable.
- **Touchscreen Input Mechanism (Confirmed)**: Uses a custom **on-screen touch letter tile keypad** (`≥ 44×44px` hitboxes) with no native `<input>` focus so iOS/Android/iPadOS keyboards, predictive text bars, and OS autocorrect never appear. Includes special keys for hyphens, apostrophes, spaces, and diacritical marks (e.g., `ñ`, `é`) required by multi-word and accented entries on the 2026–2027 list (such as *piñata*, *éclair*, *cul-de-sac*, *a cappella*, *bogong moth*).
- **Word Dataset & Filtering (Confirmed)**: Includes all **450 words** extracted verbatim from the uploaded 6-page 2026–2027 School Spelling Bee Study List (150 One Bee, 150 Two Bee, 150 Three Bee), including official alternate/British spellings (*fertilizer/fertiliser*, *materialize/materialise*, *odorant/odourant*, *glycerin/glycerine*, *brazier/brasier*, *kerosene/kerosine*), plus an **Augmented Scripps Collection** across all three difficulty levels. Users can filter by difficulty (One Bee, Two Bee, Three Bee) and word source (School PDF List, Extra Scripps Words, or Combined), or launch the dedicated **Missed Words Review Deck**.

---

## 1. Overview & Core Concept

- **What It Does**: Prepares students for classroom and regional spelling bees through authentic competitive practice wrapped in an inviting, charming Sylveon theme. Students can train verbally as if standing at the stage microphone or practice quietly on a tablet/desktop using tactile letter tiles, while an adaptive spaced-repetition engine prioritizes previously missed words.
- **Target Audience / Persona**: Elementary and middle school spellers (grades 1–8), parents coaching at home, and teachers running classroom bee prep.
- **Key Value**: Enforces the structured *"Say the word → Spell letter-by-letter → Repeat the word"* muscle memory habit required at competitive bees, eliminates tablet spellcheck cheating/interference, and tracks mastery across all 450+ words.

---

## 2. User Experience & Visual Design

### Key User Flows

1. **Top Bar & Deck Selector**:
   - Follows a clean 3-zone top navigation bar: Brand Wordmark (`RibbonSpell Bee`) — View Navigation (`Practice Stage`, `Word Explorer`, `Missed Deck`, `Mastery Stats`) — Primary Action (`New Session`).
   - Below the top bar, a workspace control strip lets students filter by **Difficulty Tier** (`All Levels`, `One Bee`, `Two Bee`, `Three Bee`) and **Word Source** (`School 2026–2027 PDF List`, `Extra Scripps Words`, `Missed Words Only`), and toggle between **Verbal Mode** and **Touchscreen Mode**.
2. **Verbal Only Mode (Stage Microphone Flow)**:
   - **Step 1 — Pronouncer Reads Word**: The app announces the new word aloud with clear pronunciation.
   - **Step 2 — Interactive Pronouncer Prompts**: While in the listening state before spelling begins, the student can say *"Repeat"* (or *"Can you repeat the word?"*), *"Sentence"* (or *"Can you use it in a sentence?"*), or *"Definition"* (or *"What is the definition?"*). The app responds aloud and displays the requested clue card in the concept deck.
   - **Step 3 — Structured "Say – Spell – Say" Tracker**:
     - **Phase A (Say Word First)**: A visual 3-step stage indicator highlights `1. Say the Word`. Using phonetic/Levenshtein fuzzy matching, the app validates that the student repeated the target word aloud (and gently prompts them if they jump straight into spelling).
     - **Phase B (Spell Letter-by-Letter)**: The indicator advances to `2. Spell Each Letter`. As the student speaks letters (`A - P - P - L - E`, including phonetic disambiguation for `B/D/E/P/T/V/Z`, `M/N`, `S/F`), each spoken letter appears as a pearl-and-ribbon tile on the stage without premature red/green interruption, allowing the student to finish spelling completely.
     - **Phase C (Say Word to Finish)**: Once the student finishes the letters and speaks the whole word again (`3. Say Word to Confirm`), or pauses and taps/says *"Done"*, the app locks in the submission and evaluates every letter.
3. **Touchscreen Only Mode (Anti-Autocorrect Tile Flow)**:
   - Displays prominent clue buttons (**Hear Word**, **Use in a Sentence**, **Definition**, **Phonetic Pronunciation**) that both reveal the clue card on screen and optionally read it aloud.
   - Provides a custom **On-Screen QWERTY + Diacritic/Punctuation Tile Keypad** with large `min-h-[48px]` tactile buttons (`A–Z`, `-`, `'`, `Space`, `Backspace`, `Clear`, `Submit Spelling`).
   - Letters populate custom visual letter slots on the stage—never invoking a browser `<input>` element—ensuring zero autocorrect, zero red squiggly underlines, and zero predictive word bars.
4. **Constructive Feedback & Audio Synthesis**:
   - **Correct Spelling**: Plays a bright, sparkling Fairy-type harmonic chime via the Web Audio API, highlights all letter tiles in Sylveon Cerulean/Mint (`#0284C7` / `#059669`) with a `● CORRECT` label, increments the word's mastery streak, and advances to the next word.
   - **Missed Spelling**: Plays a gentle, encouraging two-tone marimba prompt (never a harsh buzzer), displays a side-by-side letter diff comparing **Your Spelling** vs. **Official Spelling** so the student immediately sees the exact pattern difference, speaks the correct spelling aloud, and schedules the word for high-priority reappearance.

### Visual Identity & Theme (Sylveon Palette & Watermark)

- **Aesthetic Direction**: **Sylveon Fairy-Type Sanctuary** — soft, welcoming, and luminous while maintaining high-contrast elementary reading legibility.
- **Sylveon Background Watermark**:
  - A custom layered vector/illustrated **Sylveon watermark** (featuring Sylveon's iconic bow-like feelers, flowing ribbons, long ears, and graceful pose) rendered as a fixed, non-interactive background layer (`pointer-events-none select-none opacity-[0.09]`) behind the stage and clue cards, so it stays visible across all views without reducing text contrast.
- **60-30-10 Sylveon Color Palette**:
  - **60% Dominant Canvas (Sylveon Pearl Coat)**: Warm Pearl Cream (`#FFF9FB`) with subtle pastel rose-tinted structural hairlines (`#FBCFE8`).
  - **30% Structural Surfaces (Translucent Ribbon Cards)**: Crisp frosted white (`rgba(255, 255, 255, 0.86)`) with subtle backdrop blur so the Sylveon background watermark softly shines through, paired with deep Berry-Navy typography (`#1E1B4B`) for WCAG AA contrast.
  - **10% Semantic Focal Accents (Sylveon Ribbons & Eyes)**:
    - *Primary Interactive Accent (Sylveon Ribbon Pink)*: `#EC4899` / `#F472B6` for primary buttons, active mode selectors, and step highlights.
    - *Secondary Accent (Sylveon Sky-Blue Eyes & Bow Tips)*: `#0284C7` / `#38BDF8` for active voice listening states, phonetic badges, and Three-Bee tier markers.
    - *Correct State*: Luminous Emerald-Teal (`#059669`) paired with explicit `✓ Correct` text labels.
    - *Constructive Pattern Review*: Soft Coral-Rose (`#E11D48`) paired with explicit diff markers (`▲ Compare Letters`) for missed letters.
- **Typography & Hierarchy**:
  - **Display / Headings & Letter Tiles**: `Outfit` or `Bricolage Grotesque` (600/700 weight) for crisp, friendly geometric letter clarity on stage tiles and headers.
  - **Body & Definitions**: `Plus Jakarta Sans` (400/600 weight) for effortless elementary reading comprehension.
  - **Phonetics & Tabular Stats**: `IBM Plex Mono` (`tabular-nums`) for phonetic respellings (e.g., `\ ˈkī-tə-nəs \`), accuracy percentages, and streak counters.
- **Two-Zone Sandbox Layout**:
  - On desktop (`1440px` baseline, `max-w-7xl`), the Practice view uses a balanced 2-column layout over the Sylveon watermark canvas: **Left Zone (65% width)** houses the Interactive Spelling Stage (3-step Say-Spell-Say progress bar, live letter tile slots, and microphone/touch keypad); **Right Zone (35% width)** houses the Pronouncer Clue Deck (Phonetic respelling, Definition, Sentence, and Live Session Accuracy).

---

## 3. Key Product Decisions & Trade-Offs

- **Decision 1: Weighted Spaced-Repetition Queue for Missed Words**
  - *Chosen Approach*: Every word carries a dynamic selection weight. Unseen words start at weight `1.0`, mastered words drop to `0.25`, and missed words jump to `4.5` AND are queued to reappear within `3–5` words in the current session as well as prioritized in future sessions via `localStorage`.
  - *Why*: Ensures students immediately reinforce a tricky spelling pattern after seeing the constructive correction, and retain it across days.
- **Decision 2: Fuzzy Word Matching + Phonetic Letter Disambiguation in Verbal Mode**
  - *Chosen Approach*: Browser speech recognition often transcribes single spoken letters as homophones (e.g., `"bee"` for `B`, `"see"` for `C`, `"are"` for `R`, `"why"` for `Y`, `"double u"` for `W`) or merges rapid letters into short words. We use a specialized Spelling Bee Speech Parser that maps phonetic letter names and homophones back to individual characters while using Levenshtein / phonetic similarity for the opening and closing full-word utterances.
  - *Why*: Standard speech-to-text fails on isolated letters without a custom phonetic letter dictionary; this ensures smooth, frustration-free verbal spelling for elementary voices.
- **Decision 3: Synthesized Web Audio API Sound Effects**
  - *Chosen Approach*: Generate musical chimes (sparkling Fairy-inspired major 9th arpeggio for correct spelling, warm gentle two-note chime for constructive review, subtle pop for tile taps) using the browser's native `AudioContext` oscillator nodes with a mute toggle.
  - *Why*: Zero external audio file latency, works 100% offline, and guarantees a friendly, non-punitive acoustic environment.

---

## 4. Technical Architecture & Data Strategy

### Architecture & Component Diagram

```
┌──────────────────────────────────────────────────────────────────────────────┐
│                     Top Navigation Bar (3-Zone Contract)                     │
│  [RibbonSpell Bee]  [Practice Stage · Word List · Missed Deck · Stats] [New] │
└──────────────────────────────────────┬───────────────────────────────────────┘
                                       │
┌──────────────────────────────────────▼───────────────────────────────────────┐
│        Sylveon Watermark Canvas (Fixed Background Layer + Ribbon Motif)      │
│  ┌────────────────────────────────────────────────────────────────────────┐  │
│  │               Session Filter & Mode Control Strip                      │  │
│  │ [Verbal Mode | Touchscreen Mode] [1 Bee · 2 Bee · 3 Bee] [PDF | Extra] │  │
│  └───────────────┬────────────────────────────────────────┬───────────────┘  │
│                  │                                        │                  │
│  ┌───────────────▼──────────────────────┐ ┌───────────────▼───────────────┐  │
│  │    Left Zone: Interactive Stage      │ │ Right Zone: Pronouncer Deck   │  │
│  │                                      │ │                               │  │
│  │ • Structured Flow Progress           │ │ • Clue Action Controls        │  │
│  │   [1. Say Word]→[2. Spell]→[3. Say]  │ │   [Hear Word] [Phonetics]     │  │
│  │ • Live Letter Tile Display & Diff    │ │   [Sentence]  [Definition]    │  │
│  │   [ C ] [ H ] [ I ] [ S ] [ E ] [ L ]│ │ • Revealed Clue Cards         │  │
│  │ • Mode-Specific Input Surface        │ │   - Phonetic Respelling       │  │
│  │   - Verbal: Live Mic + Voice Parser  │ │   - Part of Speech & Def      │  │
│  │   - Touch: Custom Tile Keypad        │ │   - Example Sentence          │  │
│  └───────────────┬──────────────────────┘ └───────────────┬───────────────┘  │
└──────────────────┼────────────────────────────────────────┼──────────────────┘
                   │                                        │
┌──────────────────▼────────────────────────────────────────▼──────────────────┐
│                Core Engines & Persistent Storage (localStorage)              │
│  • 2026–2027 PDF Word Corpus (450 Words) + Augmented Scripps Bank            │
│  • Adaptive Spaced-Repetition Scheduler (Missed Word Weighting & Re-queue)   │
│  • Web Speech API Controller (TTS Pronouncer + Fuzzy Say-Spell-Say ASR)      │
│  • Web Audio API Synthesizer (Sparkling Chime + Constructive Review Tone)    │
└──────────────────────────────────────────────────────────────────────────────┘
```

### Data Model & State

- **`WordEntry` Record**:
  - `id`: Unique slug
  - `word`: Primary official spelling (e.g., `"fertilizer"`, `"piñata"`, `"cul-de-sac"`)
  - `altSpellings`: Optional accepted alternates from the PDF (e.g., `["fertiliser"]`, `["glycerine"]`)
  - `level`: `1 | 2 | 3` (One Bee, Two Bee, Three Bee)
  - `source`: `'school-pdf' | 'scripps-extra'`
  - `phonetic`: Child-friendly phonetic pronunciation guide (e.g., `"FER-tuh-ly-zer"`)
  - `partOfSpeech`: Noun, verb, adjective, etc.
  - `definition`: Age-appropriate elementary dictionary definition
  - `sentence`: Contextual sentence with the target word clearly used
- **`WordMasteryStats` Record (Persisted in `localStorage`)**:
  - `attempts`, `correctCount`, `missedCount`, `streak`, `lastAttemptAt`, `lastMisspelledAs`, `weight` (dynamic spaced-repetition priority).

### Interactive Component & State Mapping

- **Verbal State Machine (`idle` → `pronouncing` → `awaiting_start_word` → `spelling_letters` → `awaiting_end_word` → `feedback`)**:
  - During `awaiting_start_word`, voice transcripts are checked first for help intents (`"repeat"`, `"sentence"`, `"definition"`) which trigger TTS playback and reveal the clue card without advancing the step. If the transcript fuzzy-matches the target word, the state transitions to `spelling_letters`.
  - During `spelling_letters`, spoken tokens are parsed into individual letters and appended to the live stage tiles. Once the student says the full word again (or clicks/says *"Finish Spelling"*), the state transitions to `feedback`, plays the Web Audio tone, logs accuracy to `WordMasteryStats`, and inserts missed words into the short-term re-queue (`+3` words ahead) and boosts their long-term weight.
- **Touchscreen State Machine**:
  - Tapping on-screen letter tiles appends characters to the active spelling buffer with tactile visual compression (`active:scale-95`) and a soft click sound. Clue buttons (`Sentence`, `Definition`, `Phonetic Pronunciation`, `Repeat Audio`) toggle the respective clue cards and trigger TTS reading. Tapping `Submit Spelling` runs the exact same multi-spelling validator (supporting British/preferred alternates from the PDF) and constructive diff view.
