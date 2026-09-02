/**
 * Client Work File - Documents & Evidence Section.
 *
 * A native in-app file workspace — NOT a link list.
 *  - Drag/drop, file picker, clipboard paste
 *  - Image thumbnails + PDF first-page preview
 *  - Click to open in-app FileViewer (lightbox / PDF viewer)
 *  - Category tagging, grid/list toggle
 */

import { useState, useRef, useCallback } from "react";
import {
  Paperclip,
  Upload,
  FileText,
  ImageIcon,
  LayoutGrid,
  List as ListIcon,
  X,
} from "lucide-react";
import { useCreditOpsStore } from "@/lib/fulfillment/creditops-client-store";
import { FileViewer } from "./FileViewer";
import { cn } from "@/lib/utils";

export const ATTACHMENT_CATEGORIES = [
  "Credit Report",
  "ID",
  "Proof of Address",
  "SSN / Identity Document",
  "Dispute Evidence",
  "Client Correspondence",
  "Mailing Proof",
  "CFPB",
  "FTC",
  "BBB",
  "Attorney General",
  "Bureau Calling Evidence",
  "Monitoring Screenshot",
  "Client Upload",
  "Screenshot",
  "Other",
] as const;

export type AttachmentCategory = (typeof ATTACHMENT_CATEGORIES)[number];

export interface AttachmentFile {
  id: string;
  name: string;
  size: string;
  type: string;
  category: AttachmentCategory;
  url: string;
  uploadedBy: string;
  uploadedAt: string;
}

export const DEFAULT_ATTACHMENTS: AttachmentFile[] = [
  {
    id: "att-1",
    name: "Driver_License_Front_Back.pdf",
    size: "144 KB",
    type: "application/pdf",
    category: "ID",
    url: "/placeholder.svg",
    uploadedBy: "Admin",
    uploadedAt: "Jul 14, 2026",
  },
  {
    id: "att-2",
    name: "Utility_Bill_Proof_Residency.pdf",
    size: "1.4 MB",
    type: "application/pdf",
    category: "Proof of Address",
    url: "/placeholder.svg",
    uploadedBy: "Admin",
    uploadedAt: "Jul 14, 2026",
  },
  {
    id: "att-3",
    name: "Credit_Report_IdentityIQ.pdf",
    size: "1.5 MB",
    type: "application/pdf",
    category: "Credit Report",
    url: "/placeholder.svg",
    uploadedBy: "Admin",
    uploadedAt: "Jul 20, 2026",
  },
  {
    id: "att-4",
    name: "CFPB_Submission_Confirmation.png",
    size: "169 KB",
    type: "image/png",
    category: "CFPB",
    url: "/placeholder.svg",
    uploadedBy: "Jezel Ane Mirambel",
    uploadedAt: "Aug 14, 2026",
  },
  {
    id: "att-5",
    name: "Experian_Dispute_Response.jpg",
    size: "212 KB",
    type: "image/jpeg",
    category: "Bureau Calling Evidence",
    url: "/placeholder.svg",
    uploadedBy: "Keila Betancourt",
    uploadedAt: "Aug 18, 2026",
  },
];

interface Props {
  clientId: string;
  attachments: AttachmentFile[];
  setAttachments: React.Dispatch<React.SetStateAction<AttachmentFile[]>>;
}

const isImage = (f: AttachmentFile) => f.type?.startsWith("image/");
const isPdf = (f: AttachmentFile) =>
  f.type === "application/pdf" || f.name?.toLowerCase().endsWith(".pdf");

