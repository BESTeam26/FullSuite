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
import { addDays, businessToday } from "@/lib/calendar/us-federal-holidays";

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
    /* The boundary, stated once so nobody has to guess whether it is 7 or 8. */
    const onSubmit = open();
    setDate("First day away", addDays(businessToday(), 7));
    setDate("Last day away", addDays(businessToday(), 8));
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    fireEvent.click(submit());
    expect(onSubmit).toHaveBeenCalled();
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

  it("lets sick leave be filed for today", () => {
    const onSubmit = open();
    fireEvent.click(screen.getByLabelText("Leave type"));
    fireEvent.click(screen.getByText("Sick leave"));
    setDate("First day away", businessToday());
    setDate("Last day away", businessToday());
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    fireEvent.click(submit());
    expect(onSubmit).toHaveBeenCalledWith(expect.objectContaining({ startsOn: businessToday() }));
  });
});
