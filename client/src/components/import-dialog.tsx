import { useEffect, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Download, Upload, CheckCircle, AlertTriangle } from "lucide-react";
import { queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import type { Branch } from "@shared/schema";

interface ImportDialogProps {
  type: "members" | "first-timers" | "attendance";
  open: boolean;
  onClose: () => void;
}

interface ImportFailure {
  row: number;
  field: string;
  reason: string;
}

interface ImportResult {
  imported: number;
  total: number;
  failures: ImportFailure[];
}

type Stage = "idle" | "file-selected" | "importing" | "result";

export function ImportDialog({ type, open, onClose }: ImportDialogProps) {
  const [file, setFile] = useState<File | null>(null);
  const [recordCount, setRecordCount] = useState<number | null>(null);
  const [stage, setStage] = useState<Stage>("idle");
  const [importResult, setImportResult] = useState<ImportResult | null>(null);
  const [branchId, setBranchId] = useState<string>("");
  const { toast } = useToast();

  const { data: branches } = useQuery<Branch[]>({
    queryKey: ["/api/branches"],
    enabled: type === "members",
  });

  // Non-super_admin callers only ever get their own branch back from the
  // API now — auto-select it instead of making them pick from a list of one.
  useEffect(() => {
    if (branches?.length === 1 && !branchId) {
      setBranchId(branches[0].id);
    }
  }, [branches, branchId]);

  const resetState = () => {
    setFile(null);
    setRecordCount(null);
    setStage("idle");
    setImportResult(null);
    setBranchId("");
  };

  const importMutation = useMutation({
    mutationFn: async (formData: FormData) => {
      const response = await fetch(`/api/${type}/import`, {
        method: "POST",
        body: formData,
      });
      if (!response.ok) {
        throw new Error("Import failed");
      }
      return response.json() as Promise<ImportResult>;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: [`/api/${type}`] });
      queryClient.invalidateQueries({ queryKey: ["/api/members"] });
      setImportResult(data);
      setStage("result");
    },
    onError: (error: any) => {
      setStage("file-selected");
      toast({
        title: "Error",
        description: error.message || "Failed to import data",
        variant: "destructive",
      });
    },
  });

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const selectedFile = e.target.files[0];
      setFile(selectedFile);
      setStage("file-selected");
      const reader = new FileReader();
      reader.onload = (event) => {
        const text = event.target?.result as string;
        const lines = text.split("\n").filter((line) => line.trim() !== "");
        setRecordCount(Math.max(0, lines.length - 1));
      };
      reader.readAsText(selectedFile);
    }
  };

  const handleImport = () => {
    if (!file) return;
    if (type === "members" && !branchId) return;
    setStage("importing");
    const formData = new FormData();
    formData.append("file", file);
    if (type === "members") {
      formData.append("branchId", branchId);
    }
    importMutation.mutate(formData);
  };

  const handleDone = () => {
    onClose();
    resetState();
  };

  const handleDownloadTemplate = async () => {
    try {
      const response = await fetch(`/api/${type}/template`);
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${type}-template.csv`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to download template",
        variant: "destructive",
      });
    }
  };

  return (
    <Dialog open={open} onOpenChange={(isOpen) => { if (!isOpen) { resetState(); onClose(); } }}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Import {type === "first-timers" ? "First Timers" : type}</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {stage !== "result" && (
            <>
              <div>
                <p className="text-sm text-muted-foreground mb-4">
                  Upload a CSV file to import data. Download the template to see the required format.
                </p>
                <Button variant="outline" onClick={handleDownloadTemplate} data-testid="button-download-template">
                  <Download className="w-4 h-4 mr-2" />
                  Download CSV Template
                </Button>
              </div>

              {type === "members" && (
                <div className="space-y-2">
                  <Label htmlFor="branch-select">Branch *</Label>
                  <Select value={branchId} onValueChange={setBranchId} disabled={stage === "importing" || (branches?.length ?? 0) <= 1}>
                    <SelectTrigger id="branch-select" data-testid="select-branch">
                      <SelectValue placeholder="Select a branch" />
                    </SelectTrigger>
                    <SelectContent>
                      {branches?.map((branch) => (
                        <SelectItem key={branch.id} value={branch.id}>
                          {branch.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}

              <div className="space-y-2">
                <Label htmlFor="csv-file">Select CSV File</Label>
                <Input
                  id="csv-file"
                  type="file"
                  accept=".csv"
                  onChange={handleFileChange}
                  disabled={stage === "importing"}
                  data-testid="input-file"
                />
                {file && recordCount !== null && (
                  <p className="text-sm text-muted-foreground">
                    Selected: {file.name}&nbsp;&bull;&nbsp;{recordCount} record{recordCount !== 1 ? "s" : ""} detected
                  </p>
                )}
              </div>
            </>
          )}

          {stage === "result" && importResult && (
            <div className="space-y-3">
              <div className="flex items-center gap-2 text-green-600">
                <CheckCircle className="w-5 h-5 shrink-0" />
                <span className="text-sm font-medium">
                  {importResult.imported} of {importResult.total} record{importResult.total !== 1 ? "s" : ""} imported{importResult.failures.length === 0 ? " successfully." : "."}
                </span>
              </div>

              {importResult.failures.length > 0 && (
                <>
                  <div className="flex items-center gap-2 text-amber-600">
                    <AlertTriangle className="w-5 h-5 shrink-0" />
                    <span className="text-sm font-medium">
                      {importResult.failures.length} record{importResult.failures.length !== 1 ? "s" : ""} failed:
                    </span>
                  </div>

                  <div className="overflow-y-auto max-h-48 border rounded-md">
                    <table className="w-full text-xs">
                      <thead className="bg-muted sticky top-0">
                        <tr>
                          <th className="text-left p-2 font-medium w-12">Row</th>
                          <th className="text-left p-2 font-medium w-28">Field</th>
                          <th className="text-left p-2 font-medium">Reason</th>
                        </tr>
                      </thead>
                      <tbody>
                        {importResult.failures.map((f, idx) => (
                          <tr key={idx} className="border-t">
                            <td className="p-2">{f.row}</td>
                            <td className="p-2">{f.field}</td>
                            <td className="p-2">{f.reason}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </>
              )}
            </div>
          )}

          <div className="flex justify-end gap-2">
            {stage === "result" ? (
              <>
                <Button variant="outline" onClick={resetState} data-testid="button-import-another">
                  Import Another
                </Button>
                <Button onClick={handleDone} data-testid="button-done">
                  Done
                </Button>
              </>
            ) : (
              <>
                <Button variant="outline" onClick={onClose} disabled={stage === "importing"} data-testid="button-cancel">
                  Cancel
                </Button>
                <Button
                  onClick={handleImport}
                  disabled={!file || stage === "importing" || (type === "members" && !branchId)}
                  data-testid="button-import-submit"
                >
                  <Upload className="w-4 h-4 mr-2" />
                  {stage === "importing"
                    ? `Importing${recordCount ? ` ${recordCount} record${recordCount !== 1 ? "s" : ""}` : ""}…`
                    : "Import"}
                </Button>
              </>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
