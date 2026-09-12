import { describe, expect, it } from "vitest";
import { parseClickUpListRef, readStoredRef } from "@/lib/migration/clickup-list-ref";

describe("a pasted ClickUp link becomes an import reference", () => {
  it("reads a list id straight out of a list URL", () => {
    expect(parseClickUpListRef("https://app.clickup.com/25798251/v/li/901818050151"))
      .toEqual({ kind: "list", id: "901818050151", ref: "clickup:list:901818050151" });
  });

  it("recognises a VIEW link as a view, not as a list", () => {
    /* Dee's own link. `rk9kb-14078` is a view id: only ClickUp can say which
       list is behind it, so calling it a list here would silently import from
       whatever that string happened to match. */
    expect(parseClickUpListRef("https://app.clickup.com/25798251/v/l/rk9kb-14078"))
      .toEqual({ kind: "view", id: "rk9kb-14078", ref: "clickup:view:rk9kb-14078" });
  });

  it("handles board and list-board forms", () => {
    expect(parseClickUpListRef("https://app.clickup.com/25798251/v/lb/901821115879")?.id)
      .toBe("901821115879");
    expect(parseClickUpListRef("https://app.clickup.com/25798251/v/b/901821115879")?.kind)
      .toBe("list");
  });

  it("ignores query strings and trailing slashes", () => {
    expect(parseClickUpListRef("https://app.clickup.com/25798251/v/li/901818050151/?block=true")?.id)
      .toBe("901818050151");
  });

  it("still accepts a bare list id, so nothing already linked must be retyped", () => {
    expect(parseClickUpListRef("901821115879"))
      .toEqual({ kind: "list", id: "901821115879", ref: "clickup:list:901821115879" });
  });

  it("refuses a short number rather than importing from a typo", () => {
    expect(parseClickUpListRef("1234")).toBeNull();
  });

  it("refuses anything that is not a ClickUp address", () => {
    expect(parseClickUpListRef("https://example.com/v/li/901818050151")).toBeNull();
    expect(parseClickUpListRef("the tiff list")).toBeNull();
    expect(parseClickUpListRef("")).toBeNull();
  });

  it("reads back what it stored, so re-pasting the screen's own text works", () => {
    expect(readStoredRef("clickup:list:901818050151")?.kind).toBe("list");
    expect(readStoredRef("clickup:view:rk9kb-14078")?.id).toBe("rk9kb-14078");
    expect(readStoredRef(null)).toBeNull();
  });
});
