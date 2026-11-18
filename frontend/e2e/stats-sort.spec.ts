import { expect, test, type Locator, type Page } from "@playwright/test";
import { routePath } from "../src/stats/routes";
import { NARROW_PHONE } from "./layout";
import { settle } from "./lobby";
import { bigStatsData, checkStatsPage, stubStats } from "./stats";

/**
 * The sortable tables in the browser (#109): a ranked card's heads sort its rows while every rank
 * stays its player's, the power ranking sorts by Elo, a best week by player, Enter and Space on a
 * focused head sort it with the focus kept there, and a sorted card still fits a 320px phone.
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

  await headButton(table, "Games").click();
  await expect(head(table, "Games")).toHaveAttribute("aria-sort", "descending");
  await expect(head(table, "Rank")).not.toHaveAttribute("aria-sort", /./);
  const most = await numbers(table, "ranked-count");
  expect(most.every((count) => count !== null), "every count shown").toBe(true);
  expect(nonIncreasing(most), `most games first: ${most.join(", ")}`).toBe(true);
  const byGames = await ranks(table);
  for (const [player, rank] of byGames) expect(rank, `player ${player}'s rank`).toBe(rankOf.get(player));

  await headButton(table, "Games").click();
  await expect(head(table, "Games")).toHaveAttribute("aria-sort", "ascending");
  const fewest = await numbers(table, "ranked-count");
  expect(nonDecreasing(fewest), `fewest games first: ${fewest.join(", ")}`).toBe(true);
  for (const [player, rank] of await ranks(table)) expect(rank, `player ${player}'s rank`).toBe(rankOf.get(player));

  await headButton(table, "Rank").click();
  await expect(head(table, "Rank")).toHaveAttribute("aria-sort", "ascending");
  await expect(head(table, "Games")).not.toHaveAttribute("aria-sort", /./);
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
  const aToZ = [...shown].sort((a, b) => a.localeCompare(b, "en", { sensitivity: "base" }));
  expect(shown, "names A to Z").toEqual(aToZ);
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
  await open(page, routePath({ page: "tab", tab: "overview" }));
  await page.setViewportSize(NARROW_PHONE);
  const table = card(page, "Win rate").locator("table.ranked-table");
  await headButton(table, "Games").click();
  await expect(head(table, "Games")).toHaveAttribute("aria-sort", "descending");
  await checkStatsPage(page, NARROW_PHONE);
});
