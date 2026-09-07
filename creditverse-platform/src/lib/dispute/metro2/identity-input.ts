/**
 * Building Section A's input from a real credit report and a real client.
 *
 * The two sides of every identity rule come from different places, and keeping
 * them apart is the point:
 *
 *   REPORTED   what the bureau prints — `Personal` items on the imported report
 *   VERIFIED   what the consumer's own record says — the canonical client
 *
 * A rule compares them. It never infers one from the other, and it never
 * treats a bureau's version as the truth just because it is the one on screen.
 *
 * ---------------------------------------------------------------------------
 * SSN IS DELIBERATELY ABSENT.
 *
 * The report parser refuses to extract identifiers, and the client record has
 * no SSN column. So the SSN rules will always come back UNKNOWN — which is the
 * correct answer, not a gap to be filled. A platform that stored consumers'
 * social security numbers to run a comparison would be trading a serious
 * standing risk for a marginal dispute, and the catalogue's own guardrail
 * ("UNKNOWN must never become CONFIRMED") is what keeps that honest.
 * ---------------------------------------------------------------------------
 */
import type { RawReportItem } from "@/lib/credit-classification";
import type { IdentityInput } from "./section-a-identity";

export interface VerifiedIdentity {
  fullName?: string | null;
  dateOfBirth?: string | null;
  addressLine1?: string | null;
  city?: string | null;
  state?: string | null;
  postalCode?: string | null;
}

/** One address line, the way a report prints it, for comparison. */
export function formatKnownAddress(v: VerifiedIdentity): string | null {
  const parts = [v.addressLine1, [v.city, v.state].filter(Boolean).join(", "), v.postalCode]
    .filter((p) => p && String(p).trim())
    .map((p) => String(p).trim());
  return parts.length > 0 ? parts.join(" ") : null;
}

const personalOfSubtype = (items: RawReportItem[], subtype: string): string | undefined => {
  const hit = items.find(
    (i) => i.kind === "Personal" && (i.subtype ?? "").trim().toLowerCase() === subtype.toLowerCase(),
  );
  return hit?.name?.trim() || undefined;
};

const allPersonalAddresses = (items: RawReportItem[]): string[] =>
  items
    .filter((i) => i.kind === "Personal" && /address/i.test(i.subtype ?? ""))
    .map((i) => i.name?.trim())
    .filter((n): n is string => !!n);

export interface IdentityBuildResult {
  input: IdentityInput;
  /**
   * Facts this platform will never have, and why. Shown so a reviewer knows
   * an UNKNOWN here is a decision rather than an oversight.
   */
  deliberatelyAbsent: { field: string; because: string }[];
}

/**
 * Build the input, and say plainly what could not be supplied.
 *
 * `attested*` fields are only ever set from something the consumer signed.
 * There is no path here that infers "not deceased" from the file being active,
 * or "not mine" from the consumer disliking the account.
 */
export function buildIdentityInput(
  reportItems: RawReportItem[],
  verified: VerifiedIdentity,
  attestations?: { notDeceased?: boolean; addressNotMine?: boolean },
): IdentityBuildResult {
  const known = formatKnownAddress(verified);
  const reportedAddresses = allPersonalAddresses(reportItems);

  const input: IdentityInput = {
    reportedName: personalOfSubtype(reportItems, "Name"),
    verifiedName: verified.fullName?.trim() || undefined,
    verifiedDob: verified.dateOfBirth?.trim() || undefined,
    reportedAddress: personalOfSubtype(reportItems, "Address") ?? reportedAddresses[0],
    knownAddresses: known ? [known] : undefined,
    attestedNotDeceased: attestations?.notDeceased,
    attestedNotMine: attestations?.addressNotMine,
  };

  const deliberatelyAbsent = [
    {
      field: "SSN (reported and verified)",
      because:
        "The report parser refuses to extract identifiers and the client record has no SSN column. Storing one to run this comparison would be a standing risk for a marginal gain.",
    },
    {
      field: "Date of birth as the bureau reports it",
      because: "The parser does not extract it, so only the consumer's own date of birth is known.",
    },
  ];

  return { input, deliberatelyAbsent };
}
