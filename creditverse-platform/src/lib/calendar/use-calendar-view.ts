import { useEffect, useState } from "react";
import { addMonths } from "@/lib/calendar/month-grid";

/**
 * List or Month, remembered across sessions, plus the month being looked at.
 *
 * Extracted because two calendars offer the same choice — the workspace
 * calendar card and the Agency Calendar page — and each keeping its own copy
 * of "which view, which month, what Today does" is how the two drift into
 * behaving differently (rule 6). They share the STORAGE KEY on purpose too:
 * a person who prefers the month grid prefers it in both places.
 */
export type CalendarView = "list" | "month";
const VIEW_KEY = "bes-calendar-view";

/** Reads the remembered view, and copes with a browser that blocks storage. */
const rememberedView = (): CalendarView => {
  try {
    return localStorage.getItem(VIEW_KEY) === "month" ? "month" : "list";
  } catch {
    return "list";
  }
};

export function useCalendarView() {
  const [view, setView] = useState<CalendarView>(rememberedView);
  const [cursor, setCursor] = useState(() => {
    const n = new Date();
    return { year: n.getFullYear(), month: n.getMonth() };
  });
  const [selectedDay, setSelectedDay] = useState<string | null>(null);

  useEffect(() => {
    try {
      localStorage.setItem(VIEW_KEY, view);
    } catch {
      /* nothing is lost: the list is the default */
    }
  }, [view]);

  /** delta = 0 means Today: back to the current month, selection cleared. */
  const goMonth = (delta: number) => {
    setSelectedDay(null);
    if (delta === 0) {
      const n = new Date();
      setCursor({ year: n.getFullYear(), month: n.getMonth() });
      return;
    }
    setCursor((c) => addMonths(c.year, c.month, delta));
  };

  return { view, setView, cursor, goMonth, selectedDay, setSelectedDay };
}
