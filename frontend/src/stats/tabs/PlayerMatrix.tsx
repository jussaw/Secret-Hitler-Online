import { nameOf } from "../counting";
import PlayerName from "../PlayerName";
import { ScrollRegion } from "../ScrollRegion";
import "./PlayerMatrix.css";

/** A cell of a player-by-player table: its text, a smaller line under it, its title on hover, and whether it is ahead or behind. */
export interface MatrixCell {
  text: string;
  sub?: string;
  title: string;
  tone?: "ahead" | "behind";
}

export interface PlayerMatrixProps {
  /** Its card's title: the table's own region is `<title> table`. */
  title: string;
  /** The rows and the columns, in this order (the caller sorts them by name). */
  players: number[];
  names: Map<number, string>;
  /** The cell of `row` against `column`, or null for none. Never called on the diagonal. */
  cell: (row: number, column: number) => MatrixCell | null;
}

const TONE_CLASS: Record<NonNullable<MatrixCell["tone"]>, string> = { ahead: "is-ahead", behind: "is-behind" };

/**
 * A player-by-player table (RIVALS' teammates, opponents and nominations): a row and a column per
 * player, each row's name held at the left while the rest scroll sideways inside the card
 * (`ScrollRegion`), the diagonal blank. A long name wraps inside its box (`.player-matrix-name`)
 * rather than widening its column.
 */
export function PlayerMatrix({ title, players, names, cell }: PlayerMatrixProps): JSX.Element {
  const name = (player: number) => (
    <span className="player-matrix-name">
      <PlayerName player={player} name={nameOf(names, player)} />
    </span>
  );
  return (
    <ScrollRegion label={`${title} table`}>
      <table className="player-matrix">
        <thead>
          <tr>
            <td />
            {players.map((player) => (
              <th key={player} scope="col">
                {name(player)}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {players.map((row) => (
            <tr key={row}>
              <th scope="row">{name(row)}</th>
              {players.map((column) => {
                if (column === row) return <td key={column} className="is-self" />;
                const found = cell(row, column);
                if (!found) return <td key={column} />;
                return (
                  <td key={column} title={found.title} className={found.tone ? TONE_CLASS[found.tone] : undefined}>
                    {found.text}
                    {found.sub !== undefined && <span className="player-matrix-sub">{found.sub}</span>}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </ScrollRegion>
  );
}

export default PlayerMatrix;
