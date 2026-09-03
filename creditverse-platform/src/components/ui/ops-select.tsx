/**
 * OpsSelect — the app's dropdown.
 *
 * Replaces the native `<select>`, which the browser renders with the operating
 * system's own menu: a different font, a different palette, and a highlight
 * colour that has nothing to do with this design system. Radix renders the menu
 * as ordinary DOM, so it inherits the app's tokens and looks the same on every
 * machine.
 *
 * The API deliberately mirrors the native element — value, change handler, and
 * a list of options — so call sites read the same way and no screen grows a
 * five-component nest just to show a dropdown (rule 13).
 */

import { type ReactNode } from "react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";

export type OpsSelectOption = string | { value: string; label: ReactNode };

/**
 * Matches the three densities already in use:
 *   inline — an editor opened inside a table cell
 *   sm     — toolbar and filter controls
 *   field  — a labelled field in a form or modal
 */
export type OpsSelectSize = "inline" | "sm" | "field";

/* w-auto is explicit because the underlying shadcn trigger defaults to w-full,
   which would stretch a toolbar filter across the whole row. */
const TRIGGER_SIZES: Record<OpsSelectSize, string> = {
  inline: "h-auto w-auto rounded border-primary px-1.5 py-1 text-[11px] gap-1",
  sm: "h-auto w-auto rounded-lg px-3 py-1.5 text-xs font-medium gap-2",
  field: "h-auto w-full rounded-lg p-2.5 text-xs gap-2",
};

const ITEM_SIZES: Record<OpsSelectSize, string> = {
  inline: "py-1 pl-6 pr-2 text-[11px]",
  sm: "py-1.5 pl-7 pr-2 text-xs",
  field: "py-1.5 pl-7 pr-2 text-xs",
};

interface OpsSelectProps {
  value: string;
  onValueChange: (value: string) => void;
  options: readonly OpsSelectOption[];
  size?: OpsSelectSize;
  placeholder?: string;
  /** Extra classes for the trigger, e.g. a width. */
  className?: string;
  disabled?: boolean;
  autoFocus?: boolean;
  /**
   * Open the menu as soon as it mounts. For an inline editor the user has
   * already clicked once to start editing; making them click the trigger a
   * second time to see the options is the behaviour the native element forced.
   */
  openOnMount?: boolean;
  /** Fired when the menu closes without a change — used by inline editors. */
  onDismiss?: () => void;
  "aria-label"?: string;
}

const normalize = (o: OpsSelectOption) =>
  typeof o === "string" ? { value: o, label: o } : o;

export function OpsSelect({
  value,
  onValueChange,
  options,
  size = "sm",
  placeholder,
  className,
  disabled,
  autoFocus,
  openOnMount,
  onDismiss,
  "aria-label": ariaLabel,
}: OpsSelectProps) {
  return (
    <Select
      value={value}
      onValueChange={onValueChange}
      disabled={disabled}
      defaultOpen={openOnMount}
      onOpenChange={(open) => {
        // An inline editor should close when the user dismisses the menu.
        if (!open) onDismiss?.();
      }}
    >
      <SelectTrigger
        autoFocus={autoFocus}
        aria-label={ariaLabel}
        className={cn(
          "border-border bg-background text-foreground shadow-none",
          "focus:ring-1 focus:ring-primary focus:ring-offset-0",
          "data-[state=open]:ring-1 data-[state=open]:ring-primary",
          TRIGGER_SIZES[size],
          className,
        )}
      >
        <SelectValue placeholder={placeholder} />
      </SelectTrigger>
      <SelectContent
        /* Match the trigger's density rather than the library default. */
        className="max-h-[min(24rem,60vh)] min-w-[var(--radix-select-trigger-width)]"
      >
        {options.map((option) => {
          const { value: v, label } = normalize(option);
          return (
            <SelectItem key={v} value={v} className={ITEM_SIZES[size]}>
              {label}
            </SelectItem>
          );
        })}
      </SelectContent>
    </Select>
  );
}
