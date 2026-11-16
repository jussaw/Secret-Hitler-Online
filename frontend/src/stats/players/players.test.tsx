import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { makeData, makeRecord } from "../testRecords";
import PlayerPage from "./PlayerPage";
import PlayersPage from "./PlayersPage";

describe("the player pages", () => {
  it("PLAYERS is coming", () => {
    render(<PlayersPage data={makeData([makeRecord()])} route={{ page: "players" }} />);
    expect(screen.getByRole("region", { name: "PLAYERS" })).toHaveTextContent("Coming in a later update.");
  });

  it("a player's page is coming", () => {
    render(<PlayerPage data={makeData([makeRecord()])} route={{ page: "player", number: 1 }} />);
    expect(screen.getByRole("region", { name: "PLAYER" })).toHaveTextContent("Coming in a later update.");
  });
});
