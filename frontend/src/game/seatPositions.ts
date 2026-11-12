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

/** Where the boards, decks and status row live; no seat reaches into it for 5 to 10 players. */
export const CENTRE_BOX = { left: 29.5, right: 70.5, top: 23.5, bottom: 80.5 };

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
