import { describe, expect, it } from "vitest";
import { NAME_ORDER, RANK_ORDER, nextSort, sortRows, type SortColumn, type TableSort } from "./sorting";

interface Row {
  id: string;
  name: string;
  games: number | null;
  rate: number | null;
}

type Key = "name" | "games" | "rate";

const columns: SortColumn<Row, Key>[] = [
  { key: "name", first: "ascending", value: (r) => r.name },
  { key: "games", first: "descending", value: (r) => r.games },
  { key: "rate", first: "descending", value: (r) => r.rate },
];

const row = (id: string, name: string, games: number | null = 1, rate: number | null = 0.5): Row => ({
  id,
  name,
  games,
  rate,
});

const ids = (rows: Row[]) => rows.map((r) => r.id).join(",");
const asc = (column: Key): TableSort<Key> => ({ column, direction: "ascending" });
const desc = (column: Key): TableSort<Key> => ({ column, direction: "descending" });

describe("sorting", () => {
  it("aPressOnAnotherHeadUsesItsFirstDirection", () => {
    const toGames = nextSort(NAME_ORDER, { key: "games", first: "descending" });
    expect(toGames).toEqual({ column: "games", direction: "descending" });
    const toName = nextSort<Key>(toGames, { key: "name", first: "ascending" });
    expect(toName).toEqual({ column: "name", direction: "ascending" });
  });

  it("aPressOnTheSortedHeadTurnsItRound", () => {
    const games = { key: "games" as Key, first: "descending" as const };
    const start = nextSort<Key>(asc("name"), games);
    const once = nextSort(start, games);
    expect(once).toEqual({ column: "games", direction: "ascending" });
    expect(nextSort(once, games)).toEqual(start);
    expect(Object.isFrozen(RANK_ORDER)).toBe(true);
    expect(Object.isFrozen(NAME_ORDER)).toBe(true);
    expect(RANK_ORDER).toEqual({ column: "rank", direction: "ascending" });
    expect(NAME_ORDER).toEqual({ column: "name", direction: "ascending" });
  });

  it("numbersSortEitherWay", () => {
    const rows = [row("a", "A", 3), row("b", "B", 9), row("c", "C", 5)];
    expect(sortRows(rows, columns, desc("games")).map((r) => r.games)).toEqual([9, 5, 3]);
    expect(sortRows(rows, columns, asc("games")).map((r) => r.games)).toEqual([3, 5, 9]);
  });

  it("namesCompareIgnoringCase", () => {
    const rows = [row("1", "bo"), row("2", "Ann"), row("3", "cy"), row("4", "ann")];
    expect(sortRows(rows, columns, asc("name")).map((r) => r.name)).toEqual(["Ann", "ann", "bo", "cy"]);
    expect(sortRows(rows, columns, desc("name")).map((r) => r.name)).toEqual(["cy", "bo", "Ann", "ann"]);
  });

  it("missingValuesGoLastEitherWay", () => {
    const rows = [row("a", "A", 1, 0.5), row("b", "B", 1, null), row("c", "C", 1, 0.7), row("d", "D", 1, null)];
    expect(ids(sortRows(rows, columns, desc("rate")))).toBe("c,a,b,d");
    expect(ids(sortRows(rows, columns, asc("rate")))).toBe("a,c,b,d");
  });

  it("tiesKeepTheInputOrderEitherWay", () => {
    const rows = [row("a", "A", 5), row("b", "B", 5), row("c", "C", 3)];
    expect(ids(sortRows(rows, columns, desc("games")))).toBe("a,b,c");
    expect(ids(sortRows(rows, columns, asc("games")))).toBe("c,a,b");
  });

  it("zeroIsAValueNotMissing", () => {
    const rows = [row("a", "A", 0), row("b", "B", null), row("c", "C", 2)];
    expect(ids(sortRows(rows, columns, asc("games")))).toBe("a,c,b");
  });

  it("everyValueMissingKeepsTheInputOrder", () => {
    const rows = [row("a", "A", 1, null), row("b", "B", 1, null), row("c", "C", 1, null)];
    expect(ids(sortRows(rows, columns, asc("rate")))).toBe("a,b,c");
    expect(ids(sortRows(rows, columns, desc("rate")))).toBe("a,b,c");
  });

  it("theOpeningSortGivesTheRowsBack", () => {
    const rows = [row("a", "Ann"), row("b", "Bo"), row("c", "Cy")];
    const out = sortRows(rows, columns, NAME_ORDER);
    expect(out).toEqual(rows);
    expect(out).not.toBe(rows);
  });

  it("theFrozenOrdersPassWithoutACast", () => {
    const rows = [row("a", "Ann")];
    const rankColumns: SortColumn<Row, "rank" | "games">[] = [
      { key: "rank", first: "ascending", value: () => 1 },
      { key: "games", first: "descending", value: (r) => r.games },
    ];
    expect(sortRows(rows, columns, NAME_ORDER)).toEqual(rows);
    expect(sortRows(rows, rankColumns, RANK_ORDER)).toEqual(rows);
    const sort: TableSort<Key> = nextSort(NAME_ORDER, { key: "games", first: "descending" });
    expect(sort.column).toBe("games");
  });

  it("anUnknownColumnThrows", () => {
    const rows = [row("a", "Ann")];
    expect(() => sortRows(rows, columns, { column: "nope" as Key, direction: "ascending" })).toThrow('No column "nope"');
  });

  it("leavesItsInputAlone", () => {
    const rows = [row("a", "A", 3), row("b", "B", 9), row("c", "C", 5)];
    const before = [...rows];
    sortRows(rows, columns, desc("games"));
    expect(rows).toEqual(before);
  });
});
