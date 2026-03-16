# Parle

**Practice speaking French with AI** — voice conversations, role-play scenarios, and TEF-style practice in the browser.

---

## What is Parle?

Parle is a web app for practicing French conversation using your microphone and AI. You speak, the app transcribes and replies in French (with optional English), and you hear the reply via text-to-speech. No account required to try it; API keys are configured in the app or via environment variables.

### Features

| Mode | Description |
|------|-------------|
| **Free conversation** | Open-ended French chat with the AI. Speak, get transcribed and answered, hear responses with TTS. |
| **Scenario role-play** | Create or load scenarios (e.g. bakery, restaurant). Practice with one AI character or multiple (e.g. baker + cashier), each with a distinct voice. |
| **TEF Ad Persuasion** | Practice the TEF “persuasion” task: upload an ad image, then respond to objections in a structured 5-direction × 3-round flow with a timer. |
| **TEF Ad Questioning** | Practice the TEF “questioning” task: upload an ad, ask questions in French; the app tracks questions and repeated questions for review. |

Scenarios are stored in the browser. Conversation history, hints, and (where applicable) timers and summaries are shown in the UI.

---

## Tech stack

- **Frontend:** React 19, Vite 7, TypeScript, Tailwind CSS  
- **AI:** Google Gemini (transcription, chat, TTS); OpenAI optional for scenario creation from a description  
- **Tests:** Vitest (unit), Playwright (e2e)

---

## Prerequisites

- **Node.js** (LTS recommended)
- **API keys:**
  - **Gemini** — required for voice conversation, scenario practice, and TEF modes (transcription, chat, TTS).
  - **OpenAI** — optional; used only when creating a scenario from a spoken/typed description (scenario planning).

---

## Run locally

1. **Install dependencies**
   ```bash
   npm install
   ```

2. **Configure API keys** (pick one approach)
   - **Option A — Environment (recommended for development)**  
     Create `.env.local` in the project root:
     ```env
     GEMINI_API_KEY=your_gemini_key
     OPENAI_API_KEY=your_openai_key   # optional, for scenario-from-description
     ```
   - **Option B — In-app**  
     Run the app; if no keys are found, you’ll be prompted to enter them. Keys are stored in the browser and override env vars.

3. **Start the app**
   ```bash
   npm run dev
   ```
   Open the URL shown in the terminal (e.g. `http://localhost:5173`).

### Other commands

| Command | Purpose |
|---------|--------|
| `npm run build` | Production build |
| `npm run preview` | Preview production build locally |
| `npm test` | Run unit tests (Vitest) |
| `npm run test:e2e` | Run E2E tests (Playwright; run `npm run test:e2e:install` once to install browsers) |

---

## Project layout (high level)

| Area | Contents |
|------|----------|
| `App.tsx` | Main UI and mode orchestration (free chat, scenario, TEF Ad persuasion/questioning) |
| `components/` | UI (Orb, Controls, conversation history, setup flows, timers, summaries) |
| `services/` | Gemini (session, voice message, TTS), OpenAI (scenario planning), scenario/voice/API-key helpers |
| `hooks/` | Audio, conversation timer, document head |
| `utils/` | TEF objection state machine, time helpers |
| `__tests__/` | Unit tests |
| `e2e/` | Playwright E2E tests |

Design notes and intentional patterns (e.g. TTS vs history ordering, TEF state machine, schema choices) are documented in **`AGENTS.md`** for contributors and code review.
