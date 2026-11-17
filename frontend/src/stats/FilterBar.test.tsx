import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { StatsFilter } from "./counting";
import { FilterBar, filterSummary } from "./FilterBar";
import type { Player } from "./record";

const players: Player[] = [
  { number: 3, name: "Cy" },
  { number: 1, name: "ann" },
  { number: 2, name: "Bo" },
];
const everyone: StatsFilter = { players: null, cpu: false };

const chips = () => within(screen.getByRole("group", { name: "Players" })).getAllByRole("button");
const chip = (name: string) => within(screen.getByRole("group", { name: "Players" })).getByRole("button", { name });
const cpuSwitch = () => screen.getByRole("switch", { name: "Include games with Bots" });

describe("FilterBar", () => {
  it("aChipPerPlayerAllOnByName", () => {
    render(<FilterBar players={players} filter={everyone} onChange={() => undefined} />);
    expect(chips().map((c) => c.textContent)).toEqual(["ann", "Bo", "Cy"]);
    for (const c of chips()) expect(c).toHaveAttribute("aria-pressed", "true");
  });

  it("turningAChipOffKeepsTheOthers", () => {
    const onChange = vi.fn();
    render(<FilterBar players={players} filter={everyone} onChange={onChange} />);
    fireEvent.click(chip("Bo"));
    expect(onChange).toHaveBeenCalledWith({ players: new Set([1, 3]), cpu: false });
  });

  it("turningTheLastBackOnIsEveryone", () => {
    const onChange = vi.fn();
    render(<FilterBar players={players} filter={{ players: new Set([1, 3]), cpu: false }} onChange={onChange} />);
    expect(chip("Bo")).toHaveAttribute("aria-pressed", "false");
    fireEvent.click(chip("Bo"));
    expect(onChange).toHaveBeenCalledWith({ players: null, cpu: false });
  });

  it("theCpuSwitch", () => {
    const onChange = vi.fn();
    render(<FilterBar players={players} filter={everyone} onChange={onChange} />);
    expect(cpuSwitch()).toHaveAttribute("aria-checked", "false");
    fireEvent.click(cpuSwitch());
    expect(onChange).toHaveBeenCalledWith({ players: null, cpu: true });
  });

  it("theCpuSwitchKeepsThePlayers", () => {
    const onChange = vi.fn();
    const filter = { players: new Set([1]), cpu: true };
    render(<FilterBar players={players} filter={filter} onChange={onChange} />);
    expect(cpuSwitch()).toHaveAttribute("aria-checked", "true");
    fireEvent.click(cpuSwitch());
    expect(onChange).toHaveBeenCalledWith({ players: new Set([1]), cpu: false });
  });

  it("followsTheFilterItIsGiven", () => {
    // Review Focus 3: the chips follow the address, never a copy of it.
    const { rerender } = render(<FilterBar players={players} filter={everyone} onChange={() => undefined} />);
    rerender(<FilterBar players={players} filter={{ players: new Set([1]), cpu: true }} onChange={() => undefined} />);
    expect(chip("ann")).toHaveAttribute("aria-pressed", "true");
    expect(chip("Bo")).toHaveAttribute("aria-pressed", "false");
    expect(chip("Cy")).toHaveAttribute("aria-pressed", "false");
    expect(cpuSwitch()).toHaveAttribute("aria-checked", "true");
    rerender(<FilterBar players={players} filter={everyone} onChange={() => undefined} />);
    expect(chip("Bo")).toHaveAttribute("aria-pressed", "true");
  });

  it("aClickChangesNothingByItself", () => {
    render(<FilterBar players={players} filter={everyone} onChange={() => undefined} />);
    fireEvent.click(chip("Bo"));
    fireEvent.click(cpuSwitch());
    expect(chip("Bo")).toHaveAttribute("aria-pressed", "true");
    expect(cpuSwitch()).toHaveAttribute("aria-checked", "false");
  });

  it("thePhoneLine", () => {
    expect(filterSummary(players, { players: new Set([1, 3]), cpu: false })).toBe("Players: 2 of 3 · CPU off");
    expect(filterSummary(players, { players: null, cpu: true })).toBe("Players: 3 of 3 · CPU on");
  });

  it("unknownNumbersAreNotCounted", () => {
    // Review Focus 1: a number no player has matches no chip.
    expect(filterSummary(players, { players: new Set([1, 99]), cpu: false })).toBe("Players: 1 of 3 · CPU off");
    render(<FilterBar players={players} filter={{ players: new Set([1, 99]), cpu: false }} onChange={() => undefined} />);
    expect(chips().filter((c) => c.getAttribute("aria-pressed") === "true").map((c) => c.textContent)).toEqual(["ann"]);
  });

  it("everyChipOff", () => {
    // Review Focus 2: ?players= turns every chip off.
    const filter = { players: new Set<number>(), cpu: false };
    render(<FilterBar players={players} filter={filter} onChange={() => undefined} />);
    for (const c of chips()) expect(c).toHaveAttribute("aria-pressed", "false");
    expect(filterSummary(players, filter)).toBe("Players: 0 of 3 · CPU off");
    expect(screen.getByRole("button", { name: "Players: 0 of 3 · CPU off" })).toBeInTheDocument();
  });

  it("theLineOpensThePanel", () => {
    const { container } = render(<FilterBar players={players} filter={everyone} onChange={() => undefined} />);
    const line = screen.getByRole("button", { name: "Players: 3 of 3 · CPU off" });
    expect(line).toHaveClass("filter-summary");
    expect(line).toHaveAttribute("aria-expanded", "false");
    const panel = container.querySelector(".filter-panel")!;
    expect(line).toHaveAttribute("aria-controls", panel.id);
    expect(panel).not.toHaveClass("is-open");
    fireEvent.click(line);
    expect(line).toHaveAttribute("aria-expanded", "true");
    expect(panel).toHaveClass("is-open");
    fireEvent.click(line);
    expect(panel).not.toHaveClass("is-open");
  });

  it("showPlayersFalseShowsTheSwitchAlone", () => {
    const { container } = render(<FilterBar players={players} filter={everyone} onChange={() => undefined} showPlayers={false} />);
    expect(screen.queryByRole("group", { name: "Players" })).toBeNull();
    expect(container.querySelector(".filter-summary")).toBeNull();
    expect(screen.queryAllByRole("button")).toEqual([]);
    expect(cpuSwitch()).toBeInTheDocument();
  });
});
