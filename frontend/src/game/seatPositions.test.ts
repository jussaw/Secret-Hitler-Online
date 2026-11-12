import { describe, expect, test } from "vitest";
import {
  CENTRE_BOX,
  MIN_SEAT_DISTANCE,
  SEAT_HALF_SIZE,
  Seat,
  TABLE_RADIUS_X,
  TABLE_RADIUS_Y,
  seatPositions,
} from "./seatPositions";

type Box = { left: number; right: number; top: number; bottom: number };

const seatBox = (s: Seat): Box => ({
  left: s.x - SEAT_HALF_SIZE.x,
  right: s.x + SEAT_HALF_SIZE.x,
  top: s.y - SEAT_HALF_SIZE.y,
  bottom: s.y + SEAT_HALF_SIZE.y,
});

const overlaps = (a: Box, b: Box) =>
  a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom;

/** Angle around the table in degrees; it grows clockwise on screen, where y points down. */
const screenAngle = (s: Seat) =>
  (Math.atan2((s.y - 50) / TABLE_RADIUS_Y, (s.x - 50) / TABLE_RADIUS_X) * 180) /
  Math.PI;

describe.each([5, 6, 7, 8, 9, 10])("%i players", (count) => {
  test("returns one seat per player", () => {
    expect(seatPositions(count, 0)).toHaveLength(count);
  });

  test("puts the local player at bottom centre", () => {
    for (let self = 0; self < count; self++) {
      const seats = seatPositions(count, self);
      expect(seats[self].x).toBeCloseTo(50);
      seats.forEach((seat, i) => {
        if (i !== self) expect(seat.y).toBeLessThan(seats[self].y);
      });
    }
  });

  test("seats players clockwise in playerOrder", () => {
    const seats = seatPositions(count, 2);
    for (let i = 0; i < count; i++) {
      const step =
        (screenAngle(seats[(i + 1) % count]) - screenAngle(seats[i]) + 360) % 360;
      expect(step).toBeCloseTo(360 / count);
    }
    // The next player after you sits to your left.
    expect(seats[3].x).toBeLessThan(50);
  });

  test("keeps every seat inside the table", () => {
    for (const box of seatPositions(count, 0).map(seatBox)) {
      expect(box.left).toBeGreaterThanOrEqual(0);
      expect(box.right).toBeLessThanOrEqual(100);
      expect(box.top).toBeGreaterThanOrEqual(0);
      expect(box.bottom).toBeLessThanOrEqual(100);
    }
  });

  test("keeps seats apart", () => {
    const seats = seatPositions(count, 0);
    seats.forEach((a, i) => {
      seats.slice(i + 1).forEach((b) => {
        expect(Math.hypot(a.x - b.x, a.y - b.y)).toBeGreaterThanOrEqual(
          MIN_SEAT_DISTANCE
        );
        expect(overlaps(seatBox(a), seatBox(b))).toBe(false);
      });
    });
  });

  test("keeps seats clear of the centre box", () => {
    for (const seat of seatPositions(count, 0)) {
      expect(overlaps(seatBox(seat), CENTRE_BOX)).toBe(false);
    }
  });
});

test("seats a spectator, who has no seat of their own, as player 0", () => {
  expect(seatPositions(7)).toEqual(seatPositions(7, 0));
  expect(seatPositions(7, -1)).toEqual(seatPositions(7, 0));
});
