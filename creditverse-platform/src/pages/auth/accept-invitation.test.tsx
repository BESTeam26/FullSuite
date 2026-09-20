/**
 * The activation page has to work for someone who has never used the platform,
 * so the signed-out half is the half worth covering:
 *
 *   • both doors are offered on the page itself, not behind a redirect that
 *     would lose the invitation;
 *   • creating an account here goes through activate-invitation with the
 *     token, the email and the password — no business details, so no
 *     organization or trial is provisioned, and NO confirmation email (Dee,
 *     2026-09-20: the invitation link already proved the address) — and then
 *     signs the person in so the invitation is accepted as them;
 *   • a Postgres message never reaches the person.
 */
import { describe, expect, it, vi, beforeEach } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import AcceptInvitation from "@/pages/auth/AcceptInvitation";
import { invitationProblem } from "@/lib/auth/invitation-problem";

const TOKEN = "11111111-2222-4333-8444-555555555555";

const signUp = vi.fn(async () => ({ error: null }));
const signInWithPassword = vi.fn(async () => ({ error: null }));
const activateInvitedAccount = vi.fn(async () => undefined);

vi.mock("@/lib/data/agency-invitations", () => ({
  fetchInvitationPreview: vi.fn(async () => null),
  acceptAgencyInvitation: vi.fn(async () => "agency"),
  activateInvitedAccount: (...args: unknown[]) => activateInvitedAccount(...(args as [])),
}));

vi.mock("@/lib/auth/auth-context", () => ({
  useAuth: () => ({
    mode: "live",
    status: "signed-out",
    signUp,
    signInWithPassword,
    refreshMemberships: vi.fn(),
  }),
}));

const at = (path: string) =>
  render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/accept-invitation/:token" element={<AcceptInvitation />} />
        <Route path="/login" element={<div>login page</div>} />
      </Routes>
    </MemoryRouter>,
  );

beforeEach(() => {
  signUp.mockClear();
  signInWithPassword.mockClear();
  activateInvitedAccount.mockClear();
});

describe("the activation page, signed out", () => {
  it("offers both doors instead of bouncing to the login page", () => {
    at(`/accept-invitation/${TOKEN}`);
    expect(screen.getByRole("button", { name: "Create my account" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "I already have one" })).toBeInTheDocument();
    expect(screen.queryByText("login page")).not.toBeInTheDocument();
  });

  it("creates the account through the invitation — no confirmation email — then signs in", async () => {
    at(`/accept-invitation/${TOKEN}`);
    fireEvent.change(screen.getByLabelText("Your full name"), { target: { value: "Rae Agent" } });
    fireEvent.change(screen.getByLabelText("Email"), { target: { value: "rae@example.test" } });
    fireEvent.change(screen.getByLabelText("Choose a password"), { target: { value: "a-long-password" } });
    fireEvent.click(screen.getByRole("button", { name: "Activate my account" }));

    await waitFor(() => expect(activateInvitedAccount).toHaveBeenCalledTimes(1));
    expect(activateInvitedAccount).toHaveBeenCalledWith({
      token: TOKEN, email: "rae@example.test", password: "a-long-password", fullName: "Rae Agent",
    });
    await waitFor(() => expect(signInWithPassword).toHaveBeenCalledWith("rae@example.test", "a-long-password"));
    /* Never the public sign-up: that path provisions a company and waits on a confirmation email. */
    expect(signUp).not.toHaveBeenCalled();
    expect(screen.queryByText(/Check your email/)).not.toBeInTheDocument();
  });

  it("signs an existing person in without creating anything", async () => {
    at(`/accept-invitation/${TOKEN}`);
    fireEvent.click(screen.getByRole("button", { name: "I already have one" }));
    expect(screen.queryByLabelText("Your full name")).not.toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("Email"), { target: { value: "rae@example.test" } });
    fireEvent.change(screen.getByLabelText("Password"), { target: { value: "a-long-password" } });
    fireEvent.click(screen.getByRole("button", { name: "Sign in and accept" }));

    await waitFor(() => expect(signInWithPassword).toHaveBeenCalledWith("rae@example.test", "a-long-password"));
    expect(signUp).not.toHaveBeenCalled();
    expect(activateInvitedAccount).not.toHaveBeenCalled();
  });

  it("refuses a link that is not shaped like an invitation before asking the database", () => {
    at("/accept-invitation/not-a-token");
    expect(screen.getByRole("alert")).toHaveTextContent("This invitation link is not valid.");
    expect(screen.queryByRole("button", { name: "Create my account" })).not.toBeInTheDocument();
  });
});

describe("invitationProblem", () => {
  it("keeps a message written for people", () => {
    expect(invitationProblem(new Error("This invitation was sent to a different email address."))).toBe(
      "This invitation was sent to a different email address.",
    );
  });

  it("replaces a message written for Postgres", () => {
    for (const raw of [
      'invalid input syntax for type uuid: "abc"',
      'new row violates row-level security policy for table "org_memberships"',
      'function public.accept_invitation(text) does not exist',
      "permission denied for table invitations",
      "",
    ]) {
      expect(invitationProblem(new Error(raw))).toBe("This invitation link is not valid, or it has already been used.");
    }
  });
});

/* supabase-js rejects with a PostgrestError: a plain object carrying
   `message`, not an Error. Reading it as an Error found nothing and every
   refusal became "this link is not valid" — including the one a person can
   act on. */
describe("a database refusal keeps its own words", () => {
  it("reads the message off a PostgrestError-shaped object", () => {
    const postgrestError = {
      message: "This invitation was sent to a different email address",
      code: "42501", details: null, hint: null,
    };
    expect(invitationProblem(postgrestError)).toBe(
      "This invitation was sent to a different email address",
    );
  });

  it("still hides Postgres internals whatever shape they arrive in", () => {
    expect(invitationProblem({ message: 'relation "invitations" does not exist' }))
      .toBe("This invitation link is not valid, or it has already been used.");
  });

  it("falls back for a shape with no message at all", () => {
    expect(invitationProblem({ code: "42501" }))
      .toBe("This invitation link is not valid, or it has already been used.");
  });
});
