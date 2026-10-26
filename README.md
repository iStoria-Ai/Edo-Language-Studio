# Edo Language Studio — Android & iOS Mobile Application

**Edo Language Studio** is an independent, community-powered mobile application (React + TypeScript + Capacitor) built to help preserve and teach the Edo language of Nigeria.

---

## 1. Visual Identity & Color-Coded Sections

The application follows the approved Edo cultural branding (featuring the Benin/Edo bronze head artwork on a warm cream `#FAF7F0` background) and uses consistent section colors across the dashboard cards, internal section headers, and numbered presentation badges:

- **Welcome & Dashboard (Screens 1 & 2)**: Original Edo Dark Green (`#157A4C`) and warm cream styling.
- **GREEN (`#157A4C`) — Teach Edo**: Screens **3, 4, 5, 6**, and **Screen 10 (Teach Something Else)**.
- **BLUE (`#1D6CE0`) — Help Others**: Screen **7**.
- **YELLOW (`#F4C330`) — Language Library**: Screen **8**.
- **PURPLE (`#6E4BC3`) — AI Progress**: Screen **9**.

---

## 2. Core Screens & Architecture

1. **Screen 1 — Welcome (No Login)**: Full-screen Edo bronze-head hero artwork, tagline, and a single **Get Started** button that opens the dashboard immediately without requiring registration or login.
2. **Screen 2 — Home Dashboard**: 2×2 color-coded dashboard grid (`Teach Edo`, `Help Others`, `Language Library`, `AI Progress`), plus a shortcut to `Teach Something Else` and bottom navigation.
3. **Screens 3–6 — Teach Edo (Single-Screen Progressive Experience)**:
   - Happens on **one screen** without navigating to separate recording or writing pages.
   - **State 3 (Prompt & Record)**: Shows progress (`Question 1 of 10`), English word (`Hand`), illustration, English TTS speaker button (`Play`), centered green microphone button, and `"I don't know — Next"`.
   - **State 4 (Voice Recorded)**: Keeps the word and picture visible, plays back the recorded Edo answer automatically, and offers replay, **Record again**, and **Save Voice & Continue**.
   - **State 5 (Optional Writing)**: Asks `"Can you also write 'Hand' in Edo?"` with Edo vowel helpers (`ẹ`, `ọ`, `vb`, `gh`, `kh`, `mw`, `rh`), **Save and continue**, or **I can't write it** (which preserves the voice-only contribution as `Needs Writing`).
   - **State 6 (Thank You & Next)**: Offers **Next word**, **Teach Something Else**, and **Finish for now**.
4. **Screen 7 — Help Others (Blue Section)**:
   - Supports completing missing Edo writing for voice-only recordings (`"Someone has already recorded this word"` — e.g. *Good morning*) without re-recording audio.
   - Also supports the opposite queue: recording pronunciation for written Edo contributions that are missing audio.
5. **Screen 8 — Language Library (Yellow Section)**:
   - Searchable and filterable (`All`, `Words`, `Phrases`, `Missing`) library with audio playback and word detail sheets.
   - Pre-populated vocabulary is explicitly badged as **Sample** placeholder data until community verification is connected.
6. **Screen 9 — AI Progress (Purple Section)**:
   - Displays collection milestones (`Words collected`, `Voice recordings`, `Written words`, `Phrases & sentences`), review status, and the 5 Learning Stages.
   - Includes the **Future Feature: AI Speaks Edo** locked preview card (explicitly noting that the AI is not yet trained).
7. **Screen 10 — Teach Something Else (Green Section)**:
   - Open-ended contribution screen allowing speakers to teach any word, phrase, or sentence via text and/or voice.

---

## 3. Running Locally & Building for Android / iOS

```bash
# Start interactive development server
npm run dev

# Build production web bundle
npm run build

# Sync with Capacitor Android & iOS native projects
npx cap sync
```
