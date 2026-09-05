/**
 * Shared table shell for the Deals record lists: same header, loading and
 * empty rows everywhere, and the borrower → business → FND- cell that every
 * record page begins with (Dee: client first, then business).
 */
import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import { Loader2 } from "lucide-react";
import type { RecordFileRef } from "@/lib/data/funding-records";
import { cn } from "@/lib/utils";

interface Props { headers: string[]; loading: boolean; error: unknown; emptyText: string; count: number; children: ReactNode }

export function RecordTable({ headers, loading, error, emptyText, count, children }: Props) {
  return (
    <div className="overflow-x-auto rounded-xl border border-border bg-card shadow-sm">
      <table className="w-full text-left text-xs">
        <thead className="bg-muted/50 text-[11px] uppercase tracking-wider text-muted-foreground">
          <tr>{headers.map((h) => <th key={h} className="px-4 py-2 font-bold">{h}</th>)}</tr>
        </thead>
        <tbody>
          {loading && <tr><td colSpan={headers.length} className="px-4 py-6 text-center text-muted-foreground"><Loader2 className="mr-1 inline h-4 w-4 animate-spin" /> Loading…</td></tr>}
          {!loading && !!error && <tr><td colSpan={headers.length} role="alert" className="px-4 py-6 text-center text-status-danger">Could not load these records.</td></tr>}
          {!loading && !error && count === 0 && <tr><td colSpan={headers.length} className="px-4 py-6 text-center text-muted-foreground">{emptyText}</td></tr>}
          {!loading && !error && children}
        </tbody>
      </table>
    </div>
  );
}

export function FileCell({ file, detail }: { file: RecordFileRef; detail?: string | null }) {
  const title = file.clientName ?? file.businessName ?? "File";
  const sub = [file.clientName ? file.businessName : null, detail ?? file.purpose].filter(Boolean).join(" · ");
  return (
    <td className="px-4 py-2">
      {file.fileId ? <Link to={`/app/funding-files/${file.fileId}`} className="font-semibold text-primary hover:underline">{title}</Link> : <span className="font-semibold text-foreground">{title}</span>}
      <p className="text-[11px] text-muted-foreground">{sub}{file.publicId && <span className="ml-1 font-mono text-[10px]">{file.publicId}</span>}</p>
    </td>
  );
}

export function Pill({ children, tone = "neutral" }: { children: ReactNode; tone?: "neutral" | "ok" | "warn" | "bad" | "info" }) {
  const cls = {
    neutral: "border-border bg-muted text-muted-foreground",
    ok: "border-emerald-500/30 bg-emerald-500/10 text-emerald-700",
    warn: "border-amber-500/30 bg-amber-500/10 text-amber-800",
    bad: "border-red-500/30 bg-red-500/10 text-red-700",
    info: "border-blue-500/30 bg-blue-500/10 text-blue-700",
  }[tone];
  return <span className={cn("inline-flex rounded-full border px-2 py-0.5 text-[10px] font-semibold", cls)}>{children}</span>;
}
