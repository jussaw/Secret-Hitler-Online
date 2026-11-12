/**
 * Keys that carry a secret a spectator must not receive before the game ends: a role, the
 * president's or chancellor's hand, the peek, an investigation result. The same list as the
 * backend's Secrets.java.
 */
export const SECRET_KEYS = ["id", "presidentChoices", "chancellorChoices", "peek", "investigation"];

/**
 * @return the path of every secret key in `json`, at any depth (for example `players.Ann.id`),
 *   and of every string value "HITLER", which can only be a role.
 */
export function findSecrets(json: unknown, path = ""): string[] {
  if (json === "HITLER") return [path];
  if (json === null || typeof json !== "object") return [];
  return Object.entries(json).flatMap(([key, value]) => {
    const child = path === "" ? key : Array.isArray(json) ? `${path}[${key}]` : `${path}.${key}`;
    const here = !Array.isArray(json) && SECRET_KEYS.includes(key) ? [child] : [];
    return [...here, ...findSecrets(value, child)];
  });
}
