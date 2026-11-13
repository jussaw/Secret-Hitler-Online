import { render } from "@testing-library/react";
import { afterEach, expect, test, vi } from "vitest";
import LoginPageContent from "./LoginPageContent";

afterEach(() => {
  vi.restoreAllMocks();
});

test("renders the three gifs without a missing-key warning", () => {
  const error = vi.spyOn(console, "error").mockImplementation(() => {});
  const { container } = render(<LoginPageContent />);

  expect(container.querySelectorAll("#login-page-gif-container img")).toHaveLength(3);
  const keyWarnings = error.mock.calls.filter((args) => args.join(" ").includes('"key" prop'));
  expect(keyWarnings).toEqual([]);
});
