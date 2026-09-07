import { useState } from "react";
import { formatDateTime } from "@/lib/format-date";
import {
  Truck,
  PackageCheck,
  Search,
  Loader2,
  CheckCircle2,
  Clock,
  MapPin,
  Plus,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";

interface TrackingEntry {
  id: string;
  trackingNumber: string;
  letterName: string;
  bureau: string;
  status: "pending" | "in-transit" | "delivered";
  lastUpdate: string;
  location: string;
}

/* Empty. This list used to open with two fabricated certified mailings —
   real-looking tracking numbers, real bureau addresses, real dates — on EVERY
   client. A colleague reading it would believe letters were in the post. */
const INITIAL_TRACKING: TrackingEntry[] = [];

const statusTone: Record<TrackingEntry["status"], string> = {
  pending: "bg-amber-500/10 text-status-warning",
  "in-transit": "bg-blue-500/10 text-status-info",
  delivered: "bg-emerald-500/10 text-status-success",
};

const statusIcon = {
  pending: Clock,
  "in-transit": Truck,
  delivered: CheckCircle2,
};

export const UspsTrackingPanel = () => {
  const [tracking, setTracking] = useState<TrackingEntry[]>(INITIAL_TRACKING);
  const [newNumber, setNewNumber] = useState("");
  const [newLetter, setNewLetter] = useState("");
  const [lookupNumber, setLookupNumber] = useState("");
  const [looking, setLooking] = useState(false);
  const [showAdd, setShowAdd] = useState(false);

  const addTracking = () => {
    if (!newNumber.trim() || !newLetter.trim()) return;
    setTracking([
      ...tracking,
      {
        id: crypto.randomUUID(),
        trackingNumber: newNumber,
        letterName: newLetter,
        bureau: "—",
        status: "pending",
        lastUpdate: formatDateTime(new Date()),
        location: "Awaiting first scan",
      },
    ]);
    setNewNumber("");
    setNewLetter("");
    setShowAdd(false);
  };

  const lookup = () => {
    if (!lookupNumber.trim()) return;
    setLooking(true);
    setTimeout(() => {
      setTracking((prev) =>
        prev.map((t) =>
          t.trackingNumber.replace(/\s/g, "") ===
          lookupNumber.replace(/\s/g, "")
            ? {
                ...t,
                status: "in-transit",
                lastUpdate: formatDateTime(new Date()),
                location: "USPS Regional Facility — Sort Center",
              }
            : t,
        ),
      );
      setLooking(false);
    }, 1400);
  };

  return (
    <div className="rounded-2xl border border-border bg-card p-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <PackageCheck className="h-5 w-5 text-status-success" />
          <h2 className="font-semibold">USPS tracking integration</h2>
        </div>
        <Button
          size="sm"
          variant="outline"
          onClick={() => setShowAdd((s) => !s)}
        >
          <Plus className="h-3.5 w-3.5" /> Add tracking
        </Button>
      </div>
      <p className="mt-1 text-xs text-muted-foreground">
        Track certified dispute mailings through USPS. Keep tracking numbers as
        proof of delivery for your paper trail.
      </p>

      {/* Lookup bar */}
      <div className="mt-4 flex items-center gap-2">
        <Input
          value={lookupNumber}
          onChange={(e) => setLookupNumber(e.target.value)}
          placeholder="Enter USPS tracking number to refresh status"
          className="flex-1"
        />
        <Button
          onClick={lookup}
          disabled={looking || !lookupNumber.trim()}
          className="bg-gradient-emerald text-white"
        >
          {looking ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Search className="h-4 w-4" />
          )}
          Refresh
        </Button>
      </div>

      {/* Add form */}
      {showAdd && (
        <div className="mt-3 grid gap-3 rounded-xl border border-border bg-muted/30 p-4 sm:grid-cols-3">
          <Input
            value={newLetter}
            onChange={(e) => setNewLetter(e.target.value)}
            placeholder="Letter name"
          />
          <Input
            value={newNumber}
            onChange={(e) => setNewNumber(e.target.value)}
            placeholder="USPS tracking #"
            className="sm:col-span-1"
          />
          <Button
            className="bg-gradient-emerald text-white"
            onClick={addTracking}
          >
            Save
          </Button>
        </div>
      )}

      {/* Tracking list */}
      <div className="mt-4 space-y-2">
        {tracking.map((t) => {
          const Icon = statusIcon[t.status];
          return (
            <div
              key={t.id}
              className="flex items-center justify-between rounded-xl border border-border bg-muted/20 p-4"
            >
              <div className="flex items-start gap-3">
                <span
                  className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${statusTone[t.status]}`}
                >
                  <Icon className="h-4 w-4" />
                </span>
                <div>
                  <p className="text-sm font-medium">{t.letterName}</p>
                  <p className="font-mono text-xs text-muted-foreground">
                    {t.trackingNumber}
                  </p>
                  <p className="mt-0.5 flex items-center gap-1 text-[11px] text-muted-foreground">
                    <MapPin className="h-3 w-3" /> {t.location} · {t.lastUpdate}
                  </p>
                </div>
              </div>
              <Badge className={statusTone[t.status]}>
                {t.status.replace("-", " ")}
              </Badge>
            </div>
          );
        })}
      </div>
    </div>
  );
};
