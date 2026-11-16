import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { CARD_WORDS, joined, RoleWord } from "./text";

describe("joined", () => {
  it("joins the parts that are there", () => {
    const { container } = render(<p>{joined(["a", null, false, <b key="b">b</b>, "c"], " · ")}</p>);
    expect(container.textContent).toBe("a · b · c");
    expect(container.querySelector("b")).toHaveTextContent("b");
  });

  it("is null with none", () => {
    expect(joined([null, false], ", ")).toBeNull();
  });
});

describe("RoleWord", () => {
  it("each role's word in its colour", () => {
    const { container } = render(
      <p>
        <RoleWord role="LIBERAL" /> <RoleWord role="FASCIST" /> <RoleWord role="HITLER" />
      </p>
    );
    expect(Array.from(container.querySelectorAll("span"), (s) => [s.textContent, s.className])).toEqual([
      ["Liberal", "stats-liberal"],
      ["Fascist", "stats-fascist"],
      ["Hitler", "stats-hitler"],
    ]);
  });

  it("each policy's word", () => {
    expect(CARD_WORDS).toEqual({ L: "Liberal", F: "Fascist" });
  });
});

