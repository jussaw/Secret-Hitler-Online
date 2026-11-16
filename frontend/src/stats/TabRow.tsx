import { useEffect, useRef } from "react";
import { routePath, type TabId } from "./routes";
import StatsLink from "./StatsLink";
import { TABS } from "./tabs/tabs";
import "./TabRow.css";

/**
 * The stats' seven tabs, each a link in the button look with its own address, carrying the filter
 * (`search`) across. The current one is marked (`aria-current="page"`, the orange face), and when
 * it changes the row, which scrolls sideways on phones, scrolls to show it.
 */
export function TabRow({ current, search }: { current: TabId; search: string }): JSX.Element {
  const row = useRef<HTMLElement>(null);
  useEffect(() => {
    // Only the row scrolls, never the page: back and forward keep the page's scroll as it was.
    const show = () => {
      const nav = row.current;
      const tab = nav?.querySelector<HTMLElement>('[aria-current="page"]');
      if (!nav || !tab) return;
      const edges = nav.getBoundingClientRect();
      const box = tab.getBoundingClientRect();
      if (box.left < edges.left) nav.scrollLeft -= edges.left - box.left;
      else if (box.right > edges.right) nav.scrollLeft += box.right - edges.right;
    };
    show();
    // The web fonts widen the labels when they come, which can push the tab out of view again.
    let live = true;
    document.fonts?.ready.then(() => {
      if (live) show();
    });
    return () => {
      live = false;
    };
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
