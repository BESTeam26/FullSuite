/**
 * The click shows first; the URL catches up; the local choice then steps
 * aside so the URL stays the truth (FullSuite rule §26, immediate feedback).
 */
import { describe, expect, it } from "vitest";
import { act, renderHook } from "@testing-library/react";
import { useImmediateSelection } from "./use-immediate-selection";

const same = (a: string, b: string) => a === b;

describe("a selection that shows immediately", () => {
  it("shows the chosen node before the URL has changed", () => {
    const { result } = renderHook(({ url }) => useImmediateSelection(url, same), { initialProps: { url: "main-list" } });
    act(() => result.current[1]("dispute-queue"));
    expect(result.current[0]).toBe("dispute-queue");
  });
  it("hands back to the URL once it says the same thing", () => {
    const { result, rerender } = renderHook(({ url }) => useImmediateSelection(url, same), { initialProps: { url: "main-list" } });
    act(() => result.current[1]("dispute-queue"));
    rerender({ url: "dispute-queue" });
    expect(result.current[0]).toBe("dispute-queue");
    /* The URL moving on again is followed: no stale local choice remains. */
    rerender({ url: "support-queue" });
    expect(result.current[0]).toBe("support-queue");
  });
});
