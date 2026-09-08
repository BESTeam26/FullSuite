import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor, fireEvent, act } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { CopyField } from "./CopyField";
import { CredentialPasswordField } from "./CredentialPasswordField";

const reveal = vi.fn();
vi.mock("@/lib/data/use-partner-credentials", () => ({
  useRevealCredential: () => ({
    mutateAsync: reveal,
    isPending: false,
  }),
}));

const wrap = (ui: ReactNode) => {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={qc}>{ui}</QueryClientProvider>);
};

beforeEach(() => {
  reveal.mockReset();
  Object.assign(navigator, {
    clipboard: { writeText: vi.fn().mockResolvedValue(undefined) },
  });
});

describe("CopyField", () => {
  it("shows the value as selectable text, not only inside a button", () => {
    wrap(<CopyField label="Username" value="ops@dispute-me.com" />);
    expect(screen.getByText("ops@dispute-me.com")).toBeTruthy();
  });

  it("copies and confirms", async () => {
    wrap(<CopyField label="Username" value="ops@dispute-me.com" />);
    fireEvent.click(screen.getByLabelText("Copy Username"));
    await waitFor(() => expect(screen.getByText("Copied")).toBeTruthy());
    expect(navigator.clipboard.writeText).toHaveBeenCalledWith("ops@dispute-me.com");
  });

  it("says so when the clipboard is unavailable, instead of claiming success", async () => {
    Object.assign(navigator, {
      clipboard: { writeText: vi.fn().mockRejectedValue(new Error("blocked")) },
    });
    wrap(<CopyField label="Username" value="ops@dispute-me.com" />);
    fireEvent.click(screen.getByLabelText("Copy Username"));
    await waitFor(() =>
      expect(screen.getByText(/Could not copy/)).toBeTruthy(),
    );
    // The value is still on screen to select by hand.
    expect(screen.getByText("ops@dispute-me.com")).toBeTruthy();
  });
});

describe("CredentialPasswordField", () => {
  const props = { credentialId: "c1", hasSecret: true, mayReveal: true };

  it("does not fetch the password until it is asked for", () => {
    wrap(<CredentialPasswordField {...props} />);
    expect(reveal).not.toHaveBeenCalled();
    expect(screen.getByText("••••••••••••")).toBeTruthy();
  });

  it("fetches and shows it on request", async () => {
    reveal.mockResolvedValue("hunter2");
    wrap(<CredentialPasswordField {...props} />);
    fireEvent.click(screen.getByLabelText("Show password"));
    await waitFor(() => expect(screen.getByText("hunter2")).toBeTruthy());
    expect(reveal).toHaveBeenCalledWith("c1");
  });

  it("says the read is recorded, so nobody is surprised by the audit line", async () => {
    reveal.mockResolvedValue("hunter2");
    wrap(<CredentialPasswordField {...props} />);
    fireEvent.click(screen.getByLabelText("Show password"));
    await waitFor(() => expect(screen.getByText(/Recorded in the access log/)).toBeTruthy());
  });

  it("copies without ever displaying the characters", async () => {
    reveal.mockResolvedValue("hunter2");
    wrap(<CredentialPasswordField {...props} />);
    fireEvent.click(screen.getByLabelText("Copy password"));
    await waitFor(() => expect(screen.getByText("Copied")).toBeTruthy());
    expect(navigator.clipboard.writeText).toHaveBeenCalledWith("hunter2");
    expect(screen.queryByText("hunter2")).toBeNull();
  });

  it("reports a refusal in words, not as a blank field", async () => {
    reveal.mockRejectedValue(new Error("You may not see this partner's credentials"));
    wrap(<CredentialPasswordField {...props} />);
    fireEvent.click(screen.getByLabelText("Show password"));
    await waitFor(() =>
      expect(screen.getByText("You do not have access to passwords.")).toBeTruthy(),
    );
  });

  it("offers no reveal control at all without the capability", () => {
    wrap(<CredentialPasswordField {...props} mayReveal={false} />);
    expect(screen.queryByLabelText("Show password")).toBeNull();
    expect(screen.queryByLabelText("Copy password")).toBeNull();
    expect(screen.getByText(/you do not have access/i)).toBeTruthy();
  });

  it("distinguishes 'no password stored' from 'you may not see it'", () => {
    wrap(<CredentialPasswordField {...props} hasSecret={false} />);
    expect(screen.getByText(/None stored/)).toBeTruthy();
    expect(screen.queryByLabelText("Show password")).toBeNull();
  });

  it("hides the password again after a while", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    reveal.mockResolvedValue("hunter2");
    wrap(<CredentialPasswordField {...props} />);
    fireEvent.click(screen.getByLabelText("Show password"));
    await waitFor(() => expect(screen.getByText("hunter2")).toBeTruthy());
    await act(async () => {
      vi.advanceTimersByTime(31_000);
    });
    expect(screen.queryByText("hunter2")).toBeNull();
    vi.useRealTimers();
  });
});
