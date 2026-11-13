/**
 * Copies `text` with the Clipboard API where it exists. Without it, or when it rejects (no
 * permission, an insecure page), selects `field` and uses the old `execCommand("copy")`.
 * Resolves whether the copy worked.
 */
export async function copyText(
  text: string,
  field: HTMLInputElement | null,
): Promise<boolean> {
  if (navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch {
      // Fall through to the selection fallback.
    }
  }
  if (field === null) {
    return false;
  }
  try {
    field.select();
    field.setSelectionRange(0, text.length);
    return document.execCommand("copy");
  } catch {
    return false;
  }
}
