/**
 * What a person sees on My Work on a phone.
 *
 * The page itself is empty for anybody with nothing assigned — which is the
 * correct answer and proves nothing about the list — so the rendering is
 * asserted here against a spread of items instead.
 */
import { describe, expect, it } from "vitest";
import { render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import type { WorkItem } from "@/lib/bes-domain";
import { MyWorkCards } from "./MyWorkCards";

const item = (over: Partial<WorkItem>): WorkItem => ({
  id: "w", scope: "AGENCY", relatedType: "project", relatedId: "p1",
  title: "Task", stage: "Assigned", createdAt: "2026-09-01T00:00:00Z", ...over,
});

/* Dates relative to now, so the test does not rot on a fixed calendar. */
const inDays = (n: number) => new Date(Date.now() + n * 86_400_000).toISOString();

const show = (items: WorkItem[]) =>
  render(
    <MemoryRouter>
      <MyWorkCards items={items} divisionOf={() => "BES CRM"} />
    </MemoryRouter>,
  );

describe("My Work on a phone", () => {
  it("puts overdue work first and waiting work last, each headed and counted", () => {
    show([
      item({ id: "a", title: "Later thing", dueAt: inDays(9) }),
      item({ id: "b", title: "Late thing", dueAt: inDays(-2) }),
      item({ id: "c", title: "Blocked thing", stage: "Blocked" }),
    ]);
    const headings = screen.getAllByRole("heading", { level: 3 }).map((h) => h.textContent);
    expect(headings[0]).toContain("Overdue");
    expect(headings.at(-1)).toContain("Waiting on someone else");
  });

  it("says when work is due in words, not in hours", () => {
    show([item({ id: "a", title: "Tomorrow thing", dueAt: inDays(1) })]);
    expect(screen.getByText("Due tomorrow")).toBeInTheDocument();
    expect(screen.queryByText(/SLA/i)).not.toBeInTheDocument();
  });

  it("says so plainly when nothing has a due date rather than showing a dash", () => {
    show([item({ id: "a", title: "Undated" })]);
    expect(screen.getByText("No due date")).toBeInTheDocument();
  });

  it("opens the record in one tap — the whole card is the link", () => {
    show([item({ id: "a", title: "Client file", relatedType: "fulfillment", relatedId: "c1" })]);
    const link = screen.getByRole("link", { name: /Client file/ });
    expect(link).toHaveAttribute("href", "/app/creditops?client=c1");
  });

  it("a workspace task opens its workspace", () => {
    show([item({ id: "a", title: "Workspace task", workspaceId: "ws1" })]);
    expect(screen.getByRole("link", { name: /Workspace task/ })).toHaveAttribute("href", "/app/talentops?ws=ws1");
  });

  it("does not render a link when there is no record to open", () => {
    show([item({ id: "a", title: "Nowhere", relatedType: "support", relatedId: "" })]);
    expect(screen.getByText("Nowhere")).toBeInTheDocument();
    expect(screen.queryByRole("link")).not.toBeInTheDocument();
  });

  it("keeps completed work off the list entirely", () => {
    show([
      item({ id: "a", title: "Done thing", completedAt: new Date().toISOString() }),
      item({ id: "b", title: "Open thing" }),
    ]);
    expect(screen.queryByText("Done thing")).not.toBeInTheDocument();
    expect(screen.getByText("Open thing")).toBeInTheDocument();
  });

  it("every card is a thumb-sized target", () => {
    show([item({ id: "a", title: "Tap me", relatedType: "fulfillment", relatedId: "c1" })]);
    expect(screen.getByRole("link", { name: /Tap me/ }).className).toContain("min-h-[64px]");
  });

  it("groups the waiting item under its own heading, away from the day's work", () => {
    show([
      item({ id: "a", title: "Do this", dueAt: inDays(0) }),
      item({ id: "b", title: "Wait for that", stage: "Blocked" }),
    ]);
    const waiting = screen.getByRole("region", { name: "Waiting on someone else" });
    expect(within(waiting).getByText("Wait for that")).toBeInTheDocument();
    expect(within(waiting).queryByText("Do this")).not.toBeInTheDocument();
  });
});
