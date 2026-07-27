import { useState, useRef, useCallback } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useUser } from "@clerk/react";
import { useListVendors } from "@workspace/api-client-react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  BarChart,
  Bar,
  LineChart,
  Line,
  PieChart,
  Pie,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from "recharts";
import {
  Upload,
  FileSpreadsheet,
  Send,
  Sparkles,
  Download,
  RefreshCw,
  CheckCircle,
  AlertCircle,
  Database,
  BarChart2,
  TrendingUp,
} from "lucide-react";

const BASE_URL = import.meta.env.BASE_URL?.replace(/\/$/, "") ?? "";

type ColumnMeta = {
  name: string;
  type: "numeric" | "date" | "categorical" | "text";
  min?: number;
  max?: number;
  avg?: number;
  uniqueCount?: number;
};

type UploadResult = {
  sessionId: string;
  fileName: string;
  rowCount: number;
  columns: ColumnMeta[];
  preview: Record<string, string>[];
  detectedSchema: "sales" | "expenses" | "products" | "contacts" | "generic";
};

type ChatMessage = { role: "user" | "assistant"; content: string };

const COLORS = ["#7F50FF", "#FF7F50", "#22c55e", "#3b82f6", "#f59e0b", "#ef4444", "#8b5cf6", "#06b6d4"];

const SCHEMA_LABELS: Record<string, string> = {
  sales: "Sales Records",
  expenses: "Expense Records",
  products: "Product Catalog",
  contacts: "Contact List",
  generic: "General Data",
};

const SCHEMA_FIELD_MAPS: Record<string, Record<string, string[]>> = {
  sales: {
    amount:       ["amount", "total", "revenue", "sales", "value", "price"],
    date:         ["date", "sale_date", "saledate", "created_at", "month"],
    description:  ["description", "item", "product", "notes", "note"],
    customerName: ["customer", "customer_name", "client", "buyer", "name"],
    currency:     ["currency", "ccy"],
  },
  expenses: {
    amount:      ["amount", "total", "cost", "expense", "value", "price"],
    date:        ["date", "expense_date", "created_at", "month"],
    category:    ["category", "type", "group", "department"],
    description: ["description", "notes", "item", "name", "memo"],
    currency:    ["currency", "ccy"],
  },
  products: {
    name:        ["name", "product", "item", "product_name", "title"],
    price:       ["price", "unit_price", "cost", "amount", "rate"],
    stock:       ["stock", "quantity", "qty", "inventory", "on_hand"],
    sku:         ["sku", "code", "id", "ref"],
    description: ["description", "notes", "details"],
  },
};

function autoMap(columns: ColumnMeta[], schema: keyof typeof SCHEMA_FIELD_MAPS): Record<string, string> {
  const fieldMap = SCHEMA_FIELD_MAPS[schema] ?? {};
  const mapping: Record<string, string> = {};
  const colNames = columns.map(c => c.name.toLowerCase().replace(/\s+/g, "_"));
  for (const [field, candidates] of Object.entries(fieldMap)) {
    for (const cand of candidates) {
      const idx = colNames.indexOf(cand);
      if (idx >= 0) { mapping[field] = columns[idx]!.name; break; }
    }
    if (!mapping[field]) {
      // Partial match
      const partial = colNames.findIndex(n => candidates.some(c => n.includes(c) || c.includes(n)));
      if (partial >= 0) mapping[field] = columns[partial]!.name;
    }
  }
  return mapping;
}

