import { useState } from "react";
import { formatDate } from "@/lib/format-date";
import { MailPlus, Check, AlertCircle } from "lucide-react";
import { useDiyManagement } from "@/lib/diy/diy-management-context";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";

export const MgmtInvitations = () => {
  const { people, inviteConsumer } = useDiyManagement();
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const submit = () => {
    setError("");
    setSuccess("");
    const emailOk = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
    if (!emailOk) {
      setError("Enter a valid email address.");
      return;
    }
    const existing = people.find(
      (p) => p.email.toLowerCase() === email.toLowerCase(),
    );
    if (existing) {
      setError(
        "A consumer with this email already exists. No duplicate created.",
      );
      return;
    }
    inviteConsumer(email, name || undefined);
    setSuccess(`${email} invited to your DIY Credit program.`);
    setEmail("");
    setName("");
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Invitations</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Invite consumers to your white-label DIY Credit program.
        </p>
      </div>

      <Card className="max-w-lg p-6">
        <div className="space-y-4">
          <div>
            <Label>Consumer name (optional)</Label>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Maria Torres"
              className="mt-1.5"
            />
          </div>
          <div>
            <Label>Email</Label>
            <Input
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="maria@example.com"
              className="mt-1.5"
              type="email"
            />
          </div>
          {error && (
            <p className="flex items-center gap-1.5 text-xs text-red-600">
              <AlertCircle className="h-3.5 w-3.5" /> {error}
            </p>
          )}
          {success && (
            <p className="flex items-center gap-1.5 text-xs text-emerald-700">
              <Check className="h-3.5 w-3.5" /> {success}
            </p>
          )}
          <Button onClick={submit} className="w-full">
            <MailPlus className="h-4 w-4" /> Send invitation
          </Button>
        </div>
      </Card>

      <Card className="p-6">
        <h2 className="text-sm font-semibold">Pending invitations</h2>
        <div className="mt-4 space-y-2">
          {people
            .filter((p) => p.status === "invited")
            .map((p) => (
              <div
                key={p.id}
                className="flex items-center justify-between rounded-lg border border-border px-3 py-2.5"
              >
                <div>
                  <p className="text-sm font-medium">{p.email}</p>
                  <p className="text-xs text-muted-foreground">
                    Invited {formatDate(p.createdAt)}
                  </p>
                </div>
                <span className="rounded-full bg-blue-500/10 px-2.5 py-1 text-[10px] font-bold text-blue-700">
                  Pending
                </span>
              </div>
            ))}
          {people.filter((p) => p.status === "invited").length === 0 && (
            <p className="py-4 text-center text-xs text-muted-foreground">
              No pending invitations.
            </p>
          )}
        </div>
      </Card>
    </div>
  );
};
