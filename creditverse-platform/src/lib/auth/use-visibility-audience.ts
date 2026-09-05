import { useAuth } from "@/lib/auth/auth-context";

/** Who is looking: BES staff see the internal visibility taxonomy; everyone else sees organization-facing words. */
export type VisibilityAudience = "bes" | "organization";
export function useVisibilityAudience(): VisibilityAudience {
  const { isAgencyStaff } = useAuth();
  return isAgencyStaff ? "bes" : "organization";
}
