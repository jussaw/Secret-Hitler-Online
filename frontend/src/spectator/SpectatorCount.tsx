import { Eye } from "lucide-react";
import "./SpectatorCount.css";

/**
 * How many spectators are watching, at the left of the lobby and game headers: Lucide's eye and
 * the number. Nothing shows while nobody watches.
 */
export default function SpectatorCount(props: { count: number }) {
  const { count } = props;
  if (count <= 0) return null;
  return (
    <div
      className="spectator-count"
      role="status"
      aria-label={`${count} ${count === 1 ? "spectator" : "spectators"} watching`}
      title={`${count} watching`}
    >
      <Eye className="spectator-icon" aria-hidden="true" />
      <span>{count}</span>
    </div>
  );
}
