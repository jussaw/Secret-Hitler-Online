import { expect, type Page } from "@playwright/test";
import {
  OUTCOMES,
  STATS_GAMES_PATH,
  sideOf,
  type Card,
  type GameEvent,
  type GameRecord,
  type Outcome,
  type Player,
  type Role,
  type Seat,
  type StatsData,
} from "../src/stats/record";
import { DESKTOP_SIZES, MIN_FIELD_TEXT, MIN_TARGET, NARROW_PHONE, NARROW_WINDOWS, SQUARE_DESKTOPS } from "./layout";

/**
 * What every stats spec (`stats-*.spec.ts`) shares: the sizes each page is checked at, a stubbed
 * `GET /api/stats/games` and a large, fixed response for it, and the one page check. Nothing here
 * imports `src/constants` (or `api.ts`, which does): it reads `window` when it loads, which throws
 * in Playwright's Node process.
 */

export type Size = { width: number; height: number };

/** The phones: the two phone projects' viewports and the narrowest phone supported. */
export const PHONE_SIZES: Size[] = [{ width: 360, height: 740 }, { width: 412, height: 915 }, NARROW_PHONE];

/** Every size a stats page is checked at, from the desktops to 320x568. */
export const statsSizes: Size[] = [...DESKTOP_SIZES, ...SQUARE_DESKTOPS, ...NARROW_WINDOWS, ...PHONE_SIZES];

/**
 * The sizes a project checks a page at: every size in `desktop` and `firefox`; a phone project
 * its own viewport, and `phone-360` also the narrowest phone.
 */
export function statsSizesFor(project: string, viewport: Size): Size[] {
  if (project === "desktop" || project === "firefox") return statsSizes;
  if (project === "phone-360") return [viewport, NARROW_PHONE];
  return [viewport];
}

/** Answers the page's `GET /api/stats/games` with `data`. Call it before `goto`. */
export async function stubStats(page: Page, data: StatsData): Promise<void> {
  await page.route(`**${STATS_GAMES_PATH}`, (route) => route.fulfill({ json: data }));
}

// ---------------------------------------------------------------------------------------------
// bigStatsData: 400 games of ten players, played out by a seeded generator.

/** A seeded random number generator (mulberry32): the same numbers for the same seed. */
function random(seed: number) {
  let a = seed >>> 0;
  const next = () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const int = (min: number, max: number) => min + Math.floor(next() * (max - min + 1));
  const pick = <T>(items: T[]): T => items[Math.floor(next() * items.length)];
  const chance = (p: number) => next() < p;
  const shuffle = <T>(items: T[]): T[] => {
    const out = [...items];
    for (let i = out.length - 1; i > 0; i--) {
      const j = Math.floor(next() * (i + 1));
      [out[i], out[j]] = [out[j], out[i]];
    }
    return out;
  };
  return { int, pick, chance, shuffle };
}
type Random = ReturnType<typeof random>;

const ENDINGS: Outcome[] = OUTCOMES.filter((outcome) => outcome !== "UNFINISHED");
const DAY = 24 * 60 * 60 * 1000;
const MINUTE = 60 * 1000;
/** Each seat count's Liberals and Fascists besides Hitler. */
const PARTIES: Record<number, [number, number]> = { 5: [3, 1], 6: [4, 1], 7: [4, 2], 8: [5, 2], 9: [5, 3], 10: [6, 3] };

type PowerKind = "peek" | "investigate" | "specialElection" | "execute";

/** The power a Fascist policy enacted by a chancellor unlocks, by seat count and the board after. */
function powerFor(seats: number, fascist: number): PowerKind | null {
  if (fascist === 4 || fascist === 5) return "execute";
  if (seats <= 6) return fascist === 3 ? "peek" : null;
  if (fascist === 3) return "specialElection";
  if (seats <= 8) return fascist === 2 ? "investigate" : null;
  return fascist === 1 || fascist === 2 ? "investigate" : null;
}

/** Each event type without its time, which the game's clock adds. */
type WithoutTime<E> = E extends unknown ? Omit<E, "t"> : never;
type Untimed = WithoutTime<GameEvent>;

/**
 * One game played by the rules, steered towards `target` (or stopped after `stopAfter` rounds,
 * for an unfinished game). Returns null when the cards and votes would not let it end that way,
 * so the caller tries another seed.
 */
