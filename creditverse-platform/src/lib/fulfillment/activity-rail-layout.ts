/**
 * Where the Activity column sits beside a client file, and how wide.
 *
 * Dee, 2026-10-16: "make this activity movable and resizable but leave
 * enough size so it's not completely gone." So: a drag handle sets the
 * width; the width is clamped so Activity can never vanish and the work
 * area always keeps room; the column may sit on the left or the right.
 * Remembered on this device only (localStorage) — a personal convenience,
 * not data.
 *
 * Pure rules here; the component feeds it pointer positions.
 */
export const RAIL_MIN_PX = 280;
export const RAIL_MAX_PX = 640;
export const RAIL_DEFAULT_PX = 360;
/** The work area keeps at least this much, whatever the drag. */
export const WORK_MIN_PX = 520;
export const RAIL_STORAGE_KEY = "creditops.activity-rail";

export type RailSide = "left" | "right";
export interface RailLayout { width: number; side: RailSide }

export const DEFAULT_RAIL_LAYOUT: RailLayout = { width: RAIL_DEFAULT_PX, side: "right" };

/** Never narrower than the floor, never wider than the ceiling, never crowding the work area out. */
export function clampRailWidth(width: number, containerWidth: number): number {
  const ceiling = Math.max(RAIL_MIN_PX, Math.min(RAIL_MAX_PX, containerWidth - WORK_MIN_PX));
  return Math.round(Math.min(ceiling, Math.max(RAIL_MIN_PX, width)));
}

/** The rail's new width for a pointer at `x` inside a container `containerLeft..containerLeft+containerWidth`. */
export function railWidthForPointer(x: number, containerLeft: number, containerWidth: number, side: RailSide): number {
  const raw = side === "right" ? containerLeft + containerWidth - x : x - containerLeft;
  return clampRailWidth(raw, containerWidth);
}

export function readRailLayout(storage: Pick<Storage, "getItem"> | null): RailLayout {
  try {
    const raw = storage?.getItem(RAIL_STORAGE_KEY);
    if (!raw) return DEFAULT_RAIL_LAYOUT;
    const parsed = JSON.parse(raw) as Partial<RailLayout>;
    return {
      width: typeof parsed.width === "number" ? clampRailWidth(parsed.width, Number.MAX_SAFE_INTEGER) : RAIL_DEFAULT_PX,
      side: parsed.side === "left" ? "left" : "right",
    };
  } catch {
    return DEFAULT_RAIL_LAYOUT;
  }
}

export function writeRailLayout(storage: Pick<Storage, "setItem"> | null, layout: RailLayout): void {
  try { storage?.setItem(RAIL_STORAGE_KEY, JSON.stringify(layout)); } catch { /* private window, blocked storage: the choice lasts the session */ }
}
