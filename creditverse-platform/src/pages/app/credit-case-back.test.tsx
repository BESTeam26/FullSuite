/**
 * Back from a client file returns to the list it was opened from.
 *
 * Dee, 2026-09-26. The button used to navigate to a fixed "/app/creditops",
 * so opening a client from Vanquish Ventures' list and pressing Back landed
 * on the shared Main Client List. The comment beside that line claimed it
 * went "back to the list they came from"; it did not, which is why this test
 * exercises the wiring and not only the helper beside it.
 */
import { describe, expect, it, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";

/* The workspace itself is somebody else's test: it wants the CreditOps store,
   the access context, a query client and a live client id. Only the Back
   control matters here, so it is stood in for. */
vi.mock("@/components/dashboard/fulfillment/ClientWorkWorkspace", () => ({
  ClientWorkWorkspace: ({ onBack, backLabel }: { onBack: () => void; backLabel?: string }) => (
    <button onClick={onBack}>{backLabel ?? "Back"}</button>
  ),
}));
vi.mock("@/lib/fulfillment/creditops-client-store", () => ({
  CreditOpsStoreProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));
vi.mock("@/lib/fulfillment/creditops-access", () => ({
  CreditOpsAccessProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

import CreditCasePage from "./CreditCasePage";

const Where = () => {
  const l = useLocation();
  return <div data-testid="where">{l.pathname}{l.search}</div>;
};

const openCase = (state: unknown) =>
  render(
    <MemoryRouter initialEntries={[{ pathname: "/app/creditops/cases/c1", state }]}>
      <Routes>
        <Route path="/app/creditops/cases/:id" element={<CreditCasePage />} />
        <Route path="*" element={<Where />} />
      </Routes>
    </MemoryRouter>,
  );

describe("Back from a client file", () => {
  it("returns to the partner list it was opened from", () => {
    openCase({ from: "/app/creditops?partner=p-vanquish&view=main-list" });
    fireEvent.click(screen.getByRole("button", { name: /Back to clients/ }));
    expect(screen.getByTestId("where").textContent)
      .toBe("/app/creditops?partner=p-vanquish&view=main-list");
  });

  it("returns to a department queue it was opened from", () => {
    openCase({ from: "/app/creditops?view=mgmt-dispute-queue" });
    fireEvent.click(screen.getByRole("button", { name: /Back to clients/ }));
    expect(screen.getByTestId("where").textContent)
      .toBe("/app/creditops?view=mgmt-dispute-queue");
  });

  it("lands somewhere sensible when there is no return address", () => {
    /* A pasted link, a notification, or a new tab. */
    openCase(undefined);
    fireEvent.click(screen.getByRole("button", { name: /Back to clients/ }));
    expect(screen.getByTestId("where").textContent).toBe("/app/creditops");
  });

  it("ignores a return address pointing off-site", () => {
    openCase({ from: "//evil.example/phish" });
    fireEvent.click(screen.getByRole("button", { name: /Back to clients/ }));
    expect(screen.getByTestId("where").textContent).toBe("/app/creditops");
  });
});