function playGame(
  rng: Random,
  roles: Role[],
  human: boolean[],
  target: Outcome,
  stopAfter: number | null,
  options: { disconnect: boolean }
): { events: GameEvent[]; alive: boolean[]; outcome: Outcome; liberal: number; fascist: number } | null {
  const size = roles.length;
  const hitler = roles.indexOf("HITLER");
  const alive = roles.map(() => true);
  const investigated = new Set<number>();
  let draw: Card[] = rng.shuffle([...Array<Card>(6).fill("L"), ...Array<Card>(11).fill("F")]);
  let discards: Card[] = [];
  let liberal = 0;
  let fascist = 0;
  let tracker = 0;
  let r = 0;
  let t = 0;
  let terms = 0;
  let lastPresident: number | null = null;
  let lastChancellor: number | null = null;
  let rotation = -1; // the seat whose turn was the last regular presidency
  let special: number | null = null; // the next president, chosen by a special election
  const events: GameEvent[] = [];
  const add = (event: Untimed, wait: [number, number]) => {
    t += rng.int(wait[0], wait[1]);
    events.push({ ...event, t } as GameEvent);
  };
  const living = () => alive.flatMap((a, i) => (a ? [i] : []));
  const leansFascist = target !== "LIBERAL_POLICIES";
  const disconnectRound = options.disconnect ? rng.int(2, 4) : -1;

  const reshuffleIfLow = () => {
    if (draw.length < 3) {
      draw = rng.shuffle([...draw, ...discards]);
      discards = [];
      add({ type: "reshuffle", r, drawPile: draw.length }, [0, 0]);
    }
  };
  const finish = (outcome: Outcome) => {
    add({ type: "end", r, outcome }, [0, 2_000]);
    return { events, alive, outcome, liberal, fascist };
  };
  /** Enacts the top card after a third failed election or an accepted veto at 2. */
  const chaos = () => {
    reshuffleIfLow(); // a veto may have taken the pile's last cards
    add({ type: "tracker", r, value: 3 }, [0, 0]);
    const policy = draw.shift()!;
    if (policy === "L") liberal++;
    else fascist++;
    add({ type: "enact", r, policy, by: "chaos", liberal, fascist }, [0, 0]);
    tracker = 0;
    lastPresident = null;
    lastChancellor = null;
    reshuffleIfLow();
  };

  for (;;) {
    // The next president: a special election's choice, else the next living seat in turn.
    let president: number;
    if (special !== null) {
      president = special;
      special = null;
    } else {
      do rotation = (rotation + 1) % size;
      while (!alive[rotation]);
      president = rotation;
    }
    r++;
    if (stopAfter !== null && r > stopAfter) {
      // The lobby closed mid-term: no one ended it, and the sweep came ten minutes on.
      t += 10 * MINUTE + rng.int(0, MINUTE);
      r--;
      events.push({ type: "end", t, r, outcome: "UNFINISHED" });
      return { events, alive, outcome: "UNFINISHED", liberal, fascist };
    }

    // The nomination: anyone alive but the president and the last government (the last
    // president may serve again with five or fewer alive). After three Fascist policies Hitler is
    // only nominated when the game is to end that way.
    const eligible = living().filter(
      (s) => s !== president && s !== lastChancellor && (living().length <= 5 || s !== lastPresident)
    );
    const hitlerWins = fascist >= 3 && target === "HITLER_ELECTED" && eligible.includes(hitler);
    const safe = eligible.filter((s) => fascist < 3 || s !== hitler);
    if (!hitlerWins && safe.length === 0) return null;
    const chancellor = hitlerWins ? hitler : rng.pick(safe);
    add({ type: "nominate", r, president, chancellor }, [4_000, 30_000]);
    terms++;
    if (r === disconnectRound) {
      const seat = rng.pick(living().filter((s) => human[s]));
      if (seat !== undefined) {
        add({ type: "disconnect", r, seat }, [500, 4_000]);
        add({ type: "reconnect", r, seat }, [2_000, 20_000]);
      }
    }

    // The votes, one per living seat in the order they came, and the result.
    const voters = rng.shuffle(living());
    const passes = hitlerWins || tracker === 2 ? rng.chance(0.85) : rng.chance(0.72);
    const majority = Math.floor(voters.length / 2) + 1;
    const ja = passes ? rng.int(majority, voters.length) : rng.int(0, majority - 1);
    const jaVoters = new Set(rng.shuffle(voters).slice(0, ja));
    for (const seat of voters) add({ type: "vote", r, seat, ja: jaVoters.has(seat) }, [800, 15_000]);
    add({ type: "election", r, passed: passes, ja, nein: voters.length - ja }, [0, 300]);

    let powerSeat: number | null = null;
    let power: PowerKind | null = null;
    if (!passes) {
      tracker++;
      if (tracker < 3) add({ type: "tracker", r, value: tracker }, [0, 0]);
      else chaos();
    } else {
      if (fascist >= 3 && chancellor === hitler) return finish("HITLER_ELECTED");
      lastPresident = president;
      lastChancellor = chancellor;

      // The legislative session: the president's three, a discard, the chancellor's choice.
      const hand = draw.splice(0, 3);
      add({ type: "draw", r, seat: president, cards: hand }, [200, 800]);
      const keep: Card = leansFascist ? "F" : "L";
      const away: Card = keep === "F" ? "L" : "F";
      let index = rng.chance(0.25) ? rng.int(0, 2) : hand.indexOf(away);
      if (index < 0) index = rng.int(0, 2);
      const card = hand[index];
      discards.push(card);
      add({ type: "discard", r, seat: president, index, card }, [2_000, 25_000]);
      const two = hand.filter((_, i) => i !== index);

      let vetoed = false;
      if (fascist === 5 && rng.chance(0.4)) {
        add({ type: "veto", r, seat: chancellor }, [2_000, 15_000]);
        vetoed = rng.chance(0.5);
        add({ type: "vetoAnswer", r, seat: president, accepted: vetoed }, [2_000, 15_000]);
      }
      if (vetoed) {
        discards.push(...two);
        tracker++;
        if (tracker < 3) {
          add({ type: "tracker", r, value: tracker }, [0, 0]);
          reshuffleIfLow();
        } else chaos();
      } else {
        const policy: Card = two.includes(keep) && !rng.chance(0.15) ? keep : rng.pick(two);
        discards.push(two[two.indexOf(policy) === 0 ? 1 : 0]);
        if (policy === "L") liberal++;
        else fascist++;
        tracker = 0; // only a policy puts the tracker back
        add({ type: "enact", r, policy, by: "chancellor", seat: chancellor, liberal, fascist }, [2_000, 25_000]);
        reshuffleIfLow();
        if (policy === "F") power = powerFor(size, fascist);
        powerSeat = president;
      }
    }
    if (liberal >= 5) return finish("LIBERAL_POLICIES");
    if (fascist >= 6) return finish("FASCIST_POLICIES");

    // The power the policy unlocked.
    if (power !== null && powerSeat !== null) {
      const others = living().filter((s) => s !== powerSeat);
      if (power === "peek") {
        add({ type: "peek", r, seat: powerSeat, cards: draw.slice(0, 3) }, [3_000, 15_000]);
      } else if (power === "investigate") {
        const choices = others.filter((s) => !investigated.has(s));
        const suspect = rng.pick(choices.length > 0 ? choices : others);
        investigated.add(suspect);
        add({ type: "investigate", r, seat: powerSeat, target: suspect, result: sideOf(roles[suspect]) }, [3_000, 30_000]);
      } else if (power === "specialElection") {
        special = rng.pick(others);
        add({ type: "specialElection", r, seat: powerSeat, target: special }, [3_000, 30_000]);
      } else {
        const wantsHitler = target === "HITLER_EXECUTED" && others.includes(hitler);
        const victims = others.filter((s) => s !== hitler);
        if (!wantsHitler && victims.length === 0) return null;
        const victim = wantsHitler ? hitler : rng.pick(victims);
        alive[victim] = false;
        add({ type: "execute", r, seat: powerSeat, target: victim, role: roles[victim] }, [3_000, 30_000]);
        if (victim === hitler) return finish("HITLER_EXECUTED");
        if (special === victim) special = null;
      }
    }

    // The term ends: by the president, or by the countdown in every fifth term of a person's.
    if (human[president] && rng.chance(0.2)) {
      add({ type: "timerPause", r, seat: president }, [1_000, 5_000]);
      add({ type: "timerResume", r, seat: president }, [3_000, 40_000]);
    }
    const countdown = human[president] && terms % 5 === 0;
    add({ type: "endTerm", r, seat: president, by: countdown ? "countdown" : "president" }, countdown ? [10_000, 10_000] : [1_500, 9_000]);
    if (r > 40) return null;
  }
}

