import { useState } from "react";
import { SubAccount } from "@/lib/agency-context";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Building2, Inbox } from "lucide-react";
import {
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

interface Props {
  onClose: () => void;
  onCreate: (acc: {
    name: string;
    code: string;
    ownerName: string;
    ownerEmail: string;
    plan: SubAccount["plan"];
    isFulfillmentSubscriber: boolean;
  }) => void;
}

export const ProvisionSubAccountModal = ({ onClose, onCreate }: Props) => {
  const [name, setName] = useState("");
  const [code, setCode] = useState("");
  const [ownerName, setOwnerName] = useState("");
  const [ownerEmail, setOwnerEmail] = useState("");
  const [plan, setPlan] = useState<SubAccount["plan"]>("Full Suite");
  const [isFulfillmentSubscriber, setIsFulfillmentSubscriber] = useState(true);

  const handleCreate = () => {
    if (!name || !ownerEmail) return;
    onCreate({
      name,
      code: code || name.slice(0, 4).toUpperCase(),
      ownerName: ownerName || "Company Admin",
      ownerEmail,
      plan,
      isFulfillmentSubscriber,
    });
  };

  return (
    <DialogContent className="sm:max-w-md">
      <DialogHeader>
        <DialogTitle className="flex items-center gap-2">
          <Building2 className="h-5 w-5 text-amber-500" /> Provision Sub-Account
          Company
        </DialogTitle>
      </DialogHeader>

      <div className="space-y-4 py-3 text-sm">
        <div className="space-y-1.5">
          <Label>Company / Agency Name</Label>
          <Input
            placeholder="e.g. Apex Credit Solutions LLC"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label>Company Code (Short)</Label>
            <Input
              placeholder="e.g. APEX"
              value={code}
              onChange={(e) => setCode(e.target.value.toUpperCase())}
            />
          </div>
          <div className="space-y-1.5">
            <Label>Subscription Plan</Label>
            <Select
              value={plan}
              onValueChange={(v: SubAccount["plan"]) => setPlan(v)}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="Full Suite">
                  Full Suite ($2,499/mo)
                </SelectItem>
                <SelectItem value="CreditOps">CreditOps ($999/mo)</SelectItem>
                <SelectItem value="FundingOps">
                  FundingOps ($1,499/mo)
                </SelectItem>
                <SelectItem value="BES CRM">BES CRM ($499/mo)</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label>Owner Name</Label>
            <Input
              placeholder="e.g. Alex Rivera"
              value={ownerName}
              onChange={(e) => setOwnerName(e.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label>Owner Email</Label>
            <Input
              placeholder="alex@apexcredit.com"
              type="email"
              value={ownerEmail}
              onChange={(e) => setOwnerEmail(e.target.value)}
            />
          </div>
        </div>

        <div className="flex items-center justify-between rounded-xl border border-amber-500/30 bg-amber-500/10 p-3">
          <div>
            <p className="font-semibold text-amber-500 text-xs flex items-center gap-1">
              <Inbox className="h-3.5 w-3.5" /> Done-For-You Fulfillment
              Subscriber
            </p>
            <p className="text-[11px] text-muted-foreground mt-0.5">
              Auto-streams all dispute work orders to HQ Fulfillment Desk
            </p>
          </div>
          <Switch
            checked={isFulfillmentSubscriber}
            onCheckedChange={setIsFulfillmentSubscriber}
          />
        </div>
      </div>

      <DialogFooter>
        <Button variant="outline" onClick={onClose}>
          Cancel
        </Button>
        <Button
          onClick={handleCreate}
          className="bg-gradient-gold text-charcoal font-bold hover:opacity-90"
        >
          Provision Sub-Account
        </Button>
      </DialogFooter>
    </DialogContent>
  );
};