function buildCharts(columns: ColumnMeta[], preview: Record<string, string>[]) {
  const numericCols = columns.filter(c => c.type === "numeric");
  const dateCols = columns.filter(c => c.type === "date");
  const catCols = columns.filter(c => c.type === "categorical");

  const charts: Array<{ type: "bar" | "line" | "pie"; title: string; data: unknown[]; xKey?: string; yKeys?: string[] }> = [];

  // Line chart: date × numeric
  if (dateCols.length > 0 && numericCols.length > 0) {
    const dateKey = dateCols[0]!.name;
    const numKey = numericCols[0]!.name;
    const grouped: Record<string, number> = {};
    for (const row of preview) {
      const d = row[dateKey]?.slice(0, 7) ?? ""; // group by month
      const v = parseFloat((row[numKey] ?? "").replace(/[₦$€£,\s]/g, "")) || 0;
      grouped[d] = (grouped[d] ?? 0) + v;
    }
    const data = Object.entries(grouped).sort(([a], [b]) => a.localeCompare(b))
      .map(([label, value]) => ({ label, value: parseFloat(value.toFixed(2)) }));
    if (data.length > 1) charts.push({ type: "line", title: `${numKey} over ${dateKey}`, data, xKey: "label", yKeys: ["value"] });
  }

  // Bar chart: categorical × numeric
  if (catCols.length > 0 && numericCols.length > 0) {
    const catKey = catCols[0]!.name;
    const numKey = numericCols[0]!.name;
    const grouped: Record<string, number> = {};
    for (const row of preview) {
      const k = row[catKey] ?? "Other";
      const v = parseFloat((row[numKey] ?? "").replace(/[₦$€£,\s]/g, "")) || 0;
      grouped[k] = (grouped[k] ?? 0) + v;
    }
    const data = Object.entries(grouped).sort(([, a], [, b]) => b - a).slice(0, 12)
      .map(([label, value]) => ({ label, value: parseFloat(value.toFixed(2)) }));
    if (data.length > 0) charts.push({ type: "bar", title: `${numKey} by ${catKey}`, data, xKey: "label", yKeys: ["value"] });
  }

  // Pie chart: categorical distribution
  if (catCols.length > 0 && numericCols.length === 0 && charts.length === 0) {
    const catKey = catCols[0]!.name;
    const counts: Record<string, number> = {};
    for (const row of preview) { const k = row[catKey] ?? "Other"; counts[k] = (counts[k] ?? 0) + 1; }
    const data = Object.entries(counts).sort(([, a], [, b]) => b - a).slice(0, 8)
      .map(([name, value]) => ({ name, value }));
    if (data.length > 1) charts.push({ type: "pie", title: `Distribution of ${catKey}`, data });
  }

  // Numeric summary bar chart (always add if we have numeric cols)
  if (numericCols.length > 0 && charts.length === 0) {
    const data = numericCols.map(c => ({
      name: c.name,
      avg: parseFloat((c.avg ?? 0).toFixed(2)),
      max: parseFloat((c.max ?? 0).toFixed(2)),
    }));
    charts.push({ type: "bar", title: "Numeric Column Averages", data, xKey: "name", yKeys: ["avg"] });
  }

  return charts;
}