/** The seats' roles in turn order, for a seat count. */
function dealRoles(rng: Random, size: number): Role[] {
  const [liberals, fascists] = PARTIES[size];
  return rng.shuffle<Role>([
    ...Array<Role>(liberals).fill("LIBERAL"),
    ...Array<Role>(fascists).fill("FASCIST"),
    "HITLER",
  ]);
}

/** Stretches a timeline's times to `length` ms, keeping their order. */
function stretch(events: GameEvent[], length: number): GameEvent[] {
  const last = events[events.length - 1].t || 1;
  return events.map((e) => ({ ...e, t: Math.round((e.t * length) / last) }));
}

/**
 * 400 recorded games of ten players, the same on every call (a seeded generator): the response
 * every stats spec checks its pages against. Players 1 to 10 are `WWWWWWWWWW01` to
 * `WWWWWWWWWW10`; games `big-001` to `big-400`, oldest first, four an evening every third or
 * fourth evening from 6 Oct 2025, each 15 to 60 minutes long. Seat counts cycle through 5 to 10;
 * every seventh game has one or two CPU seats (Hitler among them at least once); every 25th is
 * unfinished, and the rest cycle through the four endings; `big-200` is also incomplete, opening
 * with `restored`. Its timelines follow the rules closely enough for the stats: rounds, votes,
 * the election tracker and chaos, the cards, vetoes, the powers by seat count, the term's end
 * (by the countdown in every fifth term), pauses, dropped connections, reshuffles and the board.
 * Later phases assume nothing else about it.
 */
