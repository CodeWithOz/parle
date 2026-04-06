# Code Review Guidelines for AI Agents

This document describes intentional implementation patterns in the Parle codebase that may appear unusual or incorrect at first glance, but are deliberate design decisions. Code review agents should NOT flag these as bugs.

---

## TTS Failure Handling: History Updates Before Audio Generation

**Location:** `services/geminiService.ts` - `sendVoiceMessage()` function

### Pattern
Conversation history is updated **BEFORE** TTS audio generation in single-character and free-conversation code paths:

```typescript
// Update history BEFORE TTS
addToHistory("user", userText);
addToHistory("assistant", modelText);
syncedMessageCount += 2;

// Then generate TTS (wrapped in try/catch)
let audioUrl = '';
try {
  audioUrl = await abortablePromise(generateCharacterSpeech(...));
} catch (ttsError) {
  console.error('TTS generation failed:', ttsError);
  // Return empty audioUrl - UI shows "Audio unavailable" with retry
}
```

### Why This Is Intentional

**The app is designed to display message text even when TTS fails.** This enables users to:
1. See what the AI said even if audio generation fails
2. Read the text response while audio is unavailable
3. Use the UI's retry button to regenerate TTS without losing the message
4. Maintain conversation context and history continuity

### Expected Behavior
- ✅ **TTS succeeds**: Message displays with audio, history updated
- ✅ **TTS fails**: Message displays without audio (shows "Audio unavailable" warning), history updated, retry button available
- ❌ **If history was updated AFTER TTS**: Message would be lost entirely on TTS failure, breaking UX

### Multi-Character Path
The multi-character path uses a different pattern with `Promise.allSettled()` but achieves the same graceful degradation:
- Generates TTS for all characters in parallel
- Marks failed generations with `audioGenerationFailed: true`
- Still displays all text and updates history
- Returns partial audio results rather than failing completely

### Rate Limiting Consideration
Users are rate-limited by TTS request count, not by conversation history size. By updating history before TTS, we ensure:
- Users can retry failed TTS without re-running the LLM (which would consume more tokens)
- Conversation context is preserved for subsequent messages
- Failed TTS doesn't break the conversation flow

### Related Files
- `services/geminiService.ts` - Lines ~590-640 (single-character and free-conversation paths)
- `types.ts` - Line 29 (`audioGenerationFailed?: boolean` field)
- UI components expect this pattern and handle missing audio gracefully

---

## Successive Character Message Merging

**Location:** `services/geminiService.ts` - Multi-character response processing

### Pattern
Character responses are merged when the same character appears successively:

```typescript
const mergedCharacterResponses = characterResponses.reduce((acc, current) => {
  if (acc.length === 0) return [current];

  const lastResponse = acc[acc.length - 1];
  if (lastResponse.characterId === current.characterId) {
    // Merge successive messages from same character
    lastResponse.french = `${lastResponse.french} ${current.french}`;
    lastResponse.english = `${lastResponse.english} ${current.english}`;
    return acc;
  }

  return [...acc, current];
}, []);
```

### Why This Is Intentional

**Users are rate-limited by TTS request count.** Merging successive messages ensures:
- Only ONE TTS request per character per turn (not multiple)
- Reduced API calls and faster response times
- Same audio playback result (messages would play back-to-back anyway)

### What's Allowed vs. Not Allowed

✅ **ALLOWED** - Character speaks, another character responds, first character speaks again:
```
- Character 1 (Baker): "Bonjour!"
- Character 2 (Cashier): "Bonjour!"
- Character 1 (Baker): "Que désirez-vous?"
```
→ 3 separate messages, 3 TTS requests (non-successive)

❌ **MERGED** - Same character speaks multiple times in a row:
```
- Character 1 (Baker): "Bonjour!"
- Character 1 (Baker): "Que désirez-vous?"
```
→ Merged into 1 message: "Bonjour! Que désirez-vous?" → 1 TTS request

