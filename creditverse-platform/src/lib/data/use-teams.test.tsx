/**
 * Where a new client starts: the database (`in_scope`) lets an agent create
 * only inside a team of theirs, and an admin or division manager anywhere.
 * Defaulting everyone to "No team" (2026-10-15) made Kaori's Add Client fail
 * with a row-security error; these pin the rule per view (rule 20b).
 */
import { describe, expect, it, vi } from "vitest";
import { renderHook } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { useTeams } from "./use-teams";

let authState: Record<string, unknown>;
vi.mock("@/lib/auth/auth-context", () => ({ useAuth: () => authState }));

const base = { mode: "demo", status: "signed-in", agencyId: "a1", ledTeamIds: [] as string[], teamIds: ["support"], isAgencyAdmin: false, agencyScope: "assigned" };
const wrapper = ({ children }: { children: ReactNode }) => (
  <QueryClientProvider client={new QueryClient()}>{children}</QueryClientProvider>
);
const run = (over: Partial<typeof base>) => { authState = { ...base, ...over }; return renderHook(() => useTeams(), { wrapper }).result.current; };

describe("the team a new client starts on", () => {
  it("agent: their own team, and a team is required", () => {
    const r = run({});
    expect(r.defaultTeamId).toBe("support");
    expect(r.mustChooseTeam).toBe(true);
  });
  it("team lead: the team they lead", () => {
    expect(run({ ledTeamIds: ["dispute"], teamIds: ["dispute", "support"] }).defaultTeamId).toBe("dispute");
  });
  it("division manager: no team, optional", () => {
    const r = run({ agencyScope: "division", ledTeamIds: ["x"] });
    expect(r.defaultTeamId).toBeNull();
    expect(r.mustChooseTeam).toBe(false);
  });
  it("executive (Dee leads every team): no team, like the 1,451 live files", () => {
    const r = run({ agencyScope: "agency", isAgencyAdmin: true, ledTeamIds: ["admin", "dispute"] });
    expect(r.defaultTeamId).toBeNull();
    expect(r.mustChooseTeam).toBe(false);
  });
  it("an admin whose scope is 'assigned' (Aaron on support@) still creates anywhere", () => {
    expect(run({ isAgencyAdmin: true, teamIds: ["admin"] }).defaultTeamId).toBeNull();
  });
});
