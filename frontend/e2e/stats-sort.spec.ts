import { expect, test, type Locator, type Page } from "@playwright/test";
import { routePath } from "../src/stats/routes";
import { NARROW_PHONE } from "./layout";
import { settle } from "./lobby";
import { bigStatsData, checkStatsPage, STACKED_QUERY, stubStats } from "./stats";

/**
 * The sortable tables in the browser (#109): a ranked card's heads sort its rows while every rank
 * stays its player's (where the stacked query matches, its count is a line under the name and its
 * count head is gone), the power ranking sorts by Elo, a best week by player, Enter and Space on a
 * focused head sort it with the focus kept there, and a sorted card still fits a 320px phone.
 * That every ranked table stays inside its card at every stats size is `checkStatsPage`'s, which
 * every tab's own spec runs.
 */

const data = bigStatsData();

/** Opens `path` with the big response stubbed and the clock an hour after its last game ends. */
async function open(page: Page, path: string): Promise<void> {
  await stubStats(page, data);
  const latest = data.games.reduce((most, game) => Math.max(most, game.endedAt), 0);
  await page.clock.setFixedTime(latest + 3_600_000);
  await page.goto(path);
  await expect(page.locator(".stats-main .stats-card").first()).toBeVisible();
  await settle(page);
}

const card = (page: Page, name: string) => page.getByRole("region", { name, exact: true });
const head = (table: Locator, name: string) => table.getByRole("columnheader", { name, exact: true });
const headButton = (table: Locator, name: string) => head(table, name).getByRole("button");
/** The stacked query matches (phones, tall and narrow windows): a ranked card's count is under the name. */
const stacked = (page: Page) => page.evaluate((query) => matchMedia(query).matches, STACKED_QUERY);

/** The body's cells of `cell`'s class, as numbers ("—" as null). */
function numbers(table: Locator, cell: string): Promise<(number | null)[]> {
  return table
    .locator(`tbody td.${cell}`)
    .evaluateAll((tds) =>
      tds.map((td) => {
        const text = (td.textContent ?? "").trim().replace("−", "-");
        return text === "—" ? null : parseFloat(text);
      })
    );
}

/** Each body row's player number and rank text ("3."), in the rows' order. */
function ranks(table: Locator): Promise<[string, string][]> {
  return table.locator("tbody tr").evaluateAll((trs) =>
    trs.map((tr): [string, string] => [
      tr.querySelector(".player-name")?.getAttribute("data-player") ?? "",
      (tr.querySelector("td.ranked-rank")?.textContent ?? "").trim(),
    ])
  );
}

/** The body's names, in the rows' order. */
function names(table: Locator): Promise<string[]> {
  return table.locator("tbody .ranked-name .player-name").evaluateAll((all) => all.map((el) => (el.textContent ?? "").trim()));
}

/** Names A to Z, as the Player head sorts them. */
const byName = (a: string, b: string) => a.localeCompare(b, "en", { sensitivity: "base" });

function nonIncreasing(values: (number | null)[]): boolean {
  return values.every((value, i) => i === 0 || (values[i - 1] as number) >= (value as number));
}

function nonDecreasing(values: (number | null)[]): boolean {
  return values.every((value, i) => i === 0 || (values[i - 1] as number) <= (value as number));
}

