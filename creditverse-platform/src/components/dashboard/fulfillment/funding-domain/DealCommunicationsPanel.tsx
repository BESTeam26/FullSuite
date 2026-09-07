/**
 * What was actually said to this lender.
 *
 * A log, not a mailbox. It records that contact happened — a call, an email
 * that went out — so the next person to pick the deal up does not start from
 * nothing. Nothing here sends anything, and it says so.
 *
 * Append-only by policy: a correction is another entry, never an edit
 * (rule 11).
 */
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowDownLeft, ArrowUpRight, Loader2, MessageSquare, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { OpsSelect } from "@/components/ui/ops-select";
import { formatDateTime } from "@/lib/format-date";
import { errorMessage } from "@/lib/data/error-message";
import { useAuth } from "@/lib/auth/auth-context";
import {
  fetchDealCommunications,
  recordDealCommunication,
  type DealCommChannel,
  type DealCommDirection,
} from "@/lib/data/funding-domain";

const CHANNEL_LABEL: Record<DealCommChannel, string> = {
  email: "Email",
  phone: "Phone",
  portal: "Lender portal",
  meeting: "Meeting",
  note: "Note",
};

const inputCls =
  "w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary";
const labelCls = "mb-1 block text-[10px] font-bold uppercase tracking-wider text-muted-foreground";

export function DealCommunicationsPanel({ dealId, canEdit }: { dealId: string; canEdit: boolean }) {
  const auth = useAuth();
  const qc = useQueryClient();
  const [adding, setAdding] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState({
    direction: "outbound" as DealCommDirection,
    channel: "email" as DealCommChannel,
    counterparty: "",
    subject: "",
    body: "",
  });

  const log = useQuery({
    queryKey: ["funding", "deal-comms", dealId],
    queryFn: () => fetchDealCommunications(dealId),
    staleTime: 30_000,
  });

  const record = useMutation({
    mutationFn: () =>
      recordDealCommunication({
        dealId,
        direction: form.direction,
        channel: form.channel,
        counterparty: form.counterparty.trim() || null,
        subject: form.subject.trim() || null,
        body: form.body.trim(),
        actorId: auth.user?.id as string,
      }),
    onSuccess: () => {
      setForm((f) => ({ ...f, counterparty: "", subject: "", body: "" }));
      setAdding(false);
      void qc.invalidateQueries({ queryKey: ["funding", "deal-comms", dealId] });
    },
    onError: (e) => setError(errorMessage(e, "That could not be recorded.")),
  });

  const rows = log.data ?? [];

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
          <MessageSquare className="h-3.5 w-3.5" /> Contact with this lender
        </h3>
        {canEdit && !adding && (
          <Button type="button" size="sm" variant="outline" onClick={() => setAdding(true)}>
            <Plus className="mr-1 h-3.5 w-3.5" /> Record contact
          </Button>
        )}
      </div>

      {error && (
        <p role="alert" className="text-xs text-status-danger">
          {error}
        </p>
      )}

      {adding && (
        <form
          className="space-y-2 rounded-lg border border-border bg-background p-3"
          onSubmit={(e) => {
            e.preventDefault();
            if (form.body.trim()) record.mutate();
          }}
        >
          <div className="grid gap-2 sm:grid-cols-3">
            <label className="block">
              <span className={labelCls}>Direction</span>
              <OpsSelect
                value={form.direction}
                onValueChange={(v) => setForm((f) => ({ ...f, direction: v as DealCommDirection }))}
                options={[
                  { value: "outbound", label: "We contacted them" },
                  { value: "inbound", label: "They contacted us" },
                ]}
                size="field"
                aria-label="Direction"
              />
            </label>
            <label className="block">
              <span className={labelCls}>Channel</span>
              <OpsSelect
                value={form.channel}
                onValueChange={(v) => setForm((f) => ({ ...f, channel: v as DealCommChannel }))}
                options={(Object.keys(CHANNEL_LABEL) as DealCommChannel[]).map((k) => ({
                  value: k,
                  label: CHANNEL_LABEL[k],
                }))}
                size="field"
                aria-label="Channel"
              />
            </label>
            <label className="block">
              <span className={labelCls}>Who</span>
              <input
                className={inputCls}
                value={form.counterparty}
                onChange={(e) => setForm((f) => ({ ...f, counterparty: e.target.value }))}
                placeholder="Name at the lender"
              />
            </label>
          </div>
          <label className="block">
            <span className={labelCls}>Subject</span>
            <input
              className={inputCls}
              value={form.subject}
              onChange={(e) => setForm((f) => ({ ...f, subject: e.target.value }))}
            />
          </label>
          <label className="block">
            <span className={labelCls}>What was said</span>
            <textarea
              className={`${inputCls} min-h-20`}
              value={form.body}
              onChange={(e) => setForm((f) => ({ ...f, body: e.target.value }))}
              required
            />
          </label>
          <div className="flex justify-end gap-2">
            <Button type="button" size="sm" variant="outline" onClick={() => { setAdding(false); setError(null); }}>
              Cancel
            </Button>
            <Button type="submit" size="sm" disabled={record.isPending || !form.body.trim()}>
              {record.isPending && <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />} Record it
            </Button>
          </div>
        </form>
      )}

      {log.isLoading ? (
        <p className="text-xs text-muted-foreground">Loading…</p>
      ) : rows.length === 0 ? (
        <p className="text-xs text-muted-foreground">
          Nothing recorded yet. This is a log of contact — it does not send email.
        </p>
      ) : (
        <ul className="space-y-2">
          {rows.map((c) => (
            <li key={c.id} className="rounded-lg border border-border bg-background p-3">
              <div className="flex flex-wrap items-center gap-2">
                <span
                  className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-bold ${
                    c.direction === "outbound"
                      ? "border-primary/40 bg-primary/10 text-primary"
                      : "border-emerald-600/30 bg-emerald-500/10 text-status-success"
                  }`}
                >
                  {c.direction === "outbound" ? <ArrowUpRight className="h-3 w-3" /> : <ArrowDownLeft className="h-3 w-3" />}
                  {CHANNEL_LABEL[c.channel]}
                </span>
                {c.counterparty && <span className="text-xs font-semibold text-foreground">{c.counterparty}</span>}
                {c.subject && <span className="text-xs text-foreground">{c.subject}</span>}
                <span className="ml-auto text-[10px] text-muted-foreground">
                  {c.recordedByName ?? "Unknown"} · {formatDateTime(c.occurredAt)}
                </span>
              </div>
              <p className="mt-1.5 whitespace-pre-wrap text-xs text-foreground">{c.body}</p>
            </li>
          ))}
        </ul>
      )}
      <p className="text-[10px] text-muted-foreground">
        Entries cannot be edited or deleted — a correction is another entry. This log is the
        organization's record and is never visible to the lender.
      </p>
    </div>
  );
}
