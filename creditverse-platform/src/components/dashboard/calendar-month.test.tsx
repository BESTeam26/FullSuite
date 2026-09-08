import { describe, expect, it, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { CalendarMonth, type MonthEntry } from "./CalendarMonth";

const entry = (over: Partial<MonthEntry> & { id: string; day: string }): MonthEntry => ({
  title: "Round 2 dispute prep",
  href: "/app/my-work",
  overdue: false,
  kindLabel: "Work item due",
  kindTone: "bg-amber-500/10",
  kindDot: "bg-amber-500",
  ...over,
});

const show = (props: Partial<React.ComponentProps<typeof CalendarMonth>> = {}) =>
  render(
    <MemoryRouter>
      <CalendarMonth
        year={2026}
        month={8}
        today="2026-09-08"
        selected={null}
        entries={[]}
        onMonth={() => {}}
        onSelect={() => {}}
        {...props}
      />
    </MemoryRouter>,
  );

describe("the month grid", () => {
  it("draws every day of the month", () => {
    show();
    /* September 2026 has 30 days, and the grid borrows a few either side, so
       the 30th must be present and clickable. */
    expect(screen.getByLabelText(/Sep 30, 2026/)).toBeTruthy();
  });

  it("says what a day holds in its accessible name, including nothing", () => {
    show({ entries: [entry({ id: "a", day: "2026-09-10" })] });
    expect(screen.getByLabelText(/Sep 10, 2026, 1 item/)).toBeTruthy();
    expect(screen.getByLabelText(/Sep 11, 2026, nothing due/)).toBeTruthy();
  });

  it("never hides entries without saying how many", () => {
    const many = Array.from({ length: 6 }, (_, i) => entry({ id: `e${i}`, day: "2026-09-10", title: `Item ${i}` }));
    show({ entries: many });
    /* Three chips, then the count of the rest — not a silent truncation. */
    expect(screen.getByText("+3 more")).toBeTruthy();
  });

  it("marks today without relying on colour alone", () => {
    show();
    const today = screen.getByLabelText(/Sep 8, 2026/);
    expect(today.className).toContain("border-primary");
  });

  it("keeps a selected day readable rather than stacking treatments", () => {
    /* The failure this guards: a selected TODAY in another month, where three
       backgrounds and a muted foreground stack and the number vanishes. One
       decision picks the surface, and it sets its own foreground. */
    show({ selected: "2026-09-08" });
    const cell = screen.getByLabelText(/Sep 8, 2026/);
    expect(cell.className).toContain("text-foreground");
    expect(cell.className).not.toContain("text-muted-foreground");
    expect(cell.getAttribute("aria-pressed")).toBe("true");
  });

  it("dims a borrowed day from the next month but keeps it legible", () => {
    show();
    const borrowed = screen.getByLabelText(/Oct 1, 2026/);
    expect(borrowed.className).toContain("text-muted-foreground");
  });

  it("opens the day panel on click and closes it on a second click", () => {
    const onSelect = vi.fn();
    show({ entries: [entry({ id: "a", day: "2026-09-10" })], onSelect });
    fireEvent.click(screen.getByLabelText(/Sep 10, 2026/));
    expect(onSelect).toHaveBeenCalledWith("2026-09-10");
    onSelect.mockClear();
    show({ selected: "2026-09-10", entries: [entry({ id: "a", day: "2026-09-10" })], onSelect });
    fireEvent.click(screen.getAllByLabelText(/Sep 10, 2026/)[1]);
    expect(onSelect).toHaveBeenCalledWith(null);
  });

  it("shows the whole day in the panel, so nothing is only in a clipped cell", () => {
    const many = Array.from({ length: 6 }, (_, i) => entry({ id: `e${i}`, day: "2026-09-10", title: `Item ${i}` }));
    show({ selected: "2026-09-10", entries: many });
    for (let i = 0; i < 6; i += 1) expect(screen.getAllByText(`Item ${i}`).length).toBeGreaterThan(0);
  });

  it("says so when a selected day holds nothing", () => {
    show({ selected: "2026-09-11" });
    expect(screen.getByText("Nothing due on this day.")).toBeTruthy();
  });

  it("pages months and jumps back to today", () => {
    const onMonth = vi.fn();
    show({ onMonth });
    fireEvent.click(screen.getByLabelText("Next month"));
    expect(onMonth).toHaveBeenCalledWith(1);
    fireEvent.click(screen.getByLabelText("Previous month"));
    expect(onMonth).toHaveBeenCalledWith(-1);
    fireEvent.click(screen.getByText("Today"));
    expect(onMonth).toHaveBeenCalledWith(0);
  });

  it("scrolls the grid inside its own container, never the page", () => {
    /* Rule 8: wide content scrolls in its own overflow-x container so the
       layout never scrolls sideways. */
    const { container } = show();
    expect(container.querySelector(".overflow-x-auto")).toBeTruthy();
  });
});