test("a ranked card's heads sort it and its ranks stay", async ({ page }) => {
  await open(page, routePath({ page: "tab", tab: "overview" }));
  const table = card(page, "Win rate").locator("table.ranked-table");
  await expect(head(table, "Rank")).toHaveAttribute("aria-sort", "ascending");
  const opening = await ranks(table);
  expect(opening.length, "rows").toBeGreaterThan(1);
  const rankOf = new Map(opening);
  const ranksStay = async () => {
    for (const [player, rank] of await ranks(table)) expect(rank, `player ${player}'s rank`).toBe(rankOf.get(player));
  };

  const under = await stacked(page);
  if (under) {
    // Where the stacked query matches (the phones here) the count is a line under each name, in
    // place of its column and head (as PLAYERS' Last played on phones), so sorting by it is for wide
    // windows only: the press here is on Player.
    // Hidden, not removed: CSS locators, as a display: none cell is in no role query.
    const countHead = table.locator("thead th.ranked-count");
    await expect(countHead).toHaveCount(1);
    await expect(countHead).toHaveText("Games");
    await expect(countHead).toBeHidden();
    const countCells = table.locator("tbody td.ranked-count");
    await expect(countCells).toHaveCount(opening.length);
    for (const cell of await countCells.all()) await expect(cell).toBeHidden();
    const lines = table.locator("tbody .ranked-count-under");
    await expect(lines).toHaveCount(opening.length);
    for (const line of await lines.all()) await expect(line).toBeVisible();
    for (const line of await lines.allTextContents()) expect(line).toMatch(/^\d+ games?$/);

    await headButton(table, "Player").click();
    await expect(head(table, "Player")).toHaveAttribute("aria-sort", "ascending");
    const aToZ = await names(table);
    expect(aToZ, "names A to Z").toEqual([...aToZ].sort(byName));
    await ranksStay();
    await headButton(table, "Player").click();
    await expect(head(table, "Player")).toHaveAttribute("aria-sort", "descending");
    expect(await names(table), "names Z to A").toEqual([...aToZ].reverse());
    await ranksStay();
  } else {
    // The count's line under the name is there, and hidden: the count has its column here.
    const lines = table.locator("tbody .ranked-count-under");
    await expect(lines).toHaveCount(opening.length);
    for (const line of await lines.all()) await expect(line).toBeHidden();
    await headButton(table, "Games").click();
    await expect(head(table, "Games")).toHaveAttribute("aria-sort", "descending");
    await expect(head(table, "Rank")).not.toHaveAttribute("aria-sort", /./);
    const most = await numbers(table, "ranked-count");
    expect(most.every((count) => count !== null), "every count shown").toBe(true);
    expect(nonIncreasing(most), `most games first: ${most.join(", ")}`).toBe(true);
    await ranksStay();

    await headButton(table, "Games").click();
    await expect(head(table, "Games")).toHaveAttribute("aria-sort", "ascending");
    const fewest = await numbers(table, "ranked-count");
    expect(nonDecreasing(fewest), `fewest games first: ${fewest.join(", ")}`).toBe(true);
    await ranksStay();
  }

  await headButton(table, "Rank").click();
  await expect(head(table, "Rank")).toHaveAttribute("aria-sort", "ascending");
  // The pressed head gives up its mark (a hidden head is in no role query, so Games only where shown).
  await expect(head(table, under ? "Player" : "Games")).not.toHaveAttribute("aria-sort", /./);
  expect(await ranks(table), "the opening order").toEqual(opening);
});

test("the power ranking sorts by Elo", async ({ page }) => {
  await open(page, routePath({ page: "tab", tab: "overview" }));
  const table = card(page, "Power ranking").locator("table.power-ranking");
  await headButton(table, "Elo").click();
  await expect(head(table, "Elo")).toHaveAttribute("aria-sort", "descending");
  const elo = await numbers(table, "ranked-value");
  expect(elo.length, "rows").toBeGreaterThan(1);
  expect(elo.every((rating) => rating !== null), "every rating shown").toBe(true);
  expect(nonIncreasing(elo), `highest Elo first: ${elo.join(", ")}`).toBe(true);
});

test("a best week sorts by player", async ({ page }) => {
  await open(page, routePath({ page: "tab", tab: "records" }));
  const table = card(page, "Most wins in a week").locator("table.ranked-table");
  await headButton(table, "Player").click();
  await expect(head(table, "Player")).toHaveAttribute("aria-sort", "ascending");
  const shown = await names(table);
  expect(shown.length, "rows").toBeGreaterThan(1);
  expect(shown, "names A to Z").toEqual([...shown].sort(byName));
});

test("Enter and Space on a focused head sort it", async ({ page }) => {
  const project = test.info().project.name;
  test.skip(project !== "desktop" && project !== "firefox", "a keyboard's matter");
  await open(page, routePath({ page: "tab", tab: "overview" }));
  const table = card(page, "Win rate").locator("table.ranked-table");
  const games = headButton(table, "Games");
  // From the card's first head, Tab along its heads to Games (Player and Win rate come first).
  await headButton(table, "Rank").focus();
  for (let i = 0; i < 3; i++) await page.keyboard.press("Tab");
  await expect(games).toBeFocused();

  await page.keyboard.press("Enter");
  await expect(head(table, "Games")).toHaveAttribute("aria-sort", "descending");
  await expect(games).toBeFocused();
  await page.keyboard.press("Space");
  await expect(head(table, "Games")).toHaveAttribute("aria-sort", "ascending");
  await expect(games).toBeFocused();
});

