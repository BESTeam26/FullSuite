import { describe, expect, it } from "vitest";
import {
  PORTAL_TOPICS, topicLink, topicsFor, topicsToShow,
} from "@/lib/portal/portal-conversations";

const keys = (t: { key: string }[]) => t.map((x) => x.key);

/* Dee, 2026-10-01 (PARTNER_PORTAL_DOCTRINE.md): General · Support · Projects ·
   Billing · DMs. CreditOps and Marketing are kept when they exist, never offered. */
describe("which conversations a partner is offered", () => {
  it("always offers General, Support and Billing, even with nothing running", () => {
    expect(keys(topicsFor([]))).toEqual(["general", "support", "billing"]);
  });

  it("offers Projects to a partner with a build or a campaign", () => {
    expect(keys(topicsFor(["bes_crm"]))).toEqual(["general", "support", "projects", "billing"]);
    expect(keys(topicsFor(["sales_marketing"]))).toContain("projects");
  });

  it("no longer offers the retired CreditOps and Marketing topics", () => {
    expect(keys(topicsFor(["creditops", "sales_marketing"]))).not.toContain("creditops");
    expect(keys(topicsFor(["creditops", "sales_marketing"]))).not.toContain("marketing");
  });

  it("keeps the order of the menu stable whatever the services are", () => {
    const order = PORTAL_TOPICS.map((t) => t.key);
    for (const live of [[], ["creditops"], ["sales_marketing"], ["bes_crm", "sales_marketing"]]) {
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

  it("links a conversation to where its subject lives", () => {
    expect(topicLink("billing")).toEqual({ label: "View invoices", to: "/partner/billing" });
    expect(topicLink("projects")?.to).toBe("/partner/services");
    expect(topicLink("support")).toBeNull();
    expect(topicLink(null)).toBeNull();
  });
});

describe("a conversation that exists is never hidden", () => {
  it("keeps Marketing after the marketing engagement ends", () => {
    /* The engagement is gone; the conversation and its history are not. */
    expect(keys(topicsToShow([], ["general", "marketing"]))).toContain("marketing");
  });

  it("does not invent one that neither exists nor is relevant", () => {
    expect(keys(topicsToShow([], ["general"]))).toEqual(["general", "support", "billing"]);
  });

  it("shows a relevant topic before anybody has written in it", () => {
    expect(keys(topicsToShow(["bes_crm"], []))).toContain("projects");
  });

  it("keeps a CreditOps conversation that already exists, with its history", () => {
    expect(keys(topicsToShow(["creditops"], ["creditops"]))).toContain("creditops");
  });
});
