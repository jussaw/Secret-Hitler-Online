import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { makeData, makeRecord } from "../testRecords";
import PlayerPage from "./PlayerPage";

describe("the player pages", () => {
  it("a player's page is coming", () => {
    render(<PlayerPage data={makeData([makeRecord()])} route={{ page: "player", number: 1 }} />);
    expect(screen.getByRole("region", { name: "PLAYER" })).toHaveTextContent("Coming in a later update.");
  });
});
