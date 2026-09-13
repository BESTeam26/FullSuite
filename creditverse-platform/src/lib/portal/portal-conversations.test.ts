import { describe, expect, it } from "vitest";
import {
  PORTAL_TOPICS, topicsFor, topicsToShow,
} from "@/lib/portal/portal-conversations";

const keys = (t: { key: string }[]) => t.map((x) => x.key);

describe("which conversations a partner is offered", () => {
  it("always offers General and Support, even with nothing running", () => {
    expect(keys(topicsFor([]))).toEqual(["general", "support"]);
  });

  it("offers CreditOps to a partner with a live CreditOps engagement", () => {
    expect(keys(topicsFor(["creditops"]))).toEqual(["general", "creditops", "support"]);
  });

  it("offers Marketing only to a partner who buys marketing", () => {
    expect(keys(topicsFor(["bes_crm"]))).toEqual(["general", "support"]);
    expect(keys(topicsFor(["sales_marketing"]))).toContain("marketing");
  });

  it("keeps the order of the menu stable whatever the services are", () => {
    const order = PORTAL_TOPICS.map((t) => t.key);
    for (const live of [[], ["creditops"], ["sales_marketing"], ["creditops", "sales_marketing"]]) {
      const shown = keys(topicsFor(live));
      expect(shown).toEqual(order.filter((k) => shown.includes(k)));
    }
  });

  it("every topic says what it is for", () => {
    for (const t of PORTAL_TOPICS) {
      expect(t.label.length).toBeGreaterThan(0);
      expect(t.purpose.length).toBeGreaterThan(0);
    }
  });
});

describe("a conversation that exists is never hidden", () => {
  it("keeps Marketing after the marketing engagement ends", () => {
    /* The engagement is gone; the conversation and its history are not. */
    expect(keys(topicsToShow([], ["general", "marketing"]))).toContain("marketing");
  });

  it("does not invent one that neither exists nor is relevant", () => {
    expect(keys(topicsToShow([], ["general"]))).toEqual(["general", "support"]);
  });

  it("shows a relevant topic before anybody has written in it", () => {
    expect(keys(topicsToShow(["creditops"], []))).toContain("creditops");
  });
});