export function ClientWorkAttachments({
  clientId,
  attachments,
  setAttachments,
}: Props) {
  const store = useCreditOpsStore();
  const [uploadCategory, setUploadCategory] =
    useState<AttachmentCategory>("Other");
  const [view, setView] = useState<"grid" | "list">("grid");
  const [viewerIndex, setViewerIndex] = useState<number | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const addFiles = useCallback(
    (fileList: FileList | File[]) => {
      const files = Array.from(fileList);
      if (files.length === 0) return;
      files.forEach((file) => {
        const url = URL.createObjectURL(file);
        const newAtt: AttachmentFile = {
          id: `att-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
          name: file.name,
          size:
            file.size > 1024 * 1024
              ? `${(file.size / 1024 / 1024).toFixed(1)} MB`
              : `${Math.round(file.size / 1024)} KB`,
          type: file.type || "application/octet-stream",
          category: uploadCategory,
          url,
          uploadedBy: "Agent (BES HQ)",
          uploadedAt: "Just now",
        };
        setAttachments((prev) => [newAtt, ...prev]);
        store.addActivity({
          clientId,
          actor: "Agent (BES HQ)",
          action: "Document uploaded",
          detail: `${file.name} (${uploadCategory})`,
        });
      });
    },
    [clientId, store, uploadCategory, setAttachments],
  );

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) addFiles(e.target.files);
    e.target.value = "";
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    if (e.dataTransfer.files) addFiles(e.dataTransfer.files);
  };

  const removeAttachment = (id: string) => {
    setAttachments((prev) => prev.filter((a) => a.id !== id));
    setViewerIndex(null);
  };

  return (
    <div className="rounded-xl border border-border bg-card p-4 shadow-sm space-y-3">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border/50 pb-2">
        <h3 className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-foreground">
          <Paperclip className="h-4 w-4 text-primary" /> Documents & Evidence (
          {attachments.length})
        </h3>
        <div className="flex items-center gap-2">
          <select
            value={uploadCategory}
            onChange={(e) =>
              setUploadCategory(e.target.value as AttachmentCategory)
            }
            className="rounded border border-border bg-background px-2 py-1 text-[11px] text-foreground"
          >
            {ATTACHMENT_CATEGORIES.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
          <input
            type="file"
            multiple
            ref={fileInputRef}
            onChange={handleFileUpload}
            className="hidden"
          />
          <button
            onClick={() => fileInputRef.current?.click()}
            className="inline-flex items-center gap-1 rounded-lg border border-border bg-background px-3 py-1 text-xs font-bold text-foreground hover:bg-muted"
          >
            <Upload className="h-3.5 w-3.5" /> Upload
          </button>
          <div className="flex overflow-hidden rounded-lg border border-border">
            <button
              onClick={() => setView("grid")}
              className={cn(
                "p-1.5",
                view === "grid"
                  ? "bg-primary text-primary-foreground"
                  : "bg-background text-muted-foreground hover:bg-muted",
              )}
              title="Grid view"
            >
              <LayoutGrid className="h-3.5 w-3.5" />
            </button>
            <button
              onClick={() => setView("list")}
              className={cn(
                "p-1.5",
                view === "list"
                  ? "bg-primary text-primary-foreground"
                  : "bg-background text-muted-foreground hover:bg-muted",
              )}
              title="List view"
            >
              <ListIcon className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>
      </div>

      {/* Drop zone */}
      <div
        onDragOver={(e) => {
          e.preventDefault();
          setIsDragging(true);
        }}
        onDragLeave={() => setIsDragging(false)}
        onDrop={handleDrop}
        onClick={() => fileInputRef.current?.click()}
        className={cn(
          "flex cursor-pointer items-center justify-center rounded-lg border-2 border-dashed p-4 text-center transition-colors",
          isDragging
            ? "border-primary bg-primary/5"
            : "border-border bg-muted/20 hover:border-primary/40 hover:bg-muted/40",
        )}
      >
        <p className="text-[11px] text-muted-foreground">
          <span className="font-bold text-foreground">
            Drag & drop files here
          </span>{" "}
          · click to browse · paste images with Ctrl+V
        </p>
      </div>

      {/* Files */}
      {attachments.length === 0 ? (
        <p className="py-4 text-center text-xs italic text-muted-foreground">
          No documents yet.
        </p>
      ) : view === "grid" ? (
        <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 lg:grid-cols-4">
          {attachments.map((att, i) => (
            <button
              key={att.id}
              onClick={() => setViewerIndex(i)}
              className="group relative flex flex-col overflow-hidden rounded-lg border border-border bg-muted/20 text-left transition-all hover:border-primary/40 hover:shadow-md"
            >
              {/* Thumbnail */}
              <div className="relative flex h-24 items-center justify-center overflow-hidden bg-muted/40">
                {isImage(att) ? (
                  <img
                    src={att.url}
                    alt={att.name}
                    loading="lazy"
                    className="h-full w-full object-cover transition-transform group-hover:scale-105"
                  />
                ) : isPdf(att) ? (
                  <div className="flex flex-col items-center gap-1 text-primary">
                    <FileText className="h-9 w-9" />
                    <span className="text-[9px] font-bold">PDF</span>
                  </div>
                ) : (
                  <div className="flex flex-col items-center gap-1 text-muted-foreground">
                    <FileText className="h-9 w-9" />
                    <span className="text-[9px] font-bold uppercase">
                      {att.type?.split("/")[1]?.slice(0, 4) || "FILE"}
                    </span>
                  </div>
                )}
                <span className="absolute right-1 top-1 rounded bg-black/60 px-1.5 py-0.5 text-[9px] font-bold text-white">
                  {att.size}
                </span>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    removeAttachment(att.id);
                  }}
                  className="absolute left-1 top-1 rounded bg-black/60 p-0.5 text-white opacity-0 transition-opacity group-hover:opacity-100"
                >
                  <X className="h-3 w-3" />
                </button>
              </div>
              {/* Meta */}
              <div className="flex flex-col gap-1 p-2">
                <p
                  className="line-clamp-2 text-[11px] font-bold text-foreground group-hover:text-primary"
                  title={att.name}
                >
                  {att.name}
                </p>
                <div className="flex items-center justify-between">
                  <span className="rounded bg-muted px-1.5 py-0.5 text-[9px] font-medium text-muted-foreground">
                    {att.category}
                  </span>
                  <span className="text-[9px] text-muted-foreground">
                    {att.uploadedBy}
                  </span>
                </div>
              </div>
            </button>
          ))}
        </div>
      ) : (
        <div className="space-y-1.5">
          {attachments.map((att, i) => (
            <button
              key={att.id}
              onClick={() => setViewerIndex(i)}
              className="group flex w-full items-center gap-3 rounded-lg border border-border bg-muted/20 p-2.5 text-left transition-colors hover:border-primary/40 hover:bg-muted/40"
            >
              <div className="flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded bg-muted/40">
                {isImage(att) ? (
                  <img
                    src={att.url}
                    alt={att.name}
                    loading="lazy"
                    className="h-full w-full object-cover"
                  />
                ) : (
                  <FileText className="h-6 w-6 text-primary" />
                )}
              </div>
              <div className="min-w-0 flex-1">
                <p
                  className="truncate text-xs font-bold text-foreground group-hover:text-primary"
                  title={att.name}
                >
                  {att.name}
                </p>
                <p className="text-[10px] text-muted-foreground">
                  {att.category} · {att.size} · {att.uploadedBy} ·{" "}
                  {att.uploadedAt}
                </p>
              </div>
              {isImage(att) && (
                <ImageIcon className="h-4 w-4 shrink-0 text-muted-foreground" />
              )}
            </button>
          ))}
        </div>
      )}

      {viewerIndex !== null && (
        <FileViewer
          files={attachments}
          startIndex={viewerIndex}
          onClose={() => setViewerIndex(null)}
        />
      )}
    </div>
  );
}
