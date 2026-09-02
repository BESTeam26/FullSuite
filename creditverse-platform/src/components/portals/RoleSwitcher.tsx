import { UserCog } from "lucide-react";
import { useRole } from "@/lib/role-context";
import { ROLES, ROLE_LIST } from "@/lib/roles";
import { useAuth } from "@/lib/auth/auth-context";

export const RoleSwitcher = () => {
  const { role, setRole } = useRole();
  const { mode, isAgencyAdmin } = useAuth();
  // Role preview is a demo / admin-only affordance, never a real permission switch.
  if (mode === "live" && !isAgencyAdmin) return null;
  return (
    <div className="flex items-center gap-2 rounded-full border border-border bg-card px-3 py-1.5 text-xs">
      <UserCog className="h-3.5 w-3.5 text-muted-foreground" />
      <span className="hidden text-muted-foreground sm:inline">Preview as</span>
      <div className="flex gap-1">
        {ROLE_LIST.map((r) => (
          <button
            key={r}
            onClick={() => setRole(r)}
            className={`rounded-full px-2.5 py-1 font-medium transition-colors ${
              role === r
                ? "bg-gradient-emerald text-white"
                : "text-muted-foreground hover:bg-muted"
            }`}
          >
            {ROLES[r].shortLabel}
          </button>
        ))}
      </div>
    </div>
  );
};
