/**
 * The activation page has to work for someone who has never used the platform,
 * so the signed-out half is the half worth covering:
 *
 *   • both doors are offered on the page itself, not behind a redirect that
 *     would lose the invitation;
 *   • creating an account here sends NO business details, so the trigger that
 *     provisions an organization and a trial on email confirmation does not
 *     fire — an invited person joins a team, they do not get a company;
 *   • the confirmation link comes back to this invitation;
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
});

describe("the activation page, signed out", () => {
  it("offers both doors instead of bouncing to the login page", () => {
    at(`/accept-invitation/${TOKEN}`);
    expect(screen.getByRole("button", { name: "Create my account" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "I already have one" })).toBeInTheDocument();
    expect(screen.queryByText("login page")).not.toBeInTheDocument();
  });

  it("creates an account with no business details, returning to this invitation", async () => {
    at(`/accept-invitation/${TOKEN}`);
    fireEvent.change(screen.getByLabelText("Your full name"), { target: { value: "Rae Agent" } });
    fireEvent.change(screen.getByLabelText("Email"), { target: { value: "rae@example.test" } });
    fireEvent.change(screen.getByLabelText("Choose a password"), { target: { value: "a-long-password" } });
    fireEvent.click(screen.getByRole("button", { name: "Activate my account" }));

    await waitFor(() => expect(signUp).toHaveBeenCalledTimes(1));
    const [email, password, fullName, options] = signUp.mock.calls[0] as unknown as [
      string, string, string, { business?: unknown; redirectPath?: string },
    ];
    expect(email).toBe("rae@example.test");
    expect(password).toBe("a-long-password");
    expect(fullName).toBe("Rae Agent");
    expect(options.business).toBeUndefined();
    expect(options.redirectPath).toBe(`/accept-invitation/${TOKEN}`);
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
