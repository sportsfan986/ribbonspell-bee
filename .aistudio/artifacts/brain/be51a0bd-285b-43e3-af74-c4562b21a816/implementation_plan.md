# Dual-Mode Speech Recognition & High-Reliability Letter Capture

This update redesigns Verbal Mode into a deterministic two-stage audio workflow: **Hands-Free Command Mode** for natural voice requests before and after spelling, and a dedicated **Tap-to-Spell Letter Recognition Mode** engineered specifically for rapid single-letter phonetics, multi-hypothesis (N-best) letter extraction, and instant touch-based corrections.

---

## User Review & Critical Decisions

> [!IMPORTANT]
> The following architectural and UX decisions incorporate your confirmed preferences from our design check:

- **Confirmed Decision 1 — Touch-Triggered Letter Recognition Mode**: Tapping **"Tap to Start Spelling (Letter Mode)"** switches the speech engine from generic phrase recognition into dedicated **Letter Listening Mode**, which stays open with extended silence tolerance while you spell and **automatically exits & submits** 1 second after the final letter of the word is spoken (or after a 10-second pause).
- **Confirmed Decision 2 — Hands-Free Voice Commands Outside Letter Mode**: Before starting to spell and after word evaluation, the microphone operates in **Hands-Free Command Mode**, listening continuously for natural phrases (*"Repeat"*, *"Sentence"*, *"Definition"*, *"Phonetic"*, *"Try Again"*, *"Next Word"*).
- **Confirmed Decision 3 — Multi-Layer Spelling Backup Helpers**:
  1. **Interactive Letter Tiles (Tap to Fix / Delete)**: Tapping any recognized letter tile opens an inline quick-popover showing acoustic lookalikes (e.g. `B / V / P / D / E` or `M / N` or `S / F / X`) plus a 1-tap Delete button.
  2. **Live N-Best Ambiguity Suggestions**: When speech recognition hears an ambiguous sound (e.g., E-set consonants `B / D / P / T / V / C / Z` or nasal `M / N`), an inline suggestion chip row lets you swap the last tile with a single tap without losing your place.
  3. **Compact A–Z Backup Mini-Bar**: A sleek, single-Tap A–Z + backspace ribbon directly beneath the voice controls during Letter Mode so you can tap any stubborn letter instantly if background noise interferes.

---

## 1. Overview & Core Concept

- **What It Does**: Eliminates dropped and merged letters during verbal spelling by separating **general speech-to-text command listening** from **dedicated letter-by-letter acoustic recognition**.
- **Why Standard Speech-to-Text Fails on Spelling**: Mobile and browser speech recognizers use language models that try to combine short letter sounds (`"S - A - U - N..."`) into full English words (`"saw nerd"`, `"son"`), or cut off the microphone after 650ms pauses—causing the next spoken letter to be swallowed during the 300ms microphone restart gap.
- **How Dual-Mode Solves It**:
  1. **Extended Single-Session Letter Capture**: When you tap to enter Letter Mode, the native Android recognizer increases its silence timeout to **3,500ms** and requests up to **5 N-best recognition alternatives** (`EXTRA_MAX_RESULTS = 5`), preventing mid-word microphone restarts.
  2. **N-Best & Phonetic Letter Unpacking**: Instead of only inspecting the top sentence guess (which might be a coerced English word), the letter parser scans all N-best hypotheses and phonetic letter-sound decompositions to extract the exact sequence of letters spoken.
  3. **Real-Time Interim Letter Diffing**: Spoken letters appear as tiles immediately from live partial transcripts rather than waiting for you to stop speaking.

---

## 2. User Experience & Visual Design

### Key User Flows

1. **Pre-Spelling (Hands-Free Command Mode)**:
   - The Pronouncer reads the word aloud.
   - The stage enters **Command Listening Mode** (sky-blue indicator): you can ask aloud *"Repeat"*, *"Sentence"*, *"Definition"*, or *"Next Word"* hands-free.
   - A prominent, ergonomic primary button sits in the natural thumb zone: **`Tap to Start Spelling (Letter Mode)`** (or tap the letter tile box directly).
2. **Active Spelling (Dedicated Letter Recognition Mode)**:
   - Tapping the button plays a crisp ascending confirmation chime and switches the stage into **Letter Listening Mode** (vibrant pink/emerald focus ring with live audio pulse).
   - As you speak each letter, tiles populate in real time from partial speech results.
   - **Ambiguity Chip Bar**: If the recognizer detects an acoustically close letter (e.g., heard `B`, alternatives `V`, `P`, `D`), a subtle quick-swap strip (`Did you say: [V] [P] [D]?`) appears right below the active tile.
   - **Tap Any Tile to Edit or Remove**: Tapping any placed letter tile opens an inline chooser to replace that specific letter or delete it without restarting the word.
   - **On-Screen A–Z Backup Mini-Bar**: A compact 2-row touch strip below the mic button lets you tap any missing letter at any time while remaining in Verbal Mode.
3. **Auto-Stop & Post-Word Flow**:
   - Once the number of recognized letters reaches the target word length, a 1-second visual countdown ring completes and grades the word automatically (or after a 10-second pause if fewer letters were spoken).
   - After grading, the microphone automatically returns to **Hands-Free Command Mode** so you can say *"Try Again"* or *"Next Word"* (with the 5-second auto-advance timer on correct words).

### Visual Identity & Ergonomics