function ChartCard({ chart }: { chart: ReturnType<typeof buildCharts>[0] }) {
  if (chart.type === "line") {
    return (
      <ResponsiveContainer width="100%" height={240}>
        <LineChart data={chart.data as Record<string, unknown>[]}>
          <CartesianGrid strokeDasharray="3 3" />
          <XAxis dataKey={chart.xKey} tick={{ fontSize: 11 }} />
          <YAxis tick={{ fontSize: 11 }} />
          <Tooltip />
          {(chart.yKeys ?? []).map((k, i) => (
            <Line key={k} type="monotone" dataKey={k} stroke={COLORS[i % COLORS.length]} strokeWidth={2} dot={false} />
          ))}
        </LineChart>
      </ResponsiveContainer>
    );
  }
  if (chart.type === "bar") {
    return (
      <ResponsiveContainer width="100%" height={240}>
        <BarChart data={chart.data as Record<string, unknown>[]} margin={{ bottom: 40 }}>
          <CartesianGrid strokeDasharray="3 3" />
          <XAxis dataKey={chart.xKey} tick={{ fontSize: 10 }} angle={-35} textAnchor="end" interval={0} />
          <YAxis tick={{ fontSize: 11 }} />
          <Tooltip />
          {(chart.yKeys ?? []).map((k, i) => (
            <Bar key={k} dataKey={k} fill={COLORS[i % COLORS.length]} radius={[4, 4, 0, 0]} />
          ))}
        </BarChart>
      </ResponsiveContainer>
    );
  }
  if (chart.type === "pie") {
    return (
      <ResponsiveContainer width="100%" height={240}>
        <PieChart>
          <Pie data={chart.data as Array<{ name: string; value: number }>} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={90} label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`} labelLine={false}>
            {(chart.data as Array<{ name: string }>).map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
          </Pie>
          <Tooltip />
          <Legend />
        </PieChart>
      </ResponsiveContainer>
    );
  }
  return null;
}

/** Safely renders bold segments from a text line. No HTML injection. */
function InlineBold({ text }: { text: string }) {
  const parts = text.split(/\*\*(.+?)\*\*/g);
  return (
    <>
      {parts.map((part, i) =>
        i % 2 === 1 ? <strong key={i}>{part}</strong> : <span key={i}>{part}</span>
      )}
    </>
  );
}

function MarkdownText({ text }: { text: string }) {
  const lines = text.split("\n");
  return (
    <div className="space-y-1 text-sm leading-relaxed">
      {lines.map((line, i) => {
        if (line.startsWith("## "))  return <h3 key={i} className="font-bold text-base mt-3 mb-1">{line.slice(3)}</h3>;
        if (line.startsWith("### ")) return <h4 key={i} className="font-semibold mt-2">{line.slice(4)}</h4>;
        if (line.startsWith("- ") || line.startsWith("• ")) {
          return (
            <div key={i} className="flex gap-2">
              <span className="text-primary mt-0.5 shrink-0">•</span>
              <span><InlineBold text={line.slice(2)} /></span>
            </div>
          );
        }
        if (line.trim() === "") return <div key={i} className="h-1" />;
        return <p key={i}><InlineBold text={line} /></p>;
      })}
    </div>
  );
}

export default function DataAnalysisPage() {
  const { user } = useUser();
  const { data: vendors } = useListVendors();
  const myVendorId = vendors?.find(v => v.clerkUserId === user?.id)?.id ?? null;
  const isAdmin = !myVendorId && (vendors?.length ?? 0) > 0;

  const [dragging, setDragging] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [session, setSession] = useState<UploadResult | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [question, setQuestion] = useState("");
  const [analyzing, setAnalyzing] = useState(false);
  const [activeTab, setActiveTab] = useState("preview");
  const [importTarget, setImportTarget] = useState<"sales" | "expenses" | "products">("sales");
  const [importMapping, setImportMapping] = useState<Record<string, string>>({});
  const [importing, setImporting] = useState(false);
  const [importResult, setImportResult] = useState<{ imported: number; errors: unknown[]; total: number } | null>(null);
  // Admin selects which vendor to import into (regular vendors use their own id)
  const [adminImportVendorId, setAdminImportVendorId] = useState<number | null>(vendors?.[0]?.id ?? null);
  const chatBottomRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const charts = session ? buildCharts(session.columns, session.preview) : [];

  const ACCEPTED_EXTS = ["xlsx", "xls", "csv", "tsv", "ods", "json"];

  const handleFile = useCallback(async (file: File) => {
    if (!file) return;
    const ext = file.name.split(".").pop()?.toLowerCase() ?? "";
    if (!ACCEPTED_EXTS.includes(ext)) {
      toast.error("Supported formats: .xlsx, .xls, .csv, .tsv, .ods, .json");
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      toast.error("File must be under 10 MB");
      return;
    }
    setUploading(true);
    try {
      const form = new FormData();
      form.append("file", file);
      const resp = await fetch(`${BASE_URL}/api/data-analysis/upload`, {
        method: "POST",
        body: form,
        credentials: "include",
      });
      if (!resp.ok) {
        const err = await resp.json().catch(() => ({ error: "Upload failed" }));
        toast.error(err.error ?? "Upload failed");
        return;
      }
      const data: UploadResult = await resp.json();
      setSession(data);
      setMessages([]);
      setImportResult(null);
      const autoMapping = autoMap(data.columns, data.detectedSchema as keyof typeof SCHEMA_FIELD_MAPS ?? "sales");
      setImportMapping(autoMapping);
      if (data.detectedSchema !== "generic" && data.detectedSchema !== "contacts") {
        setImportTarget(data.detectedSchema as "sales" | "expenses" | "products");
      }
      setActiveTab("preview");
      toast.success(`Uploaded "${file.name}" — ${data.rowCount.toLocaleString()} rows detected`);
    } catch (e) {
      toast.error("Upload failed");
    } finally {
      setUploading(false);
    }
  }, []);

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragging(false);
    const file = e.dataTransfer.files[0];
    if (file) handleFile(file);
  };

  const sendQuestion = async (q?: string) => {
    const text = (q ?? question).trim();
    if (!text || !session) return;
    setQuestion("");
    setAnalyzing(true);
    const userMsg: ChatMessage = { role: "user", content: text };
    setMessages(prev => [...prev, userMsg]);
    setActiveTab("analysis");

    let accumulated = "";
    const assistantMsg: ChatMessage = { role: "assistant", content: "" };
    setMessages(prev => [...prev, assistantMsg]);

    try {
      const resp = await fetch(`${BASE_URL}/api/data-analysis/analyze`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ sessionId: session.sessionId, question: text }),
      });

      if (!resp.ok || !resp.body) {
        toast.error("Analysis failed");
        setAnalyzing(false);
        return;
      }

      const reader = resp.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";
        for (const line of lines) {
          if (!line.startsWith("data: ")) continue;
          try {
            const payload = JSON.parse(line.slice(6));
            if (payload.delta) {
              accumulated += payload.delta;
              setMessages(prev => {
                const updated = [...prev];
                updated[updated.length - 1] = { role: "assistant", content: accumulated };
                return updated;
              });
            }
          } catch { /* ignore parse errors */ }
        }
      }
      chatBottomRef.current?.scrollIntoView({ behavior: "smooth" });
    } catch (e) {
      toast.error("Analysis request failed");
    } finally {
      setAnalyzing(false);
    }
  };

  const handleImport = async () => {
    if (!session) return;
    // Admins must pick a vendor first
    const effectiveVendorId = myVendorId ?? adminImportVendorId;
    if (isAdmin && !effectiveVendorId) {
      toast.error("Select a vendor to import data into");
      return;
    }
    setImporting(true);
    try {
      const resp = await fetch(`${BASE_URL}/api/data-analysis/import`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          sessionId: session.sessionId,
          targetSchema: importTarget,
          mapping: importMapping,
          ...(isAdmin && effectiveVendorId ? { vendorId: effectiveVendorId } : {}),
        }),
      });
      const data = await resp.json();
      if (!resp.ok) { toast.error(data.error ?? "Import failed"); return; }
      setImportResult(data);
      toast.success(`Imported ${data.imported} rows successfully`);
    } catch { toast.error("Import failed"); }
    finally { setImporting(false); }
  };

  // ── Empty state ────────────────────────────────────────────────────────────
  if (!session) {
    return (
      <div className="p-6 max-w-2xl mx-auto">
        <div className="mb-6">
          <div className="flex items-center gap-3 mb-2">
            <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
              <BarChart2 className="w-5 h-5 text-primary" />
            </div>
            <div>
              <h1 className="text-2xl font-bold">Data Analysis</h1>
              <p className="text-muted-foreground text-sm">Upload a file — get AI insights, charts, and one-click data import</p>
            </div>
          </div>
        </div>

        <div
          className={`border-2 border-dashed rounded-xl p-12 text-center transition-colors cursor-pointer ${dragging ? "border-primary bg-primary/5" : "border-muted-foreground/30 hover:border-primary/50 hover:bg-muted/30"}`}
          onDragOver={e => { e.preventDefault(); setDragging(true); }}
          onDragLeave={() => setDragging(false)}
          onDrop={handleDrop}
          onClick={() => fileInputRef.current?.click()}
        >
          <input
            ref={fileInputRef}
            type="file"
            accept=".xlsx,.xls,.csv,.tsv,.ods,.json"
            className="hidden"
            onChange={e => { const f = e.target.files?.[0]; if (f) handleFile(f); }}
          />
          {uploading
            ? <><RefreshCw className="w-10 h-10 mx-auto mb-3 text-primary animate-spin" /><p className="text-muted-foreground">Parsing file…</p></>
            : <>
              <FileSpreadsheet className="w-12 h-12 mx-auto mb-3 text-muted-foreground/50" />
              <p className="text-lg font-semibold mb-1">Drop your data file here</p>
              <div className="flex flex-wrap gap-1.5 justify-center mb-4">
                {[".xlsx", ".xls", ".csv", ".tsv", ".ods", ".json"].map(ext => (
                  <span key={ext} className="text-xs bg-muted rounded px-2 py-0.5 font-mono text-muted-foreground">{ext}</span>
                ))}
              </div>
              <p className="text-xs text-muted-foreground mb-4">Up to 10 MB</p>
              <Button variant="outline"><Upload className="w-4 h-4 mr-2" />Browse File</Button>
            </>
          }
        </div>

        <div className="mt-6 grid grid-cols-3 gap-3">
          {[
            { icon: FileSpreadsheet, title: "Instant Preview", desc: "See first 20 rows and column types as soon as you upload" },
            { icon: Sparkles, title: "AI Analysis", desc: "Ask anything in plain English — trends, anomalies, insights" },
            { icon: Database, title: "Direct Import", desc: "One-click import into Sales, Expenses, or Products" },
          ].map(({ icon: Icon, title, desc }) => (
            <div key={title} className="border rounded-lg p-4 text-center">
              <Icon className="w-6 h-6 mx-auto mb-2 text-primary" />
              <div className="font-semibold text-sm">{title}</div>
              <div className="text-xs text-muted-foreground mt-1">{desc}</div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  // ── Main interface ─────────────────────────────────────────────────────────
  return (
    <div className="p-4 max-w-full h-full flex flex-col gap-4">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-xl font-bold flex items-center gap-2">
            <FileSpreadsheet className="w-5 h-5 text-primary" />
            {session.fileName}
          </h1>
          <div className="flex items-center gap-2 mt-0.5">
            <Badge variant="outline">{session.rowCount.toLocaleString()} rows</Badge>
            <Badge variant="outline">{session.columns.length} columns</Badge>
            <Badge variant="secondary">{SCHEMA_LABELS[session.detectedSchema]}</Badge>
          </div>
        </div>
        <div className="flex gap-2">
          <input
            ref={fileInputRef}
            type="file"
            accept=".xlsx,.xls,.csv,.tsv,.ods,.json"
            className="hidden"
            onChange={e => { const f = e.target.files?.[0]; if (f) { e.target.value = ""; handleFile(f); } }}
          />
          <Button variant="outline" size="sm" onClick={() => fileInputRef.current?.click()}>
            <Upload className="w-3.5 h-3.5 mr-1" />New File
          </Button>
          <Button size="sm" onClick={() => sendQuestion("Summarise this dataset: describe what it contains, highlight key statistics, identify any trends or anomalies, and give 2-3 business insights.")} disabled={analyzing}>
            <Sparkles className="w-3.5 h-3.5 mr-1" />{analyzing ? "Analysing…" : "Analyse with AI"}
          </Button>
        </div>
      </div>

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab} className="flex-1 flex flex-col min-h-0">
        <TabsList>
          <TabsTrigger value="preview">Preview</TabsTrigger>
          <TabsTrigger value="charts">Charts {charts.length > 0 && <Badge className="ml-1 h-4 px-1 text-[10px]">{charts.length}</Badge>}</TabsTrigger>
          <TabsTrigger value="analysis">AI Analysis {messages.length > 0 && <Badge className="ml-1 h-4 px-1 text-[10px]">{messages.filter(m => m.role === "assistant").length}</Badge>}</TabsTrigger>
          <TabsTrigger value="import">Import</TabsTrigger>
        </TabsList>

        {/* Preview */}
        <TabsContent value="preview" className="flex-1 overflow-auto min-h-0 m-0 mt-2">
          <div className="mb-3">
            <h3 className="text-sm font-medium mb-1.5">Column Types</h3>
            <div className="flex flex-wrap gap-1.5">
              {session.columns.map(c => (
                <Badge key={c.name} variant="outline" className="gap-1">
                  <span className={`w-2 h-2 rounded-full ${c.type === "numeric" ? "bg-blue-500" : c.type === "date" ? "bg-emerald-500" : c.type === "categorical" ? "bg-purple-500" : "bg-gray-400"}`} />
                  {c.name}
                  <span className="text-muted-foreground">({c.type})</span>
                </Badge>
              ))}
            </div>
          </div>
          <div className="rounded-lg border overflow-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  {session.columns.map(c => (
                    <TableHead key={c.name} className="whitespace-nowrap text-xs py-2">
                      {c.name}
                      {c.type === "numeric" && c.avg !== undefined && (
                        <div className="text-muted-foreground font-normal">avg: {c.avg.toFixed(1)}</div>
                      )}
                    </TableHead>
                  ))}
                </TableRow>
              </TableHeader>
              <TableBody>
                {session.preview.map((row, i) => (
                  <TableRow key={i}>
                    {session.columns.map(c => (
                      <TableCell key={c.name} className="text-xs py-1.5 whitespace-nowrap max-w-40 truncate">{row[c.name] ?? ""}</TableCell>
                    ))}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
          <p className="text-xs text-muted-foreground mt-2">Showing first {session.preview.length} of {session.rowCount.toLocaleString()} rows</p>
        </TabsContent>

        {/* Charts */}
        <TabsContent value="charts" className="flex-1 overflow-auto m-0 mt-2">
          {charts.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-48 text-muted-foreground">
              <TrendingUp className="w-8 h-8 mb-2 opacity-40" />
              <p className="text-sm">No numeric or categorical columns detected for charting</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              {charts.map((chart, i) => (
                <Card key={i}>
                  <CardHeader className="pb-2 pt-4 px-4">
                    <CardTitle className="text-sm font-semibold">{chart.title}</CardTitle>
                  </CardHeader>
                  <CardContent className="px-4 pb-4">
                    <ChartCard chart={chart} />
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>

        {/* AI Analysis */}
        <TabsContent value="analysis" className="flex-1 flex flex-col min-h-0 m-0 mt-2">
          <div className="flex-1 overflow-y-auto space-y-4 pr-1">
            {messages.length === 0 && (
              <div className="text-center py-8 text-muted-foreground">
                <Sparkles className="w-8 h-8 mx-auto mb-2 opacity-40" />
                <p className="text-sm mb-3">Ask anything about your data</p>
                <div className="flex flex-wrap gap-2 justify-center">
                  {[
                    "Summarise this dataset",
                    "Which values are highest?",
                    "Are there any anomalies?",
                    "What trends do you see?",
                  ].map(q => (
                    <Button key={q} variant="outline" size="sm" onClick={() => sendQuestion(q)} disabled={analyzing}>{q}</Button>
                  ))}
                </div>
              </div>
            )}
            {messages.map((msg, i) => (
              <div key={i} className={`flex gap-3 ${msg.role === "user" ? "flex-row-reverse" : ""}`}>
                <div className={`w-7 h-7 rounded-full shrink-0 flex items-center justify-center text-xs font-bold ${msg.role === "user" ? "bg-primary text-white" : "bg-muted"}`}>
                  {msg.role === "user" ? "You" : <Sparkles className="w-3.5 h-3.5" />}
                </div>
                <div className={`flex-1 rounded-xl px-4 py-3 max-w-[85%] ${msg.role === "user" ? "bg-primary text-white text-sm" : "bg-muted"}`}>
                  {msg.role === "assistant" ? <MarkdownText text={msg.content || "…"} /> : <p className="text-sm">{msg.content}</p>}
                </div>
              </div>
            ))}
            <div ref={chatBottomRef} />
          </div>
          <div className="flex gap-2 pt-3 border-t mt-3">
            <Input
              placeholder="Ask a follow-up question…"
              value={question}
              onChange={e => setQuestion(e.target.value)}
              onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendQuestion(); } }}
              disabled={analyzing}
            />
            <Button onClick={() => sendQuestion()} disabled={analyzing || !question.trim()}>
              {analyzing ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
            </Button>
          </div>
        </TabsContent>

        {/* Import */}
        <TabsContent value="import" className="flex-1 overflow-auto m-0 mt-2">
          {importResult ? (
            <Card>
              <CardContent className="pt-6">
                <div className="flex items-start gap-3">
                  {importResult.errors.length === 0
                    ? <CheckCircle className="w-6 h-6 text-emerald-500 shrink-0 mt-0.5" />
                    : <AlertCircle className="w-6 h-6 text-amber-500 shrink-0 mt-0.5" />
                  }
                  <div>
                    <p className="font-semibold">{importResult.imported} of {importResult.total} rows imported successfully</p>
                    {importResult.errors.length > 0 && (
                      <p className="text-sm text-muted-foreground mt-1">{importResult.errors.length} rows skipped (missing required fields)</p>
                    )}
                    <Button className="mt-3" variant="outline" size="sm" onClick={() => setImportResult(null)}>Try again</Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          ) : session.detectedSchema === "contacts" || session.detectedSchema === "generic" ? (
            <div className="flex flex-col items-center py-10 text-muted-foreground">
              <Database className="w-8 h-8 mb-2 opacity-40" />
              <p className="text-sm font-medium">Import not available for this file type</p>
              <p className="text-xs mt-1">Import supports Sales, Expenses, and Products data only</p>
            </div>
          ) : (
            <div className="max-w-lg space-y-5">
              {/* Admin: pick which vendor to import into */}
              {isAdmin && vendors && vendors.length > 0 && (
                <div className="space-y-2">
                  <Label>Import into vendor</Label>
                  <Select
                    value={adminImportVendorId?.toString() ?? ""}
                    onValueChange={v => setAdminImportVendorId(parseInt(v))}
                  >
                    <SelectTrigger><SelectValue placeholder="Select a vendor…" /></SelectTrigger>
                    <SelectContent>
                      {vendors.map(v => (
                        <SelectItem key={v.id} value={v.id.toString()}>{v.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}

              <div className="space-y-2">
                <Label>Import as</Label>
                <Select value={importTarget} onValueChange={(v: typeof importTarget) => {
                  setImportTarget(v);
                  setImportMapping(autoMap(session.columns, v));
                }}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="sales">Sales Records</SelectItem>
                    <SelectItem value="expenses">Expense Records</SelectItem>
                    <SelectItem value="products">Product Catalog</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label>Column Mapping</Label>
                <p className="text-xs text-muted-foreground">Map your file's columns to the required fields</p>
                <div className="space-y-2">
                  {Object.keys(SCHEMA_FIELD_MAPS[importTarget] ?? {}).map(field => (
                    <div key={field} className="flex items-center gap-3">
                      <span className="w-28 text-sm font-medium capitalize">{field.replace(/([A-Z])/g, " $1")}</span>
                      <Select
                        value={importMapping[field] ?? "__none__"}
                        onValueChange={v => setImportMapping(prev => ({ ...prev, [field]: v === "__none__" ? "" : v }))}
                      >
                        <SelectTrigger className="flex-1"><SelectValue placeholder="Not mapped" /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="__none__">Not mapped</SelectItem>
                          {session.columns.map(c => <SelectItem key={c.name} value={c.name}>{c.name}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    </div>
                  ))}
                </div>
              </div>

              <Card className="bg-muted/30">
                <CardContent className="pt-4 pb-4">
                  <p className="text-sm font-medium mb-1">{session.rowCount.toLocaleString()} rows will be imported</p>
                  <p className="text-xs text-muted-foreground">Rows with missing required fields will be skipped. This action cannot be undone.</p>
                </CardContent>
              </Card>

              <Button onClick={handleImport} disabled={importing} className="w-full">
                {importing ? <><RefreshCw className="w-4 h-4 mr-2 animate-spin" />Importing…</> : <><Download className="w-4 h-4 mr-2" />Import {session.rowCount.toLocaleString()} Rows</>}
              </Button>
            </div>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
