import { useEffect, useRef } from "react";
import { routePath, type TabId } from "./routes";
import StatsLink from "./StatsLink";
import { TABS } from "./tabs/tabs";
import "./TabRow.css";

/**
 * The stats' seven tabs, each a link in the button look with its own address, carrying the filter
 * (`search`) across. The current one is marked (`aria-current="page"`, the orange face) and
 * scrolled into view when it changes, since the row scrolls sideways on phones.
 */
export function TabRow({ current, search }: { current: TabId; search: string }): JSX.Element {
  const row = useRef<HTMLElement>(null);
  useEffect(() => {
    row.current?.querySelector('[aria-current="page"]')?.scrollIntoView?.({ block: "nearest", inline: "nearest" });
  }, [current]);
  return (
    <nav className="stats-tabs" aria-label="Stats sections" ref={row}>
      {TABS.map((tab) => {
        const isCurrent = tab.id === current;
        return (
          <StatsLink
            key={tab.id}
            href={routePath({ page: "tab", tab: tab.id }) + search}
            className="button-link stats-tab"
            aria-current={isCurrent ? "page" : undefined}
          >
            {tab.label}
          </StatsLink>
        );
      })}
    </nav>
  );
}

export default TabRow;
