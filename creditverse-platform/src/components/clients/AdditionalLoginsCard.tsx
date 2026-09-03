import { useState } from "react";
import { OpsSelect } from "@/components/ui/ops-select";
import { KeyRound, Eye, EyeOff, Plus, Trash2, Building2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { usePasswordReveal } from "@/lib/use-password-reveal";

interface LoginEntry {
  id: string;
  label: string;
  isCustom: boolean;
  username: string;
  password: string;
}

const ADDITIONAL_LOGIN_OPTIONS = [
  "Experian (Direct)",
  "Equifax (Direct)",
  "TransUnion (Direct)",
  "ChexSystems",
  "Early Warning",
  "CFPB",
  "BBB",
  "Innovis",
  "LexisNexis",
];

/* Placeholder credentials for the sample screen. Real bureau logins must never
   be literals in frontend code, and must not be stored in a plain column when
   this is wired up — they belong in a secrets store (rule 1). */
const DEFAULT_LOGINS: LoginEntry[] = [
  {
    id: "exp",
    label: "Experian (Direct)",
    isCustom: false,
    username: "maria.g@email.com",
    password: "sample-not-a-real-password",
  },
  {
    id: "eqf",
    label: "Equifax (Direct)",
    isCustom: false,
    username: "maria.g@email.com",
    password: "sample-not-a-real-password",
  },
  {
    id: "tun",
    label: "TransUnion (Direct)",
    isCustom: false,
    username: "maria.g@email.com",
    password: "sample-not-a-real-password",
  },
];

export const AdditionalLoginsCard = () => {
  const { revealed, reveal } = usePasswordReveal();
  const [logins, setLogins] = useState<LoginEntry[]>(DEFAULT_LOGINS);
  const [showAddLogin, setShowAddLogin] = useState(false);
  const [useCustomLogin, setUseCustomLogin] = useState(false);
  const [newLoginLabel, setNewLoginLabel] = useState(
    ADDITIONAL_LOGIN_OPTIONS[0],
  );
  const [customLoginLabel, setCustomLoginLabel] = useState("");
  const [newLoginUser, setNewLoginUser] = useState("");
  const [newLoginPass, setNewLoginPass] = useState("");

  const addLogin = () => {
    if (!newLoginUser) return;
    const label = useCustomLogin ? customLoginLabel : newLoginLabel;
    if (!label.trim()) return;
    setLogins([
      ...logins,
      {
        id: crypto.randomUUID(),
        label,
        isCustom: useCustomLogin,
        username: newLoginUser,
        password: newLoginPass || "••••••••",
      },
    ]);
    setNewLoginUser("");
    setNewLoginPass("");
    setCustomLoginLabel("");
    setUseCustomLogin(false);
    setShowAddLogin(false);
  };

  const removeLogin = (id: string) => {
    setLogins(logins.filter((l) => l.id !== id));
  };

  return (
    <div className="rounded-2xl border border-border bg-card p-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Building2 className="h-4 w-4 text-emerald-600" />
          <h2 className="font-semibold">Additional logins collected</h2>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={() => setShowAddLogin((s) => !s)}
        >
          <Plus className="h-3.5 w-3.5" /> Add login
        </Button>
      </div>
      <p className="mt-1 text-xs text-muted-foreground">
        Direct bureau, ChexSystems, Early Warning, CFPB, BBB, and other portal
        credentials. Not always required — collected as needed. Use "Custom" for
        any portal not on the list.
      </p>

      {showAddLogin && (
        <div className="mt-4 space-y-3 rounded-xl border border-border bg-muted/30 p-4">
          <div className="flex items-center gap-4">
            <label className="flex items-center gap-1.5 text-xs font-medium">
              <input
                type="radio"
                checked={!useCustomLogin}
                onChange={() => setUseCustomLogin(false)}
                className="accent-emerald-500"
              />
              From list
            </label>
            <label className="flex items-center gap-1.5 text-xs font-medium">
              <input
                type="radio"
                checked={useCustomLogin}
                onChange={() => setUseCustomLogin(true)}
                className="accent-emerald-500"
              />
              Custom portal
            </label>
          </div>
          <div className="grid gap-3 sm:grid-cols-4">
            <div>
              <Label className="text-xs text-muted-foreground">Portal</Label>
              {useCustomLogin ? (
                <Input
                  value={customLoginLabel}
                  onChange={(e) => setCustomLoginLabel(e.target.value)}
                  placeholder="e.g. NCTUE, SageStream"
                  className="mt-1"
                />
              ) : (
                <OpsSelect
                  value={newLoginLabel}
                  onValueChange={setNewLoginLabel}
                  options={ADDITIONAL_LOGIN_OPTIONS}
                  size="field"
                  aria-label="Login type"
                  className="mt-1 text-sm"
                />
              )}
            </div>
            <div>
              <Label className="text-xs text-muted-foreground">
                Username / Email
              </Label>
              <Input
                value={newLoginUser}
                onChange={(e) => setNewLoginUser(e.target.value)}
                placeholder="email or username"
                className="mt-1"
              />
            </div>
            <div>
              <Label className="text-xs text-muted-foreground">Password</Label>
              <Input
                value={newLoginPass}
                onChange={(e) => setNewLoginPass(e.target.value)}
                placeholder="••••••••"
                className="mt-1"
              />
            </div>
            <div className="flex items-end">
              <Button
                size="sm"
                className="w-full bg-gradient-emerald text-white"
                onClick={addLogin}
              >
                Save login
              </Button>
            </div>
          </div>
        </div>
      )}

      <div className="mt-4 space-y-2">
        {logins.map((l) => (
          <div
            key={l.id}
            className="flex items-center justify-between rounded-xl border border-border bg-muted/20 p-3"
          >
            <div className="grid flex-1 gap-2 sm:grid-cols-3">
              <div>
                <p className="text-[10px] uppercase text-muted-foreground">
                  Portal
                </p>
                <p className="flex items-center gap-1.5 text-sm font-medium">
                  {l.label}
                  {l.isCustom && (
                    <Badge
                      variant="outline"
                      className="text-[9px] text-emerald-600"
                    >
                      custom
                    </Badge>
                  )}
                </p>
              </div>
              <div>
                <p className="text-[10px] uppercase text-muted-foreground">
                  Username
                </p>
                <p className="text-sm font-medium">{l.username}</p>
              </div>
              <div>
                <p className="text-[10px] uppercase text-muted-foreground">
                  Password
                </p>
                <p className="flex items-center gap-1.5 text-sm font-medium">
                  <KeyRound className="h-3 w-3 text-muted-foreground" />
                  {revealed[l.id] ? l.password : "••••••••"}
                  <button
                    onClick={() => reveal(l.id)}
                    className="ml-1 flex h-6 w-6 items-center justify-center rounded text-muted-foreground hover:text-foreground"
                  >
                    {revealed[l.id] ? (
                      <EyeOff className="h-3 w-3" />
                    ) : (
                      <Eye className="h-3 w-3" />
                    )}
                  </button>
                </p>
              </div>
            </div>
            <button
              onClick={() => removeLogin(l.id)}
              className="ml-3 flex h-8 w-8 items-center justify-center rounded-lg border border-border text-muted-foreground hover:bg-red-500/10 hover:text-red-600"
            >
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          </div>
        ))}
      </div>
    </div>
  );
};
