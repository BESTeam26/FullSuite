import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  attentionSummary,
  HEALTH_LABEL,
  ENGINE_STATE_LABEL,
  JOURNEY_STAGES,
  JOURNEY_LABEL,
  journeyIndex,
  QA_LABEL,
  WAITING_LABEL,
  waitingIsOurs,
  WORK_UNIT_LABEL,
  WORK_UNIT_URGENCY,
} from "./crm-domain";

const migrations = resolve(__dirname, "../../../supabase/migrations");
const derived = readFileSync(
  resolve(migrations, "20260908004500_crm_derived_state.sql"),
  "utf8",
);
const projects = readFileSync(
  resolve(migrations, "20260908004400_crm_projects.sql"),
  "utf8",
);

/**
 * The screen's vocabulary must be the database's vocabulary.
 *
 * A label the database never produces renders as a blank cell, and a state the
 * database produces but the screen has no label for renders as a raw enum. The
 * failure is silent either way, which is why these read the migrations rather
 * than a copy of the list.
 */
describe("the four layers match what the database can return", () => {
  it("covers every journey stage the database can produce", () => {
    for (const stage of JOURNEY_STAGES) {
      expect(derived, `journey stage ${stage}`).toContain(`'${stage}'`);
      expect(JOURNEY_LABEL[stage]).toBeTruthy();
    }
  });

  /* Read the values the function can actually RETURN — the `then '…'` and
     `else '…'` arms of its case expression — rather than any capitalised
     string in the file, which would also pick up the states it merely tests
     against. */
  const returned = (fnName: string, nextFn: string) => {
    const body = derived.slice(
      derived.indexOf(`function public.${fnName}`),
      derived.indexOf(`function public.${nextFn}`),
    );
    return new Set(
      [...body.matchAll(/(?:then|else) '([^']+)'\s*$/gm)].map((m) => m[1]),
    );
  };

  it("has a label for every engine state the function can return", () => {
    const states = returned("crm_engine_state", "crm_project_engine_progress");
    expect(states.size).toBeGreaterThan(4);
    for (const state of states) {
      expect(
        ENGINE_STATE_LABEL[state as keyof typeof ENGINE_STATE_LABEL],
        state,
      ).toBeTruthy();
    }
  });

  it("has a label for every project health the function can return", () => {
    const states = returned("crm_project_health", "crm_project_board");
    expect(states.size).toBeGreaterThan(4);
    for (const state of states) {
      expect(HEALTH_LABEL[state as keyof typeof HEALTH_LABEL], state).toBeTruthy();
    }
  });

  it("has a label and an urgency for every work unit state", () => {
    const inSql = returned("crm_work_unit_state", "crm_engine_state");
    expect(inSql.size).toBe(7);
    for (const state of inSql) {
      const key = state as keyof typeof WORK_UNIT_LABEL;
      expect(WORK_UNIT_LABEL[key]).toBeTruthy();
      expect(WORK_UNIT_URGENCY[key]).toBeGreaterThanOrEqual(0);
    }
  });

  it("has a label for every waiting reason the enum allows", () => {
    const inSql = projects.match(/create type public\.work_waiting_reason as enum \(([\s\S]*?)\)/)?.[1];
    expect(inSql).toBeTruthy();
    for (const reason of inSql!.split(",").map((s) => s.trim().replace(/'/g, ""))) {
      expect(WAITING_LABEL[reason as keyof typeof WAITING_LABEL], reason).toBeTruthy();
    }
  });

  it("has a label for every QA result the enum allows", () => {
    const inSql = projects.match(/create type public\.work_qa_result as enum \(([^)]+)\)/)?.[1];
    expect(inSql).toBeTruthy();
    for (const result of inSql!.split(",").map((s) => s.trim().replace(/'/g, ""))) {
      expect(QA_LABEL[result as keyof typeof QA_LABEL], result).toBeTruthy();
    }
  });
});

describe("journey ordering", () => {
  it("runs from gathering information to complete", () => {
    expect(journeyIndex("info_gathering")).toBe(0);
    expect(journeyIndex("complete")).toBe(JOURNEY_STAGES.length - 1);
    expect(journeyIndex("building")).toBeLessThan(journeyIndex("testing"));
    expect(journeyIndex("testing")).toBeLessThan(journeyIndex("launch"));
  });

  it("returns -1 for a stage it does not know, rather than pretending it is first", () => {
    expect(journeyIndex("nonsense")).toBe(-1);
  });
});

describe("work unit urgency", () => {
  it("puts blocked ahead of waiting, because blocked is BES's to fix", () => {
    expect(WORK_UNIT_URGENCY.BLOCKED).toBeLessThan(WORK_UNIT_URGENCY.WAITING);
  });

  it("puts completed last", () => {
    const worst = Math.max(...Object.values(WORK_UNIT_URGENCY));
    expect(WORK_UNIT_URGENCY.COMPLETED).toBe(worst);
  });

  it("gives every state a distinct rank, so a sort is stable", () => {
    const ranks = Object.values(WORK_UNIT_URGENCY);
    expect(new Set(ranks).size).toBe(ranks.length);
  });
});

describe("waitingIsOurs", () => {
  it("says a client or third party wait is not ours to unblock", () => {
    expect(waitingIsOurs("client")).toBe(false);
    expect(waitingIsOurs("third_party")).toBe(false);
    expect(waitingIsOurs("external_platform")).toBe(false);
  });

  it("says an internal or approval wait is", () => {
    expect(waitingIsOurs("internal")).toBe(true);
    expect(waitingIsOurs("approval")).toBe(true);
  });
});

describe("attentionSummary", () => {
  const none = { blocked: 0, waitingClient: 0, inQa: 0, overdue: 0 };

  it("says nothing when nothing needs attention", () => {
    expect(attentionSummary(none)).toBeNull();
  });

  it("reads as one sentence for one problem", () => {
    expect(attentionSummary({ ...none, blocked: 2 })).toBe("2 blocked");
  });

  it("joins two with 'and'", () => {
    expect(attentionSummary({ ...none, blocked: 1, overdue: 3 })).toBe(
      "1 blocked and 3 overdue",
    );
  });

  it("puts what BES must fix before what BES is waiting on", () => {
    const s = attentionSummary({ blocked: 1, waitingClient: 5, inQa: 2, overdue: 1 })!;
    expect(s.indexOf("blocked")).toBeLessThan(s.indexOf("waiting on the client"));
    expect(s.indexOf("overdue")).toBeLessThan(s.indexOf("waiting on QA"));
  });

  it("lists three or more with commas and a final 'and'", () => {
    expect(attentionSummary({ blocked: 1, overdue: 2, inQa: 3, waitingClient: 0 })).toBe(
      "1 blocked, 2 overdue and 3 waiting on QA",
    );
  });
});
