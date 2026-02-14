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

## Notes for Code Review Agents

When reviewing this codebase:

1. **Don't flag pre-TTS history updates as bugs** - This is intentional graceful degradation
2. **Don't flag successive message merging as data loss** - This is intentional rate-limit optimization
3. **Don't flag lowercase voice name conversion** - This is required by the Gemini API
4. **Don't suggest removing JSON response mode for single-character** - This enables French/English separation

If you believe you've found a genuine bug in one of these areas, please:
- Reference this document in your review
- Explain why the documented rationale doesn't apply
- Suggest an alternative approach that preserves the documented benefits

---

## Version History

- 2025-01-XX: Initial documentation of TTS/history pattern and successive message merging
- See git history for detailed implementation timeline
