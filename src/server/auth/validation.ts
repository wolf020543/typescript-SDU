export function isValidUrl(s: string): boolean {
  try {
    new URL(s);
    return true;
  } catch (error) {
    return false;
  }
}