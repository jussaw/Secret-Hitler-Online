import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { makeData, makeRecord } from "../testRecords";
import GamesPage from "./GamesPage";

describe("GamesPage", () => {
  it("says GAMES is coming", () => {
    render(<GamesPage data={makeData([makeRecord()])} route={{ page: "games" }} />);
    const card = screen.getByRole("region", { name: "GAMES" });
    expect(card).toHaveTextContent("Coming in a later update.");
  });
});
