/**
 * A person's photo, or their initials when there is none. The bucket is
 * private, so the caller passes a signed URL (see `useAvatarUrls`); this
 * component never fetches.
 */
import { cn } from "@/lib/utils";

export function initialsOf(name: string): string {
  const words = name.replace(/^\[TEST\]\s*/, "").trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return "?";
  const letters = words.length === 1 ? words[0].slice(0, 2) : `${words[0][0]}${words[words.length - 1][0]}`;
  return letters.toUpperCase();
}

const SIZES = {
  sm: "h-8 w-8 text-[11px]",
  md: "h-10 w-10 text-xs",
  lg: "h-20 w-20 text-xl",
} as const;

export function Avatar({
  name,
  url,
  size = "md",
  className,
}: {
  name: string;
  url?: string | null;
  size?: keyof typeof SIZES;
  className?: string;
}) {
  const shared = cn("shrink-0 overflow-hidden rounded-full", SIZES[size], className);
  if (url) return <img src={url} alt="" className={cn(shared, "object-cover")} loading="lazy" />;
  return (
    <span className={cn(shared, "flex items-center justify-center bg-gradient-gold font-bold text-charcoal")} aria-hidden>
      {initialsOf(name)}
    </span>
  );
}
