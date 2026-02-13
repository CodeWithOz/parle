import { Character } from '../types';

export interface VoiceProfile {
  name: string;
  description: string;
  gender: 'male' | 'female' | 'neutral';
  suitableFor: string[];
}

/**
 * Catalog of available Gemini voices with descriptions.
 * Based on Gemini TTS voice profiles (30 voices total).
 * Voice names must be lowercase when calling the API.
 */
export const GEMINI_VOICES: VoiceProfile[] = [
  // Female voices (14 total)
  { name: "Aoede", description: "Breezy and natural female voice", gender: "female", suitableFor: ["tutor", "friend", "host", "guide"] },
  { name: "Kore", description: "Firm and confident female voice", gender: "female", suitableFor: ["manager", "official", "receptionist", "clerk"] },
  { name: "Leda", description: "Youthful and energetic female voice", gender: "female", suitableFor: ["student", "young adult", "server", "assistant"] },
  { name: "Zephyr", description: "Bright and cheerful female voice", gender: "female", suitableFor: ["host", "shopkeeper", "salesperson", "waiter"] },
  { name: "Autonoe", description: "Bright and optimistic female voice", gender: "female", suitableFor: ["friend", "tutor", "guide", "assistant"] },
  { name: "Callirrhoe", description: "Easy-going and relaxed female voice", gender: "female", suitableFor: ["friend", "casual", "host", "guide"] },
  { name: "Despina", description: "Smooth and flowing female voice", gender: "female", suitableFor: ["narrator", "host", "guide", "tutor"] },
  { name: "Erinome", description: "Clear and precise female voice", gender: "female", suitableFor: ["official", "receptionist", "clerk", "manager"] },
  { name: "Gacrux", description: "Mature and experienced female voice", gender: "female", suitableFor: ["manager", "instructor", "official", "mentor"] },
  { name: "Laomedeia", description: "Upbeat and lively female voice", gender: "female", suitableFor: ["host", "server", "salesperson", "guide"] },
  { name: "Pulcherrima", description: "Forward and expressive female voice", gender: "female", suitableFor: ["narrator", "host", "presenter", "guide"] },
  { name: "Sulafat", description: "Warm and welcoming female voice", gender: "female", suitableFor: ["host", "shopkeeper", "receptionist", "tutor"] },
  { name: "Vindemiatrix", description: "Gentle and kind female voice", gender: "female", suitableFor: ["tutor", "friend", "mentor", "guide"] },
  { name: "Achernar", description: "Soft and gentle female voice", gender: "female", suitableFor: ["tutor", "friend", "guide", "narrator"] },

  // Male voices (16 total)
  { name: "Puck", description: "Upbeat and energetic male voice", gender: "male", suitableFor: ["young adult", "student", "server", "guide"] },
  { name: "Charon", description: "Informative and clear male voice", gender: "male", suitableFor: ["official", "manager", "instructor", "narrator"] },
  { name: "Fenrir", description: "Excitable and dynamic male voice", gender: "male", suitableFor: ["security", "instructor", "guide", "driver"] },
  { name: "Orus", description: "Firm and decisive male voice", gender: "male", suitableFor: ["manager", "official", "security", "chef"] },
  { name: "Achird", description: "Friendly and approachable male voice", gender: "male", suitableFor: ["friend", "host", "tutor", "guide"] },
  { name: "Algenib", description: "Gravelly texture male voice", gender: "male", suitableFor: ["chef", "security", "driver", "worker"] },
  { name: "Algieba", description: "Smooth and pleasant male voice", gender: "male", suitableFor: ["waiter", "concierge", "assistant", "salesperson"] },
  { name: "Alnilam", description: "Firm and strong male voice", gender: "male", suitableFor: ["security", "manager", "instructor", "official"] },
  { name: "Enceladus", description: "Breathy and soft male voice", gender: "male", suitableFor: ["narrator", "guide", "tutor", "assistant"] },
  { name: "Iapetus", description: "Clear and articulate male voice", gender: "male", suitableFor: ["official", "narrator", "instructor", "clerk"] },
  { name: "Rasalgethi", description: "Informative and professional male voice", gender: "male", suitableFor: ["official", "manager", "clerk", "receptionist"] },
  { name: "Sadachbia", description: "Lively and animated male voice", gender: "male", suitableFor: ["host", "guide", "salesperson", "waiter"] },
  { name: "Sadaltager", description: "Knowledgeable and authoritative male voice", gender: "male", suitableFor: ["manager", "instructor", "official", "mentor"] },
  { name: "Schedar", description: "Even and balanced male voice", gender: "male", suitableFor: ["narrator", "official", "clerk", "receptionist"] },
  { name: "Umbriel", description: "Easy-going and calm male voice", gender: "male", suitableFor: ["friend", "casual", "guide", "tutor"] },
  { name: "Zubenelgenubi", description: "Casual and conversational male voice", gender: "male", suitableFor: ["friend", "casual", "waiter", "assistant"] },
];

/**
 * Assigns a unique voice to a character based on their role.
 * Tries to match the role to suitable voices, avoiding already-used voices.
 *
 * @param characterRole The role of the character (e.g., "baker", "cashier")
 * @param usedVoices Set of voice names already assigned to other characters
 * @returns The name of the assigned voice (lowercase for API compatibility)
 */
export const assignVoiceToCharacter = (
  characterRole: string,
  usedVoices: Set<string>
): string => {
  const roleLower = characterRole.toLowerCase();

  // Find voices suitable for this role that haven't been used yet
  const suitableVoices = GEMINI_VOICES.filter(voice =>
    !usedVoices.has(voice.name.toLowerCase()) &&
    voice.suitableFor.some(suitable =>
      roleLower.includes(suitable.toLowerCase()) ||
      suitable.toLowerCase().includes(roleLower)
    )
  );

  // If we found suitable voices, use the first one (lowercase for API)
  if (suitableVoices.length > 0) {
    return suitableVoices[0].name.toLowerCase();
  }

  // Otherwise, just return any unused voice
  const unusedVoices = GEMINI_VOICES.filter(voice => !usedVoices.has(voice.name.toLowerCase()));
  if (unusedVoices.length > 0) {
    return unusedVoices[0].name.toLowerCase();
  }

  // If all voices are used (shouldn't happen with 30 voices), fall back to default
  return "aoede";
};

/**
 * Assigns voices to all characters in a list, ensuring uniqueness.
 *
 * @param characters Array of characters (with or without voiceName)
 * @returns Array of characters with voiceName assigned (lowercase for API)
 */
export const assignVoicesToCharacters = (characters: Omit<Character, 'voiceName'>[]): Character[] => {
  const usedVoices = new Set<string>();

  return characters.map(char => {
    const voiceName = assignVoiceToCharacter(char.role, usedVoices);
    usedVoices.add(voiceName); // Already lowercase from assignVoiceToCharacter
    return {
      ...char,
      voiceName
    };
  });
};