test("a sorted ranked card still fits", async ({ page }) => {
  test.skip(test.info().project.name !== "phone-360", "the narrowest phone, once");
  await page.setViewportSize(NARROW_PHONE);
  await open(page, routePath({ page: "tab", tab: "overview" }));
  // Its count column gives way to the line under the name on a phone, so it sorts by its value.
  const table = card(page, "Win rate").locator("table.ranked-table");
  await headButton(table, "Win rate").click();
  await expect(head(table, "Win rate")).toHaveAttribute("aria-sort", "descending");
  await checkStatsPage(page, NARROW_PHONE);
});

// ---------------------------------------------------------------------------------------------
// The other sortable tables (#109, Phase 27B): a split table's heads sort it with its dashes last
// and Player giving its first order back, a side's head keeps its colour (and Hitler's its
// underline), a held head's focus ring stays inside its region, RIVALS' People table sorts by its
// counts, the players of the month by wins and by month, ENDINGS' two tables by their figures with
// the All row last, and each still fits a 320px phone sorted. That each fits at every stats size is
// `checkStatsPage`'s in the tabs' own specs, and that the tables which fitted their cards before
// their heads sorted still do is those specs' `expectWholeTables`.

/** The text of each of the body's cells that `cells` picks (a selector inside `tbody`, such as
 *  `tr > td:nth-of-type(2)`, 1 first), in the rows' order, as `figure` reads it ("—" as null). */
function figures(table: Locator, cells: string, figure: (text: string) => number): Promise<(number | null)[]> {
  return table
    .locator(`tbody ${cells}`)
    .allTextContents()
    .then((texts) =>
      texts.map((raw) => {
        const text = raw.trim();
        return text === "—" ? null : figure(text);
      })
    );
}

/** A figure out of a cell's text by `pattern`'s first group, failing the test for text it does not
 *  match. */
function matched(pattern: RegExp): (text: string) => number {
  return (text) => {
    const found = pattern.exec(text);
    if (!found) throw new Error(`"${text}" is not a figure ${pattern}`);
    return Number(found[1]);
  };
}

/** A percent's figure ("60%" is 60). */
const percent = matched(/^(\d+)%$/);

/** A length's minutes: "38 min" is 38, "1 h 15 min" is 75. */
function minutes(text: string): number {
  const found = /^(?:(\d+) h )?(\d+) min$/.exec(text);
  if (!found) throw new Error(`"${text}" is not a length`);
  return Number(found[1] ?? 0) * 60 + Number(found[2]);
}

/** `values` run `direction` (most first for "descending"), with every "—" (null) after every figure. */
function inOrder(values: (number | null)[], direction: "ascending" | "descending"): boolean {
  const firstDash = values.indexOf(null);
  const shown = firstDash === -1 ? values : values.slice(0, firstDash);
  if (firstDash !== -1 && values.slice(firstDash).some((value) => value !== null)) return false;
  return direction === "descending" ? nonIncreasing(shown) : nonDecreasing(shown);
}

/** A split table's rows by their players' numbers, in the rows' order. */
function splitPlayers(table: Locator): Promise<string[]> {
  return table
    .locator("tbody tr > th .player-name")
    .evaluateAll((all) => all.map((el) => el.getAttribute("data-player") ?? ""));
}

/** The colour `value` (a CSS colour, or a `var(…)`) computes to inside the stats page. */
function colourOf(page: Page, value: string): Promise<string> {
  return page.evaluate((color) => {
    const probe = document.createElement("span");
    probe.style.color = color;
    document.querySelector(".stats-screen")!.append(probe);
    const computed = getComputedStyle(probe).color;
    probe.remove();
    return computed;
  }, value);
}

/** The sides of a head's focus ring past its `ScrollRegion`'s box, which would clip them, as
 *  `left by 4px`: the ring's outer edge is the button's box grown by its offset and width (by
 *  nothing for a 2px ring 2px inside the button). */
