import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { portraitsAltText } from "../assets";
import RosterRow, { RosterRowProps } from "./RosterRow";

function renderRow(overrides: Partial<RosterRowProps> = {}) {
  const props: RosterRowProps = {
    name: "Ann",
    icon: "p3",
    isUser: false,
    disabled: false,
    detail: "",
    detailClass: "",
    tag: "",
    status: null,
    ...overrides,
  };
  const { container } = render(
    <ol>
      <RosterRow {...props} />
    </ol>
  );
  return container.querySelector("li.roster-row") as HTMLElement;
}

describe("RosterRow", () => {
  it("a row shows the portrait, name, detail line, tag and status", () => {
    const row = renderRow({
      detail: "HOST",
      detailClass: "office",
      tag: "HOST",
      status: <img className="roster-busy" alt="busy" />,
    });
    expect(row.getAttribute("title")).toBe("Ann");
    expect(row.querySelector(".roster-face")?.getAttribute("alt")).toBe(portraitsAltText.p3);
    expect(row.querySelector(".roster-detail.office")?.textContent).toBe("HOST");
    expect(row.querySelector(".roster-tag")?.textContent).toBe("HOST");
    expect(row.querySelector(".roster-status .roster-busy")).not.toBeNull();
  });

  it("the user's row and a darkened row get their classes", () => {
    const row = renderRow({ isUser: true, disabled: true });
    expect(row.classList.contains("is-user")).toBe(true);
    expect(row.classList.contains("is-disabled")).toBe(true);
    const plain = renderRow();
    expect(plain.classList.contains("is-user")).toBe(false);
  });

  it("a role icon follows the name", () => {
    const row = renderRow({ roleIcon: { src: "x.png", alt: "Liberal" } });
    expect(row.querySelector('.roster-name img.roster-role-icon[alt="Liberal"]')).not.toBeNull();
  });
});
