import {
  FileSearch,
  Plus,
  Clock,
  CheckCircle2,
  AlertCircle,
  Send,
} from "lucide-react";
import { Button } from "@/components/ui/button";

const stages = [
  { name: "Intake", count: 8, color: "bg-slate-400" },
  { name: "Drafting", count: 14, color: "bg-blue-500" },
  { name: "Filed", count: 22, color: "bg-amber-500" },
  { name: "Verification", count: 11, color: "bg-purple-500" },
  { name: "Deleted", count: 31, color: "bg-emerald-500" },
];

const disputes = [
  {
    id: "DSP-2041",
    client: "Maria Gonzalez",
    item: "Late payment — Chase",
    type: "Factual",
    bureau: "Experian",
    status: "Filed",
  },
  {
    id: "DSP-2040",
    client: "Devon Park",
    item: "Collection — Midland",
    type: "Metro2",
    bureau: "Equifax",
    status: "Verification",
  },
  {
    id: "DSP-2039",
    client: "Lena Ortiz",
    item: "Inquiry — Synchrony",
    type: "Factual",
    bureau: "TransUnion",
    status: "Deleted",
  },
  {
    id: "DSP-2038",
    client: "James Whitaker",
    item: "Charge-off — Capital One",
    type: "Metro2",
    bureau: "Experian",
    status: "Drafting",
  },
  {
    id: "DSP-2037",
    client: "Tanya Brooks",
    item: "Late payment — Discover",
    type: "Factual",
    bureau: "Equifax",
    status: "Intake",
  },
];

const statusIcon: Record<string, React.ReactNode> = {
  Intake: <Clock className="h-4 w-4 text-slate-500" />,
  Drafting: <FileSearch className="h-4 w-4 text-blue-500" />,
  Filed: <Send className="h-4 w-4 text-amber-500" />,
  Verification: <AlertCircle className="h-4 w-4 text-purple-500" />,
  Deleted: <CheckCircle2 className="h-4 w-4 text-emerald-500" />,
};

const Disputes = () => (
  <div className="p-6 md:p-8">
    <div className="mb-8 flex items-center justify-between">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Disputes</h1>
        <p className="text-sm text-muted-foreground">
          Manage every dispute across all three bureaus
        </p>
      </div>
      <Button className="bg-gradient-emerald text-white hover:opacity-90">
        <Plus className="h-4 w-4" /> New dispute
      </Button>
    </div>

    <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-5">
      {stages.map((s) => (
        <div
          key={s.name}
          className="rounded-xl border border-border bg-card p-4"
        >
          <div className="flex items-center gap-2">
            <span className={`h-2.5 w-2.5 rounded-full ${s.color}`} />
            <span className="text-xs font-medium text-muted-foreground">
              {s.name}
            </span>
          </div>
          <p className="mt-2 text-2xl font-bold">{s.count}</p>
        </div>
      ))}
    </div>

    <div className="overflow-hidden rounded-2xl border border-border bg-card">
      <div className="border-b border-border p-6">
        <h2 className="font-semibold">Active disputes</h2>
      </div>
      <table className="w-full text-sm">
        <thead className="border-b border-border bg-muted/40 text-left text-xs uppercase text-muted-foreground">
          <tr>
            <th className="px-6 py-3 font-medium">Dispute</th>
            <th className="px-6 py-3 font-medium">Client</th>
            <th className="px-6 py-3 font-medium">Item</th>
            <th className="px-6 py-3 font-medium">Type</th>
            <th className="px-6 py-3 font-medium">Bureau</th>
            <th className="px-6 py-3 font-medium">Status</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {disputes.map((d) => (
            <tr key={d.id} className="hover:bg-muted/30">
              <td className="px-6 py-4 font-mono text-xs font-medium text-emerald-600">
                {d.id}
              </td>
              <td className="px-6 py-4 font-medium">{d.client}</td>
              <td className="px-6 py-4 text-muted-foreground">{d.item}</td>
              <td className="px-6 py-4">
                <span
                  className={`rounded-full px-2 py-0.5 text-xs font-medium ${d.type === "Metro2" ? "bg-purple-500/10 text-purple-600" : "bg-blue-500/10 text-blue-600"}`}
                >
                  {d.type}
                </span>
              </td>
              <td className="px-6 py-4">{d.bureau}</td>
              <td className="px-6 py-4">
                <span className="flex items-center gap-1.5 text-xs font-medium">
                  {statusIcon[d.status]} {d.status}
                </span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  </div>
);

export default Disputes;
