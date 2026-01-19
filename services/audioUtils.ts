
/**
 * Decodes a base64 string into a Uint8Array
 */
export function base64ToBytes(base64: string): Uint8Array {
  const binaryString = atob(base64);
  const len = binaryString.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  return bytes;
}

/**
 * Encodes a blob to a base64 string
 */
export function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      if (typeof reader.result === 'string') {
        // Remove the data URL prefix (e.g., "data:audio/wav;base64,")
        const base64 = reader.result.split(',')[1];
        resolve(base64);
      } else {
        reject(new Error('Failed to convert blob to base64'));
      }
    };
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

/**
 * Decodes raw PCM data or Wav data from Gemini into an AudioBuffer
 */
export async function decodeAudioData(
  audioData: Uint8Array,
  audioContext: AudioContext,
  sampleRate: number = 24000 // Default for Gemini 2.5 Flash TTS
): Promise<AudioBuffer> {
  // First, try standard browser decoding (handles WAV, MP3, etc.)
  try {
    // decodeAudioData detaches the buffer, so we slice it to keep the original if needed, 
    // or just pass a copy to be safe.
    const bufferForDecoding = audioData.buffer.slice(
      audioData.byteOffset, 
      audioData.byteOffset + audioData.byteLength
    );
    return await audioContext.decodeAudioData(bufferForDecoding);
  } catch (error) {
    // If native decoding fails, assume it is raw PCM (Int16, Little Endian)
    // which is the standard output for Gemini Live/TTS models.
    
    const numChannels = 1; // Gemini usually returns mono
    // Ensure we are working with 16-bit aligned data
    const byteLength = audioData.byteLength;
    const alignedLength = byteLength - (byteLength % 2);
    
    const dataInt16 = new Int16Array(
      audioData.buffer, 
      audioData.byteOffset, 
      alignedLength / 2
    );
    
    const frameCount = dataInt16.length / numChannels;
    const buffer = audioContext.createBuffer(numChannels, frameCount, sampleRate);

    for (let channel = 0; channel < numChannels; channel++) {
      const channelData = buffer.getChannelData(channel);
      for (let i = 0; i < frameCount; i++) {
        // Convert Int16 [-32768, 32767] to Float32 [-1.0, 1.0]
        channelData[i] = dataInt16[i * numChannels + channel] / 32768.0;
      }
    }
    return buffer;
  }
}
