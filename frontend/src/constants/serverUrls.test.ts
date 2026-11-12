import { describe, expect, test } from "vitest";
import { serverUrls } from "./serverUrls";

const https = { protocol: "https:", host: "sh.example.com", origin: "https://sh.example.com" };
const http = { protocol: "http:", host: "localhost:3000", origin: "http://localhost:3000" };

describe("serverUrls", () => {
  test("uses the page's own host over wss on an https page", () => {
    expect(serverUrls(https, {})).toEqual({
      address: "sh.example.com",
      http: "https://sh.example.com",
      websocketHeader: "wss://",
    });
  });

  test("uses ws on an http page", () => {
    expect(serverUrls(http, {})).toEqual({
      address: "localhost:3000",
      http: "http://localhost:3000",
      websocketHeader: "ws://",
    });
  });

  test("VITE_SERVER_ADDRESS overrides the page, defaulting to https and wss", () => {
    expect(serverUrls(http, { VITE_SERVER_ADDRESS: "api.example.com" })).toEqual({
      address: "api.example.com",
      http: "https://api.example.com",
      websocketHeader: "wss://",
    });
  });

  test("every override is honoured", () => {
    expect(
      serverUrls(https, {
        VITE_SERVER_ADDRESS: "dev.example.com",
        VITE_SERVER_ADDRESS_HTTP: "http://dev.example.com",
        VITE_WEBSOCKET_HEADER: "ws://",
      })
    ).toEqual({ address: "dev.example.com", http: "http://dev.example.com", websocketHeader: "ws://" });
  });
});
