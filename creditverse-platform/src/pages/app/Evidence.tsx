import { useState } from "react";
import {
  FolderLock,
  Upload,
  FileText,
  ShieldCheck,
  Search,
  Download,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";

const docs = [
  {
    name: "Midland settlement letter.pdf",
    client: "Maria Gonzalez",
    issue: "ISS-0418",
    type: "Settlement",
    uploaded: "08/22/2026",
    hash: "a3f9…b21c",
  },
  {
    name: "Bank statement 01-2024.pdf",
    client: "Maria Gonzalez",
    issue: "ISS-0418",
    type: "Payment proof",
    uploaded: "08/22/2026",
    hash: "7d2e…91fa",
  },
  {
    name: "Account agreement.jpg",
    client: "Devon Park",
    issue: "ISS-0417",
    type: "Agreement",
    uploaded: "08/19/2026",
    hash: "c0b8…3e47",
  },
  {
    name: "Identity theft report.pdf",
    client: "Lena Ortiz",
    issue: "ISS-0416",
    type: "FTC report",
    uploaded: "08/15/2026",
    hash: "f5a1…2d90",
  },
  {
    name: "Equifax dispute response.pdf",
    client: "James Whitaker",
    issue: "ISS-0415",
    type: "CRA response",
    uploaded: "08/12/2026",
    hash: "9e4c…77ab",
  },
];

const typeColor: Record<string, string> = {
  Settlement: "bg-emerald-500/10 text-emerald-600",
  "Payment proof": "bg-blue-500/10 text-blue-600",
  Agreement: "bg-amber-500/10 text-amber-600",
  "FTC report": "bg-red-500/10 text-red-600",
  "CRA response": "bg-purple-500/10 text-purple-600",
};

const Evidence = ({ embedded = false }: { embedded?: boolean }) => {
  const [q, setQ] = useState("");
  const filtered = docs.filter(
    (d) =>
      d.name.toLowerCase().includes(q.toLowerCase()) ||
      d.client.toLowerCase().includes(q.toLowerCase()),
  );

  return (
    <div className={embedded ? "" : "p-6 md:p-8"}>
      <div className="mb-8 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Evidence Vault</h1>
          <p className="text-sm text-muted-foreground">
            Every document is linked to an issue with immutable provenance and a
            content hash.
          </p>
        </div>
        <Button className="bg-gradient-emerald text-white hover:opacity-90">
          <Upload className="h-4 w-4" /> Upload evidence
        </Button>
      </div>

      <div className="mb-4 flex items-center gap-3">
        <div className="relative max-w-sm flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Search documents or clients…"
            className="pl-9"
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {filtered.map((d) => (
          <div
            key={d.hash}
            className="rounded-2xl border border-border bg-card p-5"
          >
            <div className="flex items-start justify-between">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-emerald-500/10 text-emerald-600">
                <FileText className="h-5 w-5" />
              </div>
              <Badge className={typeColor[d.type]}>{d.type}</Badge>
            </div>
            <h3 className="mt-4 truncate text-sm font-semibold">{d.name}</h3>
            <p className="mt-1 text-xs text-muted-foreground">
              {d.client} · {d.issue}
            </p>
            <div className="mt-4 flex items-center justify-between border-t border-border pt-3 text-xs text-muted-foreground">
              <span className="flex items-center gap-1">
                <ShieldCheck className="h-3.5 w-3.5 text-emerald-600" />
                {d.hash}
              </span>
              <span>{d.uploaded}</span>
            </div>
            <Button variant="outline" size="sm" className="mt-3 w-full">
              <Download className="h-3.5 w-3.5" /> Download
            </Button>
          </div>
        ))}
      </div>

      <div className="mt-6 flex items-start gap-3 rounded-2xl border border-border bg-muted/40 p-5">
        <FolderLock className="mt-0.5 h-5 w-5 shrink-0 text-emerald-600" />
        <p className="text-sm text-muted-foreground">
          Evidence objects are encrypted at rest, scoped per tenant, and never
          destructively overwritten. Originals are preserved so you can prove
          what was reported before a dispute.
        </p>
      </div>
    </div>
  );
};

export default Evidence;
