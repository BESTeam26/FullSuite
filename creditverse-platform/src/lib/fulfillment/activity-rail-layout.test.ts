import { describe, expect, it } from "vitest";
import {
  RAIL_MAX_PX, RAIL_MIN_PX, WORK_MIN_PX, clampRailWidth, railWidthForPointer, readRailLayout, writeRailLayout,
} from "./activity-rail-layout";

describe("the Activity column beside a client file (Dee, 2026-10-16)", () => {
  it("can be made narrower, but never gone", () => {
    expect(clampRailWidth(40, 1400)).toBe(RAIL_MIN_PX);
    expect(clampRailWidth(300, 1400)).toBe(300);
  });
  it("can be made wider, but the work area keeps its room", () => {
    expect(clampRailWidth(2000, 1400)).toBe(RAIL_MAX_PX);
    expect(clampRailWidth(600, 1000)).toBe(1000 - WORK_MIN_PX);
  });
  it("follows the pointer from whichever side it sits on", () => {
    expect(railWidthForPointer(1000, 0, 1400, "right")).toBe(400);
    expect(railWidthForPointer(400, 0, 1400, "left")).toBe(400);
  });
  it("remembers the choice on this device, and falls back when storage is missing or garbage", () => {
    const store = new Map<string, string>();
    const storage = { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => { store.set(k, v); } };
    writeRailLayout(storage, { width: 420, side: "left" });
    expect(readRailLayout(storage)).toEqual({ width: 420, side: "left" });
    store.set("creditops.activity-rail", "{not json");
    expect(readRailLayout(storage)).toEqual({ width: 360, side: "right" });
    expect(readRailLayout(null)).toEqual({ width: 360, side: "right" });
  });
});
