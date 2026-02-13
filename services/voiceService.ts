import { Character } from '../types';

export interface VoiceProfile {
  name: string;
  description: string;
  gender: 'male' | 'female' | 'neutral';
  suitableFor: string[];
}

/**
 * Catalog of available Gemini voices with descriptions.
 * Based on Gemini TTS voice profiles.
 */
export const GEMINI_VOICES: VoiceProfile[] = [
  { name: "Aoede", description: "Friendly, warm female voice", gender: "female", suitableFor: ["tutor", "shopkeeper", "friend", "host"] },
  { name: "Kore", description: "Professional, clear female voice", gender: "female", suitableFor: ["receptionist", "manager", "official", "clerk"] },
  { name: "Puck", description: "Energetic, youthful neutral voice", gender: "neutral", suitableFor: ["young adult", "casual", "student", "server"] },
  { name: "Charon", description: "Deep, authoritative male voice", gender: "male", suitableFor: ["manager", "official", "security", "chef"] },
  { name: "Fenrir", description: "Strong, confident male voice", gender: "male", suitableFor: ["security", "driver", "guide", "instructor"] },
  { name: "Orbit", description: "Smooth, friendly male voice", gender: "male", suitableFor: ["waiter", "concierge", "assistant", "salesperson"] },
];

/**
 * Assigns a unique voice to a character based on their role.
 * Tries to match the role to suitable voices, avoiding already-used voices.
 *
 * @param characterRole The role of the character (e.g., "baker", "cashier")
 * @param usedVoices Set of voice names already assigned to other characters
 * @returns The name of the assigned voice
 */
export const assignVoiceToCharacter = (
  characterRole: string,
  usedVoices: Set<string>
): string => {
  const roleLower = characterRole.toLowerCase();

  // Find voices suitable for this role that haven't been used yet
  const suitableVoices = GEMINI_VOICES.filter(voice =>
    !usedVoices.has(voice.name) &&
    voice.suitableFor.some(suitable =>
      roleLower.includes(suitable.toLowerCase()) ||
      suitable.toLowerCase().includes(roleLower)
    )
  );

  // If we found suitable voices, use the first one
  if (suitableVoices.length > 0) {
    return suitableVoices[0].name;
  }

  // Otherwise, just return any unused voice
  const unusedVoices = GEMINI_VOICES.filter(voice => !usedVoices.has(voice.name));
  if (unusedVoices.length > 0) {
    return unusedVoices[0].name;
  }

  // If all voices are used (shouldn't happen with 6+ voices), fall back to default
  return "Aoede";
};

/**
 * Assigns voices to all characters in a list, ensuring uniqueness.
 *
 * @param characters Array of characters (with or without voiceName)
 * @returns Array of characters with voiceName assigned
 */
export const assignVoicesToCharacters = (characters: Omit<Character, 'voiceName'>[]): Character[] => {
  const usedVoices = new Set<string>();

  return characters.map(char => {
    const voiceName = assignVoiceToCharacter(char.role, usedVoices);
    usedVoices.add(voiceName);
    return {
      ...char,
      voiceName
    };
  });
};
