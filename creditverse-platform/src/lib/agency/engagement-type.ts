/**
 * How a person is engaged by BES. Mirrors the check constraint on
 * `agency_memberships.engagement_type`; the label is the only thing the
 * interface knows, so a new kind is one row here and one ALTER there.
 */
export const ENGAGEMENT_TYPES = [
  { value: "employee", label: "Employee" },
  { value: "contractor", label: "Contractor" },
] as const;

export type EngagementType = (typeof ENGAGEMENT_TYPES)[number]["value"];

export const engagementTypeLabel = (value: string | null | undefined): string | null =>
  ENGAGEMENT_TYPES.find((t) => t.value === value)?.label ?? null;
