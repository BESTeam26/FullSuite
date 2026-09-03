import { useRef } from "react";
import { FileText, UploadCloud, CheckCircle2 } from "lucide-react";

export interface PdfFile {
  bureau: "EQ" | "EX" | "TU";
  name: string;
  size: number;
}

const BUREAU_META: Record<"EQ" | "EX" | "TU", { label: string; tone: string }> =
  {
    EQ: { label: "Equifax", tone: "text-status-danger bg-red-500/10" },
    EX: { label: "Experian", tone: "text-status-info bg-blue-500/10" },
    TU: { label: "TransUnion", tone: "text-status-success bg-emerald-500/10" },
  };

export const PdfDropZone = ({
  bureau,
  file,
  onSelect,
}: {
  bureau: "EQ" | "EX" | "TU";
  file: PdfFile | null;
  onSelect: (file: File | null) => void;
}) => {
  const inputRef = useRef<HTMLInputElement>(null);
  const meta = BUREAU_META[bureau];

  return (
    <div
      onClick={() => inputRef.current?.click()}
      className={`cursor-pointer rounded-xl border-2 border-dashed p-5 text-center transition-colors ${
        file
          ? "border-emerald-500/40 bg-emerald-500/5"
          : "border-border bg-muted/20 hover:border-emerald-500/40 hover:bg-muted/40"
      }`}
    >
      <input
        ref={inputRef}
        type="file"
        accept="application/pdf"
        className="hidden"
        onChange={(e) => onSelect(e.target.files?.[0] ?? null)}
      />
      <span
        className={`mx-auto flex h-10 w-10 items-center justify-center rounded-lg ${meta.tone}`}
      >
        {file ? (
          <CheckCircle2 className="h-5 w-5" />
        ) : (
          <UploadCloud className="h-5 w-5" />
        )}
      </span>
      <p className="mt-2 text-xs font-semibold uppercase text-muted-foreground">
        {meta.label}
      </p>
      {file ? (
        <div className="mt-1.5 flex items-center justify-center gap-1.5 text-xs">
          <FileText className="h-3 w-3 text-status-success" />
          <span className="font-medium text-status-success">{file.name}</span>
        </div>
      ) : (
        <p className="mt-1.5 text-xs text-muted-foreground">
          Click to upload PDF
        </p>
      )}
    </div>
  );
};
