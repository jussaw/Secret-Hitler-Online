import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { joined } from "./text";

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
