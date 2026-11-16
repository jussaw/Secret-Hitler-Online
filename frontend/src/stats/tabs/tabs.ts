import type { TabId } from "../routes";
import type { StatsContext } from "../useStats";
import { ActivityTab } from "./ActivityTab";
import { EndingsTab } from "./EndingsTab";
import { OverviewTab } from "./OverviewTab";
import { RecordsTab } from "./RecordsTab";
import { RivalsTab } from "./RivalsTab";
import { RolesTab } from "./RolesTab";
import { VotesTab } from "./VotesTab";

/** A stats tab: its route, its label in the tab row, and its page. */
export interface StatsTab {
  id: TabId;
  label: string;
  Component: (props: { stats: StatsContext }) => JSX.Element;
}

/** The seven tabs, in the tab row's order. Each phase fills its own tab's file. */
export const TABS: readonly StatsTab[] = [
  { id: "overview", label: "OVERVIEW", Component: OverviewTab },
  { id: "roles", label: "ROLES & CARDS", Component: RolesTab },
  { id: "votes", label: "VOTES & POWERS", Component: VotesTab },
  { id: "rivals", label: "RIVALS", Component: RivalsTab },
  { id: "endings", label: "ENDINGS", Component: EndingsTab },
  { id: "activity", label: "ACTIVITY", Component: ActivityTab },
  { id: "records", label: "RECORDS", Component: RecordsTab },
];
