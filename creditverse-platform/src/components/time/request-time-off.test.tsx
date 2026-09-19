/**
 * Seven days' notice, said before somebody fills the form in.
 *
 * Dee, 2026-09-18: "DO NOT Allow Leave Submission 7 days before the leave
 * request date." The database enforces it (see leave-notice-probe.mjs); these
 * cover the half that decides whether anyone ever hits that refusal.
 */
import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { RequestTimeOffDialog } from "./RequestTimeOffDialog";
import { addDays, businessToday, isBusinessDay, nextBusinessDay } from "@/lib/calendar/us-federal-holidays";

/*
 * These used to pick dates with plain arithmetic on today, and broke overnight
 * when today became a Saturday: "today + 7" landed on a weekend, the form
 * correctly refused a request with no working days in it, and two tests failed
 * for a reason that had nothing to do with the notice rule.
 *
 * They now assert the INVARIANT — where the floor is, and that a range with
 * working days in it is accepted — using dates rolled onto business days. A
 * test that only passes from Monday to Thursday is a test that will cry wolf.
 */
const onBusinessDay = (date: string) => (isBusinessDay(date) ? date : nextBusinessDay(date));

const TYPES = [
  { id: "vac", label: "Vacation", paid: true, minNoticeDays: 7 },
  { id: "sick", label: "Sick leave", paid: true, minNoticeDays: 0 },
];

const open = (onSubmit = vi.fn()) => {
  render(<RequestTimeOffDialog types={TYPES} busy={false} error={null}
    onSubmit={onSubmit} onClose={vi.fn()} />);
  return onSubmit;
};

const setDate = (label: string, value: string) =>
  fireEvent.change(screen.getByLabelText(label), { target: { value } });

const submit = () => screen.getByRole("button", { name: /Submit request/ });

describe("the notice rule, before the form is filled in", () => {
  it("says the rule and the earliest date up front", () => {
    open();
    expect(screen.getByText(/needs at least 7 days' notice/)).toBeInTheDocument();
  });

  it("stops the date picker offering anything earlier", () => {
    /* The refusal a person never reaches is the best kind. */
    open();
    expect(screen.getByLabelText("First day away")).toHaveAttribute("min", addDays(businessToday(), 7));
  });

  it("refuses a start date inside the notice period, and says which date works", () => {
    open();
    setDate("First day away", addDays(businessToday(), 3));
    setDate("Last day away", addDays(businessToday(), 4));
    expect(screen.getByRole("alert")).toHaveTextContent(/inside the 7-day notice period/);
    expect(submit()).toBeDisabled();
  });

  it("accepts the seventh day", () => {
    /* The boundary, stated once so nobody has to guess whether it is 7 or 8.
       Rolled onto a business day: the seventh day may be a Saturday, and a
       request with no working days in it is refused for its own good reason. */
    const onSubmit = open();
    const start = onBusinessDay(addDays(businessToday(), 7));
    setDate("First day away", start);
    setDate("Last day away", start);
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    fireEvent.click(submit());
    expect(onSubmit).toHaveBeenCalledWith(expect.objectContaining({ startsOn: start }));
  });
});

describe("leave nobody can plan", () => {
  it("says nothing about notice for sick leave", () => {
    /* A flat seven days would mean sickness could never be filed at all — the
       first person who woke up unwell would find the form refusing them. */
    open();
    fireEvent.click(screen.getByLabelText("Leave type"));
    fireEvent.click(screen.getByText("Sick leave"));
    expect(screen.queryByText(/days' notice/)).not.toBeInTheDocument();
  });

  it("puts no floor under sick leave at all", () => {
    /* The invariant, rather than "can be filed on this particular date":
       sickness carries no notice, so the earliest day is TODAY — where for
       everything else it is today + 7. */
    open();
    fireEvent.click(screen.getByLabelText("Leave type"));
    fireEvent.click(screen.getByText("Sick leave"));
    expect(screen.getByLabelText("First day away")).toHaveAttribute("min", businessToday());
  });

  it("lets sick leave be filed for the day it happens", () => {
    const onSubmit = open();
    fireEvent.click(screen.getByLabelText("Leave type"));
    fireEvent.click(screen.getByText("Sick leave"));
    /* A weekend day is not a scheduled shift, so there is nothing to excuse —
       the form refuses a range with no working days in it, deliberately. */
    const day = onBusinessDay(businessToday());
    setDate("First day away", day);
    setDate("Last day away", day);
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    fireEvent.click(submit());
    expect(onSubmit).toHaveBeenCalledWith(expect.objectContaining({ startsOn: day }));
  });
});
