/**
 * Visibility picker and badge for the activity timeline.
 *
 * Presentation only. Which levels an author may create comes from
 * `allowedVisibilities()` in the activity model, and the database enforces the
 * same rule in the insert policy — this component decides nothing (rule 13).
 * It exists so a user is not offered an option that would then be refused.
 *
 * The picker never preselects anything but BES Internal. Publishing is a
 * decision; a composer that quietly defaults to "shared" is how an internal
 * note reaches a customer.
 */
import { Eye, Building2, Handshake, Lock } from "lucide-react";
import { OpsSelect } from "@/components/ui/ops-select";
import { cn } from "@/lib/utils";
import {
  VISIBILITY_HINT,
  VISIBILITY_LABEL,
  type ActivityVisibility,
} from "@/lib/data/activity";

const ICON: Record<ActivityVisibility, typeof Lock> = {
  bes_internal: Lock,
  organization_internal: Building2,
  shared_with_partner: Handshake,
  client_visible: Eye,
};

/**
 * Tone rises with reach, so the badge reads at a glance: locked is quiet,
 * client-visible is loud. Both themes, via status tokens (rule 15).
 */
const TONE: Record<ActivityVisibility, string> = {
  bes_internal: "border-border bg-muted text-muted-foreground",
  organization_internal: "border-border bg-muted text-foreground",
  shared_with_partner: "border-primary/30 bg-primary/10 text-status-info",
  client_visible: "border-amber-500/30 bg-amber-500/10 text-status-warning",
};

/** A small marker on a persisted entry, saying who can read it. */
export function VisibilityBadge({
  visibility,
  className,
}: {
  visibility: ActivityVisibility;
  className?: string;
}) {
  const Icon = ICON[visibility];
  return (
    <span
      title={VISIBILITY_HINT[visibility]}
      className={cn(
        "inline-flex shrink-0 items-center gap-1 rounded-full border px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide",
        TONE[visibility],
        className,
      )}
    >
      <Icon className="h-2.5 w-2.5" />
      {VISIBILITY_LABEL[visibility]}
    </span>
  );
}

/**
 * The composer's audience control.
 *
 * `options` is what the author is authorized to create — computed centrally and
 * passed in, never derived here.
 */
export function VisibilityPicker({
  value,
  onChange,
  options,
  disabled,
}: {
  value: ActivityVisibility;
  onChange: (v: ActivityVisibility) => void;
  options: ActivityVisibility[];
  disabled?: boolean;
}) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className="text-[11px] font-semibold text-muted-foreground">
        Visible to
      </span>
      <OpsSelect
        value={value}
        onValueChange={(v) => onChange(v as ActivityVisibility)}
        options={options.map((v) => ({ value: v, label: VISIBILITY_LABEL[v] }))}
        disabled={disabled}
        aria-label="Who can see this note"
      />
      {/* Say the consequence in words next to the control, so the choice is
          legible before posting rather than discoverable afterwards. */}
      <span className="text-[11px] text-muted-foreground">
        {VISIBILITY_HINT[value]}
      </span>
    </div>
  );
}
