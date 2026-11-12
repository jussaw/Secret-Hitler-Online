import { render, screen } from "@testing-library/react";
import { expect, test } from "vitest";
import SpectatorCount from "./SpectatorCount";

test("shows nothing when nobody is watching", () => {
  const { container } = render(<SpectatorCount count={0} />);
  expect(container).toBeEmptyDOMElement();
});

test("shows one spectator with an eye", () => {
  const { container } = render(<SpectatorCount count={1} />);
  const count = screen.getByRole("status", { name: "1 spectator watching" });
  expect(count).toHaveTextContent("1");
  expect(container.querySelector(".spectator-count svg.lucide-eye")).not.toBeNull();
});

test("counts several spectators", () => {
  render(<SpectatorCount count={12} />);
  expect(screen.getByRole("status", { name: "12 spectators watching" })).toHaveTextContent("12");
});