function ringPast(button: Locator): Promise<string[]> {
  return button.evaluate((el) => {
    const style = getComputedStyle(el);
    const grow = Math.max(0, parseFloat(style.outlineOffset) + parseFloat(style.outlineWidth));
    const ring = el.getBoundingClientRect();
    const region = el.closest(".scroll-region")!.getBoundingClientRect();
    const past: [string, number][] = [
      ["left", region.left - (ring.left - grow)],
      ["top", region.top - (ring.top - grow)],
      ["right", ring.right + grow - region.right],
      ["bottom", ring.bottom + grow - region.bottom],
    ];
    return past.filter(([, px]) => px > 0.5).map(([side, px]) => `${side} by ${px}px`);
  });
}

test("a split table's heads sort it, its dashes last", async ({ page }) => {
  await open(page, routePath({ page: "tab", tab: "roles" }));
  const table = card(page, "Role split table").locator("table.split-table");
  await expect(head(table, "Player")).toHaveAttribute("aria-sort", "ascending");
  const opening = await splitPlayers(table);
  expect(opening.length, "rows").toBeGreaterThan(1);
  // Liberal's shares: each cell's text, without the count beside it.
  const shares = () => figures(table, "tr > td:nth-of-type(1) .split-text", percent);

  await headButton(table, "Liberal").click();
  await expect(head(table, "Liberal")).toHaveAttribute("aria-sort", "descending");
  await expect(head(table, "Player")).not.toHaveAttribute("aria-sort", /./);
  const most = await shares();
  expect(most.length, "rows").toBe(opening.length);
  expect(inOrder(most, "descending"), `Liberal shares most first, dashes last: ${most.join(", ")}`).toBe(true);

  await headButton(table, "Liberal").click();
  await expect(head(table, "Liberal")).toHaveAttribute("aria-sort", "ascending");
  const least = await shares();
  expect(inOrder(least, "ascending"), `Liberal shares least first, dashes last: ${least.join(", ")}`).toBe(true);

  await headButton(table, "Player").click();
  await expect(head(table, "Player")).toHaveAttribute("aria-sort", "ascending");
  await expect(head(table, "Liberal")).not.toHaveAttribute("aria-sort", /./);
  expect(await splitPlayers(table), "the opening order").toEqual(opening);
});

test("a side's head keeps its colour", async ({ page }) => {
  const project = test.info().project.name;
  await open(page, routePath({ page: "tab", tab: "roles" }));
  const table = card(page, "Role split table").locator("table.split-table");
  const liberal = headButton(table, "Liberal");
  const hitler = headButton(table, "Hitler");
  // The side's colours, which the heads' words are drawn in (the buttons' own colour, as the words
  // are the buttons').
  const blue = await colourOf(page, "var(--textColorLiberal)");
  const red = await colourOf(page, "var(--textColorFascist)");

  await expect(liberal, "Liberal's head before a press").toHaveCSS("color", blue);
  await expect(hitler, "Hitler's head before a press").toHaveCSS("color", red);
  await expect(hitler, "Hitler's head underlined").toHaveCSS("text-decoration-line", "underline");

  await liberal.click();
  await expect(head(table, "Liberal")).toHaveAttribute("aria-sort", "descending");
  await expect(liberal, "Liberal's head sorted").toHaveCSS("color", blue);
  await hitler.click();
  await expect(head(table, "Hitler")).toHaveAttribute("aria-sort", "descending");
  await expect(hitler, "Hitler's head sorted").toHaveCSS("color", red);
  await expect(hitler, "Hitler's head sorted, underlined").toHaveCSS("text-decoration-line", "underline");

  if (project === "desktop" || project === "firefox") {
    await liberal.hover();
    await expect(liberal, "Liberal's head hovered").toHaveCSS("color", blue);
    await hitler.hover();
    await expect(hitler, "Hitler's head hovered").toHaveCSS("color", red);
    await expect(hitler, "Hitler's head hovered, underlined").toHaveCSS("text-decoration-line", "underline");
  }
});

test("a held head's focus ring stays inside its region", async ({ page }) => {
  const project = test.info().project.name;
  test.skip(project !== "desktop" && project !== "firefox", "a keyboard's matter");
  await open(page, routePath({ page: "tab", tab: "roles" }));
  const region = card(page, "Role split table");
  const player = headButton(region.locator("table.split-table"), "Player");
  await region.focus();
  await page.keyboard.press("Tab");
  await expect(player).toBeFocused();
  expect(await player.evaluate((button) => button.matches(":focus-visible")), "Player's head shows its ring").toBe(true);
  expect(await ringPast(player), "the ring's sides past the region's").toEqual([]);
  await expect(player).toHaveCSS("outline-offset", "-2px");
});