- **Aesthetic Direction**: Continuation of the crisp Sylveon pastel palette (`#FFF9FB` canvas, `#1E1B4B` deep navy typography, `#DB2777` ribbon pink for active Letter Mode, `#0284C7` sky blue for Hands-Free Command Mode, and `#059669` emerald for completion).
- **Touch Target Ergonomics**: All mode triggers, interactive letter tiles, ambiguity swap buttons, and mini-bar keys enforce a minimum `44px × 44px` hit target for effortless mobile thumb operation.
- **Zero Target-Word Spoilers**: The coaching banner, live transcript preview, and clue deck strictly mask the target word so the spelling is never leaked on screen prior to grading.

---

## 3. Key Product Decisions & Trade-Offs

- **Decision 1: Explicit Touch Trigger for Letter Mode vs. Always-On Hybrid Guessing**
  - *Chosen Approach*: Touch button (or tapping the tile area) transitions from Command Mode into dedicated Letter Mode, and auto-stops once the word is spelled.
  - *Why*: Gives the speech engine a 100% unambiguous signal that every syllable you utter next is a letter (or *"clear"* / *"start over"* / *"done"*), allowing us to aggressively unpack letter homophones and N-best alternatives that would otherwise conflict with normal conversation.
- **Decision 2: Live Partial-Transcript Letter Streaming vs. Waiting for Final Utterance**
  - *Chosen Approach*: Track incremental token growth inside `onPartialResults` / `interimResults` during Letter Mode so letters lock in as you speak them, while preserving previously committed letters across recognizer cycles.
  - *Why*: Eliminates the frustrating delay where a student says 6 letters and sees nothing on screen until they pause.
- **Decision 3: Multi-Hypothesis (N-Best) Acoustic Decomposition**
  - *Chosen Approach*: Configure Android's speech bridge to pass all N-best transcript candidates to the web layer, scoring each candidate by how cleanly its tokens map to single letters and phonetic letter names, plus phonetic fallback rules for merged 2-letter syllables (e.g., `"be"` $\to$ `B`, `"see"` $\to$ `C`, `"ar"` $\to$ `R`, `"em"` $\to$ `M`, `"en"` $\to$ `N`, `"es"` $\to$ `S`, `"ef"` $\to$ `F`, `"el"` $\to$ `L`, `"ex"` $\to$ `X`).
  - *Why*: Standard STT frequently transcribes a sequence like `"B E D"` as `"bed"` in hypothesis #1 while keeping `"b e d"` or `"bee e dee"` in hypothesis #2 or #3. Inspecting all candidates recovers the individual letters cleanly.

---

## 4. Technical Architecture & Data Strategy

### Architecture & Mode State Machine Diagram

```
┌───────────────────────────────────────────────────────────────────────────┐
│                        PRACTICE STAGE (VERBAL MODE)                       │
└─────────────────────────────────────┬─────────────────────────────────────┘
                                      │
          ┌───────────────────────────┴───────────────────────────┐
          ▼                                                       ▼
┌───────────────────────────────────┐   Tap "Start Spelling"   ┌───────────────────────────────────┐
│     HANDS-FREE COMMAND MODE       │ ───────────────────────► │   LETTER RECOGNITION MODE         │
│  (Active before & after spelling) │                          │  (Dedicated Letter Capture)       │
├───────────────────────────────────┤                          ├───────────────────────────────────┤
│ • Short silence window (900ms)    │ ◄─────────────────────── │ • Extended silence window (3500ms)│
│ • Listens for:                    │   Auto-stops 1s after    │ • N-Best (5 candidates) scoring   │
│   "Repeat", "Sentence",           │   last letter or 10s     │ • Live partial-result tile commit │
│   "Definition", "Phonetic",       │   inactivity timeout     │ • Acoustic ambiguity suggestions  │
│   "Try Again", "Next Word"        │                          │ • Tap tile to edit/delete         │
└───────────────────────────────────┘                          │ • On-screen A-Z backup mini-bar   │
                                                               └───────────────────────────────────┘
```

### Interactive Component & State Mapping

1. **Native Android & Web Speech Mode Bridge**:
   - Extend the Android speech bridge with `startListening(mode: "command" | "letters")`.
   - In `"letters"` mode, Android configures `EXTRA_SPEECH_INPUT_COMPLETE_SILENCE_LENGTH_MILLIS = 3500L`, `EXTRA_SPEECH_INPUT_POSSIBLY_COMPLETE_SILENCE_LENGTH_MILLIS = 2500L`, and `EXTRA_MAX_RESULTS = 5`, forwarding the JSON array of N-best alternatives on both partial and final results.
2. **Incremental Session Letter Buffer**:
   - Maintain `committedLetters` (letters locked in from previous speech segments or manual taps) + `activeSegmentLetters` (letters parsed live from the current ongoing speech utterance).
   - Whenever the user taps a tile to edit/delete or taps a key on the A–Z backup mini-bar, synchronize `committedLetters` and reset the active segment baseline so speech and touch work together seamlessly.
3. **Acoustic Lookalike & Ambiguity Engine**:
   - Define phonetic confusion groups:
     - *E-Rhyme Group*: `B`, `C`, `D`, `E`, `G`, `P`, `T`, `V`, `Z`
     - *Eh-Rhyme Group*: `F`, `L`, `M`, `N`, `S`, `X`
     - *Ay-Rhyme Group*: `A`, `H`, `J`, `K`
     - *Eye/Y Group*: `I`, `Y`
     - *Oh/U Group*: `O`, `Q`, `U`, `W`
   - When a letter from a confusion group is recognized (or when N-best candidates disagree on the last letter), surface the top 3–4 acoustic neighbors as 1-tap quick-fix buttons and populate the tile-tap edit popover with those neighbors first, followed by full A–Z selection and Delete.
