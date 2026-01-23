/**
 * Formats seconds as "M:SS" (e.g., 1 second = "0:01", 65 seconds = "1:05")
 */
export function formatTime(seconds: number): string {
  const rounded = Math.round(seconds);
  const minutes = Math.floor(rounded / 60);
  const secs = rounded % 60;
  return `${minutes}:${secs.toString().padStart(2, '0')}`;
}
