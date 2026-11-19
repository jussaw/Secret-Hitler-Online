import { expect, test } from "@playwright/test";
import { measureUntil, type Timed } from "./measureUntil";

/**
 * measureUntil's deadline, on a clock the test moves: no page and no server. It lives here because
 * Vitest takes only src/; one project is enough, as nothing here draws.
 */

test.beforeEach(({}, testInfo) => {
  test.skip(testInfo.project.name !== "desktop", "no page: one project is enough");
});

/**
 * Measurements on a clock that starts at `start`: each look waits `before` ms, then begins (its
 * `at`) and takes `after` ms more to return its value. `calls()` counts the looks made.
 */
function scriptedLooks(looks: { value: number; before: number; after: number }[], start = 0) {
  let time = start;
  let calls = 0;
  const measure = async (): Promise<Timed> => {
    const look = looks[calls++];
    time += look.before;
    const at = time;
    time += look.after;
    return { value: look.value, at };
  };
  return { measure, now: () => time, calls: () => calls };
}

const gone = (share: number) => share < 0.01;
const DEADLINE = 2_500;

test("a measurement that began by the deadline counts, however long it takes to return", async () => {
  // The first look sees the box at once and takes 2 s to return; the second, begun at 2 s, sees it
  // gone and takes 3 s more. expect.poll would fail at 2.5 s with the second still running.
  const looks = scriptedLooks([
    { value: 0.9, before: 0, after: 2_000 },
    { value: 0, before: 0, after: 3_000 },
  ]);
  expect(await measureUntil(looks.measure, gone, DEADLINE, looks.now)).toBe(0);
  expect(looks.calls()).toBe(2);
});

test("a measurement that began after the deadline does not count, even when it would pass", async () => {
  // The second look is called at 2.4 s, within the time, but begins at 2.6 s.
  const looks = scriptedLooks([
    { value: 0.9, before: 0, after: 2_400 },
    { value: 0, before: 200, after: 100 },
  ]);
  expect(await measureUntil(looks.measure, gone, DEADLINE, looks.now)).toBe(0.9);
  expect(looks.calls()).toBe(2);
});

test("stops at the first value that passes", async () => {
  const looks = scriptedLooks([
    { value: 0.9, before: 0, after: 100 },
    { value: 0.02, before: 0, after: 100 },
    { value: 0.005, before: 0, after: 100 },
    { value: 0.9, before: 0, after: 100 },
  ]);
  expect(await measureUntil(looks.measure, gone, DEADLINE, looks.now)).toBe(0.005);
  expect(looks.calls()).toBe(3);
});

test("measures no more once the time is up, and returns the last value begun within it", async () => {
  // Looks of 1 s each, at 0, 1 and 2 s: the third returns at 3 s, past the deadline, so no fourth.
  const looks = scriptedLooks([
    { value: 0.9, before: 0, after: 1_000 },
    { value: 0.5, before: 0, after: 1_000 },
    { value: 0.02, before: 0, after: 1_000 },
    { value: 0, before: 0, after: 1_000 },
  ]);
  expect(await measureUntil(looks.measure, gone, DEADLINE, looks.now)).toBe(0.02);
  expect(looks.calls()).toBe(3);
});

test("the first measurement counts even when it begins after the deadline", async () => {
  const looks = scriptedLooks(
    [
      { value: 0.5, before: 0, after: 100 },
      { value: 0, before: 0, after: 100 },
    ],
    3_000
  );
  expect(await measureUntil(looks.measure, gone, DEADLINE, looks.now)).toBe(0.5);
  expect(looks.calls()).toBe(1);
});
