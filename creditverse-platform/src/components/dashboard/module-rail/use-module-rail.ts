/**
 * Whether a module's secondary rail is collapsed, remembered per module.
 *
 * ── WHY THIS IS A HOOK AND NOT A BOOLEAN IN EACH MODULE ────────────────────
 *
 * Dee, 2026-09-07: "Do not create CreditOpsCollapse, FundingOpsCollapse,
 * CRMNavCollapse as separate implementations." Two modules writing their own
 * localStorage key with their own fallback is how one of them ends up with a
 * state nobody can get out of.
 *
 * ── THE ONE RULE THAT MATTERS ──────────────────────────────────────────────
 *
 * A stored value can be anything: a leftover from an older version, a hand-
 * edited string, a width in pixels from a resize feature that no longer
 * exists. Exactly ONE stored value means collapsed. Everything else — absent,
 * malformed, "0", "30px", null — means EXPANDED, because expanded is the state
 * a person can always work from and always collapse again.
 *
 * A persisted preference must never be able to produce a rail nobody can open.
 */
import { useCallback, useEffect, useState } from "react";

const KEY = (module: string) => `bes.moduleRail.${module}`;
const COLLAPSED = "collapsed";

/** Anything that is not exactly "collapsed" is expanded. Deliberately strict. */
export function readRailCollapsed(module: string): boolean {
  try {
    return window.localStorage.getItem(KEY(module)) === COLLAPSED;
  } catch {
    /* A private window refusing storage starts expanded, which is usable. */
    return false;
  }
}

export interface ModuleRailState {
  collapsed: boolean;
  toggle: () => void;
  /** Small screens: the module menu is open as a drawer. */
  menuOpen: boolean;
  setMenuOpen: (open: boolean) => void;
}

export function useModuleRail(module: string): ModuleRailState {
  const [collapsed, setCollapsed] = useState(() => readRailCollapsed(module));
  const [menuOpen, setMenuOpen] = useState(false);

  /* Switching module reads that module's own preference — collapsing CreditOps
     says nothing about FundingOps (Dee, §11 "preferably per module"). */
  useEffect(() => { setCollapsed(readRailCollapsed(module)); }, [module]);

  const toggle = useCallback(() => {
    setCollapsed((current) => {
      const next = !current;
      try {
        window.localStorage.setItem(KEY(module), next ? COLLAPSED : "expanded");
      } catch {
        /* Not remembered, still works for this page load. */
      }
      return next;
    });
  }, [module]);

  return { collapsed, toggle, menuOpen, setMenuOpen };
}
