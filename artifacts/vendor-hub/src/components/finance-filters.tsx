import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import type { DateRangePreset } from "@/hooks/use-date-range-filter";

const PRESET_OPTIONS: { value: DateRangePreset; label: string }[] = [
  { value: "all", label: "All time" },
  { value: "week", label: "This week" },
  { value: "month", label: "This month" },
  { value: "year", label: "This year" },
  { value: "custom", label: "Custom range" },
];

/** "This week / month / year / custom" preset selector, shown on Sales, Expenses, Investments & Orders. */
export function DateRangeFilterControl({
  preset, onPresetChange, customFrom, onCustomFromChange, customTo, onCustomToChange,
}: {
  preset: DateRangePreset;
  onPresetChange: (v: DateRangePreset) => void;
  customFrom: string;
  onCustomFromChange: (v: string) => void;
  customTo: string;
  onCustomToChange: (v: string) => void;
}) {
  return (
    <>
      <div className="space-y-1.5">
        <Label className="text-xs">Date Range</Label>
        <Select value={preset} onValueChange={(v) => onPresetChange(v as DateRangePreset)}>
          <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
          <SelectContent>
            {PRESET_OPTIONS.map((o) => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>
      {preset === "custom" && (
        <>
          <div className="space-y-1.5">
            <Label className="text-xs">From</Label>
            <Input type="date" value={customFrom} onChange={(e) => onCustomFromChange(e.target.value)} className="w-40" />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">To</Label>
            <Input type="date" value={customTo} onChange={(e) => onCustomToChange(e.target.value)} className="w-40" />
          </div>
        </>
      )}
    </>
  );
}

interface BranchLike { id: number; name: string }
interface WorkerLike { id: number; name: string }

/** Branch + Worker dropdown filters, shown alongside the date range on the same 4 pages. */
export function BranchWorkerFilterControl({
  branches, workers, branchId, onBranchChange, workerId, onWorkerChange,
}: {
  branches: BranchLike[] | undefined;
  workers: WorkerLike[] | undefined;
  branchId: string;
  onBranchChange: (v: string) => void;
  workerId: string;
  onWorkerChange: (v: string) => void;
}) {
  return (
    <>
      <div className="space-y-1.5">
        <Label className="text-xs">Branch</Label>
        <Select value={branchId} onValueChange={onBranchChange}>
          <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All branches</SelectItem>
            {branches?.map((b) => <SelectItem key={b.id} value={String(b.id)}>{b.name}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>
      <div className="space-y-1.5">
        <Label className="text-xs">Worker</Label>
        <Select value={workerId} onValueChange={onWorkerChange}>
          <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All workers</SelectItem>
            {workers?.map((w) => <SelectItem key={w.id} value={String(w.id)}>{w.name}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>
    </>
  );
}

/** Branch/Worker <Select> pair for create/edit forms — assigns, doesn't filter. */
export function BranchWorkerFormFields({
  branches, workers, branchId, onBranchChange, workerId, onWorkerChange,
}: {
  branches: BranchLike[] | undefined;
  workers: WorkerLike[] | undefined;
  branchId: string;
  onBranchChange: (v: string) => void;
  workerId: string;
  onWorkerChange: (v: string) => void;
}) {
  return (
    <div className="grid grid-cols-2 gap-3">
      <div className="space-y-1.5">
        <Label>Branch</Label>
        <Select value={branchId} onValueChange={onBranchChange}>
          <SelectTrigger><SelectValue placeholder="None" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="none">None</SelectItem>
            {branches?.map((b) => <SelectItem key={b.id} value={String(b.id)}>{b.name}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>
      <div className="space-y-1.5">
        <Label>Worker</Label>
        <Select value={workerId} onValueChange={onWorkerChange}>
          <SelectTrigger><SelectValue placeholder="None" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="none">None</SelectItem>
            {workers?.map((w) => <SelectItem key={w.id} value={String(w.id)}>{w.name}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>
    </div>
  );
}