### LLM Instruction
The system prompt explicitly instructs the LLM to avoid creating successive messages from the same character (see `scenarioService.ts` guideline #7), but the defensive merge code ensures it happens regardless of LLM compliance.

---

## Voice Name Case Sensitivity

**Location:** `services/voiceService.ts` - Voice assignment functions

### Pattern
Voice names are stored with capital letters in the catalog but converted to lowercase when passed to the API:

```typescript
export const GEMINI_VOICES: VoiceProfile[] = [
  { name: "Aoede", description: "...", gender: "female", ... },
  // ... (names are capitalized)
];

export const assignVoiceToCharacter = (...): string => {
  // Returns lowercase for API compatibility
  return suitableVoices[0].name.toLowerCase();
};
```

### Why This Is Intentional

**The Gemini TTS API requires lowercase voice names.** The pattern ensures:
- Human-readable names in code ("Aoede")
- API-compatible names when calling TTS ("aoede")
- Single source of truth for voice metadata

### Error Prevention
Using capitalized names like "Aoede" directly results in API error:
```
Voice name Aoede is not supported. Allowed voice names are: aoede, kore, leda, ...
```

---

## JSON Response Format for All Scenarios

**Location:** `services/geminiService.ts` - `createChatSession()`

### Pattern
Both single-character AND multi-character scenarios use JSON response format:

```typescript
const isScenarioMode = activeScenario !== null;

chatSession = ai.chats.create({
  model: 'gemini-2.0-flash-lite',
  config: {
    systemInstruction: systemInstruction,
    ...(isScenarioMode && {
      responseMimeType: 'application/json'
    })
  },
  ...
});
```

### Why This Is Intentional

**Structured responses enable precise French/English separation for TTS control:**
- LLM returns `{ "french": "...", "english": "...", "hint": "..." }`
- TTS only uses the French text
- UI displays both French and English
- Prevents LLM from mixing languages in unpredictable ways

### Alternative Approach (Rejected)
Previously, single-character scenarios used free-form text with inline translations. This was changed because:
- Unreliable separation of French and English
- TTS would read both languages aloud
- Harder to parse and display separately

---

## Abort / Cancellation Strategy for Audio Requests

### Why this exists
Audio flows can have races: a user may cancel, close/reopen a modal, or start a new 'turn' while a previous Gemini request is still in-flight. If the stale request resolves after the user moved on, it can incorrectly update UI state (wrong transcript/messages/spinners) or throw JSON parsing errors.

This section is a developer-facing rule to prevent that entire class of bug.

### Required strategy (use for every future audio request)
1. Create a new `AbortController` per 'turn/request' and store it in a ref that cancellation/timeout handlers can reach.
2. Pass the per-request `signal` into the Gemini SDK via `config.abortSignal` on *every* relevant SDK call (`ai.models.generateContent(...)` and `chatSession.sendMessage(...)`).
   - Do not rely on `Promise.race` / wrapper rejection alone. The Gemini SDK must receive the signal so it can stop internally and reject with `AbortError`.
3. Invalidate/discard stale responses:
   - Track a request token (e.g. `requestIdRef.current` captured into `currentRequestId`) and check it before any state updates.
   - If a newer request started (token changed) or the relevant UI is no longer open, return early and do not mutate UI state.
4. Preserve JSON enforcement when passing per-request config with `abortSignal`:
   - Keep `responseMimeType: 'application/json'` and `responseSchema: ...` set in the same request config.
   - This avoids the SDK returning plain text (which breaks downstream JSON parsing/validation).
5. Handle `AbortError` according to *why* the request was aborted:
   - **`processingAbortedRef` (exercise exit, TEF timer, leaving summary):** suppress ERROR UI — treat as intentional and return silently from `processAudioMessage` / related flows.
   - **User orb cancel during processing:** `handleAbortProcessing` is a no-op if `abortControllerRef` is null (nothing in flight). Otherwise set `pipelineFailureKindRef` to `'user_cancel'`, then `abort()` on the user `AbortController` — surface ERROR + retry + a clear message (same retry path as network failures). `lastChatAudio` remains for Retry.
   - **Pipeline deadline (`PIPELINE_MAX_MS`, 90s wall-clock for transcribe + chat + TTS):** set `pipelineFailureKindRef` to `'timeout'` before aborting a second controller; combine **user** + **deadline** signals with `combineAbortSignals` (or `AbortSignal.any`) and pass that composite signal to `sendVoiceMessage`. Clear the deadline `setTimeout` in `finally`.

### Main mic pipeline (`sendVoiceMessage`)
- One composite `AbortSignal` covers the whole turn: user cancel **or** `PIPELINE_MAX_MS` (exported from `services/geminiService.ts`).
- `sendVoiceMessage` uses `config.abortSignal` on transcribe, `sendMessage`, and TTS; no parallel `Promise.race` wrappers around those SDK calls.
- In `App.tsx`, **`isAbortLikeError`** classifies aborted requests: the SDK may throw `APIUserAbortError`, plain `Error` with `name === 'AbortError'`, or **`Error` with default `name` and a message containing `signal is aborted`** (from the GenAI client). Do not rely on `instanceof DOMException` alone. Timeout user copy is **“Connection timed out”** (no seconds in the string).
- If the model returns an invalid **multi-character** shape (missing `characters` / `modelText`, or array length mismatch), `App.tsx` sets ERROR and **`canRetryChatAudio(true)`** so the user can Retry with the same `lastChatAudio` (same as network/cancel failures).

### Example: scenario description recording (abort + stale discard)
In the scenario description 'describe by voice' flow:
- Each transcription attempt creates a fresh `AbortController` (`scenarioDescriptionAbortControllerRef`) and increments a request token (`scenarioDescriptionRequestIdRef`).
- The in-flight call passes `abortController.signal` into `transcribeAndCleanupAudio(...)`.
- After awaiting, results are discarded if `currentRequestId !== scenarioDescriptionRequestIdRef.current` or if the modal is closed (`scenarioSetupOpenRef`).
- In `catch`, `AbortError` is ignored, and only non-abort failures show errors / enable retry.
- In `finally`, the transcription spinner is only cleared when the request token still matches (so stale requests can’t affect UI after close+reopen).

This is the same overall strategy used for the main mic audio flow: per-turn `AbortController`, request-token guarded state updates, and selective `AbortError` handling (suppress only when `processingAbortedRef` indicates an intentional exit).

### Related files
- `App.tsx` (main mic + scenario description cancellation/discard logic)
- `utils/combineAbortSignals.ts` (composite signal for user + deadline)
- `utils/isAbortLikeError.ts` (abort detection for `processAudioMessage` catch)
- `services/geminiService.ts` (`transcribeAndCleanupAudio`, `sendVoiceMessage` per-request `config.abortSignal`, `PIPELINE_MAX_MS`, and JSON enforcement config)
- `services/tefReviewService.ts` (`generateTefReview` — passes `signal` to `fetch` and to `ai.models.generateContent`; returns `null` on `AbortError`)
- `__tests__/scenarioDescriptionRecordingAbortDiscard.test.tsx` / `__tests__/transcribeAndCleanupAudioAbortSignal.test.ts` (abort + discard + config preservation)

---

## Deferred Audio URL Revocation for TEF Post-Exercise Review

**Location:** `App.tsx` — `handleExitTefAd`, `handleExitTefQuestioning`, `handleDismissTefAdSummary`, `handleDismissTefQuestioningSummary`

### Pattern

For TEF Ad and TEF Questioning sessions, `URL.revokeObjectURL` is **not** called in the exit handlers. Revocation is deferred to the dismiss handlers — after the summary screen closes and the user is done with the review.

```typescript
// handleExitTefAd — NO revocation here
const snapshot = messagesRef.current;
tefAdMessagesSnapshotRef.current = snapshot;
startTefAdReview(snapshot);       // review service will fetch audio from blob URLs

// handleDismissTefAdSummary — revocation happens here, after review is done
for (const msg of tefAdMessagesSnapshotRef.current) {
  if (msg.audioUrl) {
    // ...
    URL.revokeObjectURL(url);     // safe: review service is no longer fetching
  }
}
tefAdMessagesSnapshotRef.current = [];
```

The same pattern applies to TEF Questioning: `handleExitTefQuestioning` captures the snapshot and calls `startTefQuestioningReview`; `handleDismissTefQuestioningSummary` does the revocation.

### Why This Is Intentional

`generateTefReview` in `services/tefReviewService.ts` fetches user audio from blob URLs to send to the Gemini evaluator as inline audio data. If exit handlers revoked the URLs immediately (as other scenario exit handlers do), the fetch inside `generateTefReview` would fail with a network error and the review would only have transcripts, degrading evaluation quality.

### What "snapshot refs" are for

`tefAdMessagesSnapshotRef` and `tefQuestioningMessagesSnapshotRef` capture the message array at exit time so that:
1. The review service has a stable reference to the messages (including blob URLs) that persists even after React state is cleared.
2. The dismiss handler can find the URLs to revoke them after the review is complete.

Do **not** clear these refs or revoke URLs in the exit handlers. Do **not** "clean up" the exit handlers by adding `URL.revokeObjectURL` calls there — this will silently break review audio.

### Related Files

- `App.tsx` — `handleExitTefAd`, `handleExitTefQuestioning` (exit: capture snapshot, no revocation); `handleDismissTefAdSummary`, `handleDismissTefQuestioningSummary` (dismiss: revoke + clear snapshot)
- `services/tefReviewService.ts` — `generateTefReview` — fetches blob URLs via `fetchAudioAsInlineData`

---

## TEF Post-Exercise Review: `generateTefReview` Returns `null` on Abort

**Location:** `services/tefReviewService.ts` — `generateTefReview()`

### Pattern

`generateTefReview` has return type `Promise<TefReview | null>`. It returns `null` when the request is aborted (via `AbortSignal`) rather than throwing. All callers must check for `null` and treat it as a graceful cancellation — not as an error.

```typescript
// tefReviewService.ts
if (err instanceof DOMException && err.name === 'AbortError') return null;
if (err instanceof Error && err.name === 'AbortError') return null;

// App.tsx callers
generateTefReview({ ... })
  .then((r) => {
    if (r) {              // null check is required — null means aborted
      setReviews([r]);
    }
  })
```

### Why This Is Intentional

This follows the same abort-suppression convention used throughout the codebase (see "Abort / Cancellation Strategy for Audio Requests" above). Returning `null` rather than throwing keeps callers free of AbortError-specific catch logic. The review loading state is cleared in `finally`, so the UI returns cleanly to its idle state.

Do **not** change `null` returns to throws. Do **not** flag the `if (r)` null-checks in callers as unnecessary — they guard against the abort case.

### Related Files

- `services/tefReviewService.ts` — `generateTefReview` return type and AbortError handling
- `App.tsx` — `startTefAdReview`, `regenerateTefAdReview`, `startTefQuestioningReview`, `regenerateTefQuestioningReview` callers

---

## Missing AI Credentials Handling

**Location:** `App.tsx` handlers, `components/ScenarioSetup.tsx`, `components/AdPersuasionSetup.tsx`

### Principle
When AI functionality requires API credentials, the app handles missing credentials in two complementary ways:

1. **Warning banners**: Setup forms (ScenarioSetup, AdPersuasionSetup) display a yellow warning banner when required API keys are not configured. This gives users a passive, non-blocking notification about what's needed.

2. **Modal trigger on action**: When users attempt an action that depends on AI credentials (clicking record, uploading an image, starting a conversation), the app intercepts the action, opens the API key configuration modal, and returns early without performing the action. Once the user configures their keys, the action can proceed normally.

### When Adding New AI-Dependent Features

Any new feature that depends on AI API credentials MUST implement both of these patterns:

1. **Add a warning banner** in the relevant setup/configuration UI when the required key(s) are missing. Use the yellow warning style (`bg-yellow-900/30 border border-yellow-600/50`) consistent with existing banners.

2. **Gate user actions** that trigger AI calls with a credential check at the top of the handler:
   ```typescript
   if (!hasApiKeyOrEnv('provider')) {
     setShowApiKeyModal(true);
     return;
   }
   ```

### Which Keys Each Feature Requires

| Feature | Gemini | OpenAI | Why |
|---------|--------|--------|-----|
| Free conversation (main mic) | Required | — | Gemini handles transcription + conversation |
| Scenario creation (describe) | Required | Required | Gemini for transcription, OpenAI for scenario planning |
| Scenario practice (mic) | Required | — | Gemini handles conversation |
| Ad Persuasion (TEF Ad) | Required | — | Gemini for image analysis + conversation |
| Ad Questioning (TEF Questioning) | Required | — | Gemini for image analysis + conversation |

### Related Files
- `services/apiKeyService.ts` — `hasApiKeyOrEnv()` function for checking key availability
- `components/ApiKeySetup.tsx` — Modal component for entering API keys
- `App.tsx` — Handler functions with credential gates (`handleStartRecording`, `handleStartRecordingDescription`, `handleOpenTefAdSetup`, etc.)

---

## Deterministic Objection Tracking with Per-Turn Context Injection (TEF Ad Mode)

**Location:** `utils/tefObjectionState.ts`, `services/geminiService.ts` - `sendVoiceMessage()`, `App.tsx`

### Pattern

The TEF Ad Persuasion mode tracks objection progress entirely on the client side using a pure state machine. The LLM is **not** responsible for counting objections or deciding when to move to the next direction — that is driven deterministically by the app and communicated to the LLM as a text part injected alongside the user's audio on every turn.

```typescript
// App.tsx: build per-turn context from current state, inject into sendVoiceMessage
const contextText = buildTefAdContextText(tefObjectionState);
const response = await sendVoiceMessage(audioBase64, mimeType, signal, contextText);

// After each response, advance the state machine
setTefObjectionState(prev => advanceTefObjectionState(prev));
```

```typescript
// geminiService.ts: contextText is prepended as a text part before the audio part
const messageParts = [];
if (contextText) {
  messageParts.push({ text: contextText });
}
messageParts.push({ inlineData: { data: audioBase64, mimeType: mimeType } });
```

The state machine (`utils/tefObjectionState.ts`) is a pure function with no side effects: `advanceTefObjectionState(state) => nextState`. It tracks 5 objection directions × 3 rounds each, then sets `isConvinced = true`.

### Why This Is Intentional

**Objection sequencing must be deterministic and auditable for exam practice.** Leaving it to the LLM introduces two problems:

1. **Unpredictable pacing**: The LLM may dwell on one objection too long or skip directions, making practice sessions inconsistent.
2. **Untestable logic**: Client-side state can be unit-tested exhaustively; LLM counting behavior cannot.

The TEF system prompt is therefore intentionally thin about objection logistics — it defers to the per-turn context injection rather than carrying its own counting logic. Reviewers should **not** flag the simplified system prompt as missing objection-sequencing instructions; those are injected per-turn.

### Why There Is a Text Part Alongside Audio

The `contextText` parameter to `sendVoiceMessage` adds a `{ text: ... }` part to the message before the audio blob. This is the mechanism for injecting the current objection direction and round number. It is intentional and required — without it the LLM has no reliable signal for which direction to raise or when to express being convinced.

### What "Simplified System Prompt" Means

The TEF Ad system prompt in `services/scenarioService.ts` (`generateTefAdSystemInstruction`) deliberately omits any hardcoded round-counting or direction-sequencing logic. The prompt instructs the LLM to:
- Follow the per-turn context for direction and round number
- Express conviction only when the per-turn context says all directions are done

This is intentional. Adding counting logic back into the system prompt would conflict with the client-side state machine.

### First-Message Skip in Persuasion Mode

The first user turn in a TEF Ad Persuasion session is always a greeting (e.g., "Bonjour"). It must **not** receive any objection context injection and must **not** advance the objection state machine. The app tracks this with a `tefAdIsFirstMessage` boolean:

```typescript
// App.tsx: skip context injection on the first turn
if (tefAdMode === 'practice' && tefObjectionState && !tefAdIsFirstMessage) {
  objectionContextText = buildTefAdContextText(tefObjectionState);
}

// After the response:
if (tefAdIsFirstMessage) {
  setTefAdIsFirstMessage(false); // greeting done, no state advance
} else {
  setTefObjectionState(prev => advanceTefObjectionState(prev)); // normal advance
}
```

Do **not** flag the missing `advanceTefObjectionState` call on the first turn as a bug — it is intentional. The objection state machine should start from Direction 1 / Round 1 on the second turn (the first real persuasion exchange), not consume a round on the greeting.

### Related Files

- `utils/tefObjectionState.ts` — Pure state machine: `createInitialTefObjectionState`, `advanceTefObjectionState`
- `types.ts` — `TefObjectionState` interface
- `services/geminiService.ts` — `generateTefAdObjections()` (pre-generates 5 directions at setup), `sendVoiceMessage()` (accepts `contextText?`)
- `services/scenarioService.ts` — `generateTefAdSystemInstruction()` (simplified system prompt)
- `components/PersuasionTimer.tsx` — Progress indicator ("Objection X/5 · Round Y/3") driven by the same state
- `App.tsx` — Wires generation at setup, context injection per turn, state advancement after each response

---

## TEF Ad Questioning Mode: Schema Selection and `isRepeat` Flag

**Location:** `services/geminiService.ts` - `TefQuestioningSchema`, `createChatSession()`, `sendVoiceMessage()`; `types.ts`; `App.tsx`

### Pattern

TEF Ad Questioning is a third synthetic-scenario practice mode (alongside Role Play and Ad Persuasion). It sets `isTefQuestioning: true` on the `Scenario` object. This flag drives two distinct behaviors in `geminiService.ts`:

**1. Schema selection in `createChatSession()`**

```typescript
// isTefQuestioning selects the extended schema at session creation time
const schemaToUse = activeScenario.isTefQuestioning
  ? TefQuestioningSchema
  : SingleCharacterSchema;
```

`TefQuestioningSchema` is a superset of `SingleCharacterSchema` — it adds one optional field:

```typescript
isRepeat: z.boolean().optional()
  .describe("true if the user asked a question that was already answered")
```

Do **not** flag the two-schema branch as unnecessary complexity or suggest collapsing it into one schema. The schemas must remain separate so that `isRepeat` is never present in the standard single-character path and never absent in the questioning path.

**2. `isRepeat` propagation in `sendVoiceMessage()`**

After validating the JSON response, `isRepeat` is extracted and forwarded on the `VoiceResponse` object:

```typescript
const isRepeat = activeScenario.isTefQuestioning && 'isRepeat' in validated
  ? (validated as { isRepeat?: boolean }).isRepeat
  : undefined;
```

`App.tsx` reads `response.isRepeat` to increment a `tefQuestioningRepeatCount` displayed on the summary screen. Do **not** flag `isRepeat` on `VoiceResponse` as dead code — it is consumed by the repeat counter.

### No Per-Turn Context Injection for Questioning Mode

Unlike Ad Persuasion (which injects objection direction and round number on every turn), TEF Ad Questioning does **not** inject any per-turn context into `sendVoiceMessage`. The AI customer service agent's system prompt is self-sufficient — it needs no external sequencing signal. Adding context injection to the questioning path would be incorrect.

### First-Message Skip in Questioning Mode

Like persuasion mode, questioning mode tracks a `tefQuestioningIsFirstMessage` boolean. The first user turn (a greeting) does not increment `tefQuestioningQuestionCount`. This is intentional — only genuine questions should count toward the score shown in `TefQuestioningSummary`.

```typescript
if (tefQuestioningIsFirstMessage) {
  setTefQuestioningIsFirstMessage(false); // greeting done, no count
} else {
  setTefQuestioningQuestionCount(c => c + 1);
  if (response.isRepeat === true) setTefQuestioningRepeatCount(r => r + 1);
}
```

### Related Files

- `types.ts` — `isTefQuestioning?: boolean` on `Scenario`; `isRepeat?: boolean` on `VoiceResponse`
- `services/geminiService.ts` — `TefQuestioningSchema`; schema selection in `createChatSession()`; `isRepeat` extraction in `sendVoiceMessage()`
- `services/scenarioService.ts` — `generateTefQuestioningSystemInstruction()` (self-contained prompt, no per-turn injection)
- `components/AdQuestioningSetup.tsx` — Setup UI for the questioning session
- `components/QuestioningTimer.tsx` — In-session timer and question counter
- `components/TefQuestioningSummary.tsx` — End-of-session summary (total questions, repeat count)
- `App.tsx` — `tefQuestioningIsFirstMessage`, `tefQuestioningQuestionCount`, `tefQuestioningRepeatCount` state; `handleStartTefQuestioning`

---

## Notes for Code Review Agents

When reviewing this codebase:

1. **Don't flag pre-TTS history updates as bugs** - This is intentional graceful degradation
2. **Don't flag successive message merging as data loss** - This is intentional rate-limit optimization
3. **Don't flag lowercase voice name conversion** - This is required by the Gemini API
4. **Don't suggest removing JSON response mode for single-character** - This enables French/English separation
5. **Don't flag the TEF Ad system prompt as missing objection-counting logic** - Objection sequencing is deterministic and injected per-turn (see "Deterministic Objection Tracking" section above)
6. **Don't flag the `contextText` text part alongside audio as an API misuse** - It is the intentional mechanism for delivering per-turn objection context to the LLM
7. **Don't flag the missing `advanceTefObjectionState` call on the first persuasion turn as a bug** - The first turn is a greeting; the state machine must not advance until the first real exchange (see "First-Message Skip" under "Deterministic Objection Tracking")
8. **Don't flag the two-schema branch (`TefQuestioningSchema` / `SingleCharacterSchema`) as unnecessary** - `isRepeat` must only appear in the questioning path; the schemas must remain separate
9. **Don't flag `isRepeat` on `VoiceResponse` as dead code** - It is consumed by the repeat counter in `App.tsx` and displayed on `TefQuestioningSummary`
10. **Don't add per-turn context injection to the questioning mode path** - Unlike persuasion mode, questioning mode needs no external sequencing signal; its system prompt is self-sufficient
11. **Don't add `URL.revokeObjectURL` calls to `handleExitTefAd` or `handleExitTefQuestioning`** - Revocation is intentionally deferred to the dismiss handlers so the review service can fetch audio blob URLs for evaluation (see "Deferred Audio URL Revocation" section)
12. **Don't flag the `if (r)` null-checks on `generateTefReview` results as redundant** - `null` is the documented return value for an aborted review request; the check is required (see "TEF Post-Exercise Review: `generateTefReview` Returns `null` on Abort" section)

If you believe you've found a genuine bug in one of these areas, please:
- Reference this document in your review
- Explain why the documented rationale doesn't apply
- Suggest an alternative approach that preserves the documented benefits

---

## Learned User Preferences

- Remove temporary debug instrumentation (e.g. NDJSON ingest / `#region agent log` blocks) only after the user has confirmed the fix in the UI, unless they explicitly ask to clean up earlier.

## Learned Workspace Facts

- Continual-learning transcript processing for this project uses an index file under the main checkout: `01-projects/parle/.cursor/hooks/state/continual-learning-index.json`. `AGENTS.md` may be edited from a Cursor worktree (e.g. `worktrees/parle/<branch>/AGENTS.md`), so hook state and agent memory paths are not always the same directory.

---

## Version History

- 2025-01-XX: Initial documentation of TTS/history pattern and successive message merging
- 2026-03-11: Added deterministic objection tracking pattern (TEF Ad mode)
- 2026-03-14: Added TEF Ad Questioning mode patterns (isTefQuestioning schema selection, isRepeat flag, no per-turn context injection, first-message skip); added persuasion first-message skip note; updated credentials table
- 2026-04-04: Added deferred audio URL revocation pattern and `generateTefReview` null-on-abort convention (TEF post-exercise review feature)
- See git history for detailed implementation timeline
