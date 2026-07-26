import { useState, useRef } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Upload, FileText, CheckCircle2, AlertCircle, X } from "lucide-react";
import { toast } from "sonner";

const BASE_URL = import.meta.env.BASE_URL?.replace(/\/$/, "") ?? "";

interface ImportResult {
  imported: number;
  skipped: number;
  errors: number;
  errorDetails?: { row: number; error: string }[];
}

interface CsvImportDialogProps {
  open: boolean;
  onClose: () => void;
  importUrl: string; // e.g. "/api/sales/import"
  entityName: string; // e.g. "Sales"
  columns: string[]; // Describe expected columns to the user
  requiredColumns?: string[];
  extraFields?: Record<string, string>; // extra form fields to append
  onSuccess: (result: ImportResult) => void;
}

export function CsvImportDialog({
  open, onClose, importUrl, entityName, columns, requiredColumns = [], extraFields = {}, onSuccess,
}: CsvImportDialogProps) {
  const [file, setFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [result, setResult] = useState<ImportResult | null>(null);
  const [showErrors, setShowErrors] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  function reset() {
    setFile(null);
    setResult(null);
    setShowErrors(false);
  }

  function handleClose() {
    reset();
    onClose();
  }

  async function handleImport() {
    if (!file) return;
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      for (const [k, v] of Object.entries(extraFields)) fd.append(k, v);
      const res = await fetch(`${BASE_URL}${importUrl}`, {
        method: "POST",
        body: fd,
        credentials: "include",
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error ?? `Upload failed (${res.status})`);
      }
      const data: ImportResult = await res.json();
      setResult(data);
      onSuccess(data);
      if (data.errors === 0) {
        toast.success(`${data.imported} ${entityName.toLowerCase()} imported successfully`);
      } else {
        toast.warning(`Imported ${data.imported}, ${data.errors} rows had errors`);
      }
    } catch (e: any) {
      toast.error(e.message ?? "Import failed");
    } finally {
      setUploading(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(v) => !v && handleClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Import {entityName} from CSV</DialogTitle>
        </DialogHeader>

        {!result ? (
          <>
            {/* Column guide */}
            <div className="rounded-lg bg-muted/50 p-3 text-sm space-y-1.5">
              <p className="font-semibold text-xs uppercase tracking-wide text-muted-foreground">Expected columns</p>
              <div className="flex flex-wrap gap-1.5">
                {columns.map(c => (
                  <Badge key={c} variant={requiredColumns.includes(c) ? "default" : "secondary"} className="text-xs">
                    {c}{requiredColumns.includes(c) ? " *" : ""}
                  </Badge>
                ))}
              </div>
              <p className="text-xs text-muted-foreground">* Required. First row must be headers.</p>
            </div>

            {/* File picker */}
            <div
              className="border-2 border-dashed rounded-xl p-8 flex flex-col items-center gap-3 cursor-pointer hover:bg-muted/30 transition-colors"
              onClick={() => inputRef.current?.click()}
            >
              {file ? (
                <>
                  <FileText className="w-8 h-8 text-primary" />
                  <p className="text-sm font-medium">{file.name}</p>
                  <p className="text-xs text-muted-foreground">{(file.size / 1024).toFixed(1)} KB</p>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="text-xs"
                    onClick={(e) => { e.stopPropagation(); setFile(null); }}
                  >
                    <X className="w-3 h-3 mr-1" /> Remove
                  </Button>
                </>
              ) : (
                <>
                  <Upload className="w-8 h-8 text-muted-foreground" />
                  <p className="text-sm font-medium">Click to choose a CSV file</p>
                  <p className="text-xs text-muted-foreground">Up to 10 MB</p>
                </>
              )}
            </div>
            <input
              ref={inputRef}
              type="file"
              accept=".csv,text/csv"
              className="hidden"
              onChange={e => setFile(e.target.files?.[0] ?? null)}
            />

            <DialogFooter>
              <Button variant="outline" onClick={handleClose}>Cancel</Button>
              <Button onClick={handleImport} disabled={!file || uploading}>
                <Upload className="w-4 h-4 mr-2" />
                {uploading ? "Importing…" : "Import"}
              </Button>
            </DialogFooter>
          </>
        ) : (
          /* Results panel */
          <>
            <div className="space-y-3 py-2">
              <div className="grid grid-cols-3 gap-3 text-center">
                <div className="rounded-lg bg-emerald-500/10 p-3">
                  <CheckCircle2 className="w-5 h-5 text-emerald-500 mx-auto mb-1" />
                  <p className="text-2xl font-bold text-emerald-500">{result.imported}</p>
                  <p className="text-xs text-muted-foreground">Imported</p>
                </div>
                <div className="rounded-lg bg-amber-500/10 p-3">
                  <p className="text-2xl font-bold text-amber-500">{result.skipped}</p>
                  <p className="text-xs text-muted-foreground">Skipped</p>
                </div>
                <div className="rounded-lg bg-destructive/10 p-3">
                  <AlertCircle className="w-5 h-5 text-destructive mx-auto mb-1" />
                  <p className="text-2xl font-bold text-destructive">{result.errors}</p>
                  <p className="text-xs text-muted-foreground">Errors</p>
                </div>
              </div>

              {result.errors > 0 && result.errorDetails && result.errorDetails.length > 0 && (
                <div>
                  <button
                    className="text-xs text-muted-foreground underline"
                    onClick={() => setShowErrors(v => !v)}
                  >
                    {showErrors ? "Hide" : "Show"} error details
                  </button>
                  {showErrors && (
                    <div className="mt-2 max-h-40 overflow-y-auto rounded border text-xs divide-y">
                      {result.errorDetails.map(e => (
                        <div key={e.row} className="p-2 flex gap-2">
                          <span className="text-muted-foreground shrink-0">Row {e.row}</span>
                          <span className="text-destructive">{e.error}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={reset}>Import Another File</Button>
              <Button onClick={handleClose}>Done</Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
