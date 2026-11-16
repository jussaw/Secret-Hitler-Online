import { StatCard } from "../StatCard";

/** A tab its phase has not filled yet: one card under the tab's title. */
export function ComingSoon({ title }: { title: string }): JSX.Element {
  return <StatCard title={title} definition="Coming in a later update." />;
}

export default ComingSoon;
