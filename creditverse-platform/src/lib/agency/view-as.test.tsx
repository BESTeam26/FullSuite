/**
 * View As — the interface must authorize as the TARGET, not the previewer.
 *
 * WHO may preview, and what the target's effective access actually is, are
 * the database's answers and are proved against the live database in the
 * matrix. What these cover is the substitution: that the ONE authority the
 * menu and the route guard share is handed the previewed person, so a preview
 * cannot be "only the sidebar" (§37), and that the guarantee is honestly
 * scoped.
 */
import { describe, expect, it, vi, beforeEach } from "vitest";
import { renderHook } from "@testing-library/react";
import { accessTo, routeFor, visibleRoutes, type AccessContext } from "@/lib/agency/navigation";

let previewing = false;
let previewRole: string | null = null;
let previewCan: (k: string) => boolean = () => false;
const ownRole = "agency_owner";
const ownCan = () => true;

vi.mock("@/lib/auth/auth-context", () => ({
  useAuth: () => ({
    agencyMembership: { role: ownRole }, status: "signed-in",
    user: { id: "owner" }, isAgencyStaff: true,
  }),
}));
vi.mock("@/lib/auth/use-permission", () => ({
  usePermissions: () => ({ can: () => true, loading: false }),
}));
vi.mock("@/lib/data/agency-permissions", () => ({
  useAgencyPermissions: () => ({ can: ownCan, loading: false }),
}));
vi.mock("@/lib/agency/view-as-context", () => ({
  useViewAs: () => ({
    previewing, effectiveRole: previewRole, effectiveCan: previewCan,
    canPreview: true, targetUserId: null, access: null, loading: false,
    error: null, start: vi.fn(), exit: vi.fn(),
  }),
}));

import { useAgencyAccessContext, useOwnAccessContext } from "@/lib/agency/use-access-context";

beforeEach(() => {
  previewing = false;
  previewRole = null;
  previewCan = () => false;
});

const settings = routeFor("/app/settings")!;
const preview = routeFor("/app/access-preview")!;

describe("the context the interface runs on", () => {
  it("is the caller's own when nothing is being previewed", () => {
    const { result } = renderHook(() => useAgencyAccessContext());
    expect(result.current.previewing).toBe(false);
    expect(result.current.ctx.role).toBe("agency_owner");
    expect(accessTo(settings, result.current.ctx)).toBe("allow");
  });

  it("becomes the TARGET's while previewing — role and capabilities both", () => {
    previewing = true;
    previewRole = "agency_agent";
    previewCan = () => false;
    const { result } = renderHook(() => useAgencyAccessContext());
    expect(result.current.previewing).toBe(true);
    expect(result.current.ctx.role).toBe("agency_agent");
    /* The owner could open Settings; the agent cannot — and the SAME
       function answers, so the menu and the door agree. */
    expect(accessTo(settings, result.current.ctx)).not.toBe("allow");
  });

  it("does not leak the previewer's capabilities into the preview", () => {
    previewing = true;
    previewRole = "agency_agent";
    previewCan = (k) => k === "reports.view";
    const { result } = renderHook(() => useAgencyAccessContext());
    expect(result.current.ctx.can("reports.view")).toBe(true);
    /* The owner's `can` returns true for everything; the preview must not. */
    expect(result.current.ctx.can("org.structure.manage")).toBe(false);
  });

  it("shrinks the menu to the previewed person's", () => {
    const owner = renderHook(() => useAgencyAccessContext());
    const ownerCount = visibleRoutes(owner.result.current.ctx).length;

    previewing = true;
    previewRole = "agency_agent";
    previewCan = () => false;
    const agent = renderHook(() => useAgencyAccessContext());
    const agentCount = visibleRoutes(agent.result.current.ctx).length;

    expect(agentCount).toBeLessThan(ownerCount);
  });

  it("keeps the OWN context available for the provider to fall back to", () => {
    previewing = true;
    previewRole = "agency_agent";
    previewCan = () => false;
    const { result } = renderHook(() => useOwnAccessContext());
    /* Unchanged by the preview — this is what the provider restores on exit. */
    expect(result.current.role).toBe("agency_owner");
    expect(result.current.can("anything")).toBe(true);
  });
});

describe("the preview route itself", () => {
  it("is hidden from an agent and refused by the door", () => {
    const agentCtx: AccessContext = { role: "agency_agent", can: () => false };
    expect(accessTo(preview, agentCtx)).toBe("hide");
  });

  it("is hidden from an admin who has not been granted it", () => {
    const adminCtx: AccessContext = { role: "agency_admin", can: () => false };
    expect(accessTo(preview, adminCtx)).toBe("hide");
  });

  it("opens for an admin who has", () => {
    const superAdmin: AccessContext = {
      role: "agency_admin",
      can: (k) => k === "access.preview_as_user",
    };
    expect(accessTo(preview, superAdmin)).toBe("allow");
  });

  it("opens for the owner", () => {
    const owner: AccessContext = { role: "agency_owner", can: () => true };
    expect(accessTo(preview, owner)).toBe("allow");
  });
});
