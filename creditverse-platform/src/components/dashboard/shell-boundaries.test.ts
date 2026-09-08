import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

/**
 * WHERE THE LOADING AND AUTHORIZATION BOUNDARIES LIVE.
 *
 * Dee, 2026-09-08: *"When I CLICK ONE MENU TAB to another I am seeing this in
 * a couple of seconds which I dont like and it feels a bug… the app should not
 * behave this way."* — and it was a bug. `App.tsx` had ONE `<Suspense>`
 * wrapping the entire route tree, and `RequireAgencyRoute` wrapped
 * `DashboardLayout`. So the first visit to any tab suspended the whole tree:
 * the sidebar and topbar disappeared and a bare skeleton sat on an empty
 * background until the page's chunk arrived. A navigation that removes the
 * navigation is indistinguishable from a crash.
 *
 * Both boundaries now sit INSIDE the shell, around the `Outlet`. This is an
 * architectural invariant that a component test cannot reach cheaply — the
 * layout pulls in a dozen providers — so it is pinned by reading the source.
 * If somebody moves either boundary back out, this fails and says why.
 */
const app = readFileSync("src/App.tsx", "utf8");
const layout = readFileSync("src/components/dashboard/DashboardLayout.tsx", "utf8");

describe("the shell stays mounted while a page loads", () => {
  it("App.tsx does not wrap the shell in the route guard", () => {
    expect(app).not.toMatch(/<RequireAgencyRoute>\s*<DashboardLayout/);
    /* Not imported either — a stale import is how it comes back. */
    expect(app).not.toMatch(/import .*RequireAgencyRoute/);
  });

  it("the guard is inside DashboardLayout instead", () => {
    expect(layout).toContain("RequireAgencyRoute");
  });

  it("the page area has its own Suspense boundary around the Outlet", () => {
    /* The guard OUTSIDE the boundary, so a refused page never loads its
       chunk; Suspense inside it, so only the content waits. */
    expect(layout).toMatch(
      /<RequireAgencyRoute>[\s\S]{0,120}<Suspense[\s\S]{0,80}<Outlet\s*\/>[\s\S]{0,80}<\/Suspense>[\s\S]{0,60}<\/RequireAgencyRoute>/,
    );
  });

  it("the shell's own chrome sits outside that boundary, so it cannot suspend", () => {
    const sidebarAt = layout.indexOf("<Sidebar />");
    const topbarAt = layout.indexOf("<Topbar />");
    const suspenseAt = layout.indexOf("<Suspense");
    expect(sidebarAt).toBeGreaterThan(-1);
    expect(topbarAt).toBeGreaterThan(-1);
    expect(sidebarAt).toBeLessThan(suspenseAt);
    expect(topbarAt).toBeLessThan(suspenseAt);
  });

  it("App.tsx keeps a fallback for the routes that have no shell", () => {
    /* Marketing, sign-in and the portals suspend with nothing around them, so
       the outer boundary is still needed — it is only the /app subtree that
       must not use it. */
    expect(app).toMatch(/<Suspense fallback=\{<RouteFallback \/>\}>/);
  });
});
