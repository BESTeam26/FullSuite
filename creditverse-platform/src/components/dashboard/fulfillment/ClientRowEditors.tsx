/**
 * Cells you can edit in the row, the way Dee's dispute board works.
 *
 * ── EVERY EDIT LEAVES A TRAIL ──────────────────────────────────────────────
 *
 * Changing a round, a processed date or a due date writes the record, and the
 * database trigger on `fulfillment_clients` writes the activity entry. The
 * screen never writes the log itself — that is how a timeline ends up claiming
 * a change that did not happen, which is exactly the bug the "Move to X"
 * selector had.
 *
 * ── DAYS TO UPDATE IS DERIVED ──────────────────────────────────────────────
 *
 * Due date minus today, computed on render. Storing it would be wrong by
 * tomorrow — the same reason ClickUp keeps its own "Days Active" as a formula.
 */
import { useState } from "react";
import { ChevronDown, Loader2, Pencil } from "lucide-react";
import { OpsSelect } from "@/components/ui/ops-select";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { formatDate } from "@/lib/format-date";
import { cn } from "@/lib/utils";

/** Whole days from today to a due date. Negative once it has passed. */
export function daysUntil(due: string | null | undefined): number | null {
  if (!due) return null;
  const at = Date.parse(`${String(due).slice(0, 10)}T00:00:00Z`);
  if (!Number.isFinite(at)) return null;
  const today = Date.parse(`${new Date().toISOString().slice(0, 10)}T00:00:00Z`);
  return Math.round((at - today) / 86_400_000);
}

/** A date cell that turns into a date input when clicked. */
export function EditableDateCell({ value, onSave, label, tone }: {
  value: string | null;
  onSave: (next: string | null) => Promise<void>;
  label: string;
  tone?: string;
}) {
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);

  if (editing) {
    return (
      <input
        type="date"
        autoFocus
        defaultValue={value ? String(value).slice(0, 10) : ""}
        aria-label={label}
        disabled={saving}
        className="w-full rounded border border-primary bg-background px-1 py-0.5 text-[11px] text-foreground focus:outline-none"
        onBlur={() => !saving && setEditing(false)}
        onKeyDown={async (e) => {
          if (e.key === "Escape") { setEditing(false); return; }
          if (e.key !== "Enter") return;
          const next = (e.currentTarget as HTMLInputElement).value || null;
          setSaving(true);
          try { await onSave(next); } finally { setSaving(false); setEditing(false); }
        }}
      />
    );
  }

  return (
    <button
      type="button"
      onClick={() => setEditing(true)}
      aria-label={`${label} — click to change`}
      className={cn(
        "group flex w-full items-center gap-1 rounded border border-transparent px-1 py-0.5",
        "text-left text-[11px] transition-colors",
        "hover:border-border hover:bg-muted",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary",
        tone ?? "text-foreground",
      )}
    >
      {saving ? <Loader2 className="h-3 w-3 animate-spin" /> : (
        <>
          <span className="flex-1 truncate">
            {value ? formatDate(value) : <span className="text-muted-foreground">—</span>}
          </span>
          {/* Only on hover: a permanent icon in every cell of every row is
              noise, and a cell that gives no sign at all is not editable to
              anybody who has not been told. */}
          <Pencil className="h-2.5 w-2.5 shrink-0 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100" />
        </>
      )}
    </button>
  );
}

/** A dropdown cell — the round, and anything else with a fixed vocabulary. */
export function EditableChoiceCell({ value, options, onSave, label }: {
  value: string;
  options: readonly string[];
  onSave: (next: string) => Promise<void>;
  label: string;
}) {
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);

  if (editing) {
    return (
      <OpsSelect
        autoFocus
        openOnMount
        size="inline"
        aria-label={label}
        value={value}
        options={options as string[]}
        onDismiss={() => setEditing(false)}
        onValueChange={async (v) => {
          setSaving(true);
          try { await onSave(v); } finally { setSaving(false); setEditing(false); }
        }}
      />
    );
  }

  return (
    <button
      type="button"
      onClick={() => setEditing(true)}
      aria-label={`${label} — click to change`}
      className="group flex w-full items-center gap-1 rounded border border-transparent px-1 py-0.5 text-left text-[11px] font-semibold text-foreground transition-colors hover:border-border hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
    >
      {saving ? <Loader2 className="h-3 w-3 animate-spin" /> : (
        <>
          <span className="flex-1 truncate">{value}</span>
          <ChevronDown className="h-3 w-3 shrink-0 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100" />
        </>
      )}
    </button>
  );
}

