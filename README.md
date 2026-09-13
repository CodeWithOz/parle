# Parle

**Practice speaking French with AI** — voice conversations, role-play scenarios, and TEF-style practice in the browser.

---

## What is Parle?

Parle is a web app for practicing French conversation using your microphone and AI. You speak, the app transcribes and replies in French (with optional English), and you hear the reply via text-to-speech. No account required to try it; paste your API keys in Settings. The browser never stores readable keys — they are sealed in an HttpOnly cookie by the Cloudflare Worker BFF.

### Features

| Mode | Description |
|------|-------------|
| **Free conversation** | Open-ended French chat with the AI. Speak, get transcribed and answered, hear responses with TTS. |
| **Scenario role-play** | Create or load scenarios (e.g. bakery, restaurant). Practice with one AI character or multiple (e.g. baker + cashier), each with a distinct voice. Scenarios can include an editable, ordered **roadmap** of steps shown as a progress outline during practice; the AI reports which step the conversation currently reflects, and the displayed step only ever advances, never regresses. |
| **TEF Ad Persuasion** | Practice the TEF “persuasion” task: upload an ad image, argue your position for 10 minutes while the AI coaches you through early, mid, and late-session phases. Post-session review scores you against the 5 official TEF criteria. |
| **TEF Ad Questioning** | Practice the TEF “questioning” task: upload an ad, ask questions in French; the app tracks questions and repeated questions for review. |

Scenarios, saved TEF ads, and topic history are stored in the browser. Settings includes a
**Backup** export/import for that durable data (`.parle` file). Conversation history, hints,
and (where applicable) timers and summaries are shown in the UI.

---

## Tech stack

- **Frontend:** React 19, Vite 7, TypeScript, Tailwind CSS (French-flag-inspired blue/white/red design tokens; responsive at `tablet` 760px / `desktop` 1200px breakpoints)  
- **BFF:** Cloudflare Worker (`worker/`) with static assets + `/api/*` routes; Gemini via `@google/genai` on the Worker; OpenAI scenario planning via `fetch`  
- **Tests:** Vitest (unit), Playwright (e2e)

---

## Prerequisites

- **Node.js** (LTS recommended)
- **Wrangler** (installed with `npm install`) for the local BFF Worker
- **API keys** (pasted in Settings; sealed into an HttpOnly cookie):
  - **Gemini** — required for voice conversation, scenario practice, and TEF modes (transcription, chat, TTS).
  - **OpenAI** — optional; used only when creating a scenario from a spoken/typed description (scenario planning).

---

## Run locally

1. **Install dependencies**
   ```bash
   npm install
   ```

2. **Configure the Worker cookie secret**
   ```bash
   cp .dev.vars.example .dev.vars
   # Set API_KEY_COOKIE_SECRET to a high-entropy value, e.g. `openssl rand -base64 32`
   ```

3. **Start Vite and the Worker together**
   ```bash
   npm run dev:full
   ```
   Or run `npm run dev` (http://localhost:3000) and `npm run dev:worker` (http://localhost:8787) in two terminals. Vite proxies `/api` to the Worker.

4. **Paste API keys in Settings** (gear icon). Empty fields leave a saved key unchanged. Use Remove to delete a key.

### Other commands

| Command | Purpose |
|---------|--------|
| `npm run build` | Production frontend build |
| `npm run deploy` | Build + `wrangler deploy` |
| `npm run types` | Regenerate `worker-configuration.d.ts` from `wrangler.jsonc` |
| `npm run preview` | Preview production build locally |
| `npm test` | Run unit tests (Vitest) |
| `npm run test:e2e` | Run E2E tests (Playwright; run `npm run test:e2e:install` once to install browsers) |

---

## Project layout (high level)

| Area | Contents |
|------|----------|
| `App.tsx` | Main UI and mode orchestration (free chat, scenario, TEF Ad persuasion/questioning) |
| `components/` | UI (Orb, Controls, conversation history, setup flows, timers, summaries); app shell (`NavRail`, `TopBar`) and `ScenarioRoadmap` (scenario step progress outline) |
| `services/` | Client BFF calls (`geminiService`, scenario planning, reviews); IndexedDB archives, `.parle` backup |
| `worker/` | Cloudflare Worker: session cookie seal/CSRF, typed `/api/*` AI routes |
| `shared/` | Prompts and Zod chat schemas used by Worker and client |
| `hooks/` | Audio, conversation timer, document head |
| `utils/` | Abort signal combiner, abort error helper, time helpers |
| `__tests__/` | Unit tests |
| `e2e/` | Playwright E2E tests |

Design notes and intentional patterns (e.g. TTS vs history ordering, TEF phase-based turn counting, schema choices) are documented in **`AGENTS.md`** for contributors and code review.
