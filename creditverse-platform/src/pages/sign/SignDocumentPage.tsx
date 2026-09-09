/**
 * /sign/:token — the signer's page. No account, no app shell.
 *
 * The link is the only key, exactly as an invitation's is. Opening it records
 * "viewed"; reading it through, typing a full name and confirming consent
 * records the signature — into the frozen snapshot, with the date, kept
 * beside the original. A signed page shows the signed copy, read-only.
 *
 * Everything shown comes from `signature_request_preview`, which discloses
 * nothing for a voided or unknown token.
 */
import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { CheckCircle2, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { fetchSignaturePreview, signDocument, type SignaturePreview } from "@/lib/data/documents";
import { formatDate } from "@/lib/format-date";

/* Before signing, the two signing fields read as lines to sign on, not as
   template code. The snapshot itself is untouched — this is display only. */
const withSignatureLines = (html: string) =>
  html
    .replace(/\{\{\s*signature\s*\}\}/gi, '<span class="signature-line">your signature</span>')
    .replace(/\{\{\s*signed_date\s*\}\}/gi, '<span class="signature-line">date signed</span>');

const isUuid = (v: string) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v);

export default function SignDocumentPage() {
  const { token = "" } = useParams<{ token: string }>();
  const [doc, setDoc] = useState<SignaturePreview | null | "loading" | "gone">("loading");
  const [name, setName] = useState("");
  const [consent, setConsent] = useState(false);
  const [signing, setSigning] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!isUuid(token)) { setDoc("gone"); return; }
    let cancelled = false;
    fetchSignaturePreview(token)
      .then((d) => { if (!cancelled) setDoc(d ?? "gone"); })
      .catch(() => { if (!cancelled) setDoc("gone"); });
    return () => { cancelled = true; };
  }, [token]);

  const sign = async () => {
    setSigning(true); setError(null);
    try {
      await signDocument(token, name, consent);
      const refreshed = await fetchSignaturePreview(token);
      setDoc(refreshed ?? "gone");
    } catch (e) {
      const message = (e as { message?: string })?.message ?? "Signing did not go through.";
      setError(message);
    } finally {
      setSigning(false);
    }
  };

  const shell = (children: React.ReactNode) => (
    <div className="min-h-screen bg-background px-4 py-8">
      <div className="mx-auto max-w-3xl">{children}</div>
    </div>
  );

  if (doc === "loading") {
    return shell(<p className="py-16 text-center text-sm text-muted-foreground"><Loader2 className="mr-2 inline h-4 w-4 animate-spin" /> Opening your document…</p>);
  }
  if (doc === "gone") {
    return shell(
      <div className="rounded-xl border border-border bg-card p-8 text-center">
        <h1 className="text-lg font-bold text-foreground">This signing link is not valid</h1>
        <p className="mt-2 text-sm text-muted-foreground">It may have been withdrawn, or the address was mistyped. Ask the sender for a new link.</p>
      </div>,
    );
  }

  const brandName = doc.agencyName;
  const logo = doc.agencyBranding?.logoUrl ?? null;
  const signed = doc.status === "signed";
  const expired = doc.status === "expired";

  return shell(
    <>
      <div className="mb-4 flex items-center gap-3">
        {logo ? <img src={logo} alt="" className="h-9 w-9 rounded-lg object-contain" /> : null}
        <div>
          <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground">{brandName}</p>
          <h1 className="text-xl font-bold text-foreground">{doc.title}</h1>
          <p className="text-xs text-muted-foreground">For {doc.signerName} · {doc.signerEmail}</p>
        </div>
      </div>

      {signed && (
        <div className="mb-4 flex items-start gap-2 rounded-lg border border-emerald-600/30 bg-emerald-500/10 p-3 text-sm text-emerald-900">
          <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />
          <span>Signed {doc.signedAt ? `on ${formatDate(doc.signedAt)}` : ""}. This is your signed copy; it will not change.</span>
        </div>
      )}
      {expired && (
        <div className="mb-4 rounded-lg border border-amber-500/40 bg-amber-500/10 p-3 text-sm text-amber-900">
          This link expired on {formatDate(doc.expiresAt)}. Ask the sender for a new one — nothing was signed.
        </div>
      )}

      {/* The agency's own document, rendered server-side with every merge value escaped. */}
      <article className="document-body rounded-xl border border-border bg-card p-6 text-foreground shadow-sm"
        dangerouslySetInnerHTML={{ __html: signed && doc.signedHtml ? doc.signedHtml : withSignatureLines(doc.renderedHtml) }} />

      {!signed && !expired && (
        <div className="mt-4 rounded-xl border border-border bg-card p-5">
          <h2 className="text-sm font-bold text-foreground">Sign this document</h2>
          <p className="mt-1 text-xs text-muted-foreground">
            Type your full name as your signature. It will be placed where the document says &ldquo;Signed&rdquo;,
            with today&apos;s date, and the document is then final.
          </p>
          <label className="mt-3 block text-xs">
            <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Your full name</span>
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder={doc.signerName} className="mt-1 h-10 text-base" autoComplete="name" />
          </label>
          <label className="mt-3 flex items-start gap-2 text-xs text-foreground">
            <input type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)} className="mt-0.5" />
            <span>I have read this document and agree to sign it electronically. I understand my typed name is my legal signature.</span>
          </label>
          {error && <p role="alert" className="mt-2 text-xs text-status-danger">{error}</p>}
          <Button className="mt-4" disabled={signing || name.trim().length < 2 || !consent} onClick={() => void sign()}>
            {signing && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />} Sign document
          </Button>
          <p className="mt-3 text-[11px] text-muted-foreground">
            Valid until {formatDate(doc.expiresAt)}. Only {doc.signerEmail} was sent this link.
          </p>
        </div>
      )}
    </>,
  );
}
