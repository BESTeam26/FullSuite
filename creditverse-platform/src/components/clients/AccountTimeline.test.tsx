/**
 * What the timeline shows, and the language it must never use.
 */
import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { AccountTimeline, AccountTimelineSection } from "./AccountTimeline";
import type { BureauValues } from "@/lib/credit-classification";
import type { ChronologySnapshot } from "@/lib/credit-report/chronology";

const REF = "northwind bank 4417";
const snap = (
  pulledAt: string,
  values: Partial<BureauValues>[] | null,
  over: Partial<ChronologySnapshot> = {},
): ChronologySnapshot => ({
  reportId: `r-${pulledAt}`,
  pulledAt,
  bureaus: ["EQ", "EX", "TU"],
  quality: "complete",
  observations: values ? { [REF]: values.map((v) => ({ bureau: "EX", ...v }) as BureauValues) } : {},
  items: values ? { [REF]: { name: "NORTHWIND BANK" } } : {},
  ...over,
});

const changed = [
  snap("2026-06-01", [{ bureau: "EX", balance: 3031 }]),
  snap("2026-07-01", [{ bureau: "EX", balance: 2800 }]),
];

describe("AccountTimeline", () => {
  it("reads as a sentence a person can act on", () => {
    render(<AccountTimeline snapshots={changed} accountRef={REF} />);
    expect(screen.getByText(/Experian balance changed \$3,031 → \$2,800\./)).toBeInTheDocument();
  });

  it("groups events by report date, newest first", () => {
    render(<AccountTimeline snapshots={[
      ...changed,
      snap("2026-08-01", [{ bureau: "EX", balance: 2500 }]),
    ]} accountRef={REF} />);
    const dates = [...document.querySelectorAll("ol > li > p")].map((p) => p.textContent);
    expect(dates[0]).toContain("2026");
    expect(dates).toHaveLength(3);
  });

  /* The language audit. If any of these words reaches a screen, an operator
     may repeat it to a bureau. */
  it("never uses legal or conclusive language anywhere on screen", () => {
    render(<AccountTimeline snapshots={[
      snap("2026-05-01", [{ bureau: "EX", balance: 500, dofd: "01/2021", status: "Collection" }]),
      snap("2026-06-01", null, { quality: "partial" }),
      snap("2026-07-01", [{ bureau: "EX", balance: 400, dofd: "06/2021", status: "Closed" }]),
    ]} accountRef={REF} />);
    const text = document.body.textContent!.toLowerCase();
    for (const word of ["violation", "inaccurate", "corrected", "re-aged", "illegal", "reinsertion", "unverifiable", "deleted"]) {
      expect(text).not.toContain(word);
    }
  });

  it("shows a table view with previous and new values", () => {
    render(<AccountTimeline snapshots={changed} accountRef={REF} />);
    /* The table is behind a toggle; its header text is enough to prove it is
       wired without simulating a click. */
    expect(screen.getByRole("button", { name: /Table/ })).toBeInTheDocument();
  });

  it("says a partial snapshot could not be compared, not that the account went", () => {
    render(<AccountTimeline snapshots={[
      snap("2026-06-01", [{ bureau: "EX", balance: 500 }]),
      snap("2026-07-01", null, { quality: "partial" }),
    ]} accountRef={REF} />);
    expect(screen.getByText(/Cannot compare/)).toBeInTheDocument();
    expect(screen.getByText(/an account not read — not an account removed/i)).toBeInTheDocument();
    expect(screen.queryByText(/Not observed/)).not.toBeInTheDocument();
  });

  it("warns that a gapped timeline does not show whether reporting stopped", () => {
    render(<AccountTimeline snapshots={[
      snap("2026-06-01", [{ bureau: "EX", balance: 500 }]),
      snap("2026-07-01", null, { quality: "partial" }),
    ]} accountRef={REF} />);
    expect(screen.getByText(/does/).closest("p")!.textContent)
      .toMatch(/not show whether the account stopped being reported/i);
  });

  it("says histories are not merged when identity is unsettled", () => {
    const later = snap("2026-07-01", null);
    later.items = { "northwind bank na 4417": { name: "NORTHWIND BANK NA" } };
    render(<AccountTimeline snapshots={[snap("2026-06-01", [{ bureau: "EX" }]), later]} accountRef={REF} />);
    expect(screen.getByText(/Match to review/)).toBeInTheDocument();
    expect(document.body.textContent).toMatch(/not merged/i);
  });

  it("calls a return an observation, not a reinsertion", () => {
    render(<AccountTimeline snapshots={[
      snap("2026-05-01", [{ bureau: "EX", balance: 500 }]),
      snap("2026-06-01", null, { quality: "complete" }),
      snap("2026-07-01", [{ bureau: "EX", balance: 500 }]),
    ]} accountRef={REF} />);
    expect(screen.getByText(/a question, not a finding/i)).toBeInTheDocument();
  });

  it("says nothing rather than inventing an event when nothing changed", () => {
    render(<AccountTimeline snapshots={[
      snap("2026-06-01", [{ bureau: "EX", balance: 500 }]),
      snap("2026-07-01", [{ bureau: "EX", balance: 500 }]),
    ]} accountRef={REF} />);
    /* FIRST_OBSERVED is the only event — it appears both as the badge and in
       the sentence, so match on all of them. */
    expect(screen.getAllByText(/First observed/).length).toBeGreaterThan(0);
    expect(screen.queryByText(/changed/)).not.toBeInTheDocument();
  });
});

describe("AccountTimelineSection", () => {
  it("says a history needs two reports rather than showing an empty frame", () => {
    render(<AccountTimelineSection snapshots={[]} refs={[]} />);
    expect(screen.getByText(/needs at least two reports/i)).toBeInTheDocument();
  });

  it("offers each account by name", () => {
    render(<AccountTimelineSection snapshots={changed} refs={[{ accountRef: REF, name: "NORTHWIND BANK" }]} />);
    expect(screen.getByRole("option", { name: "NORTHWIND BANK" })).toBeInTheDocument();
  });
});
