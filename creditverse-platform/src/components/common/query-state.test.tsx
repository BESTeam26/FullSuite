/**
 * A failed request must never be reported as an empty account.
 *
 * Dee, 2026-09-16: *"A failed API call must not render as '0 results' unless
 * zero is actually known."* The regression these guard is one character wide —
 * `query.data ?? []` followed by a length check — and it has already shipped
 * once, as the Partner-folder PostgREST error that rendered as empty folders.
 *
 * So these assert the DISTINCTION, not the wording: pending, failed and
 * genuinely-empty must each produce something different from the other two.
 */
import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { PageLoadError, PanelState } from "@/components/common/QueryState";
import { hasRows } from "@/lib/ui/query-rows";

const EMPTY = <p>You&apos;re all caught up.</p>;
const pending = { isPending: true, isError: false, data: undefined };
const failed = { isPending: false, isError: true, data: undefined };
const empty = { isPending: false, isError: false, data: [] };
const loaded = { isPending: false, isError: false, data: [{ id: 1 }] };

describe("hasRows", () => {
  it("is false while the request is still in flight", () => {
    expect(hasRows(pending)).toBe(false);
  });

  it("is false when the request failed", () => {
    expect(hasRows(failed)).toBe(false);
  });

  it("is false when the answer really is none", () => {
    expect(hasRows(empty)).toBe(false);
  });

  it("is true only once rows have actually arrived", () => {
    expect(hasRows(loaded)).toBe(true);
  });

  it("refuses a non-array payload rather than guessing", () => {
    expect(hasRows({ isPending: false, isError: false, data: { id: 1 } })).toBe(false);
  });
});

describe("PanelState", () => {
  it("shows the empty message only when the query came back with nothing", () => {
    render(<PanelState query={empty} empty={EMPTY} />);
    expect(screen.getByText(/all caught up/i)).toBeInTheDocument();
  });

  it("does NOT claim the account is empty when the request failed", () => {
    render(<PanelState query={failed} empty={EMPTY} />);
    expect(screen.queryByText(/all caught up/i)).not.toBeInTheDocument();
    expect(screen.getByText(/could not be loaded/i)).toBeInTheDocument();
  });

  it("says a failure is about reaching BES, not about their account", () => {
    render(<PanelState query={failed} empty={EMPTY} />);
    expect(screen.getByText(/not a change to your account/i)).toBeInTheDocument();
  });

  it("does NOT claim the account is empty while still loading", () => {
    render(<PanelState query={pending} empty={EMPTY} />);
    expect(screen.queryByText(/all caught up/i)).not.toBeInTheDocument();
    expect(screen.getByText(/loading/i)).toBeInTheDocument();
  });
});

describe("PageLoadError", () => {
  it("names what failed, so a partner knows which part of the page is missing", () => {
    render(<PageLoadError what="Your clients" />);
    expect(screen.getByText(/your clients could not be loaded/i)).toBeInTheDocument();
  });

  it("is announced rather than drawn silently", () => {
    render(<PageLoadError what="Your agreements" />);
    expect(screen.getByRole("status")).toBeInTheDocument();
  });
});
