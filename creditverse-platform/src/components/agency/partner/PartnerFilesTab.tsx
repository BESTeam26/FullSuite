/**
 * Documents filed against this partner — private to BES until shared.
 *
 * 0146 settled the rule: association is not publication. A file filed here is
 * BES's own until somebody with the portal permission deliberately shares it,
 * and sharing is a named, audited act (`set_partner_file_shared`), not a row
 * edit. The toggle below is that act; the badge says plainly which state a
 * file is in, because "who can see this?" must never need a guess.
 */
import { useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Download, FileText, Loader2, Upload } from "lucide-react";
import { ContentCard } from "@/components/dashboard/DivisionLayout";
import { Button } from "@/components/ui/button";
import { Empty, Pill } from "@/components/agency/partner/partner-ui";
import {
  fetchPartnerFiles, partnerFileUrl, setPartnerFileShared, uploadPartnerFile,
} from "@/lib/data/agency-partners";
import { useAgencyPermissions } from "@/lib/data/agency-permissions";
import { useAuth } from "@/lib/auth/auth-context";
import { useToast } from "@/hooks/use-toast";
import { formatDate } from "@/lib/format-date";

const size = (bytes: number | null) => {
  if (bytes === null) return "";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
};

export function PartnerFilesTab({ groupId }: { groupId: string }) {
  const auth = useAuth();
  const perms = useAgencyPermissions();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const inputRef = useRef<HTMLInputElement>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const files = useQuery({
    queryKey: ["partner", "files", groupId],
    queryFn: () => fetchPartnerFiles(groupId),
    enabled: auth.mode === "live" && auth.status === "signed-in" && perms.can("partners.files.view"),
    staleTime: 60_000,
  });
  const refresh = () => queryClient.invalidateQueries({ queryKey: ["partner", "files", groupId] });

  const upload = useMutation({
    mutationFn: (file: File) => uploadPartnerFile(groupId, file),
    onSuccess: () => { refresh(); toast({ title: "File uploaded", description: "Private to BES until you share it." }); },
    onError: (e: Error) => toast({ title: "Upload failed", description: e.message, variant: "destructive" }),
  });

  const share = useMutation({
    mutationFn: ({ id, shared }: { id: string; shared: boolean }) => setPartnerFileShared(id, shared),
    onMutate: ({ id }) => setBusyId(id),
    onSettled: () => setBusyId(null),
    onSuccess: (_d, v) => {
      refresh();
      toast({
        title: v.shared ? "Shared to the partner portal" : "Removed from the partner portal",
        description: v.shared
          ? "The partner's activated contacts can now see and download it."
          : "The partner can no longer see it.",
      });
    },
    onError: (e: Error) => toast({ title: "Could not change sharing", description: e.message, variant: "destructive" }),
  });

  const download = async (path: string) => {
    try {
      const url = await partnerFileUrl(path);
      window.open(url, "_blank", "noopener");
    } catch (e) {
      toast({ title: "Could not open the file", description: (e as Error).message, variant: "destructive" });
    }
  };

  const canUpload = perms.can("partners.files.upload");
  const canShare = perms.can("partners.portal");
  const rows = files.data ?? [];

  return (
    <ContentCard title="Files">
      {canUpload && (
        <div className="mb-3">
          <input ref={inputRef} type="file" className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) upload.mutate(f);
              e.target.value = "";
            }} />
          <Button variant="outline" size="sm" disabled={upload.isPending}
            onClick={() => inputRef.current?.click()}>
            {upload.isPending
              ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
              : <Upload className="mr-1.5 h-3.5 w-3.5" />}
            Upload file
          </Button>
        </div>
      )}

      {files.isLoading ? (
        <p className="py-6 text-center text-sm text-muted-foreground">
          <Loader2 className="mr-2 inline h-4 w-4 animate-spin" /> Loading…
        </p>
      ) : rows.length === 0 ? (
        <Empty title="No documents filed against this partner"
          hint="Files here are private to BES. Sharing one to the partner's portal is a separate, deliberate step." />
      ) : (
        <ul className="divide-y divide-border/50">
          {rows.map((f) => (
            <li key={f.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
              <span className="flex min-w-0 items-center gap-2">
                <FileText className="h-4 w-4 shrink-0 text-muted-foreground" />
                <span className="min-w-0">
                  <span className="block truncate text-sm text-foreground">{f.name}</span>
                  <span className="block text-[11px] text-muted-foreground">
                    {formatDate(f.createdAt)}{f.sizeBytes !== null && ` · ${size(f.sizeBytes)}`}
                    {f.sharedWithPartner && f.sharedAt &&
                      ` · shared ${formatDate(f.sharedAt)}${f.sharedByName ? ` by ${f.sharedByName}` : ""}`}
                  </span>
                </span>
              </span>
              <span className="flex items-center gap-1.5">
                {f.sharedWithPartner ? (
                  <Pill tone="border-emerald-500/40 bg-emerald-500/10 text-emerald-800">Shared with partner</Pill>
                ) : (
                  <Pill tone="border-border bg-muted text-muted-foreground">Private to BES</Pill>
                )}
                <Button variant="ghost" size="sm" className="h-7 px-2"
                  onClick={() => void download(f.path)} title="Download">
                  <Download className="h-3.5 w-3.5" />
                </Button>
                {canShare && (
                  <Button variant="outline" size="sm" className="h-7 text-xs"
                    disabled={busyId === f.id}
                    onClick={() => share.mutate({ id: f.id, shared: !f.sharedWithPartner })}>
                    {busyId === f.id
                      ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      : f.sharedWithPartner ? "Unshare" : "Share to portal"}
                  </Button>
                )}
              </span>
            </li>
          ))}
        </ul>
      )}
      <p className="mt-3 rounded-lg border border-border bg-muted/40 px-3 py-2 text-[11px] text-muted-foreground">
        Files are <strong>private to BES</strong> until someone with the portal permission presses
        Share to portal. Only shared files reach the partner's activated contacts — and every share
        or unshare is recorded in the partner's activity.
      </p>
    </ContentCard>
  );
}
