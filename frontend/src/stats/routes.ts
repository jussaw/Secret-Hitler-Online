import { useSyncExternalStore } from "react";
import type { StatsData } from "./record";

/**
 * The stats pages' addresses, read and written with the History API (no router library): one
 * route per path, `navigate` to move without a reload, and `useLocation` to follow the address,
 * the back and forward buttons included.
 *
 * This module imports React and the record's types only, never `src/constants`, so the browser
 * tests can use `routePath`.
 */

export type TabId = "overview" | "roles" | "votes" | "rivals" | "endings" | "activity" | "records";
export type StatsRoute =
  | { page: "tab"; tab: TabId }
  | { page: "games" }
  | { page: "game"; id: string }
  | { page: "players" }
  | { page: "player"; number: number }
  | { page: "notFound" };

/** Every tab, in the tab row's order. OVERVIEW is `/stats`; each other tab `/stats/<tab>`. */
export const TAB_IDS: TabId[] = ["overview", "roles", "votes", "rivals", "endings", "activity", "records"];

/** The props of every stats page component. */
export interface PageProps {
  data: StatsData;
  route: StatsRoute;
}

const NOT_FOUND: StatsRoute = { page: "notFound" };

/** A player's number in an address: no sign, no leading zero, not 0. */
const PLAYER_NUMBER = /^[1-9][0-9]*$/;

/** The route of a stats address's path; anything that names no page is `notFound`. */
export function parseRoute(pathname: string): StatsRoute {
  const segments = pathname.split("/");
  if (segments[0] !== "" || segments[1] !== "stats") return NOT_FOUND;
  const rest = segments.slice(2);
  if (rest.length > 0 && rest[rest.length - 1] === "") rest.pop(); // a trailing slash
  if (rest.length === 0) return { page: "tab", tab: "overview" };
  const [first, second] = rest;
  if (rest.length === 1 && first !== "overview" && (TAB_IDS as string[]).includes(first)) {
    return { page: "tab", tab: first as TabId };
  }
  if (first === "games") {
    if (rest.length === 1) return { page: "games" };
    if (rest.length === 2 && second !== "") {
      try {
        return { page: "game", id: decodeURIComponent(second) };
      } catch {
        return NOT_FOUND; // a bad % escape
      }
    }
  }
  if (first === "players") {
    if (rest.length === 1) return { page: "players" };
    if (rest.length === 2 && PLAYER_NUMBER.test(second)) return { page: "player", number: Number(second) };
  }
  return NOT_FOUND;
}

/** The path of a route; `notFound` gives the stats' home, `/stats`. */
export function routePath(route: StatsRoute): string {
  switch (route.page) {
    case "tab":
      return route.tab === "overview" ? "/stats" : `/stats/${route.tab}`;
    case "games":
      return "/stats/games";
    case "game":
      return `/stats/games/${encodeURIComponent(route.id)}`;
    case "players":
      return "/stats/players";
    case "player":
      return `/stats/players/${route.number}`;
    case "notFound":
      return "/stats";
  }
}

/** The event `navigate` dispatches on `window` after it changes the address. */
const LOCATION_EVENT = "stats-location";

/**
 * Moves to `pathAndSearch` without a reload: one new history entry (none for the address the
 * page is at), then the scroll back to the top for a new page. A change of the search alone,
 * such as a filter, keeps the scroll position.
 */
export function navigate(pathAndSearch: string): void {
  const before = window.location.pathname;
  if (pathAndSearch === before + window.location.search) return;
  window.history.pushState(null, "", pathAndSearch);
  window.dispatchEvent(new Event(LOCATION_EVENT));
  if (window.location.pathname !== before) window.scrollTo(0, 0);
}

let snapshot: { pathname: string; search: string } = { pathname: "", search: "" };

/** The address now, the same object until it changes (as `useSyncExternalStore` needs). */
function currentLocation(): { pathname: string; search: string } {
  const { pathname, search } = window.location;
  if (pathname !== snapshot.pathname || search !== snapshot.search) snapshot = { pathname, search };
  return snapshot;
}

function subscribe(onChange: () => void): () => void {
  window.addEventListener("popstate", onChange);
  window.addEventListener(LOCATION_EVENT, onChange);
  return () => {
    window.removeEventListener("popstate", onChange);
    window.removeEventListener(LOCATION_EVENT, onChange);
  };
}

/** The address's path and search, following `navigate` and the back and forward buttons. */
export function useLocation(): { pathname: string; search: string } {
  return useSyncExternalStore(subscribe, currentLocation);
}
