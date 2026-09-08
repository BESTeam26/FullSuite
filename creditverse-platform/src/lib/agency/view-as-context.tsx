/**
 * Who the interface is pretending to be, and the fact that it is only
 * pretending.
 *
 * ── READ-ONLY IS A UX GUARANTEE, NOT A SECURITY BOUNDARY ───────────────────
 *
 * Worth being exact, because the distinction changes what the code has to do.
 *
 * Nothing here impersonates. `auth.uid()` is the previewer for every request,
 * so a write attempted during a preview would be attributed to the previewer
 * and governed by the previewer's own row-level security. There is no boundary
 * to breach: the owner would simply be doing, as themselves, something they
 * could already do.
 *
 * So blocking writes is about not MISLEADING the person previewing — Dee, §39:
 * "While Preview active: hide/block writes... Show: Exit Preview to make
 * changes." Somebody who edits a client while the banner says they are
 * viewing as Daniel would reasonably believe Daniel made the change. They
 * did not, and the audit log will say so.
 *
 * The guard therefore lives in the interface (controls disabled, `readOnly`
 * observed) and in one central place for table writes — not in RLS, because
 * RLS has nothing to say about it.
 */
import {
  createContext, useCallback, useContext, useMemo, useState, type ReactNode,
} from "react";
import { useQuery } from "@tanstack/react-query";
import { canPreviewAsUser, fetchPreviewAccess, type PreviewAccess } from "@/lib/data/view-as";
import { useAuth } from "@/lib/auth/auth-context";
import type { AgencyRole } from "@/lib/agency/navigation";

interface ViewAsValue {
  /** Whether this person may preview at all. */
  canPreview: boolean;
  /** Who is being previewed, or null. */
  targetUserId: string | null;
  access: PreviewAccess | null;
  loading: boolean;
  error: string | null;
  /** True whenever a preview is active — every write control observes this. */
  previewing: boolean;
  start: (userId: string) => void;
  exit: () => void;
  /**
   * The role and capability function to authorize the INTERFACE with.
   *
   * While previewing this is the target's; otherwise the previewer's own. One
   * value, so `accessTo()` — the single authority the menu and the route
   * guard already share — answers for whoever is being previewed without
   * either of them knowing a preview exists.
   */
  effectiveRole: AgencyRole | null;
  effectiveCan: (permission: string) => boolean;
}

const ViewAsContext = createContext<ViewAsValue | null>(null);

export function ViewAsProvider({
  children, ownRole, ownCan,
}: {
  children: ReactNode;
  ownRole: AgencyRole | null;
  ownCan: (permission: string) => boolean;
}) {
  const auth = useAuth();
  const [targetUserId, setTargetUserId] = useState<string | null>(null);

  const permitted = useQuery({
    queryKey: ["view-as", "permitted", auth.user?.id ?? ""],
    queryFn: canPreviewAsUser,
    enabled: !!auth.user?.id && auth.isAgencyStaff,
    staleTime: 300_000,
  });

  const preview = useQuery({
    queryKey: ["view-as", "access", targetUserId ?? ""],
    queryFn: () => fetchPreviewAccess(targetUserId!),
    enabled: !!targetUserId,
    staleTime: 60_000,
    retry: false,
  });

  const start = useCallback((userId: string) => setTargetUserId(userId), []);
  const exit = useCallback(() => setTargetUserId(null), []);

  const access = preview.data ?? null;

  /* Only once the access has ARRIVED. A preview that authorized the
     interface from a half-loaded profile would show the previewer's own menu
     under somebody else's name for a moment, which is the one thing §37 says
     must never happen. */
  const active = !!targetUserId && !!access;

  const value = useMemo<ViewAsValue>(() => {
    const capabilityMap = new Map(
      (access?.capabilities ?? []).map((c) => [c.key, c.allowed]),
    );
    return {
      canPreview: !!permitted.data,
      targetUserId,
      access,
      loading: preview.isLoading,
      error: preview.error ? (preview.error as Error).message : null,
      previewing: active,
      start,
      exit,
      effectiveRole: active ? ((access!.profile.role as AgencyRole) ?? null) : ownRole,
      effectiveCan: active
        ? (permission: string) => capabilityMap.get(permission) ?? false
        : ownCan,
    };
  }, [permitted.data, targetUserId, access, preview.isLoading, preview.error,
      start, exit, active, ownRole, ownCan]);

  return <ViewAsContext.Provider value={value}>{children}</ViewAsContext.Provider>;
}

/**
 * Outside a provider this reports "not previewing" rather than throwing.
 *
 * Deliberate: a write guard that crashes when the provider is absent is a
 * guard that makes screens fail in the organization views, where preview does
 * not exist at all.
 */
export function useViewAs(): ViewAsValue {
  return (
    useContext(ViewAsContext) ?? {
      canPreview: false,
      targetUserId: null,
      access: null,
      loading: false,
      error: null,
      previewing: false,
      start: () => undefined,
      exit: () => undefined,
      effectiveRole: null,
      effectiveCan: () => false,
    }
  );
}

/**
 * For a control that writes: whether it should be inert, and what to say.
 *
 * One hook rather than each button inventing its own message, so "Exit
 * Preview to make changes" reads the same everywhere (§39).
 */
export function usePreviewGuard(): { readOnly: boolean; reason: string | null } {
  const { previewing, access } = useViewAs();
  return {
    readOnly: previewing,
    reason: previewing
      ? `Viewing as ${access?.profile.name ?? "someone else"} — exit preview to make changes.`
      : null,
  };
}