export function bigStatsData(): StatsData {
  const players: Player[] = Array.from({ length: 10 }, (_, i) => ({
    number: i + 1,
    name: `${"W".repeat(10)}${String(i + 1).padStart(2, "0")}`,
  }));
  const rng = random(31);
  const games: GameRecord[] = [];
  let evening = Date.UTC(2025, 9, 6, 19, 0);
  let finished = 0;
  let hitlerBot = false;

  for (let i = 0; i < 400; i++) {
    const number = i + 1;
    if (i > 0 && i % 4 === 0) evening += rng.pick([3, 4]) * DAY;
    const startedAt = i % 4 === 0 ? evening + rng.int(0, 10) * MINUTE : games[i - 1].endedAt + rng.int(3, 12) * MINUTE;
    const size = 5 + (i % 6);
    const bots = number % 7 === 0 ? 1 + ((number / 7) % 2) : 0;
    const unfinished = number % 25 === 0;
    const outcome: Outcome = unfinished ? "UNFINISHED" : ENDINGS[finished++ % 4];

    let roles: Role[] = [];
    let botSeats: number[] = [];
    let people: number[] = [];
    let played: NonNullable<ReturnType<typeof playGame>> | undefined;
    for (let attempt = 0; !played; attempt++) {
      if (attempt === 200) throw new Error(`bigStatsData could not play big-${number}`);
      roles = dealRoles(rng, size);
      botSeats = rng.shuffle(roles.map((_, s) => s)).slice(0, bots);
      const hitler = roles.indexOf("HITLER");
      // The first CPU game seats a CPU player as Hitler.
      if (bots > 0 && !hitlerBot && !botSeats.includes(hitler)) botSeats[0] = hitler;
      people = rng.shuffle(players.map((p) => p.number)).slice(0, size - bots);
      const human = roles.map((_, s) => !botSeats.includes(s));
      const stopAfter = unfinished ? rng.int(3, 8) : null;
      const game = playGame(rng, roles, human, unfinished ? "LIBERAL_POLICIES" : outcome, stopAfter, {
        disconnect: number % 5 === 2,
      });
      if (game && game.outcome === outcome) played = game;
    }
    if (bots > 0 && botSeats.includes(roles.indexOf("HITLER"))) hitlerBot = true;
    const { alive } = played;

    let botCount = 0;
    let person = 0;
    const seats: Seat[] = roles.map((role, s) => {
      const cpu = botSeats.includes(s);
      const player = cpu ? null : people[person++];
      const name = cpu ? `Bot ${++botCount}` : players[player! - 1].name;
      return { player, name, cpu, role, alive: alive[s] };
    });

    let events = played.events;
    let complete = true;
    let opened = startedAt;
    if (number === 200) {
      // Restored from a backup with no timeline: the record starts at the restore, in round 2.
      const from = events.findIndex((e) => e.type === "nominate" && e.r === 2);
      const cut = events[from].t - 1_000;
      events = [{ type: "restored", t: 0, r: 2 }, ...events.slice(from).map((e) => ({ ...e, t: e.t - cut }))];
      complete = false;
      opened = startedAt + cut;
    }
    const length = rng.int(15 * MINUTE, 60 * MINUTE);
    events = stretch(events, length);
    const last = events[events.length - 1];
    games.push({
      id: `big-${String(number).padStart(3, "0")}`,
      format: 1,
      startedAt: opened,
      endedAt: opened + last.t,
      outcome,
      winner: outcome === "UNFINISHED" ? null : outcome === "LIBERAL_POLICIES" || outcome === "HITLER_EXECUTED" ? "LIBERAL" : "FASCIST",
      complete,
      hasCpu: bots > 0,
      liberalPolicies: played.liberal,
      fascistPolicies: played.fascist,
      rounds: last.r,
      seats,
      events,
    });
  }
  return { players, games };
}

