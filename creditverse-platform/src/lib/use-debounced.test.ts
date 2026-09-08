import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useDebounced } from "./use-debounced";

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

describe("useDebounced", () => {
  it("returns the first value immediately — there is nothing to wait for yet", () => {
    const { result } = renderHook(() => useDebounced("metro", 300));
    expect(result.current).toBe("metro");
  });

  it("holds a change back until the delay has passed", () => {
    const { result, rerender } = renderHook(({ v }) => useDebounced(v, 300), {
      initialProps: { v: "m" },
    });
    rerender({ v: "metro" });
    expect(result.current).toBe("m");
    act(() => vi.advanceTimersByTime(299));
    expect(result.current).toBe("m");
    act(() => vi.advanceTimersByTime(1));
    expect(result.current).toBe("metro");
  });

  it("collapses a run of changes into ONE settled value", () => {
    /* This is the property the search depends on: five keystrokes, one
       request. Each change restarts the clock. */
    const { result, rerender } = renderHook(({ v }) => useDebounced(v, 300), {
      initialProps: { v: "" },
    });
    for (const v of ["m", "me", "met", "metr", "metro"]) {
      rerender({ v });
      act(() => vi.advanceTimersByTime(100));
    }
    expect(result.current).toBe("");
    act(() => vi.advanceTimersByTime(300));
    expect(result.current).toBe("metro");
  });

  it("does not emit a value the caller has already moved on from", () => {
    const { result, rerender } = renderHook(({ v }) => useDebounced(v, 300), {
      initialProps: { v: "a" },
    });
    rerender({ v: "ab" });
    act(() => vi.advanceTimersByTime(200));
    rerender({ v: "a" });
    act(() => vi.advanceTimersByTime(300));
    expect(result.current).toBe("a");
  });
});
