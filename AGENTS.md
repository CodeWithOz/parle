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

If you believe you've found a genuine bug in one of these areas, please:
- Reference this document in your review
- Explain why the documented rationale doesn't apply
- Suggest an alternative approach that preserves the documented benefits

---

## Version History

- 2025-01-XX: Initial documentation of TTS/history pattern and successive message merging
- 2026-03-11: Added deterministic objection tracking pattern (TEF Ad mode)
- 2026-03-14: Added TEF Ad Questioning mode patterns (isTefQuestioning schema selection, isRepeat flag, no per-turn context injection, first-message skip); added persuasion first-message skip note; updated credentials table
- See git history for detailed implementation timeline
