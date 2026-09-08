import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

/**
 * The cold-load frame is drawn twice: once in `index.html` so it paints before
 * any script runs, and once in `WorkspaceSkeleton` so React can hold the same
 * shape while the session resolves. They cannot share code — one is static
 * HTML with literal colours, the other is a component using theme tokens — so
 * this holds them to the same measurements instead.
 *
 * If these fail, the two frames no longer line up and a cold load will visibly
 * jump at the moment React takes over. Change both, or change neither.
 */
const root = resolve(__dirname, "../../..");
const html = readFileSync(resolve(root, "index.html"), "utf8");
const css = readFileSync(resolve(root, "src/index.css"), "utf8");
const skeleton = readFileSync(
  resolve(root, "src/components/dashboard/WorkspaceSkeleton.tsx"),
  "utf8",
);

const boot = html.slice(html.indexOf("#bes-boot {"), html.indexOf("</style>"));

describe("the boot frame and the React frame agree", () => {
  it("uses the same rail width", () => {
    expect(boot).toContain("width: 16rem");
    expect(skeleton).toContain("w-64"); // 16rem
  });

  it("uses the same top bar height", () => {
    expect(boot).toContain("height: 3.5rem");
    expect(skeleton).toContain("h-14"); // 3.5rem
  });

  it("uses the same content padding", () => {
    expect(boot).toContain("padding: 1.5rem");
    expect(skeleton).toContain("p-6"); // 1.5rem
  });

  it("shows the same four tiles above one panel", () => {
    expect((boot.match(/\.tile\b/g) ?? []).length).toBeGreaterThan(0);
    expect(html).toContain('<div class="tile"></div><div class="tile"></div>');
    expect(skeleton).toContain("[0, 1, 2, 3]");
    expect(boot).toContain("height: 16rem"); // .panel
    expect(skeleton).toContain("h-64"); // 16rem
  });

  it("hides the rail at the same breakpoint", () => {
    expect(boot).toContain("@media (max-width: 1023px)");
    expect(skeleton).toContain("lg:block"); // shown from 1024px up
  });
});

describe("the boot frame's literal colours still match the theme", () => {
  /* The HTML cannot wait for a stylesheet, so it repeats the token values. If
     a palette changes and these do not, the frame flashes the old colour. */
  const token = (name: string) => {
    const match = css.match(new RegExp(`--${name}:\\s*([^;]+);`));
    return match?.[1].trim();
  };

  it.each([
    ["background", "38 27% 93%"],
    ["sidebar-background", "200 8% 5%"],
    ["card", "0 0% 100%"],
    ["border", "38 14% 82%"],
    ["muted", "38 18% 90%"],
    ["sidebar-border", "200 8% 16%"],
  ])("--%s is %s in both", (name, expected) => {
    expect(token(name)).toBe(expected);
    expect(boot).toContain(`hsl(${expected})`);
  });
});

describe("the boot frame is workspace-only", () => {
  it("is removed on any path that is not the workspace", () => {
    expect(html).toContain('location.pathname.startsWith("/app")');
    expect(html).toContain("boot.remove()");
  });
});