/**
 * The due date, in the row, for somebody who may override it.
 *
 * ── WHY THIS IS NOT `EditableDateCell` ─────────────────────────────────────
 *
 * `fulfillment_clients.due_at` is DERIVED — the earliest of the client's open
 * department deadlines, rewritten by the database whenever work moves. Typing
 * into it directly saves a number the next status change silently discards,
 * which is worse than an uneditable field because it looks like it worked.
 *
 * So the cell writes an override on the department that owns the deadline,
 * exactly as the client file does: the calculated date is preserved beside it
 * and the reason is recorded. Dee: "I do not want silent date edits that
 * destroy the original SLA logic." One extra field is the price of that, and
 * anyone without `ops.manage` sees the date read-only.
 */
export function DueDateOverrideCell({ value, department, onSave, onClear }: {
  value: string | null;
  department: string | null;
  onSave: (date: string, reason: string) => Promise<void>;
  onClear: () => Promise<void>;
}) {
  const [open, setOpen] = useState(false);
  const [date, setDate] = useState("");
  const [reason, setReason] = useState("");
  const [saving, setSaving] = useState(false);

  const shown = value ? formatDate(value) : "—";
  if (!department) {
    return <span className="text-[11px] text-muted-foreground">{shown}</span>;
  }

  return (
    <Popover open={open} onOpenChange={(o) => { setOpen(o); if (o) { setDate(value ? String(value).slice(0, 10) : ""); setReason(""); } }}>
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label="Due date — click to adjust"
          className="group flex w-full items-center gap-1 rounded border border-transparent px-1 py-0.5 text-left text-[11px] text-foreground transition-colors hover:border-border hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
        >
          <span className="flex-1 truncate">{shown}</span>
          <Pencil className="h-2.5 w-2.5 shrink-0 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100" />
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-72 space-y-2 p-3">
        <p className="text-[11px] text-muted-foreground">
          Adjusting the {department} deadline. The calculated date is kept beside it.
        </p>
        <input
          type="date"
          value={date}
          onChange={(e) => setDate(e.target.value)}
          aria-label="New due date"
          className="h-8 w-full rounded border border-border bg-background px-2 text-xs text-foreground"
        />
        <input
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          placeholder="Why is this date different?"
          aria-label="Reason for the override"
          className="h-8 w-full rounded border border-border bg-background px-2 text-xs text-foreground"
        />
        <div className="flex gap-2">
          <button
            type="button"
            disabled={!date || !reason.trim() || saving}
            onClick={async () => {
              setSaving(true);
              try { await onSave(date, reason.trim()); setOpen(false); } finally { setSaving(false); }
            }}
            className="inline-flex h-8 flex-1 items-center justify-center rounded bg-primary text-xs font-medium text-primary-foreground disabled:opacity-50"
          >
            {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : "Save"}
          </button>
          <button
            type="button"
            disabled={saving}
            onClick={async () => {
              setSaving(true);
              try { await onClear(); setOpen(false); } finally { setSaving(false); }
            }}
            className="inline-flex h-8 items-center justify-center rounded border border-border px-2 text-xs text-foreground hover:bg-muted disabled:opacity-50"
          >
            System date
          </button>
        </div>
      </PopoverContent>
    </Popover>
  );
}

/** Days to the next update. Read-only because it is arithmetic, not a field. */
export function DaysToUpdateCell({ dueAt }: { dueAt: string | null }) {
  const days = daysUntil(dueAt);
  if (days === null) return <span className="text-muted-foreground">—</span>;
  return (
    <span className={cn(
      "font-semibold tabular-nums",
      days < 0 ? "text-status-danger" : days <= 3 ? "text-amber-700" : "text-foreground",
    )}>
      {days < 0 ? `${Math.abs(days)}d over` : days === 0 ? "today" : `${days}d`}
    </span>
  );
}
