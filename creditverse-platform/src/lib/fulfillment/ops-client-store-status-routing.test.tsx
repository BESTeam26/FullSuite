/**
 * A status change reloads the file's department rows.
 *
 * The database routes a file when its credit status changes — it opens,
 * closes or re-points department rows. The store cached those rows per file
 * and never reloaded them after the write, so the client file's header read
 * "No open work" right after Dee moved a file to Monitoring Issue, although
 * the Support row was already open (2026-10-15).
 */
import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, waitFor, fireEvent, act } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createOpsClientStore } from "@/lib/fulfillment/ops-client-store";
import type { OpsClient } from "@/lib/fulfillment/ops-client-domain";

let authState: { mode: string; status: string; agencyId: string | null; user: unknown };
vi.mock("@/lib/auth/auth-context", () => ({
  useAuth: () => authState,
  AuthProvider: ({ children }: { children: React.ReactNode }) => children,
}));

interface TestClient extends OpsClient { status: string }
interface Row { department: string; status: string }

const seedClient: TestClient = {
  id: "c1", name: "Shanika Dessalines", email: "s@example.com", mode: "outsourcing_only",
  outsourcingGroupId: "grp-1", autoSync: false, status: "Program Completed",
  assignedAgent: "Unassigned", lastActivity: "Just now", createdAt: "2026-09-25",
};

function makeBackend() {
  /* What the database holds: nothing open until the status is changed, then
     the routed Support row. */
  let rows: Row[] = [];
  let reads = 0;
  return {
    reads: () => reads,
    backend: {
      fetchClients: async () => [seedClient],
      fetchDepartmentStatuses: async () => { reads += 1; return rows; },
      updateStatus: async (_id: string, status: string) => {
        rows = [{ department: "Support", status: "MONITORING ISSUE" }];
        return { ...seedClient, status };
      },
      updateContact: async () => seedClient,
      addClient: async () => "new-id",
      logProduction: async () => {},
    },
  };
}

function Harness({ backend }: { backend: ReturnType<typeof makeBackend>["backend"] }) {
  const store = createOpsClientStore<TestClient, Row>({
    initialClients: [seedClient], seedDepartmentStatuses: () => [],
    activityEntityType: "test_client", activityIdPrefix: "t", clientIdPrefix: "tc",
    queryKey: "creditops", live: backend,
  });
  function File() {
    const s = store.useStore();
    const rows = s.getDepartmentStatuses("c1");
    return (
      <div>
        <p>{rows.length === 0 ? "No open work" : `${rows[0].department}: ${rows[0].status}`}</p>
        <button onClick={() => void s.updateStatus("c1", "Monitoring Issue 2", "Dee")}>move</button>
      </div>
    );
  }
  return (
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <store.Provider><File /></store.Provider>
    </QueryClientProvider>
  );
}

beforeEach(() => {
  authState = { mode: "live", status: "signed-in", agencyId: "aaaaaaaa-0000-4000-8000-000000000001", user: { id: "u1" } };
});

describe("a credit status change reloads the file's department rows", () => {
  it("shows the department the database opened, without a page reload", async () => {
    const { backend, reads } = makeBackend();
    render(<Harness backend={backend} />);
    await waitFor(() => expect(reads()).toBe(1));
    expect(screen.getByText("No open work")).toBeTruthy();
    await act(async () => { fireEvent.click(screen.getByText("move")); });
    await waitFor(() => expect(screen.getByText("Support: MONITORING ISSUE")).toBeTruthy());
    expect(reads()).toBe(2);
  });
});
