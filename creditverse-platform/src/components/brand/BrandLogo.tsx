/**
 * The ONE place the platform decides which logo to show.
 *
 * Order: the active organization's own logo (white-label, organization view)
 * → the agency logo saved in Settings → Agency & Branding (`agencies.branding`)
 * → the local file `/bes-logo.png` → a text mark. Nothing is hard-coded to a
 * third-party image URL any more; changing the logo is a Settings action (or
 * dropping the file into `public/`), not a code change.
 */
import { useState } from "react";
import { useAgency } from "@/lib/agency-context";
import { useAgencySettings } from "@/lib/agency-settings-context";

const LOCAL_LOGO = "/bes-logo.png";

interface Props {
  /** Text shown when no image is available (or while one fails to load). */
  fallbackText: string;
  /** Prefer the active organization's logo (organization view). */
  preferOrganization?: boolean;
  className?: string;
  imgClassName?: string;
  textClassName?: string;
}

export function BrandLogo({
  fallbackText,
  preferOrganization = false,
  className,
  imgClassName = "h-full w-full object-cover",
  textClassName = "font-bold text-amber-400 text-xs",
}: Props) {
  const agency = useAgency();
  const settings = useAgencySettings();
  const orgLogo = preferOrganization ? agency.activeOrganization?.branding?.logoUrl : undefined;
  const agencyLogo = settings.agency.logoUrl?.trim() || undefined;
  const candidates = [orgLogo, agencyLogo, LOCAL_LOGO].filter((u): u is string => !!u);
  const [failed, setFailed] = useState<Record<string, true>>({});
  const src = candidates.find((u) => !failed[u]);

  return (
    <div className={className}>
      {src ? (
        <img
          src={src}
          alt=""
          className={imgClassName}
          onError={() => setFailed((f) => ({ ...f, [src]: true }))}
        />
      ) : (
        <span className={textClassName}>{fallbackText}</span>
      )}
    </div>
  );
}
