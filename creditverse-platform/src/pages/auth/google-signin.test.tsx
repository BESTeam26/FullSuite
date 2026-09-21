/**
 * The Google button must never strand somebody on "Please wait…".
 *
 * Dee, 2026-09-21: "still the Login via google did not work the first time as
 * it stays on PLEASE WAIT page and did not proceed." Three ways that happens,
 * and the old code handled only the first:
 *
 *   the call returns an error      → was handled
 *   the call THROWS                → rejected through an async handler with no
 *                                    catch, so the busy flag was never cleared
 *   the call returns and nothing   → no error exists to report; only a clock
 *   navigates                        notices
 */
import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { act, fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import Login from "@/pages/auth/Login";

const signInWithGoogle = vi.fn();
/* The button only renders when Google is an enabled provider, and the page
   sets page metadata on mount. Neither is what these tests are about. */
vi.mock("@/lib/auth/use-external-providers", () => ({
  useExternalProviders: () => ({ google: true }),
}));
vi.mock("@/lib/use-seo", () => ({ useSeo: () => {} }));
vi.mock("@/lib/auth/auth-context", () => ({
  useAuth: () => ({
    status: "signed-out", mode: "live", signInWithGoogle,
    signIn: vi.fn(), signUp: vi.fn(), resetPassword: vi.fn(), signInWithOtp: vi.fn(),
  }),
}));

const clickGoogle = () => {
  render(<MemoryRouter><Login /></MemoryRouter>);
  fireEvent.click(screen.getByRole("button", { name: /Continue with Google/i }));
};

beforeEach(() => { vi.useFakeTimers({ shouldAdvanceTime: true }); signInWithGoogle.mockReset(); });
afterEach(() => { vi.useRealTimers(); });

describe("the Google button", () => {
  it("says why when the call reports an error", async () => {
    signInWithGoogle.mockResolvedValue({ error: "Provider is disabled." });
    clickGoogle();
    await act(async () => {});
    expect(await screen.findByText(/Provider is disabled/)).toBeInTheDocument();
  });

  it("recovers when the call THROWS instead of returning", async () => {
    /* A browser refusing storage rejects rather than returning. This used to
       propagate through an async handler with no catch and leave the button
       waiting for ever. */
    signInWithGoogle.mockRejectedValue(new Error("Access to storage is denied."));
    clickGoogle();
    await act(async () => {});
    expect(await screen.findByText(/storage is denied/)).toBeInTheDocument();
  });

  it("gives up when the call succeeds but the browser never navigates", async () => {
    /* No error exists to report. Only the clock notices — which is the exact
       shape of what Dee saw. */
    signInWithGoogle.mockResolvedValue({ error: null });
    clickGoogle();
    await act(async () => {});
    expect(screen.queryByText(/did not open/)).toBeNull();
    await act(async () => { vi.advanceTimersByTime(8001); });
    expect(screen.getByText(/Google did not open/)).toBeInTheDocument();
  });

  it("stays quiet while the redirect is still plausibly on its way", async () => {
    signInWithGoogle.mockResolvedValue({ error: null });
    clickGoogle();
    await act(async () => { vi.advanceTimersByTime(3000); });
    expect(screen.queryByText(/did not open/)).toBeNull();
  });
});
