/**
 * Which file Complete & Next Client hands somebody.
 *
 * The button's whole promise is that the next screen is the right next piece
 * of work. Two ways that quietly breaks: handing back the file just finished,
 * and ignoring the due dates every other queue is ordered by.
 */
import { describe, expect, it } from "vitest";
import { pickNext, type NextClient } from "./use-next-client";

const f = (clientId: string, department: string, dueAt: string | null): NextClient => ({
  clientId, department, dueAt, clientName: clientId,
});

describe("the next client", () => {
  it("is the most urgent one that is not the file just finished", () => {
    const queue = [
      f("a", "Dispute", "2026-09-24T00:00:00Z"),
      f("b", "Support", "2026-09-26T00:00:00Z"),
    ];
    expect(pickNext(queue, "a")?.clientId).toBe("b");
  });

  it("never hands back the same client through a different department", () => {
    /* A client can sit in two departments at once — Dee's queue doctrine, and
       exactly what happens when Dispute hands on to Complaints. Matching by
       ROW rather than by client would send somebody straight back to the file
       they had just completed. */
    const queue = [
      f("a", "Dispute", "2026-09-24T00:00:00Z"),
      f("a", "Complaints", "2026-09-25T00:00:00Z"),
      f("b", "Support", "2026-09-26T00:00:00Z"),
    ];
    expect(pickNext(queue, "a")?.clientId).toBe("b");
  });

  it("is nothing when the queue holds only the file just finished", () => {
    /* Not an error and not a loop: the panel simply closes on a finished
       file, and the button says "Complete Work" rather than promising a next
       one that does not exist. */
    expect(pickNext([f("a", "Dispute", null)], "a")).toBeNull();
  });

  it("is nothing when there is no queue at all", () => {
    expect(pickNext([], "a")).toBeNull();
  });

  it("takes the order it is given, which the database sorts by due date", () => {
    /* The ordering is the view's — soonest first, undated last — so that the
       button and every other queue read the same priorities. This pins that
       the picker does not re-sort and quietly invent a second order. */
    const queue = [f("late", "Dispute", null), f("soon", "Dispute", "2026-09-24T00:00:00Z")];
    expect(pickNext(queue, "x")?.clientId).toBe("late");
  });
});
