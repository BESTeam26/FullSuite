/**
 * The clock on Home: the state it shows, and the moves it offers.
 *
 * The rule under test is Dee's, 2026-09-21 — "only show actions valid for the
 * employee's current state. Do not show a collection of disabled buttons for
 * impossible actions" — plus the two safety properties: a punch in flight
 * cannot be sent twice, and a failed punch never renders as success.
 */
import { describe, expect, it, vi, beforeEach } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { ClockCard } from "./ClockCard";
import type { TimeEntry } from "@/lib/data/time-entries";

let sheet: Record<string, unknown>;
let membership: Record<string, unknown> | null;
let schedules: Record<string, unknown>[];
const clockIn = vi.fn(), clockOut = vi.fn(), startBreak = vi.fn(), resumeWork = vi.fn();

vi.mock("@/lib/auth/auth-context", () => ({
  useAuth: () => ({ agencyMembership: membership, user: { id: "u1" } }),
}));
vi.mock("@/lib/data/use-time", () => ({ useTimesheet: () => sheet }));
vi.mock("@/lib/data/use-people", () => ({ useSchedules: () => ({ data: schedules }) }));

const entry = (kind: TimeEntry["kind"]): TimeEntry => ({
  id: "t1", employeeId: "u1", divisionId: "creditops", kind,
  startedAt: new Date(Date.now() - 20 * 60_000).toISOString(),
  endedAt: null, durationMinutes: null, workDate: "2026-09-21",
  taskNote: null, partnerGroupId: null, clientId: null, organizationId: null,
  autoStopped: false,
} as unknown as TimeEntry);

const base = {
  openEntry: undefined as TimeEntry | undefined,
  entries: [] as TimeEntry[],
  today: "2026-09-21",
  todayMinutes: 0,
  isMutating: false,
  actionError: null as string | null,
  clockIn, clockOut, startBreak, resumeWork,
};

beforeEach(() => {
  membership = { time_tracking_required: true };
  schedules = [{ userId: "u1", breakMinutes: 30, lunchMinutes: 60 }];
  sheet = { ...base };
  [clockIn, clockOut, startBreak, resumeWork].forEach((m) => m.mockClear());
});

const show = () => render(<MemoryRouter><ClockCard /></MemoryRouter>);

describe("only the moves that exist", () => {
  it("clocked out offers Clock in, and nothing else", () => {
    show();
    expect(screen.getByRole("button", { name: /Clock in/ })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /break/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Clock out/ })).not.toBeInTheDocument();
  });

  it("working offers break, lunch and clock out — not 'back to work'", () => {
    sheet = { ...base, openEntry: entry("work") };
    show();
    expect(screen.getByRole("button", { name: /Start break/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Start lunch/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Clock out/ })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Back to work/ })).not.toBeInTheDocument();
  });

  it("on break the only move is back to work", () => {
    sheet = { ...base, openEntry: entry("break") };
    show();
    expect(screen.getByText("On break")).toBeInTheDocument();
    expect(screen.getAllByRole("button")).toHaveLength(1);
    expect(screen.getByRole("button", { name: /Back to work/ })).toBeInTheDocument();
  });

  it("on lunch says lunch, not break", () => {
    sheet = { ...base, openEntry: entry("lunch") };
    show();
    expect(screen.getByText("On lunch")).toBeInTheDocument();
  });
});

describe("a punch cannot be sent twice", () => {
  it("every action is disabled while one is in flight, and says so", () => {
    sheet = { ...base, openEntry: entry("work"), isMutating: true };
    show();
    const buttons = screen.getAllByRole("button");
    expect(buttons.length).toBeGreaterThan(0);
    for (const b of buttons) expect(b).toBeDisabled();
    expect(screen.getAllByText("Working…").length).toBe(buttons.length);
  });

  it("a disabled button sends nothing when tapped again", () => {
    sheet = { ...base, isMutating: true };
    show();
    fireEvent.click(screen.getByRole("button"));
    expect(clockIn).not.toHaveBeenCalled();
  });
});

describe("a failed punch says so", () => {
  it("shows the error and keeps the old state rather than pretending", () => {
    sheet = { ...base, actionError: "You are already clocked in. Clock out first." };
    show();
    expect(screen.getByRole("alert")).toHaveTextContent("already clocked in");
    /* Still offering Clock in: the state did not change, so the card does not
       pretend it did. */
    expect(screen.getByRole("button", { name: /Clock in/ })).toBeInTheDocument();
  });
});

describe("who sees a clock at all", () => {
  it("an organization user has no agency clock", () => {
    membership = null;
    const { container } = show();
    expect(container).toBeEmptyDOMElement();
  });

  it("somebody exempt who has not punched today sees nothing", () => {
    membership = { time_tracking_required: false };
    const { container } = show();
    expect(container).toBeEmptyDOMElement();
  });

  it("…but an exempt person who IS on the clock still sees it — exempt means not required, not forbidden", () => {
    membership = { time_tracking_required: false };
    sheet = { ...base, openEntry: entry("lunch") };
    show();
    expect(screen.getByText("On lunch")).toBeInTheDocument();
  });
});
