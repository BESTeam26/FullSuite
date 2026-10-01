/**
 * Save an attachment under its own name. The signed URL asks the browser to
 * download rather than display; the browser does the rest.
 */
import { signedAttachmentUrl, type Attachment } from "@/lib/data/messages";

export async function downloadAttachment(attachment: Attachment): Promise<void> {
  const href = await signedAttachmentUrl(attachment.path, 120, attachment.name);
  const a = document.createElement("a");
  a.href = href;
  a.download = attachment.name;
  a.rel = "noopener";
  document.body.appendChild(a);
  a.click();
  a.remove();
}
