/**
 * How the partner's Files page groups what it may see (Dee, 2026-10-01,
 * PARTNER_PORTAL_DOCTRINE.md: "Partner uploads · BES shared docs · Agreements
 * · Deliverables · Reports · Client-related shared documents").
 *
 * Pure shaping. Visibility is decided by my_partner_files(),
 * my_partner_shared_client_files() and the storage rule — never here.
 */

export interface PartnerPortalFile {
  id: string;
  name: string;
  path: string;
  mimeType: string | null;
  sizeBytes: number | null;
  createdAt: string;
  sharedAt: string | null;
  /** Added by one of the partner's own contacts, rather than shared by BES. */
  fromPartner: boolean;
}

export interface SharedClientFile {
  id: string;
  name: string;
  path: string;
  mimeType: string | null;
  sizeBytes: number | null;
  sharedAt: string;
  clientName: string;
  clientPublicId: string;
}

/** A report is named as one — "Progress Report …", "Credit report", "Monthly report". */
export const isReport = (name: string) => /\breports?\b/i.test(name);

export function groupPartnerFiles(files: readonly PartnerPortalFile[]) {
  const uploads = files.filter((f) => f.fromPartner);
  const fromBes = files.filter((f) => !f.fromPartner);
  return {
    uploads,
    reports: fromBes.filter((f) => isReport(f.name)),
    documents: fromBes.filter((f) => !isReport(f.name)),
  };
}

/** Where a partner upload goes: their own uploads folder, a fresh name, the original extension. */
export function partnerUploadPath(groupId: string, fileName: string, id: string): string {
  const ext = fileName.includes(".") ? fileName.split(".").pop()!.replace(/[^a-z0-9]/gi, "").slice(0, 12) : "";
  return `agency/partner/${groupId}/uploads/${id}${ext ? `.${ext}` : ""}`;
}
