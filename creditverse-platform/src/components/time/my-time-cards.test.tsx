/**
 * The redesigned My Time, at the states that matter.
 *
 * These are presentational components on purpose — no query client, no hooks
 * to mock. The rule this file exists to hold is the one a redesign is most
 * likely to lose: an agent never writes or edits their own time.
 */
import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { TimerCard } from "./TimerCard";
import { TodayTimeline } from "./TodayTimeline";
import { WeekChart } from "./WeekChart";
import { StartWorkCard } from "./StartWorkCard";
import { todayTimeline, weekBars } from "@/lib/time/my-time-view";
import type { TimeEntry } from "@/lib/data/time-entries";

const NOW = new Date("2026-09-17T18:30:00.000Z");

const entry = (over: Partial<TimeEntry> = {}): TimeEntry => ({
  id: "e1", divisionId: "creditops", workDate: "2026-09-17",
  startedAt: "2026-09-17T18:14:00.000Z", durationMinutes: undefined,
  autoStopped: false, kind: "work", ...over,
});

const noop = () => undefined;

describe("the running timer", () => {
  const card = (over: Partial<TimeEntry> = {}) =>
    render(<TimerCard entry={entry(over)} now={NOW} partnerName="Credit by Nainoa"
      busy={false} onStop={noop} onBreak={noop} onLunch={noop} onResume={noop} />);

  it("says what is being worked on, for whom", () => {
    card({ taskNote: "Client Review" });
    expect(screen.getByText("Client Review")).toBeInTheDocument();
    expect(screen.getByText("CreditOps")).toBeInTheDocument();
    expect(screen.getByText("Credit by Nainoa")).toBeInTheDocument();
  });

  it("counts from when it started", () => {
    card();
    expect(screen.getByText("00:16:00")).toBeInTheDocument();
    expect(screen.getByText(/Started at/)).toBeInTheDocument();
  });

  it("falls back to the division when there is no note, never to a blank", () => {
    card({ taskNote: undefined });
    expect(screen.getAllByText("CreditOps").length).toBeGreaterThan(0);
  });

  it("stops on one press", () => {
    const onStop = vi.fn();
    render(<TimerCard entry={entry()} now={NOW} partnerName={null} busy={false}
      onStop={onStop} onBreak={noop} onLunch={noop} onResume={noop} />);
    fireEvent.click(screen.getByRole("button", { name: /Stop timer/ }));
    expect(onStop).toHaveBeenCalled();
  });

  it("offers break and lunch, and says they are not worked time", () => {
    /* The distinction is governance, not styling: rest never counts toward
       pay or production, and the menu says so where the choice is made. */
    card();
    fireEvent.click(screen.getByRole("button", { name: "Timer options" }));
    expect(screen.getByText("Take a break")).toBeInTheDocument();
    expect(screen.getByText("Go to lunch")).toBeInTheDocument();
    expect(screen.getAllByText(/Counted as rest, not as worked time/)).toHaveLength(2);
  });

  it("shows a break as a break, and offers the way back", () => {
    card({ kind: "break" });
    expect(screen.getByText("On break")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Timer options" }));
    expect(screen.getByText("Back to work")).toBeInTheDocument();
    expect(screen.queryByText("Take a break")).not.toBeInTheDocument();
  });

  it("cannot be operated while a write is in flight", () => {
    render(<TimerCard entry={entry()} now={NOW} partnerName={null} busy
      onStop={noop} onBreak={noop} onLunch={noop} onResume={noop} />);
    expect(screen.getByRole("button", { name: /Stop timer/ })).toBeDisabled();
  });
});

describe("today", () => {
  const rows = todayTimeline([
    entry({ id: "a", taskNote: "Client Review", startedAt: "2026-09-17T13:03:00.000Z", endedAt: "2026-09-17T14:21:00.000Z", durationMinutes: 78 }),
    entry({ id: "b", kind: "lunch", startedAt: "2026-09-17T15:00:00.000Z", endedAt: "2026-09-17T15:43:00.000Z", durationMinutes: 43 }),
    entry({ id: "c", taskNote: "Support Follow-up", startedAt: "2026-09-17T18:14:00.000Z" }),
  ], "2026-09-17", NOW);

  const timeline = (action = () => null as React.ReactNode) =>
    render(<TodayTimeline rows={rows} partnerNameOf={() => "Business Made Fair"} action={action} />);

  it("shows each entry as a span with its length", () => {
    timeline();
    expect(screen.getByText("1h 18m")).toBeInTheDocument();
    expect(screen.getByText(/– Running$/)).toBeInTheDocument();
  });

  it("marks rest as rest rather than as work", () => {
    timeline();
    expect(screen.getByText("Lunch")).toBeInTheDocument();
    expect(screen.getByText("Counted as rest, not worked time")).toBeInTheDocument();
  });

  it("has no control that edits an entry in place", () => {
    /* Dee's mockup shows "+ Add time". It is deliberately not built: an agent
       never writes or edits their own time — a lead approves an adjustment. */
    timeline();
    expect(screen.queryByText(/Add time/i)).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /^Edit/ })).not.toBeInTheDocument();
  });

  it("offers the adjustment control the page passes in, and not on a running entry", () => {
    const action = vi.fn(() => <span>Request adjustment</span>);
    render(<TodayTimeline rows={rows} partnerNameOf={() => null} action={action} />);
    expect(action).toHaveBeenCalledTimes(3);
  });

  it("flags an entry the system stopped at the cap", () => {
    const capped = todayTimeline([entry({ autoStopped: true, endedAt: "2026-09-17T18:20:00.000Z", durationMinutes: 600 })], "2026-09-17", NOW);
    render(<TodayTimeline rows={capped} partnerNameOf={() => null} action={() => null} />);
    expect(screen.getByText(/auto-stopped at the cap/)).toBeInTheDocument();
  });

  it("says so plainly when nothing has been tracked", () => {
    render(<TodayTimeline rows={[]} partnerNameOf={() => null} action={() => null} />);
    expect(screen.getByText(/Nothing tracked today yet/)).toBeInTheDocument();
  });
});

