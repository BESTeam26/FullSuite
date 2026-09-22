/**
 * "Add column" on the client list.
 *
 * Dee, 2026-09-22: *"The task list should be able to create column like
 * dropdown and on the actual list i should be able to change the drop down.
 * dont make it too complicated."*
 *
 * So: a name, a type, and — for a dropdown — the choices, one per line. No
 * formulas, no rollups, no conditional formatting. The four types are the
 * ones the field engine already stores, not a new vocabulary.
 *
 * Adding a column changes the list for everybody, so it needs operational
 * management; the database refuses otherwise and the button is not drawn.
 */
import { useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { OpsSelect } from "@/components/ui/ops-select";
import {
  Popover, PopoverContent, PopoverTrigger,
} from "@/components/ui/popover";
import { useAgencyPermissions } from "@/lib/data/agency-permissions";
import {
  useArchiveClientColumn, useClientColumns, useCreateClientColumn,
  type ClientColumnType,
} from "@/lib/data/client-columns";

const TYPES: { value: ClientColumnType; label: string }[] = [
  { value: "select", label: "Dropdown" },
  { value: "text", label: "Text" },
  { value: "number", label: "Number" },
  { value: "date", label: "Date" },
];

export function AddClientColumn() {
  const canManage = useAgencyPermissions().can("ops.manage");
  const { columns } = useClientColumns();
  const create = useCreateClientColumn();
  const archive = useArchiveClientColumn();
  const [open, setOpen] = useState(false);
  const [label, setLabel] = useState("");
  const [type, setType] = useState<ClientColumnType>("select");
  const [choices, setChoices] = useState("");

  /* Not rendered rather than disabled: an offer nobody can accept is worse
     than no offer (rule 3). */
  if (!canManage) return null;

  const options = choices.split("\n").map((o) => o.trim()).filter(Boolean);
  const ready = label.trim().length > 0 && (type !== "select" || options.length > 0);

  const submit = () => {
    create.mutate({ label, type, options }, {
      onSuccess: () => {
        toast.success(`"${label.trim()}" added to the list.`);
        setLabel(""); setChoices(""); setType("select"); setOpen(false);
      },
      onError: (e) => toast.error("Could not add the column", { description: e.message }),
    });
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button size="sm" variant="outline" className="gap-1.5 text-xs">
          <Plus className="h-3.5 w-3.5" /> Add column
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-80 space-y-3">
        <div className="space-y-1.5">
          <label htmlFor="column-name" className="text-xs font-semibold text-foreground">Column name</label>
          <Input id="column-name" value={label} maxLength={40} placeholder="Priority"
            onChange={(e) => setLabel(e.target.value)} />
        </div>

        <div className="space-y-1.5">
          <span className="text-xs font-semibold text-foreground">Type</span>
          <OpsSelect aria-label="Column type" value={type} options={TYPES}
            onValueChange={(v) => setType(v as ClientColumnType)} />
        </div>

        {type === "select" && (
          <div className="space-y-1.5">
            <label htmlFor="column-choices" className="text-xs font-semibold text-foreground">
              Choices, one per line
            </label>
            <textarea id="column-choices" rows={4} value={choices}
              onChange={(e) => setChoices(e.target.value)}
              placeholder={"High\nNormal\nLow"}
              className="w-full rounded-lg border border-border bg-background px-2.5 py-1.5 text-xs text-foreground focus:outline-none focus-visible:ring-2 focus-visible:ring-ring" />
          </div>
        )}

        <Button size="sm" className="w-full" disabled={!ready || create.isPending} onClick={submit}>
          {create.isPending ? "Adding…" : "Add column"}
        </Button>

        {columns.length > 0 && (
          <div className="border-t border-border pt-2">
            <p className="mb-1 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
              Columns you added
            </p>
            <ul className="space-y-0.5">
              {columns.map((c) => (
                <li key={c.id} className="flex items-center justify-between gap-2 text-xs">
                  <span className="truncate text-foreground">{c.label}</span>
                  <button type="button" aria-label={`Remove ${c.label}`}
                    /* Archived, not deleted: the values stay, so removing a
                       column by mistake loses nothing. */
                    onClick={() => archive.mutate(c.id, {
                      onSuccess: () => toast.success(`"${c.label}" removed from the list.`),
                      onError: (e) => toast.error("Could not remove it", { description: e.message }),
                    })}
                    className="shrink-0 rounded p-1 text-muted-foreground transition-colors hover:bg-muted hover:text-status-danger focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )}
      </PopoverContent>
    </Popover>
  );
}