// ---------------------------------------------------------------------------------------------
// The page check.

/** The game's stacked query: phones, phones held sideways, and narrow and tall windows. */
export const STACKED_QUERY = "(max-width: 768px), (aspect-ratio < 5/4), (max-height: 500px)";

/**
 * What is wrong with the stats page at its current size, as `tag#id "text" WxH` (or `… 14px`):
 * - `sideways`: the page scrolls sideways (`scrollWidth <W>`), or a visible element reaches more
 *   than 1px past either side, unless it is inside a box that scrolls sideways itself (computed
 *   `overflow-x` `auto` or `scroll`, other than `body`, `.stats-screen` and `.stats-main`, which
 *   compute it for a vertical scroller too). That box itself still counts.
 * - `smallTargets`, only where the stacked query matches: every visible link, button, select,
 *   input, summary and `[role="button"]` narrower or shorter than MIN_TARGET, but for a link
 *   inline in a sentence of a `p` (never one in a table cell). A checkbox or radio is measured by
 *   its label.
 * - `smallText`, only where the stacked query matches: every visible text or date field, select
 *   and textarea whose text is below MIN_FIELD_TEXT (no field, no check).
 */
export function statsPageProblems(
  page: Page
): Promise<{ sideways: string[]; smallTargets: string[]; smallText: string[] }> {
  return page.evaluate(
    ({ stacked, minTarget, minText }) => {
      const describe = (el: Element, extra: string) => {
        const id = el.id ? `#${el.id}` : "";
        const text = (el.textContent ?? "").trim().replace(/\s+/g, " ").slice(0, 24);
        return `${el.tagName.toLowerCase()}${id} "${text}" ${extra}`;
      };
      const size = (r: DOMRect) => `${Math.round(r.width)}x${Math.round(r.height)}`;
      const shown = (el: Element) => {
        const r = el.getBoundingClientRect();
        return r.width > 0 && r.height > 0 && getComputedStyle(el).visibility === "visible";
      };

      const width = document.documentElement.clientWidth;
      const sideways: string[] = [];
      const scrollWidth = Math.max(document.documentElement.scrollWidth, document.body.scrollWidth);
      if (scrollWidth > width) sideways.push(`scrollWidth ${scrollWidth}`);
      const page = new Set<Element>([document.body, ...Array.from(document.querySelectorAll(".stats-screen, .stats-main"))]);
      const insideScroller = (el: Element) => {
        for (let up = el.parentElement; up && up !== document.body; up = up.parentElement) {
          if (page.has(up)) continue;
          const overflow = getComputedStyle(up).overflowX;
          if (overflow === "auto" || overflow === "scroll") return true;
        }
        return false;
      };
      for (const el of Array.from(document.querySelectorAll("body *"))) {
        if (!shown(el)) continue;
        const r = el.getBoundingClientRect();
        if ((r.left < -1 || r.right > width + 1) && !insideScroller(el)) {
          sideways.push(describe(el, `[${Math.round(r.left)}, ${Math.round(r.right)}]`));
        }
      }

      const smallTargets: string[] = [];
      const smallText: string[] = [];
      if (matchMedia(stacked).matches) {
        /** A link inline in a sentence: in a `p` (and in no table cell) with text of its own beside it. */
        const inSentence = (el: Element) => {
          if (el.tagName !== "A" || getComputedStyle(el).display !== "inline") return false;
          if (el.closest("td, th")) return false;
          const p = el.closest("p");
          if (!p) return false;
          const walker = document.createTreeWalker(p, NodeFilter.SHOW_TEXT);
          for (let node = walker.nextNode(); node; node = walker.nextNode()) {
            if (!el.contains(node) && (node.nodeValue ?? "").trim() !== "") return true;
          }
          return false;
        };
        const controls = document.querySelectorAll(
          '.stats-screen :is(a, button, select, input:not([type="hidden"]), summary, [role="button"])'
        );
        for (const el of Array.from(controls)) {
          const input = el instanceof HTMLInputElement && (el.type === "checkbox" || el.type === "radio") ? el : null;
          const measured = input ? (input.labels?.[0] ?? input.closest("label") ?? input) : el;
          if (!shown(measured) || inSentence(el)) continue;
          const r = measured.getBoundingClientRect();
          if (r.width < minTarget - 0.01 || r.height < minTarget - 0.01) smallTargets.push(describe(el, size(r)));
        }

        const typed = ["text", "search", "url", "tel", "email", "password", "number", "date", "datetime-local", "month", "week", "time"];
        const fields = document.querySelectorAll<HTMLElement>(".stats-screen :is(input, select, textarea)");
        for (const el of Array.from(fields)) {
          if (el instanceof HTMLInputElement && !typed.includes(el.type)) continue;
          if (!shown(el)) continue;
          const px = parseFloat(getComputedStyle(el).fontSize);
          if (px < minText) smallText.push(describe(el, `${px}px`));
        }
      }
      return { sideways, smallTargets, smallText };
    },
    { stacked: STACKED_QUERY, minTarget: MIN_TARGET, minText: MIN_FIELD_TEXT }
  );
}

