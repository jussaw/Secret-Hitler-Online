import { ChevronDown } from "lucide-react";
import { useId, useState } from "react";
import { compareNames, togglePlayer, type StatsFilter } from "./counting";
import type { Player } from "./record";
import "./greyButtons.css";
import "./FilterBar.css";

export interface FilterBarProps {
  players: Player[];
  /** The address's filter: the chips and the switch show it, and keep no copy of it. */
  filter: StatsFilter;
  onChange: (filter: StatsFilter) => void;
  /** The player chips and the phone's line; false leaves the CPU switch alone (a player's page). */
  showPlayers?: boolean;
}

const isOn = (filter: StatsFilter, player: number) => filter.players === null || filter.players.has(player);

/** The phone's line: "Players: 7 of 8 · Bots off", counting only numbers some player has. */
export function filterSummary(players: Player[], filter: StatsFilter): string {
  const on = players.filter((player) => isOn(filter, player.number)).length;
  return `Players: ${on} of ${players.length} · Bots ${filter.cpu ? "on" : "off"}`;
}

/**
 * The filter at the top of the stats: a chip per player (on by default; a game counts only when
 * every person in it is on) and the switch that counts games with CPU players, "Include games
 * with Bots" (the address's `cpu`). It shows the filter it is given and hands every change to
 * `onChange`, which puts it in the address. On phones it folds into one line that opens the panel.
 */
export function FilterBar({ players, filter, onChange, showPlayers = true }: FilterBarProps): JSX.Element {
  const [open, setOpen] = useState(false);
  const panelId = useId();
  const labelId = useId();
  const all = players.map((player) => player.number);
  const sorted = [...players].sort((a, b) => compareNames(a.name, b.name) || a.number - b.number);
  const summary = filterSummary(players, filter);

  const cpuSwitch = (
    <button
      type="button"
      role="switch"
      aria-checked={filter.cpu}
      className="filter-switch stats-grey"
      onClick={() => onChange({ players: filter.players, cpu: !filter.cpu })}
    >
      <span className="filter-switch-track" aria-hidden="true" />
      Include games with Bots
    </button>
  );

  if (!showPlayers) {
    return <div className="filter-bar is-switch-only">{cpuSwitch}</div>;
  }
  return (
    <div className="filter-bar">
      <button
        type="button"
        className="filter-summary stats-grey"
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => setOpen(!open)}
      >
        <span className="filter-summary-text">{summary}</span>
        <ChevronDown className="filter-summary-chevron" aria-hidden="true" />
      </button>
      <div id={panelId} className={open ? "filter-panel is-open" : "filter-panel"}>
        <div className="filter-players" role="group" aria-labelledby={labelId}>
          <span className="filter-label" id={labelId}>
            Players
          </span>
          {sorted.map((player) => {
            const on = isOn(filter, player.number);
            return (
              <button
                key={player.number}
                type="button"
                className="filter-chip stats-grey"
                aria-pressed={on}
                onClick={() => onChange(togglePlayer(filter, player.number, all))}
              >
                {player.name}
              </button>
            );
          })}
        </div>
        {cpuSwitch}
      </div>
    </div>
  );
}

export default FilterBar;
