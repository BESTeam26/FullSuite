/**
 * The callback must not answer before the answer exists.
 *
 * Dee, 2026-09-21: Google sign-in failed on the first click and worked after a
 * refresh. PKCE sends the browser back with `?code=…` and supabase-js exchanges
 * it asynchronously; the provider meanwhile boots, finds no stored session and
 * reports `signed-out`. The page treated that as final and navigated to
 * /login, abandoning the code mid-exchange. The retry won the race.
 */
import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { act, render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import AuthCallback from "@/pages/auth/AuthCallback";

const status = { value: "loading" as "loading" | "signed-in" | "signed-out" | "unavailable" };
vi.mock("@/lib/auth/auth-context", () => ({ useAuth: () => ({ status: status.value }) }));
vi.mock("@/components/auth/RequireAuth", () => ({
  FullScreenSpinner: () => <p>waiting</p>,
}));

const at = (search: string) => render(
  <MemoryRouter initialEntries={[`/auth/callback${search}`]}>
    <Routes>
      <Route path="/auth/callback" element={<AuthCallback />} />
      <Route path="/login" element={<p>login page</p>} />
      <Route path="/app" element={<p>the app</p>} />
      <Route path="/app/settings" element={<p>settings</p>} />
    </Routes>
  </MemoryRouter>,
);

beforeEach(() => { vi.useFakeTimers({ shouldAdvanceTime: true }); status.value = "signed-out"; });
afterEach(() => { vi.useRealTimers(); vi.clearAllMocks(); });

describe("the OAuth callback", () => {
  it("waits while a code is still being exchanged, even though the session is not there yet", () => {
    at("?code=abc123");
    expect(screen.getByText("waiting")).toBeInTheDocument();
    expect(screen.queryByText("login page")).toBeNull();
  });

  it("forwards as soon as the exchange lands", () => {
    status.value = "signed-in";
    at("?code=abc123");
    expect(screen.getByText("the app")).toBeInTheDocument();
  });

  it("gives up after the timeout rather than hanging for ever", () => {
    at("?code=abc123");
    /* act(), because the timeout sets state and React must re-render before
       the assertion can see the result. */
    act(() => { vi.advanceTimersByTime(15001); });
    expect(screen.getByText("login page")).toBeInTheDocument();
  });

  it("still leaves immediately when there is no code to wait for", () => {
    /* A plain visit with no exchange owed keeps the old, correct behaviour. */
    at("");
    expect(screen.getByText("login page")).toBeInTheDocument();
  });

  it("does not wait when the provider itself refused", () => {
    at("?error=access_denied&error_description=You%20cancelled");
    expect(screen.getByText("login page")).toBeInTheDocument();
  });

  /* Dee's named regression cases, 2026-09-21. "A successful first Google login
     should never require a second attempt." */
  it("first-click success: the code lands and the person goes straight in", () => {
    /* Boot order is the whole bug: signed-out arrives first, the session second. */
    status.value = "signed-out";
    const view = at("?code=first-click");
    expect(screen.getByText("waiting")).toBeInTheDocument();
    status.value = "signed-in";
    view.rerender(
      <MemoryRouter initialEntries={["/auth/callback?code=first-click"]}>
        <Routes>
          <Route path="/auth/callback" element={<AuthCallback />} />
          <Route path="/login" element={<p>login page</p>} />
          <Route path="/app" element={<p>the app</p>} />
        </Routes>
      </MemoryRouter>,
    );
    expect(screen.getByText("the app")).toBeInTheDocument();
    expect(screen.queryByText("login page")).toBeNull();
  });

  it("cancelled at Google: back to login, with the reason", () => {
    at("?error=access_denied&error_description=You%20cancelled%20sign-in");
    expect(screen.getByText("login page")).toBeInTheDocument();
  });

  it("a provider error is not waited on", () => {
    at("?error=server_error");
    expect(screen.getByText("login page")).toBeInTheDocument();
  });

  it("an expired or already-used code gives up at the timeout rather than hanging", () => {
    /* Nothing signs in, because the exchange fails. The page must still let go. */
    at("?code=expired");
    expect(screen.getByText("waiting")).toBeInTheDocument();
    act(() => { vi.advanceTimersByTime(15001); });
    expect(screen.getByText("login page")).toBeInTheDocument();
  });

  it("a direct refresh mid-callback waits again rather than bouncing", () => {
    /* A refresh remounts with the same URL. The code may already be spent, in
       which case the timeout ends it — but it must not bounce instantly, which
       is what made the first attempt fail. */
    at("?code=refreshed");
    expect(screen.getByText("waiting")).toBeInTheDocument();
  });

  it("forwards somebody whose session is real but whose identity would not load", () => {
    /* `unavailable` matched neither branch, so the page span to the timeout and
       then sent a signed-IN person back to the login form. That is the
       first-try failure Dee and Bryan both hit. */
    status.value = "unavailable";
    at("?code=abc123");
    expect(screen.getByText("the app")).toBeInTheDocument();
    expect(screen.queryByText("login page")).toBeNull();
  });

  it("honours recovery links, which carry no code", () => {
    status.value = "signed-in";
    at("?type=recovery");
    expect(screen.getByText("settings")).toBeInTheDocument();
  });
});
