export type PageLocation = Pick<Location, "protocol" | "host" | "origin">;
export type AddressEnv = Pick<
  ImportMetaEnv,
  "VITE_SERVER_ADDRESS" | "VITE_SERVER_ADDRESS_HTTP" | "VITE_WEBSOCKET_HEADER"
>;

/**
 * Where the client finds the server: the page's own origin, unless
 * VITE_SERVER_ADDRESS points at a separate backend.
 */
export function serverUrls(location: PageLocation, env: AddressEnv) {
  if (env.VITE_SERVER_ADDRESS) {
    return {
      address: env.VITE_SERVER_ADDRESS,
      http: env.VITE_SERVER_ADDRESS_HTTP || "https://" + env.VITE_SERVER_ADDRESS,
      websocketHeader: env.VITE_WEBSOCKET_HEADER || "wss://",
    };
  }
  return {
    address: location.host,
    http: location.origin,
    websocketHeader: location.protocol === "https:" ? "wss://" : "ws://",
  };
}
