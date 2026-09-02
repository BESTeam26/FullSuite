import { useState } from "react";
import { Pencil, Eye, EyeOff, AlertCircle, CheckCircle2 } from "lucide-react";
import { Input } from "@/components/ui/input";
import { isValidEmail } from "@/lib/use-password-reveal";
import { CreditMonitoringCard } from "./CreditMonitoringCard";
import { AdditionalLoginsCard } from "./AdditionalLoginsCard";
import { AgreementCard, PortalCard } from "./AgreementPortalCards";

function InfoCard({
  title,
  children,
  onEdit,
}: {
  title: string;
  children: React.ReactNode;
  onEdit?: () => void;
}) {
  return (
    <div className="rounded-2xl border border-border bg-card p-6">
      <div className="flex items-center justify-between">
        <h2 className="font-semibold">{title}</h2>
        <button
          onClick={onEdit}
          className="flex items-center gap-1 text-xs font-medium text-muted-foreground hover:text-foreground"
        >
          <Pencil className="h-3.5 w-3.5" /> Edit
        </button>
      </div>
      <div className="mt-4 grid grid-cols-2 gap-4">{children}</div>
    </div>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="mt-0.5 text-sm font-medium">{value}</p>
    </div>
  );
}

const AccountTab = () => {
  const [showSSN, setShowSSN] = useState(false);
  const [prevAddress, setPrevAddress] = useState(
    "2055 Anthony Ave, Apt 5B, Hazleton, PA 18201",
  );
  const [showPrevAddress, setShowPrevAddress] = useState(true);
  const [email, setEmail] = useState("maria.g@email.com");
  const [emailTouched, setEmailTouched] = useState(false);

  const emailValid = isValidEmail(email);
  const emailError = emailTouched && !emailValid;

  return (
    <div className="space-y-6">
      <div className="grid gap-6 md:grid-cols-2">
        <InfoCard title="Client information">
          <Field label="First name" value="Maria" />
          <Field label="Last name" value="Gonzalez" />
          <Field label="Date of birth" value="10/29/1994" />
          <div>
            <p className="text-xs text-muted-foreground">Social Security</p>
            <button
              onClick={() => setShowSSN((s) => !s)}
              className="mt-0.5 flex items-center gap-1.5 text-sm font-medium hover:text-emerald-600"
            >
              {showSSN ? (
                <>
                  <EyeOff className="h-3.5 w-3.5 text-muted-foreground" />
                  000-00-0000
                </>
              ) : (
                <>
                  <Eye className="h-3.5 w-3.5 text-muted-foreground" />
                  •••-••-0000
                </>
              )}
            </button>
          </div>
          <Field label="Cell phone" value="+1 (844) 797-5866" />
          <div>
            <p className="text-xs text-muted-foreground">Email</p>
            <Input
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              onBlur={() => setEmailTouched(true)}
              className={`mt-0.5 h-8 text-sm ${
                emailError ? "border-red-500" : ""
              }`}
            />
            {emailError && (
              <p className="mt-1 flex items-center gap-1 text-[11px] text-red-600">
                <AlertCircle className="h-3 w-3" /> Enter a valid, unique email
              </p>
            )}
            {emailTouched && emailValid && (
              <p className="mt-1 flex items-center gap-1 text-[11px] text-emerald-600">
                <CheckCircle2 className="h-3 w-3" /> Valid &amp; unique
              </p>
            )}
          </div>
          <Field label="Start date" value="08/24/2026" />
          <Field label="Couple / joint client" value="—" />
        </InfoCard>

        <InfoCard title="Address" onEdit={() => setShowPrevAddress((s) => !s)}>
          <Field label="Current address" value="139 Coxe St" />
          <Field label="City / state / zip" value="Hazleton, PA 18201" />
          <Field label="Time at address" value="< 2 years" />
          <div className="col-span-2">
            <div className="flex items-center justify-between">
              <p className="text-xs text-muted-foreground">Previous address</p>
              <button
                onClick={() => setShowPrevAddress((s) => !s)}
                className="text-[11px] font-medium text-emerald-600 hover:underline"
              >
                {showPrevAddress ? "Hide" : "Add previous address"}
              </button>
            </div>
            {showPrevAddress ? (
              <textarea
                value={prevAddress}
                onChange={(e) => setPrevAddress(e.target.value)}
                rows={2}
                className="mt-1 w-full rounded-lg border border-border bg-background px-2.5 py-1.5 text-sm font-medium focus:outline-none focus:ring-1 focus:ring-emerald-500"
              />
            ) : (
              <p className="mt-0.5 text-sm font-medium text-muted-foreground">
                —
              </p>
            )}
          </div>
        </InfoCard>
      </div>

      <CreditMonitoringCard provider="IdentityIQ" />
      <AdditionalLoginsCard />
      <AgreementCard />
      <PortalCard />
    </div>
  );
};

export default AccountTab;
