import { useEffect, useState } from "react";
import { SERVER_ADDRESS_HTTP } from "../constants";
import { parseStatsData, STATS_GAMES_PATH, type StatsData } from "./record";

export { STATS_GAMES_PATH } from "./record";

/** What a stats page says when the games cannot be loaded. */
export const STATS_LOAD_ERROR = "Could not load the games. Reload the page to try again.";

/**
 * Fetches every record from the server and checks it.
 * @throws Error for a status other than 2xx, a network error, a body that is not JSON, or a
 *   response `parseStatsData` refuses.
 */
export async function fetchStatsData(): Promise<StatsData> {
  const response = await fetch(SERVER_ADDRESS_HTTP + STATS_GAMES_PATH);
  if (!response.ok) {
    throw new Error(`${STATS_GAMES_PATH} answered ${response.status}`);
  }
  let json: unknown;
  try {
    json = await response.json();
  } catch {
    throw new Error(`${STATS_GAMES_PATH} answered with something that is not JSON`);
  }
  return parseStatsData(json);
}

/** The page load's one request, shared by every page; forgotten when it fails. */
let request: Promise<StatsData> | null = null;
/** Its answer, once it has come. */
let loaded: StatsData | null = null;

/** Forgets the request and its answer, as a new page load would (tests only). */
export function resetStatsDataForTests(): void {
  request = null;
  loaded = null;
}

function requestStatsData(): Promise<StatsData> {
  if (!request) {
    request = fetchStatsData().then(
      (data) => {
        loaded = data;
        return data;
      },
      (error: unknown) => {
        request = null; // the next mount asks again
        throw error;
      }
    );
  }
  return request;
}

export interface StatsDataState {
  data: StatsData | null;
  error: string | null;
}

const PENDING: StatsDataState = { data: null, error: null };

/**
 * The records, fetched once per page load and shared: `{ data: null, error: null }` while they
 * come, then the data, or `STATS_LOAD_ERROR` if they could not be loaded.
 */
export function useStatsData(): StatsDataState {
  const [state, setState] = useState<StatsDataState>(() => (loaded ? { data: loaded, error: null } : PENDING));
  useEffect(() => {
    if (state.data) return;
    let live = true;
    requestStatsData().then(
      (data) => {
        if (live) setState({ data, error: null });
      },
      (error: unknown) => {
        console.warn("Could not load the games:", error);
        if (live) setState({ data: null, error: STATS_LOAD_ERROR });
      }
    );
    return () => {
      live = false;
    };
    // Asked once per mount: a failure shows until the next mount (a new page) asks again.
  }, []);
  return state;
}
