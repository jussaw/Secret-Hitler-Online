/** A seat's centre, in percent of the table area (0-100 on both axes). */
export type Seat = { x: number; y: number };

/** Radii of the seat ellipse, centred at (50, 50). */
export const TABLE_RADIUS_X = 42;
export const TABLE_RADIUS_Y = 40;

/**
 * Half the size of one seat (label row plus tile) that the geometry allows for. Seats are the
 * default player tile scaled to 9vh (TableSeats.css), which stays within this at every desktop
 * acceptance size.
 */
export const SEAT_HALF_SIZE = { x: 2.8, y: 8.5 };

/** A rectangle in percent of the table area. */
export type Box = { left: number; right: number; top: number; bottom: number };

/** The centre box's sides clear the diagonal seats (x 25.3 at 5 and 10 players). */
const CENTRE_LEFT = 29.5;
const CENTRE_RIGHT = 70.5;
/** Gap between the centre box and a seat above or below it, and the table's edge. */
const CENTRE_MARGIN = 1;
const CENTRE_EDGE = 2;

/** The smallest centre-to-centre distance between two seats. */
export const MIN_SEAT_DISTANCE = 20;

/**
 * Places `count` players on an ellipse around the table.
 * @param count the number of players.
 * @param selfIndex the local player's index in playerOrder; out of range (a spectator) counts as 0.
 * @return one seat per player, in playerOrder. The local player is at bottom centre and the
 *         order runs clockwise on screen, so the next player sits to their left.
 */
export function seatPositions(count: number, selfIndex = 0): Seat[] {
  const self = selfIndex >= 0 && selfIndex < count ? selfIndex : 0;
  return Array.from({ length: count }, (_, i) => {
    const fromSelf = (i - self + count) % count;
    // Screen y points down, so a growing angle turns clockwise, starting from straight down.
    const angle = Math.PI / 2 + (2 * Math.PI * fromSelf) / count;
    return {
      x: 50 + TABLE_RADIUS_X * Math.cos(angle),
      y: 50 + TABLE_RADIUS_Y * Math.sin(angle),
    };
  });
}

/**
 * Where the boards, decks and status row live: between the sides, and as tall as the seats above
 * and below it allow for this many players.
 * @param count the number of players.
 */
export function centreBox(count: number): Box {
  let top = CENTRE_EDGE;
  let bottom = 100 - CENTRE_EDGE;
  for (const seat of seatPositions(count)) {
    const besideTheBox =
      seat.x + SEAT_HALF_SIZE.x <= CENTRE_LEFT || seat.x - SEAT_HALF_SIZE.x >= CENTRE_RIGHT;
    if (besideTheBox) continue;
    if (seat.y < 50) {
      top = Math.max(top, seat.y + SEAT_HALF_SIZE.y + CENTRE_MARGIN);
    } else {
      bottom = Math.min(bottom, seat.y - SEAT_HALF_SIZE.y - CENTRE_MARGIN);
    }
  }
  return { left: CENTRE_LEFT, right: CENTRE_RIGHT, top, bottom };
}

/** The most seats in one row of the phone grid: four default tiles fit a 360px-wide screen. */
export const MAX_GRID_COLUMNS = 4;

/** The most seats in one row of a narrow window's grid, where seats are round-table size. */
export const MAX_WIDE_GRID_COLUMNS = 5;

/**
 * How many seats share a row of a grid, so the rows come out as even as possible.
 * @param count the number of players.
 * @param max the most seats a row holds.
 * @return with the phone's 4: 3 for 5, 6 and 9 players, 4 for 7, 8 and 10. With 5: 5 for 5, 9
 *   and 10 players, 3 for 6, 4 for 7 and 8.
 */
export function seatColumns(count: number, max: number = MAX_GRID_COLUMNS): number {
  const rows = Math.ceil(count / max);
  return Math.ceil(count / rows);
}
