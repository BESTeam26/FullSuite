import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";

/**
 * Badge — status chips, pills and labels.
 *
 * **Badges are not interactive.** All 101 usages render a plain `<div>` with no
 * click handler, so a hover state is decoration that can only do harm — and it
 * did: the old `default` variant carried `hover:bg-primary/80`, which every
 * call site that recoloured a badge through `className` silently inherited.
 * Those sites override the *base* background only, so on hover a pale green
 * "HQ DFY Subscriber" pill turned solid primary while its text stayed dark
 * green — 1.3:1, unreadable — and in dark mode it became amber behind pale
 * green text. Removing the hover from the non-interactive variants fixes every
 * one of those call sites at once, without touching any of them.
 *
 * A badge that genuinely is a control opts in with `interactive`, which deepens
 * the background one step while keeping the same foreground, so contrast rises
 * rather than falls (rule 15).
 *
 * Semantic variants carry the meaning: green = active/success, amber =
 * pending/warning, red = blocked/error, blue = informational, neutral =
 * inactive/self-managed. Prefer them over recolouring through `className`, so
 * hover, focus and disabled stay defined in one place.
 */
const badgeVariants = cva(
  [
    "inline-flex items-center rounded-full border px-2.5 py-0.5",
    "text-xs font-semibold transition-colors",
    // focus-visible, not focus: a badge should not ring on a mouse click.
    // Layout is untouched — the ring is drawn outside the box (rule 15).
    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background",
    // Disabled stays legible — inactive, not invisible (rule 15).
    "data-[disabled=true]:opacity-60 data-[disabled=true]:saturate-50",
  ],
  {
    variants: {
      variant: {
        /* Solid variants: the foreground is a paired *-foreground token, so it
           tracks the background in both themes. */
        default: "border-transparent bg-primary text-primary-foreground",
        secondary: "border-transparent bg-secondary text-secondary-foreground",
        destructive:
          "border-transparent bg-destructive text-destructive-foreground",
        outline: "border-border text-foreground",

        /* Tinted status variants. The background is a low-alpha wash of the
           status hue over the surface, and the foreground is the status token —
           which is deliberately dark in light mode and light in dark mode, so
           the pair stays readable in both without a second set of classes. */
        success:
          "border-emerald-500/25 bg-status-success-tint text-status-success",
        warning: "border-amber-500/30 bg-status-warning-tint text-status-warning",
        danger: "border-red-500/25 bg-status-danger-tint text-status-danger",
        info: "border-sky-500/25 bg-status-info-tint text-status-info",
        neutral: "border-border bg-muted text-muted-foreground",
      },
      /**
       * Opt-in hover, for the rare badge that is a control.
       *
       * Every hover deepens the *same* hue and keeps the same foreground, so
       * contrast can only improve. No size, padding or border-width change, so
       * nothing around it moves.
       */
      interactive: {
        true: "cursor-pointer",
        false: "",
      },
    },
    compoundVariants: [
      { interactive: true, variant: "default", class: "hover:bg-primary/90" },
      {
        interactive: true,
        variant: "secondary",
        class: "hover:bg-secondary/80",
      },
      {
        interactive: true,
        variant: "destructive",
        class: "hover:bg-destructive/90",
      },
      { interactive: true, variant: "outline", class: "hover:bg-muted" },
      {
        interactive: true,
        variant: "success",
        class: "hover:bg-status-success-tint-strong",
      },
      {
        interactive: true,
        variant: "warning",
        class: "hover:bg-status-warning-tint-strong",
      },
      {
        interactive: true,
        variant: "danger",
        class: "hover:bg-status-danger-tint-strong",
      },
      {
        interactive: true,
        variant: "info",
        class: "hover:bg-status-info-tint-strong",
      },
      {
        interactive: true,
        variant: "neutral",
        class: "hover:bg-muted/70 hover:text-foreground",
      },
    ],
    defaultVariants: {
      variant: "default",
      interactive: false,
    },
  },
);

export interface BadgeProps
  extends
    React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof badgeVariants> {
  /** Renders the disabled treatment without hiding the label. */
  disabled?: boolean;
}

function Badge({
  className,
  variant,
  interactive,
  disabled,
  ...props
}: BadgeProps) {
  return (
    <div
      data-disabled={disabled ? "true" : undefined}
      className={cn(badgeVariants({ variant, interactive }), className)}
      {...props}
    />
  );
}

export { Badge, badgeVariants };
