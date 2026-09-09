import { describe, expect, it } from "vitest";
import {
  MERGE_FIELDS, SAMPLE_AGREEMENT, SIGNATURE_TOKENS, renderPreview, sampleValues, unknownTokens,
} from "./merge-fields";

describe("the merge-field registry", () => {
  it("has no duplicate tokens and every token is namespace.field or a bare word", () => {
    const tokens = MERGE_FIELDS.map((f) => f.token);
    expect(new Set(tokens).size).toBe(tokens.length);
    for (const t of tokens) expect(t).toMatch(/^[a-z_]+(\.[a-z_]+)*$/);
  });

  it("marks exactly the signature fields as filled at signing", () => {
    expect([...SIGNATURE_TOKENS].sort()).toEqual(["signature", "signed_date"]);
  });

  it("gives a member document the user namespace and a partner document the partner one", () => {
    expect(Object.keys(sampleValues("member"))).toContain("user.name");
    expect(Object.keys(sampleValues("member"))).not.toContain("partner.name");
    expect(Object.keys(sampleValues("partner"))).toContain("partner.company_name");
  });
});

describe("preview rendering — the same rule as the database renderer", () => {
  it("replaces known tokens and HTML-escapes their values", () => {
    const out = renderPreview("Hi {{user.first_name}} <b>x</b>", { "user.first_name": "<Rowell> & co" });
    expect(out).toBe("Hi &lt;Rowell&gt; &amp; co <b>x</b>");
  });

  it("leaves a token it cannot resolve in place, so it can be seen and refused", () => {
    expect(renderPreview("{{partner.name}} / {{signature}}", { "partner.name": "Bizhub" }))
      .toBe("Bizhub / {{signature}}");
  });

  it("is case-insensitive and tolerant of spaces inside the braces", () => {
    expect(renderPreview("{{ User.Name }}", { "user.name": "R" })).toBe("R");
  });

  it("reports tokens the registry does not know, so a typo cannot ship", () => {
    expect(unknownTokens("{{user.name}} {{usr.nmae}} {{signature}}")).toEqual(["usr.nmae"]);
  });

  it("the sample agreement uses only known tokens", () => {
    expect(unknownTokens(SAMPLE_AGREEMENT)).toEqual([]);
  });
});
