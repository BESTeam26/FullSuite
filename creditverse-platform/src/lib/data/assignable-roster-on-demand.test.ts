/**
 * The client lists ask for the roster only when somebody opens an assignee
 * picker or selects rows (2026-10-03). While it loads, the picker says so
 * with an entry that is never a person.
 */
import { describe, expect, it, vi } from "vitest";
import { renderHook } from "@testing-library/react";

let queryState: { data?: unknown; isLoading: boolean } = { isLoading: false };
const enabledSeen: boolean[] = [];
vi.mock("@/lib/auth/auth-context", () => ({ useAuth: () => ({ mode: "live", status: "signed-in" }) }));
vi.mock("@tanstack/react-query", async (orig) => ({
  ...(await orig<object>()),
  useQuery: (o: { enabled: boolean }) => { enabledSeen.push(o.enabled); return queryState; },
}));

import { ROSTER_LOADING_ID, useAssignableRoster } from "./use-workforce";

describe("the assignable roster, on demand", () => {
  it("asks for nothing until wanted, and offers only Unassigned", () => {
    queryState = { isLoading: false };
    const { result } = renderHook(() => useAssignableRoster(false));
    expect(enabledSeen.at(-1)).toBe(false);
    expect(result.current).toEqual([{ id: null, name: "Unassigned" }]);
  });

  it("says it is loading with an entry that is not a person", () => {
    queryState = { isLoading: true };
    const { result } = renderHook(() => useAssignableRoster(true));
    expect(enabledSeen.at(-1)).toBe(true);
    expect(result.current.map((a) => a.id)).toEqual([null, ROSTER_LOADING_ID]);
  });

  it("lists the people once loaded", () => {
    queryState = { isLoading: false, data: { people: [{ userId: "u1", name: "Jet" }] } };
    const { result } = renderHook(() => useAssignableRoster(true));
    expect(result.current).toEqual([{ id: null, name: "Unassigned" }, { id: "u1", name: "Jet" }]);
  });
});
