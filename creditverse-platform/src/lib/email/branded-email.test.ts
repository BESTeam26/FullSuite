/**
 * The shared email layout lives with the Edge Functions that send it, but its
 * pure half is worth testing here — branding is customer input, and it is
 * pasted into HTML that lands in someone else's inbox.
 *
 * What must hold: a colour is a plain hex value or the BES fallback, a logo is
 * an http(s) URL or nothing, every caller-supplied string is escaped, and the
 * plain-text alternative carries the link so a text-only client is not left
 * with a dead email.
 */
import { describe, expect, it } from "vitest";
import {
  escapeHtml,
  parseFrom,
  renderEmail,
  renderEmailText,
  safeColor,
  safeImage,
} from "../../../supabase/functions/_shared/email-template";

const BES_GREEN = "#005F4B";

describe("safeColor", () => {
  it("keeps a plain hex colour", () => {
    expect(safeColor("#1d4ed8")).toBe("#1d4ed8");
    expect(safeColor("#abc")).toBe("#abc");
  });

  it("falls back to the BES green for anything else", () => {
    for (const hostile of [
      "javascript:alert(1)",
      "red; background:url(http://evil.test)",
      "#1d4ed8\" onload=\"alert(1)",
      "expression(alert(1))",
      "",
      null,
      undefined,
    ]) {
      expect(safeColor(hostile as string | null | undefined)).toBe(BES_GREEN);
    }
  });
});

describe("safeImage", () => {
  it("keeps an http(s) URL", () => {
    expect(safeImage("https://cdn.example.test/logo.png")).toBe("https://cdn.example.test/logo.png");
  });

  it("drops anything that is not one", () => {
    for (const hostile of ["javascript:alert(1)", "data:image/svg+xml;base64,PHN2Zz4=", "//evil.test/logo.png", "", null]) {
      expect(safeImage(hostile as string | null)).toBeNull();
    }
  });
});

describe("escapeHtml", () => {
  it("neutralises markup and attribute breaks", () => {
    const out = escapeHtml('<script>alert("x")</script> & \'quote\'');
    expect(out).not.toContain("<script>");
    expect(out).not.toContain('"');
    expect(out).toContain("&amp;");
  });
});

describe("renderEmail", () => {
  const content = {
    brand: { name: "Lakeside <Partners>", primaryColor: "#1d4ed8", tagline: "Credit, done properly" },
    heading: "You have been invited",
    paragraphs: ["Activate your account.", "The link is good for seven days."],
    action: { label: "Activate my account", url: "https://example.test/accept-invitation/abc" },
    footnote: "Nothing is created until you open the link.",
  };

  it("carries the organization's brand and the call to action", () => {
    const html = renderEmail(content);
    expect(html).toContain("#1d4ed8");
    expect(html).toContain("Activate my account");
    expect(html).toContain("https://example.test/accept-invitation/abc");
    expect(html).toContain("Credit, done properly");
  });

  it("escapes a name that contains markup", () => {
    const html = renderEmail(content);
    expect(html).not.toContain("Lakeside <Partners>");
    expect(html).toContain("Lakeside &lt;Partners&gt;");
  });

  it("still reads as a message when the branding is empty", () => {
    const html = renderEmail({ brand: { name: "BES" }, heading: "Hello", paragraphs: ["Body."] });
    expect(html).toContain(BES_GREEN);
    expect(html).toContain("Hello");
  });

  it("gives a text-only client the same message and the link", () => {
    const text = renderEmailText(content);
    expect(text).toContain("You have been invited");
    expect(text).toContain("https://example.test/accept-invitation/abc");
    /* Plain text is not HTML: the brand name is carried as written, not escaped. */
    expect(text).toContain("Lakeside <Partners>");
    expect(text).not.toContain("&lt;");
    expect(text).not.toContain("</");
  });
});

describe("parseFrom", () => {
  it("reads a bare address", () => {
    expect(parseFrom("hello@bes.test", "BES")).toEqual({ email: "hello@bes.test", name: "BES" });
  });

  it("reads a named address", () => {
    expect(parseFrom("BES Support <hello@bes.test>", "Fallback")).toEqual({
      email: "hello@bes.test",
      name: "BES Support",
    });
  });
});
