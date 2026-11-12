/**
 * Joins `count` extra players to a lobby over the game WebSocket, sending the same messages the
 * browser client sends. Guest i (from 1) is "Long Guest i", twelve characters like the longest
 * name the login form allows, and takes portrait p(i + 1); the host has p1.
 * The guests never act: callers close the sockets when they are done.
 */
export async function joinGuests(
  baseURL: string,
  lobby: string,
  count: number
): Promise<WebSocket[]> {
  const guests: WebSocket[] = [];
  for (let i = 1; i <= count; i++) {
    const name = `Long Guest ${i}`;
    const url = new URL("/game", baseURL);
    url.protocol = url.protocol === "https:" ? "wss:" : "ws:";
    url.searchParams.set("lobby", lobby);
    url.searchParams.set("name", name);

    const ws = new WebSocket(url);
    await new Promise<void>((resolve, reject) => {
      ws.addEventListener("open", () => resolve(), { once: true });
      ws.addEventListener("error", () => reject(new Error(`${name} could not connect`)), {
        once: true,
      });
    });
    ws.send(JSON.stringify({ name, lobby, command: "select-icon", icon: `p${i + 1}` }));
    guests.push(ws);
  }
  return guests;
}