/** What lies over the left edge of a head's focus ring (the button's box grown by its offset and
 *  width), 1px in, at the button's middle: null for the button itself, else the element there,
 *  such as a held first column's cell, which paints over what lies under it. */
function overRingLeft(button: Locator): Promise<string | null> {
  return button.evaluate((el) => {
    const style = getComputedStyle(el);
    const grow = Math.max(0, parseFloat(style.outlineOffset) + parseFloat(style.outlineWidth));
    const box = el.getBoundingClientRect();
    const hit = document.elementFromPoint(box.left - grow + 1, box.top + box.height / 2);
    if (hit && el.contains(hit)) return null;
    if (!hit) return "nothing";
    return `${hit.tagName.toLowerCase()}.${hit.getAttribute("class") ?? ""} "${(hit.textContent ?? "").trim().slice(0, 24)}"`;
  });
}

test("the heads' focus rings stay inside their buttons where heads are tightened", async ({ page }) => {
  const project = test.info().project.name;
  test.skip(project !== "desktop" && project !== "firefox", "a keyboard's matter");
  // An upright tablet: the stacked query gives a split table's heads 3px a side and ENDINGS' 2px,
  // less than a ring 2px out needs, so every head draws its ring inside its button. The second
  // head stands that close to the held first column, which would paint over its ring's left side;
  // the last, scrolled to (the Liberal win rate scrolls in its region), at the region's edge.
  await page.setViewportSize({ width: 820, height: 1180 });
  const cases = [
    { tab: "roles", region: "Role split table", second: "Liberal", last: "Hitler", heads: 4 },
    { tab: "endings", region: "Liberal win rate by player count table", second: "Games", last: "Smoothed", heads: 5 },
  ] as const;
  for (const { tab, region: name, second, last, heads } of cases) {
    await open(page, routePath({ page: "tab", tab }));
    const region = card(page, name);
    const table = region.locator("table");
    await region.focus();
    await page.keyboard.press("Tab");
    await page.keyboard.press("Tab");
    const next = headButton(table, second);
    await expect(next, `${second}'s head focused`).toBeFocused();
    await region.evaluate((el) => {
      el.scrollLeft = 0;
    });
    expect(await next.evaluate((el) => el.matches(":focus-visible")), `${second}'s head shows its ring`).toBe(true);
    expect(await overRingLeft(next), `${name}: over the left of ${second}'s ring`).toBeNull();
    await expect(next, `${second}'s ring inside its button`).toHaveCSS("outline-offset", "-2px");
    expect(await ringPast(next), `${name}: ${second}'s ring's sides past the region's`).toEqual([]);

    for (let i = 2; i < heads; i++) await page.keyboard.press("Tab");
    const button = headButton(table, last);
    await expect(button, `${last}'s head focused`).toBeFocused();
    await region.evaluate((el) => {
      el.scrollLeft = el.scrollWidth;
    });
    expect(await button.evaluate((el) => el.matches(":focus-visible")), `${last}'s head shows its ring`).toBe(true);
    expect(await ringPast(button), `${name}: ${last}'s ring's sides past the region's`).toEqual([]);
    await expect(button, `${last}'s ring inside its button`).toHaveCSS("outline-offset", "-2px");
  }
});

test("the People table sorts by its counts", async ({ page }) => {
  await open(page, routePath({ page: "tab", tab: "rivals" }));
  const table = card(page, "People table").locator("table.rivals-people");
  await expect(head(table, "Player")).toHaveAttribute("aria-sort", "ascending");
  // Nemesis's cells: "Bo · lost 3", or "—".
  const lost = () => figures(table, "tr > td:nth-of-type(2)", matched(/ · lost (\d+)$/));

  await headButton(table, "Nemesis").click();
  await expect(head(table, "Nemesis")).toHaveAttribute("aria-sort", "descending");
  const most = await lost();
  expect(most.length, "rows").toBeGreaterThan(1);
  expect(inOrder(most, "descending"), `most losses first, dashes last: ${most.join(", ")}`).toBe(true);

  await headButton(table, "Nemesis").click();
  await expect(head(table, "Nemesis")).toHaveAttribute("aria-sort", "ascending");
  const fewest = await lost();
  expect(inOrder(fewest, "ascending"), `fewest losses first, dashes last: ${fewest.join(", ")}`).toBe(true);
});

