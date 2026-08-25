/**
 * Fetches a blob/object URL (or any audio URL) and returns Gemini inlineData fields.
 * Used by TEF/scenario review and by chat-session rebuild on regenerate.
 */
export async function fetchAudioAsInlineData(
  url: string,
  signal?: AbortSignal
): Promise<{ base64: string; mimeType: string } | null> {
  try {
    const response = await fetch(url, signal ? { signal } : undefined);
    if (signal?.aborted) return null;
    if (!response.ok) return null;
    const blob = await response.blob();
    const mimeType = blob.type || 'audio/wav';

    return new Promise((resolve) => {
      const reader = new FileReader();
      reader.onloadend = () => {
        const dataUrl = reader.result as string;
        const base64 = dataUrl.split(',')[1];
        resolve({ base64, mimeType });
      };
      reader.onerror = () => resolve(null);
      reader.readAsDataURL(blob);
    });
  } catch {
    return null;
  }
}
