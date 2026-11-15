import { LOBBY_CODE_LENGTH } from "../constants";

/**
 * A lobby code as the login page takes it, typed into its field or from a link (?lobby=CODE): no
 * whitespace, in capitals, and at most LOBBY_CODE_LENGTH letters.
 */
export function normalizeCode(code: string): string {
  return code.replace(/\s+/g, "").toUpperCase().slice(0, LOBBY_CODE_LENGTH);
}