/**
 * Sets the page to `size`, lets it lay itself out again, and expects `statsPageProblems` to find
 * nothing: no sideways scroll and, where the stacked query matches, 44px targets and 16px field
 * text. Every stats spec checks its pages with it, and writes no sideways check of its own.
 */
export async function checkStatsPage(page: Page, size: Size): Promise<void> {
  await page.setViewportSize(size);
  // Two frames, so anything that sizes itself from its box (a chart) has drawn at the new size.
  await page.evaluate(() => new Promise((done) => requestAnimationFrame(() => requestAnimationFrame(done))));
  const at = `${size.width}x${size.height}`;
  const problems = await statsPageProblems(page);
  expect(problems.sideways, `sideways at ${at}`).toEqual([]);
  expect(problems.smallTargets, `small targets at ${at}`).toEqual([]);
  expect(problems.smallText, `small field text at ${at}`).toEqual([]);
}

// ---------------------------------------------------------------------------------------------
// The game's first download.

/** Text only the stats chunk holds (ASCII, so the minifier keeps it as written). */
export const STATS_ONLY_STRINGS = ["/api/stats/games", "Could not load the games", "This page was not found"];

/**
 * Every same-origin response while `goto(path, { waitUntil: "networkidle" })` loads, with its
 * resource type and, for scripts and stylesheets, its text (`""` for the rest). Open the page
 * with `browser.newPage()`, so nothing comes from the cache.
 */
export async function downloads(page: Page, path: string): Promise<{ url: string; type: string; body: string }[]> {
  const responses: import("@playwright/test").Response[] = [];
  const listen = (response: import("@playwright/test").Response) => responses.push(response);
  page.on("response", listen);
  try {
    await page.goto(path, { waitUntil: "networkidle" });
  } finally {
    page.off("response", listen);
  }
  const origin = new URL(page.url()).origin;
  const out: { url: string; type: string; body: string }[] = [];
  for (const response of responses) {
    const url = response.url();
    if (new URL(url).origin !== origin) continue;
    const type = response.request().resourceType();
    const text = type === "script" || type === "stylesheet" || /\.(js|css)(\?|$)/.test(url);
    out.push({ url, type, body: text ? await response.text() : "" });
  }
  return out;
}
