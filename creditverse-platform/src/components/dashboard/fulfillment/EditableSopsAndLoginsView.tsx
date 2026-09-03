/**
 * SOPs, Logins & Partner Notes — ONE scrollable operational reference page.
 * No inner tabs. Everything visible together for fast agent reference.
 */

import { useState } from "react";
import {
  BookOpen,
  Key,
  Lock,
  ExternalLink,
  Plus,
  History,
  FileCheck,
  X,
} from "lucide-react";
import { getPartnerByScope } from "@/lib/fulfillment/creditops-partners";
import { CREDIT_OPS_STATUS_GUIDE } from "@/lib/fulfillment/creditops-status-guide";

interface SopItem {
  id: string;
  title: string;
  content: string;
  link?: string;
  notes?: string;
  lastUpdated: string;
  updatedBy: string;
}

interface LoginItem {
  id: string;
  systemName: string;
  loginUrl: string;
  usernameRef: string;
  notes?: string;
  lastUpdated: string;
  updatedBy: string;
}

interface PartnerNoteItem {
  id: string;
  note: string;
  createdBy: string;
  createdDate: string;
  lastUpdated: string;
}

type AddType = "sop" | "login" | "note" | null;

export function EditableSopsAndLoginsView({
  selectedScope,
}: {
  selectedScope: string;
}) {
  const partner = getPartnerByScope(selectedScope);
  const partnerName = partner?.name ?? "Partner Workspace";

  const [sops, setSops] = useState<SopItem[]>([
    {
      id: "sop-1",
      title: "SOP 1.0 — Client Intake & Onboarding Review",
      content:
        "Verify driver's license, proof of address, full SSN, and active credit monitoring logins before routing to dispute processing.",
      link: "https://docs.google.com/document/d/sop-intake",
      notes: "Mandatory SSN validation required for all new intakes.",
      lastUpdated: "2026-03-11",
      updatedBy: "Amia Gallardo (BES HQ)",
    },
    {
      id: "sop-2",
      title: "SOP 2.0 — 7-Layer TRAP Dispute Escalation Model",
      content:
        "Execute CRA + FTC + CFPB multi-channel filings simultaneously for Round 1 to Round 3 disputes.",
      link: "https://docs.google.com/document/d/sop-trap",
      notes: "Ensure FTC Identity Theft report is attached to CFPB filings.",
      lastUpdated: "2026-03-10",
      updatedBy: "Daniel Reyes",
    },
  ]);

  const [logins, setLogins] = useState<LoginItem[]>([
    {
      id: "log-1",
      systemName: "LetterStream USPS Certified Portal",
      loginUrl: "https://www.letterstream.com",
      usernameRef: "Ref: VAULT_SECRET_LS_01",
      notes: "Use Certified Mail with Return Receipt for Round 2+ disputes.",
      lastUpdated: "2026-03-08",
      updatedBy: "Amia Gallardo",
    },
    {
      id: "log-2",
      systemName: "FTC Identity Theft Report Portal",
      loginUrl: "https://www.identitytheft.gov",
      usernameRef: "Ref: VAULT_SECRET_FTC_02",
      notes: "File under Blue FTC form for Inquiries without codes.",
      lastUpdated: "2026-03-05",
      updatedBy: "Marcus Lee",
    },
  ]);

  const [notes, setNotes] = useState<PartnerNoteItem[]>([
    {
      id: "note-1",
      note: "Special instruction for Apex: Do not mail Experian paper letters. All Experian disputes must be uploaded via Experian Upload Center portal.",
      createdBy: "Amia Gallardo",
      createdDate: "2026-03-01",
      lastUpdated: "2026-03-01",
    },
  ]);

  const [addType, setAddType] = useState<AddType>(null);

  // form state
  const [fTitle, setFTitle] = useState("");
  const [fContent, setFContent] = useState("");
  const [fLink, setFLink] = useState("");
  const [fSystem, setFSystem] = useState("");
  const [fUrl, setFUrl] = useState("");
  const [fRef, setFRef] = useState("");
  const [fNotes, setFNotes] = useState("");
  const [fNoteText, setFNoteText] = useState("");

  const resetForm = () => {
    setFTitle("");
    setFContent("");
    setFLink("");
    setFSystem("");
    setFUrl("");
    setFRef("");
    setFNotes("");
    setFNoteText("");
  };

  const handleSave = () => {
    const today = new Date().toISOString().split("T")[0];
    if (addType === "sop" && fTitle) {
      setSops((p) => [
        ...p,
        {
          id: `sop-${Date.now()}`,
          title: fTitle,
          content: fContent,
          link: fLink,
          notes: fNotes,
          lastUpdated: today,
          updatedBy: "Agent (BES HQ)",
        },
      ]);
    } else if (addType === "login" && fSystem) {
      setLogins((p) => [
        ...p,
        {
          id: `log-${Date.now()}`,
          systemName: fSystem,
          loginUrl: fUrl,
          usernameRef: fRef || "Ref: VAULT_SECRET",
          notes: fNotes,
          lastUpdated: today,
          updatedBy: "Agent (BES HQ)",
        },
      ]);
    } else if (addType === "note" && fNoteText) {
      setNotes((p) => [
        ...p,
        {
          id: `note-${Date.now()}`,
          note: fNoteText,
          createdBy: "Agent (BES HQ)",
          createdDate: today,
          lastUpdated: today,
        },
      ]);
    }
    resetForm();
    setAddType(null);
  };

  return (
    <div className="space-y-6 text-xs text-foreground">
      {/* Page header with 3 add buttons */}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border bg-card p-4 shadow-sm">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10 text-primary">
            <Key className="h-5 w-5" />
          </div>
          <div>
            <h2 className="text-sm font-extrabold text-foreground tracking-wide">
              SOPs, LOGINS & PARTNER NOTES — {partnerName.toUpperCase()}
            </h2>
            <p className="text-xs text-muted-foreground">
              Partner operational reference handbook
            </p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button
            onClick={() => {
              resetForm();
              setAddType("sop");
            }}
            className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-3 py-1.5 font-bold text-primary-foreground hover:opacity-90 shadow-sm"
          >
            <Plus className="h-3.5 w-3.5" /> Add SOP
          </button>
          <button
            onClick={() => {
              resetForm();
              setAddType("login");
            }}
            className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-card px-3 py-1.5 font-bold text-foreground hover:bg-muted/40 shadow-sm"
          >
            <Plus className="h-3.5 w-3.5" /> Add Login
          </button>
          <button
            onClick={() => {
              resetForm();
              setAddType("note");
            }}
            className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-card px-3 py-1.5 font-bold text-foreground hover:bg-muted/40 shadow-sm"
          >
            <Plus className="h-3.5 w-3.5" /> Add Note
          </button>
        </div>
      </div>

      {/* Add modal/drawer */}
      {addType && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-lg rounded-2xl border border-border bg-card p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-extrabold text-foreground">
                {addType === "sop" && "Add New SOP / Instruction"}
                {addType === "login" && "Add Login / System Reference"}
                {addType === "note" && "Add Operational Note"}
              </h3>
              <button
                onClick={() => setAddType(null)}
                className="rounded-lg p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {addType === "sop" && (
              <div className="space-y-3">
                <input
                  value={fTitle}
                  onChange={(e) => setFTitle(e.target.value)}
                  placeholder="SOP Title"
                  className="w-full rounded-lg border border-border bg-background p-2.5 text-xs text-foreground"
                />
                <textarea
                  value={fContent}
                  onChange={(e) => setFContent(e.target.value)}
                  placeholder="Full SOP Content / Instructions..."
                  rows={4}
                  className="w-full rounded-lg border border-border bg-background p-2.5 text-xs text-foreground"
                />
                <input
                  value={fLink}
                  onChange={(e) => setFLink(e.target.value)}
                  placeholder="Document Link (optional)"
                  className="w-full rounded-lg border border-border bg-background p-2.5 text-xs text-foreground"
                />
                <input
                  value={fNotes}
                  onChange={(e) => setFNotes(e.target.value)}
                  placeholder="Additional Notes (optional)"
                  className="w-full rounded-lg border border-border bg-background p-2.5 text-xs text-foreground"
                />
              </div>
            )}

            {addType === "login" && (
              <div className="space-y-3">
                <input
                  value={fSystem}
                  onChange={(e) => setFSystem(e.target.value)}
                  placeholder="Platform / System Name"
                  className="w-full rounded-lg border border-border bg-background p-2.5 text-xs text-foreground"
                />
                <input
                  value={fUrl}
                  onChange={(e) => setFUrl(e.target.value)}
                  placeholder="Login URL"
                  className="w-full rounded-lg border border-border bg-background p-2.5 text-xs text-foreground"
                />
                <input
                  value={fRef}
                  onChange={(e) => setFRef(e.target.value)}
                  placeholder="Vault Account Reference (e.g. VAULT_SECRET_XX)"
                  className="w-full rounded-lg border border-border bg-background p-2.5 text-xs text-foreground"
                />
                <textarea
                  value={fNotes}
                  onChange={(e) => setFNotes(e.target.value)}
                  placeholder="Special Instructions / Notes (optional)"
                  rows={3}
                  className="w-full rounded-lg border border-border bg-background p-2.5 text-xs text-foreground"
                />
              </div>
            )}

            {addType === "note" && (
              <textarea
                value={fNoteText}
                onChange={(e) => setFNoteText(e.target.value)}
                placeholder="Enter operational note..."
                rows={5}
                className="w-full rounded-lg border border-border bg-background p-2.5 text-xs text-foreground"
              />
            )}

            <div className="flex gap-2 justify-end">
              <button
                onClick={() => setAddType(null)}
                className="rounded-lg border border-border px-4 py-2 font-bold text-muted-foreground hover:text-foreground"
              >
                Cancel
              </button>
              <button
                onClick={handleSave}
                className="rounded-lg bg-primary px-4 py-2 font-bold text-primary-foreground hover:opacity-90"
              >
                Save
              </button>
            </div>
          </div>
        </div>
      )}

      {/* SECTION 1: SOPs & Instructions */}
      <section className="rounded-xl border border-border bg-card shadow-sm">
        <div className="flex items-center gap-2 border-b border-border px-4 py-3">
          <BookOpen className="h-4 w-4 text-status-success" />
          <h3 className="text-xs font-black uppercase tracking-wider text-foreground">
            SOPs & Instructions
          </h3>
          <span className="text-xs text-muted-foreground">({sops.length})</span>
        </div>
        <div className="divide-y divide-border/60">
          {sops.map((sop) => (
            <div key={sop.id} className="px-4 py-3 space-y-1.5">
              <div className="flex items-center justify-between gap-2">
                <h4 className="font-bold text-foreground">{sop.title}</h4>
                <span className="text-[10px] text-muted-foreground flex items-center gap-1 whitespace-nowrap">
                  <History className="h-3 w-3" /> {sop.lastUpdated}
                </span>
              </div>
              <p className="text-muted-foreground leading-relaxed">
                {sop.content}
              </p>
              {sop.notes && (
                <p className="text-[11px] text-foreground/70 italic">
                  Note: {sop.notes}
                </p>
              )}
              <div className="flex items-center justify-between">
                <span className="text-[10px] text-muted-foreground">
                  Updated by {sop.updatedBy}
                </span>
                {sop.link && (
                  <a
                    href={sop.link}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1 text-primary hover:underline font-semibold"
                  >
                    Open Document <ExternalLink className="h-3 w-3" />
                  </a>
                )}
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* SECTION 2: Logins & Systems */}
      <section className="rounded-xl border border-border bg-card shadow-sm">
        <div className="flex items-center gap-2 border-b border-border px-4 py-3">
          <Lock className="h-4 w-4 text-purple-600" />
          <h3 className="text-xs font-black uppercase tracking-wider text-foreground">
            Logins & Systems
          </h3>
          <span className="text-xs text-muted-foreground">
            ({logins.length})
          </span>
        </div>
        <div className="divide-y divide-border/60">
          {logins.map((item) => (
            <div key={item.id} className="px-4 py-3 space-y-1.5">
              <div className="flex items-center justify-between gap-2">
                <h4 className="font-bold text-foreground">{item.systemName}</h4>
                <a
                  href={item.loginUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="text-primary hover:underline font-semibold flex items-center gap-1 whitespace-nowrap"
                >
                  Launch <ExternalLink className="h-3 w-3" />
                </a>
              </div>
              <p className="font-mono text-[11px] text-muted-foreground bg-muted px-2 py-1 rounded inline-block">
                {item.usernameRef}
              </p>
              {item.notes && (
                <p className="text-[11px] text-foreground/70 italic">
                  {item.notes}
                </p>
              )}
              <span className="text-[10px] text-muted-foreground">
                Updated by {item.updatedBy} · {item.lastUpdated}
              </span>
            </div>
          ))}
        </div>
      </section>

      {/* SECTION 3: Partner Notes */}
      <section className="rounded-xl border border-border bg-card shadow-sm">
        <div className="flex items-center gap-2 border-b border-border px-4 py-3">
          <FileCheck className="h-4 w-4 text-primary" />
          <h3 className="text-xs font-black uppercase tracking-wider text-foreground">
            Partner Notes
          </h3>
          <span className="text-xs text-muted-foreground">
            ({notes.length})
          </span>
        </div>
        <div className="divide-y divide-border/60">
          {notes.map((n) => (
            <div key={n.id} className="px-4 py-3 space-y-1">
              <p className="text-foreground leading-relaxed whitespace-pre-line">
                {n.note}
              </p>
              <div className="flex items-center justify-between text-[10px] text-muted-foreground">
                <span>By {n.createdBy}</span>
                <span>{n.lastUpdated}</span>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* SECTION 4: Quick Reference */}
      <section className="rounded-xl border border-border bg-card shadow-sm">
        <div className="flex items-center gap-2 border-b border-border px-4 py-3">
          <h3 className="text-xs font-black uppercase tracking-wider text-foreground">
            Status Code Quick Reference
          </h3>
        </div>
        <div className="grid gap-2 p-4 sm:grid-cols-3">
          {CREDIT_OPS_STATUS_GUIDE.slice(0, 9).map((s) => (
            <div
              key={s.code}
              className="rounded-lg border border-border/60 bg-muted/20 p-2.5"
            >
              <span
                className={`inline-block rounded-full border px-2 py-0.5 text-[10px] font-bold ${s.badgeClass}`}
              >
                {s.name}
              </span>
              <p className="mt-1 text-[11px] text-muted-foreground line-clamp-2">
                {s.description}
              </p>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
