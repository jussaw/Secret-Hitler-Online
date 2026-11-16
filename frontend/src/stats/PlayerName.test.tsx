import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import PlayerName, { roleClass } from "./PlayerName";

describe("PlayerName", () => {
  it("colours a name by role", () => {
    const { container } = render(
      <>
        <PlayerName player={1} name="Ann" role="LIBERAL" />
        <PlayerName player={2} name="Bo" role="FASCIST" />
        <PlayerName player={3} name="Cy" role="HITLER" />
        <PlayerName player={4} name="Di" />
      </>
    );
    const names = Array.from(container.querySelectorAll("span"));
    expect(names.map((n) => n.textContent)).toEqual(["Ann", "Bo", "Cy", "Di"]);
    expect(names.map((n) => n.className)).toEqual([
      "player-name stats-liberal",
      "player-name stats-fascist",
      "player-name stats-hitler",
      "player-name",
    ]);
  });

  it("gives each role's class, for a side's word too", () => {
    expect([roleClass("LIBERAL"), roleClass("FASCIST"), roleClass("HITLER")]).toEqual([
      "stats-liberal",
      "stats-fascist",
      "stats-hitler",
    ]);
  });

  it("is plain text", () => {
    const { container } = render(
      <>
        <PlayerName player={3} name="Cy" />
        <PlayerName player={3} name="Cy" link />
        <PlayerName player={3} name="Cy" link={false} />
        <PlayerName player={null} name="Bot 1" role="LIBERAL" />
      </>
    );
    expect(container.querySelector("a")).toBeNull();
    const names = Array.from(container.querySelectorAll(".player-name"));
    expect(names.map((n) => n.getAttribute("data-player"))).toEqual(["3", "3", "3", null]);
  });
});
