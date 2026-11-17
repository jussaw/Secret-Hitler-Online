import { render } from "@testing-library/react";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import ButtonPrompt from "./ButtonPrompt";
import NamePrompt from "./NamePrompt";
import RoleAlert from "./RoleAlert";
import VetoPrompt from "./VetoPrompt";
import { makeGameState } from "../game/testGameState";
import { Role } from "../types";

// Every prompt is drawn in PromptLayout's three parts: its title at the top, centred; its buttons
// at the foot; and everything else in the middle, the one part that scrolls (CustomAlert.css).

beforeEach(() => {
  vi.spyOn(console, "error");
  vi.spyOn(console, "warn");
});

afterEach(() => {
  expect(console.error).not.toHaveBeenCalled();
  vi.restoreAllMocks();
});

/** The text of each part, and the buttons' labels. */
function parts(container: HTMLElement) {
  const part = (name: string) => container.querySelector(`.prompt > .prompt-${name}`)!;
  return {
    title: part("title").textContent,
    middle: part("body").textContent,
    buttons: Array.from(part("buttons").querySelectorAll("button")).map((b) => b.textContent),
    // A title is centred: none of it is .left-align.
    leftAlignedTitle: part("title").querySelector(".left-align") !== null,
  };
}

test("a ButtonPrompt's label is its title, its header, children and footer the middle, and its button the foot", () => {
  const { container } = render(
    <ButtonPrompt label="EXECUTION RESULTS" headerText="Before." footerText="After." buttonText="OKAY">
      <p>Between.</p>
    </ButtonPrompt>
  );
  expect(parts(container)).toEqual({
    title: "EXECUTION RESULTS",
    middle: "Before.Between.After.",
    buttons: ["OKAY"],
    leftAlignedTitle: false,
  });
});

test("a ButtonPrompt's own buttons (renderButton) are its foot, all of them", () => {
  const { container } = render(<VetoPrompt sendWSCommand={vi.fn()} electionTracker={0} />);
  const { title, buttons, middle } = parts(container);
  expect(title).toBe("LEGISLATIVE VETO");
  expect(buttons).toEqual(["REJECT", "ACCEPT"]);
  expect(middle).toContain("Accept the veto?");
});

test("the role alert's role is its title, the card and the rules the middle, and OKAY the foot", () => {
  const names = ["Ann", "Bo", "Cy", "Di", "Ed"];
  const { container } = render(
    <RoleAlert role={Role.FASCIST} name="Ann" gameState={makeGameState(names)} onClick={vi.fn()} />
  );
  const { title, middle, buttons, leftAlignedTitle } = parts(container);
  expect(title).toBe("YOU ARE: FASCIST");
  expect(middle).toContain("You win if Hitler is successfully elected chancellor");
  expect(container.querySelector(".prompt-body img#role")).not.toBeNull();
  expect(buttons).toEqual(["OKAY"]);
  expect(leftAlignedTitle).toBe(false);
});

test("the name prompt's title is its title, the field the middle, and its two buttons the foot", () => {
  const { container } = render(
    <NamePrompt
      title="CHANGE NAME"
      initialName="Sam"
      confirmLabel="SAVE"
      secondaryLabel="CANCEL"
      onConfirm={vi.fn().mockResolvedValue("")}
      onSecondary={vi.fn()}
    />
  );
  const { title, middle, buttons, leftAlignedTitle } = parts(container);
  expect(title).toBe("CHANGE NAME");
  expect(middle).toContain("Others see it in lobbies and games.");
  expect(container.querySelector(".prompt-body input")).not.toBeNull();
  expect(buttons).toEqual(["SAVE", "CANCEL"]);
  expect(leftAlignedTitle).toBe(false);
});
