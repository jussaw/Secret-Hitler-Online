import { fireEvent, render, screen, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { parseFilter } from "./counting";
import type { StatsData } from "./record";
import { navigate, useLocation, type TabId } from "./routes";
import TabsPage from "./TabsPage";
import { generateData } from "./testGames";
import { buildStats, useStats } from "./useStats";

vi.mock("./useStats", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./useStats")>()),
  useStats: vi.fn(),
}));
vi.mock("./routes", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./routes")>()),
  useLocation: vi.fn(),
  navigate: vi.fn(),
}));
// Every tab is a stub, so the tabs later phases fill never break these tests.
vi.mock("./tabs/OverviewTab", () => ({ OverviewTab: () => <p>overview tab</p> }));
vi.mock("./tabs/RolesTab", () => ({ RolesTab: () => <p>roles tab</p> }));
vi.mock("./tabs/VotesTab", () => ({ VotesTab: () => <p>votes tab</p> }));
vi.mock("./tabs/RivalsTab", () => ({ RivalsTab: () => <p>rivals tab</p> }));
vi.mock("./tabs/EndingsTab", () => ({ EndingsTab: () => <p>endings tab</p> }));
vi.mock("./tabs/ActivityTab", () => ({ ActivityTab: () => <p>activity tab</p> }));
vi.mock("./tabs/RecordsTab", () => ({ RecordsTab: () => <p>records tab</p> }));

const data: StatsData = generateData(30, 4, 3);
let location = { pathname: "/stats", search: "" };
let loaded = true;

beforeEach(() => {
  location = { pathname: "/stats", search: "" };
  loaded = true;
  vi.mocked(navigate).mockReset();
  vi.mocked(useLocation).mockImplementation(() => location);
  vi.mocked(useStats).mockImplementation(() => (loaded ? buildStats(data, parseFilter(location.search)) : null));
});

function openTab(tab: TabId, pathname: string, search = "") {
  location = { pathname, search };
  return render(<TabsPage data={data} route={{ page: "tab", tab }} />);
}

const tabRow = () => within(screen.getByRole("navigation", { name: "Stats sections" }));
const cpuSwitch = () => screen.getByRole("switch", { name: "Include games with Bots" });

describe("TabsPage", () => {
  it("showsTheFilterTheTabRowAndTheRoutesTab", () => {
    const { container } = openTab("roles", "/stats/roles");
    expect(screen.getByText("roles tab")).toBeInTheDocument();
    expect(tabRow().getByRole("link", { name: "ROLES & CARDS" })).toHaveAttribute("aria-current", "page");
    expect(cpuSwitch()).toHaveAttribute("aria-checked", "false");
    expect(screen.getByRole("group", { name: "Players" })).toBeInTheDocument();
    const page = container.querySelector(".stats-tabs-page")!;
    expect(Array.from(page.children).map((child) => child.className || child.tagName)).toEqual([
      "filter-bar",
      "stats-tabs",
      "P",
    ]);
  });

  it("eachRouteShowsItsTab", () => {
    const tabs: [TabId, string, string][] = [
      ["overview", "/stats", "overview tab"],
      ["votes", "/stats/votes", "votes tab"],
      ["rivals", "/stats/rivals", "rivals tab"],
      ["endings", "/stats/endings", "endings tab"],
      ["activity", "/stats/activity", "activity tab"],
      ["records", "/stats/records", "records tab"],
    ];
    for (const [tab, path, text] of tabs) {
      const { unmount } = openTab(tab, path);
      expect(screen.getByText(text)).toBeInTheDocument();
      unmount();
    }
  });

  it("aFilterChangeStaysOnTheTab", () => {
    openTab("roles", "/stats/roles");
    fireEvent.click(cpuSwitch());
    expect(navigate).toHaveBeenCalledWith("/stats/roles?cpu=1");
  });

  it("aChipChangeKeepsTheRestOfTheFilter", () => {
    openTab("overview", "/stats", "?cpu=1");
    const first = data.players.find((p) => p.number === 1)!;
    fireEvent.click(within(screen.getByRole("group", { name: "Players" })).getByRole("button", { name: first.name }));
    expect(navigate).toHaveBeenCalledWith("/stats?players=2,3&cpu=1");
  });

  it("theTabsCarryTheFilter", () => {
    openTab("overview", "/stats", "?players=1,3&cpu=1");
    expect(tabRow().getByRole("link", { name: "ENDINGS" })).toHaveAttribute("href", "/stats/endings?players=1,3&cpu=1");
    expect(tabRow().getByRole("link", { name: "OVERVIEW" })).toHaveAttribute("href", "/stats?players=1,3&cpu=1");
  });

  it("theTabsCarryTheFilterAsTheAddressSpellsIt", () => {
    openTab("overview", "/stats", "?cpu=1&players=3,1,x");
    expect(tabRow().getByRole("link", { name: "RIVALS" })).toHaveAttribute("href", "/stats/rivals?players=1,3&cpu=1");
  });

  it("nothingUntilTheRecordsArrive", () => {
    loaded = false;
    const { container } = openTab("overview", "/stats");
    expect(container).toBeEmptyDOMElement();
  });
});
