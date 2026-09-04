/**
 * Tenant isolation at the application boundary.
 *
 * These prove what the STORE does with agency context. They are not a
 * substitute for the database check — RLS is the enforcement layer, and
 * `is_staff_of(agency_id)` is what actually stops a cross-agency read. What
 * these pin down is that the store never invents an agency, never lets a caller
 * choose one, and refuses to write when it has none.
 *
 * The regression they exist to prevent: two divisions previously wrote a
 * hardcoded agency id, so every record went to one tenant no matter who was
 * signed in.
 */
import { describe, expect, it, vi, beforeEach } from "vitest";
import {
  render,
  screen,
  waitFor,
  fireEvent,
  act,
} from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createOpsClientStore } from "@/lib/fulfillment/ops-client-store";
import type { OpsClient } from "@/lib/fulfillment/ops-client-domain";

const AGENCY_A = "aaaaaaaa-0000-4000-8000-000000000001";
const AGENCY_B = "bbbbbbbb-0000-4000-8000-000000000002";

/** What `useAuth()` returns for a given test. Reset in beforeEach. */
let authState: {
  mode: string;
  status: string;
  agencyId: string | null;
  user: unknown;
};

vi.mock("@/lib/auth/auth-context", () => ({
  useAuth: () => authState,
  AuthProvider: ({ children }: { children: React.ReactNode }) => children,
}));

interface TestClient extends OpsClient {
  status: string;
}

const seedClient: TestClient = {
  id: "seed-1",
  name: "Seed Person",
  email: "seed@example.com",
  mode: "outsourcing_only",
  outsourcingGroupId: "grp-1",
  autoSync: false,
  status: "Onboarding",
  assignedAgent: "Unassigned",
  lastActivity: "Just now",
  createdAt: "2026-09-03",
};

/** Records what the backend was asked to do, so assertions read plainly. */
function makeBackend() {
  const calls: { agencyId: string; email: string }[] = [];
  return {
    calls,
    backend: {
      fetchClients: async () => [] as TestClient[],
      fetchDepartmentStatuses: async () => [],
      // Writes resolve to the updated canonical row, as the real backends do.
      updateStatus: async () => seedClient,
      updateContact: async () => seedClient,
      addClient: async (
        c: Omit<TestClient, "id" | "lastActivity" | "createdAt">,
        agencyId: string,
      ) => {
        calls.push({ agencyId, email: c.email });
        return "new-id";
      },
      logProduction: async () => {},
    },
  };
}

function buildHarness(backendImpl: ReturnType<typeof makeBackend>["backend"]) {
  const store = createOpsClientStore<TestClient, unknown>({
    seedClients: [seedClient],
    seedDepartmentStatuses: () => [],
    activityEntityType: "test_client",
    activityIdPrefix: "t",
    clientIdPrefix: "tc",
    queryKey: "test-division",
    live: backendImpl,
  });

  function AddButton() {
    const s = store.useStore();
    return (
      <button
        onClick={() =>
          s.addClient({
            name: "New Person",
            email: "new@example.com",
            mode: "outsourcing_only",
            outsourcingGroupId: "grp-1",
            autoSync: false,
            status: "Onboarding",
          } as Omit<TestClient, "id" | "lastActivity" | "createdAt">)
        }
      >
        add
      </button>
    );
  }

  return function Harness() {
    return (
      <QueryClientProvider
        client={
          new QueryClient({ defaultOptions: { queries: { retry: false } } })
        }
      >
        <store.Provider>
          <AddButton />
        </store.Provider>
      </QueryClientProvider>
    );
  };
}

beforeEach(() => {
  authState = {
    mode: "live",
    status: "signed-in",
    agencyId: AGENCY_A,
    user: { id: "u1" },
  };
});

describe("agency context reaches writes from the authenticated session only", () => {
  it("writes under the agency the session resolved — Agency A", async () => {
    const { backend, calls } = makeBackend();
    const Harness = buildHarness(backend);
    render(<Harness />);
    await act(async () => {
      fireEvent.click(screen.getByText("add"));
    });
    await waitFor(() => expect(calls).toHaveLength(1));
    expect(calls[0].agencyId).toBe(AGENCY_A);
  });

  it("a different session writes under ITS agency, not a baked-in one", async () => {
    authState = { ...authState, agencyId: AGENCY_B };
    const { backend, calls } = makeBackend();
    const Harness = buildHarness(backend);
    render(<Harness />);
    await act(async () => {
      fireEvent.click(screen.getByText("add"));
    });
    await waitFor(() => expect(calls).toHaveLength(1));
    // The regression: this used to be a constant, so it was always Agency A.
    expect(calls[0].agencyId).toBe(AGENCY_B);
    expect(calls[0].agencyId).not.toBe(AGENCY_A);
  });

  it("refuses the write when no agency context resolved — default deny", async () => {
    authState = { ...authState, agencyId: null };
    const { backend, calls } = makeBackend();
    const Harness = buildHarness(backend);
    render(<Harness />);
    await act(async () => {
      fireEvent.click(screen.getByText("add"));
    });
    // Nothing reaches the backend: no agency means no tenant to file under.
    await new Promise((r) => setTimeout(r, 50));
    expect(calls).toHaveLength(0);
  });

  it("a caller cannot supply its own agency — the field is not on the payload", async () => {
    const { backend, calls } = makeBackend();
    const Harness = buildHarness(backend);
    render(<Harness />);
    await act(async () => {
      fireEvent.click(screen.getByText("add"));
    });
    await waitFor(() => expect(calls).toHaveLength(1));
    // addClient's payload type has no agency field; the store supplies it from
    // the session, so a component cannot target another tenant.
    expect(calls[0].agencyId).toBe(AGENCY_A);
  });

  it("existing single-agency behaviour is unchanged", async () => {
    const { backend, calls } = makeBackend();
    const Harness = buildHarness(backend);
    render(<Harness />);
    await act(async () => {
      fireEvent.click(screen.getByText("add"));
    });
    await waitFor(() => expect(calls).toHaveLength(1));
    expect(calls[0]).toEqual({ agencyId: AGENCY_A, email: "new@example.com" });
  });

  it("demo mode never reaches the live backend at all", async () => {
    authState = {
      mode: "demo",
      status: "signed-in",
      agencyId: null,
      user: null,
    };
    const { backend, calls } = makeBackend();
    const Harness = buildHarness(backend);
    render(<Harness />);
    await act(async () => {
      fireEvent.click(screen.getByText("add"));
    });
    await new Promise((r) => setTimeout(r, 50));
    expect(calls).toHaveLength(0);
  });
});