describe("the week chart", () => {
  const bars = weekBars([
    entry({ workDate: "2026-09-14", durationMinutes: 462, endedAt: "x" }),
    entry({ workDate: "2026-09-17", durationMinutes: 384, endedAt: "x" }),
  ], "2026-09-14", "2026-09-17", NOW);

  it("draws all seven days", () => {
    render(<WeekChart bars={bars} today="2026-09-17" />);
    for (const d of ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]) {
      expect(screen.getByText(d)).toBeInTheDocument();
    }
  });

  it("is readable without seeing it", () => {
    render(<WeekChart bars={bars} today="2026-09-17" />);
    expect(screen.getByRole("img").getAttribute("aria-label")).toContain("Mon 7h 42m");
  });
});

describe("starting work", () => {
  const recent = [
    { key: "k1", title: "Support Follow-up", divisionId: "talentops", partnerGroupId: "p1", taskNote: "Support Follow-up" },
    { key: "k2", title: "Admin", divisionId: "talentops", partnerGroupId: "p2", taskNote: "Admin" },
  ];
  const card = (over: { disabled?: boolean; onStart?: (r: unknown) => void } = {}) =>
    render(<StartWorkCard recent={recent} partners={[{ id: "p1", name: "Business Made Fair" }]}
      partnerNameOf={(id) => (id === "p1" ? "Business Made Fair" : id ? "K&A Consulting" : null)}
      disabled={over.disabled ?? false} busy={false} onStart={over.onStart ?? noop} />);

  it("offers recent work as one click", () => {
    const onStart = vi.fn();
    card({ onStart });
    fireEvent.click(screen.getByText("Support Follow-up").closest("button")!);
    expect(onStart).toHaveBeenCalledWith({
      divisionId: "talentops", partnerGroupId: "p1", taskNote: "Support Follow-up",
    });
  });

  it("filters what it offers, including by partner", () => {
    card();
    fireEvent.change(screen.getByLabelText("Search your recent work"), { target: { value: "K&A" } });
    expect(screen.getByText("Admin")).toBeInTheDocument();
    expect(screen.queryByText("Support Follow-up")).not.toBeInTheDocument();
  });

  it("says so rather than showing an empty area when nothing matches", () => {
    card();
    fireEvent.change(screen.getByLabelText("Search your recent work"), { target: { value: "zzz" } });
    expect(screen.getByText(/Nothing you have tracked matches that/)).toBeInTheDocument();
  });

  it("refuses to start visibly when time cannot be written", () => {
    /* A clock-in that silently does nothing is worse than a disabled button. */
    card({ disabled: true });
    expect(screen.getByText("Support Follow-up").closest("button")).toBeDisabled();
  });

  it("lets somebody pick a division and partner by hand", () => {
    card();
    fireEvent.click(screen.getByRole("button", { name: /Choose manually/ }));
    expect(screen.getByLabelText("Division")).toBeInTheDocument();
    expect(screen.getByLabelText("Partner this time is for")).toBeInTheDocument();
  });
});
