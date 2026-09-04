/**
 * Regression tests for the intake write path.
 *
 * The cross-partner enrollment prompt is only meaningful if nothing has been
 * written when it appears. Before this was fixed, the add-client modal called
 * addClient first and asked afterwards, so declining still left the record
 * behind. These tests pin the invariant that makes the prompt a real gate.
 */

import { describe, it, expect } from "vitest";
import { renderHook, act } from "@testing-library/react";
import type { ReactNode } from "react";
import { AuthProvider } from "@/lib/auth/auth-context";
import { createOpsClientStore } from "./ops-client-store";
import type { OpsClient } from "./ops-client-domain";

interface TestClient extends OpsClient {
  openItems: number;
}

const seed: TestClient[] = [
  {
    id: "c1",
    name: "Anthony Ramos",
    email: "aramos@outlook.com",
    mode: "saas_pulled",
    organizationId: "org-1",
    organizationName: "Apex Credit Co.",
    autoSync: true,
    status: "In Processing",
    lastActivity: "Today",
    createdAt: "2026-01-01",
    openItems: 2,
  },
  {
    id: "c2",
    name: "Diana Reyes",
    email: "diana.reyes@gmail.com",
    mode: "outsourcing_only",
    outsourcingGroupId: "os-2",
    outsourcingGroupName: "Metro Dispute Partners",
    autoSync: false,
    status: "Onboarding",
    lastActivity: "Today",
    createdAt: "2026-01-01",
    openItems: 0,
  },
];

const candidate = (email: string) => ({
  name: "New Person",
  email,
  mode: "saas_pulled" as const,
  organizationId: "org-1",
  organizationName: "Apex Credit Co.",
  autoSync: true,
  status: "Onboarding",
  openItems: 0,
});

function setup() {
  const store = createOpsClientStore<TestClient, { department: string }>({
    seedClients: seed,
    seedDepartmentStatuses: () => [{ department: "Dispute" }],
    activityEntityType: "test_client",
    activityIdPrefix: "test",
    clientIdPrefix: "tc",
    queryKey: "test",
    /* No live backend: these tests exercise the seed-data path deliberately. */
  });
  /* The store picks its implementation from auth mode, so it needs the auth
     context. With no Supabase credentials in the test environment that mode is
     "demo", which is the seed-data path these tests target. */
  const wrapper = ({ children }: { children: ReactNode }) => (
    <AuthProvider>
      <store.Provider>{children}</store.Provider>
    </AuthProvider>
  );
  return renderHook(() => store.useStore(), { wrapper });
}

describe("ops client store — intake", () => {
  it("checkAddConflict reports a same-partner duplicate without writing", () => {
    const { result } = setup();
    let conflict!: ReturnType<typeof result.current.checkAddConflict>;
    act(() => {
      conflict = result.current.checkAddConflict(
        candidate("aramos@outlook.com"),
      );
    });
    expect(conflict.sameScopeDuplicate?.name).toBe("Anthony Ramos");
    // The critical part: nothing was added.
    expect(result.current.clients).toHaveLength(2);
  });

  it("checkAddConflict reports a cross-partner match without writing", () => {
    const { result } = setup();
    let conflict!: ReturnType<typeof result.current.checkAddConflict>;
    act(() => {
      conflict = result.current.checkAddConflict(
        candidate("diana.reyes@gmail.com"),
      );
    });
    expect(conflict.sameScopeDuplicate).toBeUndefined();
    expect(conflict.crossScopeMatches.map((c) => c.name)).toEqual([
      "Diana Reyes",
    ]);
    // Declining must be possible, so the record must not exist yet.
    expect(result.current.clients).toHaveLength(2);
  });

  it("checkAddConflict reports no conflict for a fresh email, still without writing", () => {
    const { result } = setup();
    let conflict!: ReturnType<typeof result.current.checkAddConflict>;
    act(() => {
      conflict = result.current.checkAddConflict(candidate("brand.new@x.com"));
    });
    expect(conflict.sameScopeDuplicate).toBeUndefined();
    expect(conflict.crossScopeMatches).toEqual([]);
    expect(result.current.clients).toHaveLength(2);
  });

  it("addClient is what writes, and still hard-blocks a same-partner duplicate", () => {
    const { result } = setup();
    act(() => {
      result.current.addClient(candidate("brand.new@x.com"));
    });
    expect(result.current.clients).toHaveLength(3);

    let outcome!: ReturnType<typeof result.current.addClient>;
    act(() => {
      outcome = result.current.addClient(candidate("aramos@outlook.com"));
    });
    expect(outcome.blocked).toBe(true);
    expect(result.current.clients).toHaveLength(3);
  });

  it("addClient allows a confirmed cross-partner enrollment", () => {
    const { result } = setup();
    let outcome!: ReturnType<typeof result.current.addClient>;
    act(() => {
      outcome = result.current.addClient(candidate("diana.reyes@gmail.com"));
    });
    expect(outcome.blocked).toBe(false);
    expect(outcome.crossScopeMatches.map((c) => c.name)).toEqual([
      "Diana Reyes",
    ]);
    expect(result.current.clients).toHaveLength(3);
  });
});
