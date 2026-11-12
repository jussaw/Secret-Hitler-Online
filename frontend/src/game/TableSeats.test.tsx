import { render } from "@testing-library/react";
import { expect, test } from "vitest";
import { seatPositions } from "./seatPositions";
import TableSeats from "./TableSeats";
import { makeGameState } from "./testGameState";

const SEVEN = ["Ann", "Ben", "Cat", "Dan", "Eve", "Fay", "Gus"];

test("seats every player in playerOrder, with the user at bottom centre", () => {
  const { container } = render(
    <TableSeats gameState={makeGameState(SEVEN)} user="Dan" showVotes={false} showBusy />
  );
  const seats = Array.from(container.querySelectorAll<HTMLElement>(".table-seat"));
  const expected = seatPositions(7, 3);
  expect(seats).toHaveLength(7);
  seats.forEach((seat, i) => {
    expect(seat).toHaveTextContent(SEVEN[i]);
    expect(parseFloat(seat.style.left)).toBeCloseTo(expected[i].x);
    expect(parseFloat(seat.style.top)).toBeCloseTo(expected[i].y);
  });
  expect(parseFloat(seats[3].style.left)).toBeCloseTo(50);
  expect(parseFloat(seats[3].style.top)).toBeCloseTo(90);
});

test("marks the president and shows executed players as executed", () => {
  const gameState = makeGameState(SEVEN, { president: "Cat" });
  gameState.players["Eve"].alive = false;
  const { container } = render(
    <TableSeats gameState={gameState} user="Dan" showVotes={false} showBusy />
  );
  const seats = Array.from(container.querySelectorAll<HTMLElement>(".table-seat"));
  expect(seats[2]).toHaveTextContent("PRESIDENT");
  expect(seats[4]).toHaveTextContent("EXECUTED");
});
