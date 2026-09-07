/**
 * What the operator must be told, and what they must never be told.
 */
import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { ImportQualityPanel } from "./ImportQualityPanel";
import type { CompletenessFact, ReconciliationCheck } from "@/lib/credit-report/completeness";

const passing: ReconciliationCheck[] = [
  { bureau: "EX", checkKey: "accounts", stated: 27, parsed: 27, ok: true },
  { bureau: "TU", checkKey: "accounts", stated: 27, parsed: 27, ok: true },
  { bureau: "EX", checkKey: "inquiries", stated: 1, parsed: 1, ok: true },
];
const short: ReconciliationCheck[] = [
  { bureau: "EX", checkKey: "accounts", stated: 27, parsed: 27, ok: true },
  { bureau: "TU", checkKey: "accounts", stated: 29, parsed: 27, ok: false, reason: "2 not read." },
];

describe("ImportQualityPanel", () => {
  it("says Complete when everything reconciled", () => {
    render(<ImportQualityPanel quality="complete" checks={passing} />);
    expect(screen.getByText("Complete")).toBeInTheDocument();
    expect(screen.getByText(/Every check passed/)).toBeInTheDocument();
  });

  /* Dee's example, rendered. */
  it("shows source expected, parsed, difference and reason per check", () => {
    render(<ImportQualityPanel quality="partial" checks={short} />);
    const row = screen.getByText("TransUnion accounts").closest("tr")!;
    expect(row.textContent).toContain("29");
    expect(row.textContent).toContain("27");
    expect(row.textContent).toContain("−2");
    expect(row.textContent).toContain("2 not read.");
  });

  it("shows the passing checks too, so agreement is visible", () => {
    render(<ImportQualityPanel quality="partial" checks={short} />);
    const row = screen.getByText("Experian accounts").closest("tr")!;
    expect(row.textContent).toContain("✓");
  });

  /* THE ASSERTION THIS PANEL EXISTS FOR. Six unparsed accounts must never read
     as six accounts the consumer does not have. */
  it("says plainly that nothing missing is deleted, absent or no longer reported", () => {
    render(<ImportQualityPanel quality="partial" checks={short} />);
    expect(screen.getByText(/Nothing missing is treated as deleted, absent,/i)).toBeInTheDocument();
    expect(screen.getByText(/items that did parse are workable/i)).toBeInTheDocument();
  });

  it("offers reparse, correction or a recorded reason — not a block", () => {
    render(<ImportQualityPanel quality="partial" checks={short} />);
    expect(screen.getByText(/Reparse, correct the source, or record a reason/i)).toBeInTheDocument();
  });

  it("says Review required when a section is missing", () => {
    render(<ImportQualityPanel quality="review_required" checks={[
      { checkKey: "section:summary", stated: 1, parsed: 0, ok: false, reason: "The summary section was not found." },
    ]} />);
    expect(screen.getByText("Review required")).toBeInTheDocument();
    expect(screen.getByText("Summary section")).toBeInTheDocument();
  });

  /* A source that states no counts is UNKNOWN, and the panel must not let that
     read as complete. */
  it("says completeness is not determined when nothing could be checked", () => {
    render(<ImportQualityPanel quality={null} checks={[]} />);
    expect(screen.getByText(/not determined/i)).toBeInTheDocument();
    expect(screen.getByText(/different from complete/i)).toBeInTheDocument();
    expect(screen.queryByText("Complete")).not.toBeInTheDocument();
  });

  it("shows 'not stated' rather than a zero where the source states no count", () => {
    render(<ImportQualityPanel quality="review_required" checks={[
      { bureau: "TU", checkKey: "accounts", parsed: 27, ok: false, reason: "The source states no count for this." },
    ]} />);
    const row = screen.getByText("TransUnion accounts").closest("tr")!;
    expect(row.textContent).toContain("not stated");
  });

  it("lists what the provider does not expose, and refuses to blame a bureau for it", () => {
    const facts: CompletenessFact[] = [
      { fieldKey: "dofd", state: "not_exposed_by_provider", reason: "SmartCredit does not expose dofd. This says nothing about whether a bureau reports it." },
    ];
    render(<ImportQualityPanel quality="complete" checks={passing} facts={facts} />);
    const block = screen.getByText(/Not exposed by this source/i).closest("div")!;
    expect(block.textContent).toContain("dofd");
    /* Split by a <strong>, so match on the container's own text. */
    expect(block.textContent).toMatch(/says nothing about whether a bureau reports them/i);
    expect(block.textContent).not.toMatch(/omit/i);
  });

  it("keeps other completeness facts separate from the not-exposed list", () => {
    render(<ImportQualityPanel quality="partial" checks={short} facts={[
      { fieldKey: "tradeline_block_1", state: "parse_failed", reason: "Account block 1 has no readable name." },
    ]} />);
    expect(screen.getByText("Also recorded")).toBeInTheDocument();
    expect(screen.getByText(/We could not read it/)).toBeInTheDocument();
  });

  /* Acceptance records a decision and changes no fact. */
  it("shows an acceptance without changing the verdict", () => {
    render(<ImportQualityPanel
      quality="partial"
      checks={short}
      acceptance={{ reason: "Client needs the round out today; the two missing accounts are positive.", acceptedAt: "2026-09-07T10:00:00Z" }}
    />);
    expect(screen.getByText("Partial")).toBeInTheDocument();
    expect(screen.getByText(/records a decision/i)).toBeInTheDocument();
    expect(screen.getByText(/analysis that needs a complete snapshot stays off/i)).toBeInTheDocument();
  });

  /* The database's verdict is authoritative; the computed one is only for a
     preview. A UI bug must not be able to upgrade a stored partial. */
  it("prefers the stored verdict over the one it could compute", () => {
    render(<ImportQualityPanel quality="partial" checks={passing} />);
    expect(screen.getByText("Partial")).toBeInTheDocument();
    expect(screen.queryByText("Complete")).not.toBeInTheDocument();
  });
});
