import { describe, it, expect } from "vitest";
import {
  ROUND_DEFINITIONS,
  SEVEN_LAYERS,
  getRoundDefinition,
  buildLayerStates,
} from "./rounds-and-layers";

describe("ROUND_DEFINITIONS / SEVEN_LAYERS shape", () => {
  it("defines seven sequential rounds whose activated layers grow cumulatively", () => {
    expect(ROUND_DEFINITIONS).toHaveLength(7);
    ROUND_DEFINITIONS.forEach((r, idx) => {
      expect(r.number).toBe(idx + 1);
      expect(r.layersActivated).toEqual(
        Array.from({ length: idx + 1 }, (_, i) => i + 1),
      );
      expect(r.requiredActions.length).toBeGreaterThan(0);
      expect(r.legalBasis.length).toBeGreaterThan(0);
    });
  });

  it("defines seven uniquely named layers numbered 1..7", () => {
    expect(SEVEN_LAYERS.map((l) => l.number)).toEqual([1, 2, 3, 4, 5, 6, 7]);
    expect(new Set(SEVEN_LAYERS.map((l) => l.name)).size).toBe(7);
    expect(SEVEN_LAYERS[0].name).toBe("CRA Dispute");
    expect(SEVEN_LAYERS[6].name).toBe("Regulatory Pressure");
  });

  it("keeps every round in the mailed / Dispute Ongoing status pair", () => {
    for (const r of ROUND_DEFINITIONS) {
      expect(r.statusAfter).toEqual({
        clickup: "indispute - mailed",
        googleSheet: "Dispute Ongoing",
      });
    }
  });
});

describe("getRoundDefinition", () => {
  it("returns the matching round", () => {
    const r3 = getRoundDefinition(3);
    expect(r3.number).toBe(3);
    expect(r3.name).toMatch(/Furnisher Escalation/);
    expect(r3.legalBasis).toContain("FCRA §1681s-2(b)");
  });

  it("falls back to Round 1 for unknown round numbers", () => {
    expect(getRoundDefinition(0).number).toBe(1);
    expect(getRoundDefinition(99).number).toBe(1);
  });
});

describe("buildLayerStates", () => {
  it("activates exactly the layers for the round and leaves the rest pending", () => {
    const states = buildLayerStates(3);
    expect(states).toHaveLength(7);
    expect(states.filter((s) => s.status === "active").map((s) => s.number)).toEqual([1, 2, 3]);
    expect(states.filter((s) => s.status === "pending").map((s) => s.number)).toEqual([4, 5, 6, 7]);
    expect(states[0].activatedInRound).toBe(1);
    expect(states[2].activatedInRound).toBe(3);
    expect(states[3].activatedInRound).toBeNull();
  });

  it("activates only layer 1 at round 1 and all seven at round 7", () => {
    expect(buildLayerStates(1).filter((s) => s.status === "active")).toHaveLength(1);
    expect(buildLayerStates(7).every((s) => s.status === "active")).toBe(true);
  });

  it("does not mutate the shared SEVEN_LAYERS constant", () => {
    buildLayerStates(7);
    expect("status" in SEVEN_LAYERS[0]).toBe(false);
    expect("activatedInRound" in SEVEN_LAYERS[0]).toBe(false);
  });
});
