/**
 * Sidebar layout state — collapsed rail on large screens, slide-in drawer on
 * small ones. Pure presentation: nothing here is consulted for authorization.
 *
 * The collapsed preference is remembered per browser (localStorage) because it
 * is a device-level comfort setting, not account data; a fresh browser simply
 * starts expanded. The drawer closes itself on every navigation so a tap on a
 * link never leaves the menu covering the page it opened.
 */
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { useLocation } from "react-router-dom";

const STORAGE_KEY = "bes.sidebarCollapsed";

interface SidebarState {
  /** Large screens: icon-only rail when true. */
  collapsed: boolean;
  toggleCollapsed: () => void;
  /** Small screens: the drawer is open. */
  mobileOpen: boolean;
  setMobileOpen: (open: boolean) => void;
}

const SidebarStateContext = createContext<SidebarState | null>(null);

const readCollapsed = (): boolean => {
  try {
    return window.localStorage.getItem(STORAGE_KEY) === "1";
  } catch {
    return false;
  }
};

export function SidebarStateProvider({ children }: { children: ReactNode }) {
  const [collapsed, setCollapsed] = useState<boolean>(readCollapsed);
  const [mobileOpen, setMobileOpen] = useState(false);
  const { pathname } = useLocation();

  useEffect(() => {
    setMobileOpen(false);
  }, [pathname]);

  const toggleCollapsed = useCallback(() => {
    setCollapsed((current) => {
      const next = !current;
      try {
        window.localStorage.setItem(STORAGE_KEY, next ? "1" : "0");
      } catch {
        /* Storage unavailable (private window): the toggle still works for
           this page load; it just will not be remembered. */
      }
      return next;
    });
  }, []);

  const value = useMemo<SidebarState>(
    () => ({ collapsed, toggleCollapsed, mobileOpen, setMobileOpen }),
    [collapsed, toggleCollapsed, mobileOpen],
  );

  return (
    <SidebarStateContext.Provider value={value}>
      {children}
    </SidebarStateContext.Provider>
  );
}

export function useSidebarState(): SidebarState {
  const ctx = useContext(SidebarStateContext);
  if (!ctx)
    throw new Error("useSidebarState must be used inside <SidebarStateProvider>");
  return ctx;
}
