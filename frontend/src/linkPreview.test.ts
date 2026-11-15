import { expect, test } from "vitest";
import html from "../index.html?raw";

// What a chat app shows for an invite link comes from index.html's meta tags.
const head = new DOMParser().parseFromString(html, "text/html").head;
const meta = (selector: string) => head.querySelector(`meta[${selector}]`)?.getAttribute("content");

test("an invite link previews as one plain line", () => {
  const line = "Join a game of Secret Hitler with friends: 5–10 players, bots fill empty seats.";
  expect(meta('name="description"')).toBe(line);
  expect(meta('property="og:description"')).toBe(line);
});

test("the preview carries no image or keywords from upstream", () => {
  expect(head.querySelectorAll('meta[property^="og:image"]')).toHaveLength(0);
  expect(head.querySelector('meta[name="keywords"]')).toBeNull();
});
