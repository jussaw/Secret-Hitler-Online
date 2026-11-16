import { filterSearch } from "./counting";
import { FilterBar } from "./FilterBar";
import { navigate, useLocation, type PageProps } from "./routes";
import { TabRow } from "./TabRow";
import { TABS } from "./tabs/tabs";
import { useStats } from "./useStats";
import "./TabsPage.css";

/**
 * The stats' home and its tabs (`/stats`, `/stats/<tab>`): the filter, which lives in the address
 * (a change stays on the tab), the tab row, which carries it to every tab, and the route's tab.
 * Each tab is a file of its own in `tabs/`, registered in `tabs/tabs.ts`.
 */
export default function TabsPage({ route }: PageProps): JSX.Element {
  const stats = useStats();
  const { pathname } = useLocation();
  if (!stats) return <></>; // the records are on their way (StatsApp shows them once they come)
  const current = route.page === "tab" ? route.tab : "overview";
  const tab = TABS.find((t) => t.id === current) ?? TABS[0];
  const Tab = tab.Component;
  return (
    <div className="stats-tabs-page">
      <FilterBar
        players={stats.data.players}
        filter={stats.filter}
        onChange={(next) => navigate(pathname + filterSearch(next))}
      />
      <TabRow current={tab.id} search={filterSearch(stats.filter)} />
      <Tab stats={stats} />
    </div>
  );
}