test("the players of the month sort by wins and by month", async ({ page }) => {
  await open(page, routePath({ page: "tab", tab: "records" }));
  const table = page.locator('[data-card="players-of-the-month"] table.ranked-table');
  const months = () => table.locator("tbody td.ranked-name .records-sub").allTextContents();
  await expect(head(table, "Month")).toHaveAttribute("aria-sort", "descending");
  const opening = await months();
  expect(opening.length, "months").toBeGreaterThan(1);

  await headButton(table, "Wins").click();
  await expect(head(table, "Wins")).toHaveAttribute("aria-sort", "descending");
  await expect(head(table, "Month")).not.toHaveAttribute("aria-sort", /./);
  const wins = await numbers(table, "ranked-value");
  expect(wins.every((count) => count !== null), "every month's wins shown").toBe(true);
  expect(nonIncreasing(wins), `most wins first: ${wins.join(", ")}`).toBe(true);

  await headButton(table, "Month").click();
  await expect(head(table, "Month")).toHaveAttribute("aria-sort", "descending");
  expect(await months(), "the latest month first again").toEqual(opening);
  await headButton(table, "Month").click();
  await expect(head(table, "Month")).toHaveAttribute("aria-sort", "ascending");
  expect(await months(), "the earliest month first").toEqual([...opening].reverse());
});

test("ENDINGS' tables sort, the All row last", async ({ page }) => {
  await open(page, routePath({ page: "tab", tab: "endings" }));
  const length = card(page, "Game length table").locator("table");
  const lastRow = () => length.locator("tbody tr").last().locator("th");
  // The sizes' Average length cells, the All row left out.
  const averages = () => figures(length, "tr:not(.endings-all) > td:nth-of-type(2)", minutes);
  await expect(head(length, "Players")).toHaveAttribute("aria-sort", "ascending");

  await headButton(length, "Average length").click();
  await expect(head(length, "Average length")).toHaveAttribute("aria-sort", "descending");
  const longest = await averages();
  expect(longest.length, "sizes").toBeGreaterThan(1);
  expect(inOrder(longest, "descending"), `longest first, dashes last: ${longest.join(", ")}`).toBe(true);
  await expect(lastRow()).toHaveText("All");

  await headButton(length, "Average length").click();
  await expect(head(length, "Average length")).toHaveAttribute("aria-sort", "ascending");
  const shortest = await averages();
  expect(inOrder(shortest, "ascending"), `shortest first, dashes last: ${shortest.join(", ")}`).toBe(true);
  await expect(lastRow()).toHaveText("All");

  const rates = card(page, "Liberal win rate by player count table").locator("table");
  await headButton(rates, "Win rate").click();
  await expect(head(rates, "Win rate")).toHaveAttribute("aria-sort", "descending");
  // Win rate's cells, the third after the size's head: "54%", or "—" below 5 games.
  const highest = await figures(rates, "tr > td:nth-of-type(3)", percent);
  expect(highest.length, "sizes").toBeGreaterThan(1);
  expect(inOrder(highest, "descending"), `highest rate first, dashes last: ${highest.join(", ")}`).toBe(true);
});

test("the other sorted tables still fit", async ({ page }) => {
  test.skip(test.info().project.name !== "phone-360", "the narrowest phone, once");
  await page.setViewportSize(NARROW_PHONE);
  // Each tab's table and the head pressed once (each column's first press is most first).
  const sorted: ["roles" | "rivals" | "records" | "endings", (page: Page) => Locator, string][] = [
    ["roles", (p) => card(p, "Role split table"), "Liberal"],
    ["rivals", (p) => card(p, "People table"), "Nemesis"],
    ["records", (p) => p.locator('[data-card="players-of-the-month"]'), "Wins"],
    ["endings", (p) => card(p, "Game length table"), "Average length"],
  ];
  for (const [tab, table, column] of sorted) {
    await open(page, routePath({ page: "tab", tab }));
    await headButton(table(page), column).click();
    await expect(head(table(page), column), `${tab}: ${column} sorted`).toHaveAttribute("aria-sort", "descending");
    await checkStatsPage(page, NARROW_PHONE);
  }
});
