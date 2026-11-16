import { act, render, screen } from "@testing-library/react";
import { useRef } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { useChartWidth } from "./useChartWidth";

function Probe({ fallback }: { fallback?: number }) {
  const ref = useRef<HTMLDivElement>(null);
  const width = useChartWidth(ref, fallback);
  return <div ref={ref}>{width}</div>;
}

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("useChartWidth", () => {
  it("isTheFallbackWhileTheBoxHasNoWidth", () => {
    render(<Probe />);
    expect(screen.getByText("320")).toBeInTheDocument();
    render(<Probe fallback={500} />);
    expect(screen.getByText("500")).toBeInTheDocument();
  });

  it("measuresTheBoxInWholePixels", () => {
    vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockReturnValue({ width: 611.6 } as DOMRect);
    render(<Probe />);
    expect(screen.getByText("611")).toBeInTheDocument();
  });

  it("followsAResize", () => {
    let resized: () => void = () => undefined;
    vi.stubGlobal(
      "ResizeObserver",
      class {
        constructor(callback: () => void) {
          resized = callback;
        }
        observe() {}
        disconnect() {}
      }
    );
    const rect = vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockReturnValue({ width: 400 } as DOMRect);
    render(<Probe />);
    expect(screen.getByText("400")).toBeInTheDocument();
    rect.mockReturnValue({ width: 700 } as DOMRect);
    act(() => resized());
    expect(screen.getByText("700")).toBeInTheDocument();
  });
});
