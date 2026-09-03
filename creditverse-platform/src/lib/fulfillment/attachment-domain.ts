/**
 * Attachment domain — categories, the canonical AttachmentFile shape, and the
 * sample set the workspace starts from.
 *
 * These live here, not inside a component, so that UI modules never import
 * types from one another. FileViewer previously imported AttachmentFile back
 * out of ClientWorkAttachments, which created a circular dependency between
 * two UI files (rule 13). Both now depend downward on this module instead.
 */

export const ATTACHMENT_CATEGORIES = [
  "Credit Report",
  "ID",
  "Proof of Address",
  "SSN / Identity Document",
  "Dispute Evidence",
  "Client Correspondence",
  "Mailing Proof",
  "CFPB",
  "FTC",
  "BBB",
  "Attorney General",
  "Bureau Calling Evidence",
  "Monitoring Screenshot",
  "Client Upload",
  "Screenshot",
  "Other",
] as const;

export type AttachmentCategory = (typeof ATTACHMENT_CATEGORIES)[number];

export interface AttachmentFile {
  id: string;
  name: string;
  size: string;
  type: string;
  category: AttachmentCategory;
  url: string;
  uploadedBy: string;
  uploadedAt: string;
}

export const DEFAULT_ATTACHMENTS: AttachmentFile[] = [
  {
    id: "att-1",
    name: "Driver_License_Front_Back.pdf",
    size: "144 KB",
    type: "application/pdf",
    category: "ID",
    url: "/placeholder.svg",
    uploadedBy: "Admin",
    uploadedAt: "Jul 14, 2026",
  },
  {
    id: "att-2",
    name: "Utility_Bill_Proof_Residency.pdf",
    size: "1.4 MB",
    type: "application/pdf",
    category: "Proof of Address",
    url: "/placeholder.svg",
    uploadedBy: "Admin",
    uploadedAt: "Jul 14, 2026",
  },
  {
    id: "att-3",
    name: "Credit_Report_IdentityIQ.pdf",
    size: "1.5 MB",
    type: "application/pdf",
    category: "Credit Report",
    url: "/placeholder.svg",
    uploadedBy: "Admin",
    uploadedAt: "Jul 20, 2026",
  },
  {
    id: "att-4",
    name: "CFPB_Submission_Confirmation.png",
    size: "169 KB",
    type: "image/png",
    category: "CFPB",
    url: "/placeholder.svg",
    uploadedBy: "Jezel Ane Mirambel",
    uploadedAt: "Aug 14, 2026",
  },
  {
    id: "att-5",
    name: "Experian_Dispute_Response.jpg",
    size: "212 KB",
    type: "image/jpeg",
    category: "Bureau Calling Evidence",
    url: "/placeholder.svg",
    uploadedBy: "Keila Betancourt",
    uploadedAt: "Aug 18, 2026",
  },
];

/* ------------------------------------------------------------------ */
/* File-type predicates                                                */
/*                                                                     */
/* Both the attachment grid and the viewer need to decide how to render */
/* a file. They previously each carried their own copy of this test;    */
/* one definition keeps them from drifting apart.                       */
/* ------------------------------------------------------------------ */

/**
 * A file attached to a comment on the activity timeline. Narrower than
 * AttachmentFile: no category, and it belongs to a comment rather than to the
 * client file itself.
 */
export interface CommentAttachment {
  id: string;
  name: string;
  size: string;
  type: string;
  url: string;
}

type MaybeFile = Pick<AttachmentFile, "type" | "name"> | null | undefined;

export const isImageFile = (f: MaybeFile): boolean =>
  Boolean(f?.type?.startsWith("image/"));

export const isPdfFile = (f: MaybeFile): boolean =>
  f?.type === "application/pdf" ||
  Boolean(f?.name?.toLowerCase().endsWith(".pdf"));
