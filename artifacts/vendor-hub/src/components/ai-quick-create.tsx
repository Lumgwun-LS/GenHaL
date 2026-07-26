import { useState, useRef, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Sparkles, X, Mic, MicOff, MessageSquare, FormInput, Package,
  ShoppingCart, Receipt, Loader2, Check, ChevronDown, AlertCircle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { useAuth } from "@clerk/react";
import { cn } from "@/lib/utils";

const BASE_URL = import.meta.env.BASE_URL?.replace(/\/$/, "") ?? "";

type EntityType = "product" | "order" | "sale";
type InputMode = "chat" | "voice" | "form";

const ENTITIES: { value: EntityType; label: string; icon: typeof Package; description: string }[] = [
  { value: "product", label: "Inventory Item", icon: Package, description: "Add a new product or stock item" },
  { value: "order", label: "Order", icon: ShoppingCart, description: "Create a customer order" },
  { value: "sale", label: "Invoice / Sale", icon: Receipt, description: "Record a sale or invoice" },
];

interface ParsedProduct { name: string; sku: string; price: string; category: string; stockQuantity: number; description?: string; unit?: string }
interface ParsedOrder { customerName: string; customerEmail: string; customerPhone?: string; totalAmount: string; currency: string; notes?: string; shippingAddress?: string }
interface ParsedSale { description: string; customerName?: string; amount: string; currency: string }

type ParsedData = ParsedProduct | ParsedOrder | ParsedSale;

const PLACEHOLDERS: Record<EntityType, string> = {
  product: 'e.g. "Add 50 units of Mango Juice 75cl at ₦450 per bottle, category Beverages, SKU MJ-75CL"',
  order: 'e.g. "Order from John Adeyemi, phone 08012345678, 3 shirts totalling ₦15,000, shipping to Lagos"',
  sale: 'e.g. "Cash sale of ₦25,000 for catering services to ABC Company on Friday"',
};

// Default form state per entity
function defaultForm(entity: EntityType): Record<string, string> {
  if (entity === "product") return { name: "", sku: "", price: "", category: "", stockQuantity: "0", description: "", unit: "" };
  if (entity === "order") return { customerName: "", customerEmail: "", customerPhone: "", totalAmount: "", currency: "NGN", notes: "", shippingAddress: "" };
  return { description: "", customerName: "", amount: "", currency: "NGN" };
}

async function parseDescription(entityType: EntityType, description: string, token: string): Promise<ParsedData> {
  const res = await fetch(`${BASE_URL}/api/ai-quick-create/parse`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify({ entityType, description }),
  });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

async function createEntity(entityType: EntityType, data: ParsedData, token: string): Promise<{ id: number; message: string }> {
  const res = await fetch(`${BASE_URL}/api/ai-quick-create/create`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify({ entityType, data }),
  });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

function FieldRow({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <div className="space-y-1">
      <Label className="text-xs text-muted-foreground">{label}</Label>
      <Input value={value} onChange={(e) => onChange(e.target.value)} className="h-8 text-sm" />
    </div>
  );
}

function ProductForm({ data, onChange }: { data: ParsedProduct; onChange: (d: ParsedProduct) => void }) {
  const set = (k: keyof ParsedProduct) => (v: string) => onChange({ ...data, [k]: k === "stockQuantity" ? Number(v) : v });
  return (
    <div className="grid grid-cols-2 gap-3">
      <div className="col-span-2"><FieldRow label="Product Name *" value={data.name} onChange={set("name")} /></div>
      <FieldRow label="SKU *" value={data.sku} onChange={set("sku")} />
      <FieldRow label="Category *" value={data.category} onChange={set("category")} />
      <FieldRow label="Price *" value={data.price} onChange={set("price")} />
      <FieldRow label="Stock Qty" value={String(data.stockQuantity)} onChange={set("stockQuantity")} />
      <FieldRow label="Unit (e.g. kg, pcs)" value={data.unit ?? ""} onChange={set("unit")} />
      <div className="col-span-2"><FieldRow label="Description" value={data.description ?? ""} onChange={set("description")} /></div>
    </div>
  );
}

function OrderForm({ data, onChange }: { data: ParsedOrder; onChange: (d: ParsedOrder) => void }) {
  const set = (k: keyof ParsedOrder) => (v: string) => onChange({ ...data, [k]: v });
  return (
    <div className="grid grid-cols-2 gap-3">
      <div className="col-span-2"><FieldRow label="Customer Name *" value={data.customerName} onChange={set("customerName")} /></div>
      <FieldRow label="Customer Email *" value={data.customerEmail} onChange={set("customerEmail")} />
      <FieldRow label="Phone" value={data.customerPhone ?? ""} onChange={set("customerPhone")} />
      <FieldRow label="Total Amount *" value={data.totalAmount} onChange={set("totalAmount")} />
      <FieldRow label="Currency" value={data.currency} onChange={set("currency")} />
      <div className="col-span-2"><FieldRow label="Shipping Address" value={data.shippingAddress ?? ""} onChange={set("shippingAddress")} /></div>
      <div className="col-span-2"><FieldRow label="Notes" value={data.notes ?? ""} onChange={set("notes")} /></div>
    </div>
  );
}

function SaleForm({ data, onChange }: { data: ParsedSale; onChange: (d: ParsedSale) => void }) {
  const set = (k: keyof ParsedSale) => (v: string) => onChange({ ...data, [k]: v });
  return (
    <div className="grid grid-cols-2 gap-3">
      <div className="col-span-2"><FieldRow label="Description *" value={data.description} onChange={set("description")} /></div>
      <FieldRow label="Customer Name" value={data.customerName ?? ""} onChange={set("customerName")} />
      <FieldRow label="Amount *" value={data.amount} onChange={set("amount")} />
      <FieldRow label="Currency" value={data.currency} onChange={set("currency")} />
    </div>
  );
}

export default function AiQuickCreate() {
  const [open, setOpen] = useState(false);
  const [entity, setEntity] = useState<EntityType>("product");
  const [mode, setMode] = useState<InputMode>("chat");
  const [chatText, setChatText] = useState("");
  const [isRecording, setIsRecording] = useState(false);
  const [transcript, setTranscript] = useState("");
  const [formData, setFormData] = useState<Record<string, string>>(defaultForm("product"));
  const [parsing, setParsing] = useState(false);
  const [parsed, setParsed] = useState<ParsedData | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [success, setSuccess] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const recogRef = useRef<unknown>(null);
  const { getToken } = useAuth();

  useEffect(() => {
    if (!open) {
      setChatText(""); setTranscript(""); setParsed(null); setError(null); setSuccess(null);
      setFormData(defaultForm(entity));
    }
  }, [open]);

  useEffect(() => {
    setFormData(defaultForm(entity));
    setChatText(""); setTranscript(""); setParsed(null);
  }, [entity]);

  async function fetchToken(): Promise<string> {
    return (await getToken()) ?? "";
  }

  async function handleParse(description: string) {
    if (!description.trim()) return;
    setParsing(true); setError(null);
    try {
      const token = await fetchToken();
      const result = await parseDescription(entity, description, token);
      setParsed(result);
      setConfirmOpen(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to parse. Please try again.");
    } finally {
      setParsing(false);
    }
  }

  function handleFormSubmit() {
    // Build a ParsedData from the raw form fields
    if (entity === "product") {
      setParsed({
        name: formData.name, sku: formData.sku, price: formData.price,
        category: formData.category, stockQuantity: Number(formData.stockQuantity),
        description: formData.description, unit: formData.unit,
      } as ParsedProduct);
    } else if (entity === "order") {
      setParsed({
        customerName: formData.customerName, customerEmail: formData.customerEmail,
        customerPhone: formData.customerPhone, totalAmount: formData.totalAmount,
        currency: formData.currency, notes: formData.notes, shippingAddress: formData.shippingAddress,
      } as ParsedOrder);
    } else {
      setParsed({
        description: formData.description, customerName: formData.customerName,
        amount: formData.amount, currency: formData.currency,
      } as ParsedSale);
    }
    setConfirmOpen(true);
  }

  async function handleConfirm() {
    if (!parsed) return;
    setSaving(true); setError(null);
    try {
      const token = await fetchToken();
      const result = await createEntity(entity, parsed, token);
      setSuccess(result.message);
      setConfirmOpen(false);
      setTimeout(() => { setOpen(false); setSuccess(null); }, 1800);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to create. Please try again.");
    } finally {
      setSaving(false);
    }
  }

  function startVoice() {
    type SpeechRecognitionCtor = new () => {
      lang: string; interimResults: boolean; maxAlternatives: number;
      onresult: ((e: { results: Iterable<{ 0: { transcript: string } }> }) => void) | null;
      onend: (() => void) | null; onerror: ((e: Event) => void) | null;
      start(): void; stop(): void;
    };
    const w = window as unknown as { SpeechRecognition?: SpeechRecognitionCtor; webkitSpeechRecognition?: SpeechRecognitionCtor };
    const SR = w.SpeechRecognition ?? w.webkitSpeechRecognition;
    if (!SR) { setError("Voice input is not supported in this browser. Try Chrome or Edge."); return; }
    const rec = new SR();
    rec.lang = "en-US"; rec.interimResults = true; rec.maxAlternatives = 1;
    rec.onresult = (e) => {
      const t = Array.from(e.results).map((r) => r[0].transcript).join(" ");
      setTranscript(t);
    };
    rec.onend = () => setIsRecording(false);
    rec.onerror = () => { setIsRecording(false); setError("Voice recognition error. Please try again."); };
    recogRef.current = rec;
    rec.start();
    setIsRecording(true);
    setTranscript("");
  }

  function stopVoice() {
    (recogRef.current as { stop(): void } | null)?.stop();
    setIsRecording(false);
  }

  const activeEntity = ENTITIES.find((e) => e.value === entity)!;
  const EntityIcon = activeEntity.icon;

  return (
    <>
      {/* Floating trigger — sits above the WhatsApp button */}
      <div className="fixed bottom-24 right-6 z-50">
        <motion.button
          whileHover={{ scale: 1.08 }}
          whileTap={{ scale: 0.95 }}
          onClick={() => setOpen(true)}
          className="w-14 h-14 rounded-full bg-primary hover:bg-primary/90 shadow-lg shadow-primary/40 flex items-center justify-center text-primary-foreground transition-colors"
          aria-label="AI Quick Create"
        >
          <Sparkles className="w-6 h-6" />
        </motion.button>
        <div className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-emerald-400 border-2 border-background animate-pulse" aria-hidden="true" />
      </div>

      {/* Main panel */}
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, x: 40, scale: 0.96 }}
            animate={{ opacity: 1, x: 0, scale: 1 }}
            exit={{ opacity: 0, x: 40, scale: 0.96 }}
            transition={{ duration: 0.2 }}
            className="fixed bottom-6 right-[5.5rem] z-50 w-[380px] max-h-[90vh] flex flex-col bg-card border border-border rounded-2xl shadow-2xl overflow-hidden"
          >
            {/* Header */}
            <div className="flex items-center gap-2 px-4 py-3 border-b border-border bg-muted/30">
              <Sparkles className="w-4 h-4 text-primary" />
              <span className="font-semibold text-sm flex-1">AI Quick Create</span>
              <button onClick={() => setOpen(false)} className="text-muted-foreground hover:text-foreground rounded-full p-0.5" aria-label="Close">
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-4 space-y-4">
              {/* Success state */}
              {success && (
                <motion.div initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }}
                  className="flex flex-col items-center gap-3 py-8 text-center">
                  <div className="w-14 h-14 rounded-full bg-emerald-500/20 flex items-center justify-center">
                    <Check className="w-7 h-7 text-emerald-500" />
                  </div>
                  <p className="font-semibold">{success}</p>
                </motion.div>
              )}

              {!success && (
                <>
                  {/* Entity selector */}
                  <div>
                    <Label className="text-xs text-muted-foreground mb-2 block">What do you want to create?</Label>
                    <div className="grid grid-cols-3 gap-2">
                      {ENTITIES.map((e) => {
                        const Icon = e.icon;
                        return (
                          <button
                            key={e.value}
                            onClick={() => setEntity(e.value)}
                            className={cn(
                              "flex flex-col items-center gap-1.5 p-2.5 rounded-xl border text-xs font-medium transition-all",
                              entity === e.value
                                ? "border-primary bg-primary/10 text-primary"
                                : "border-border bg-muted/30 text-muted-foreground hover:border-primary/40 hover:text-foreground"
                            )}
                          >
                            <Icon className="w-4 h-4" />
                            {e.label}
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  {/* Mode tabs */}
                  <div className="flex items-center gap-1 bg-muted rounded-lg p-1">
                    {([["chat", MessageSquare, "Chat"], ["voice", Mic, "Voice"], ["form", FormInput, "Form"]] as const).map(([m, Icon, label]) => (
                      <button
                        key={m}
                        onClick={() => setMode(m)}
                        className={cn(
                          "flex-1 flex items-center justify-center gap-1.5 px-2 py-1.5 rounded-md text-xs font-medium transition-all",
                          mode === m ? "bg-card shadow text-foreground" : "text-muted-foreground hover:text-foreground"
                        )}
                      >
                        <Icon className="w-3.5 h-3.5" />
                        {label}
                      </button>
                    ))}
                  </div>

                  {/* Error */}
                  {error && (
                    <div className="flex items-start gap-2 p-3 rounded-lg bg-destructive/10 border border-destructive/20 text-sm text-destructive">
                      <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                      <span>{error}</span>
                    </div>
                  )}

                  {/* Chat mode */}
                  {mode === "chat" && (
                    <div className="space-y-3">
                      <Textarea
                        placeholder={PLACEHOLDERS[entity]}
                        value={chatText}
                        onChange={(e) => setChatText(e.target.value)}
                        className="min-h-[120px] resize-none text-sm"
                      />
                      <Button
                        className="w-full" size="sm"
                        onClick={() => handleParse(chatText)}
                        disabled={!chatText.trim() || parsing}
                      >
                        {parsing ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Sparkles className="w-4 h-4 mr-2" />}
                        {parsing ? "Analysing…" : "Generate & Preview"}
                      </Button>
                    </div>
                  )}

                  {/* Voice mode */}
                  {mode === "voice" && (
                    <div className="space-y-3">
                      <div className="flex flex-col items-center gap-4 py-4">
                        <motion.button
                          whileTap={{ scale: 0.92 }}
                          onClick={isRecording ? stopVoice : startVoice}
                          className={cn(
                            "w-20 h-20 rounded-full flex items-center justify-center shadow-lg transition-all",
                            isRecording
                              ? "bg-destructive text-destructive-foreground shadow-destructive/40 animate-pulse"
                              : "bg-primary text-primary-foreground shadow-primary/40 hover:bg-primary/90"
                          )}
                          aria-label={isRecording ? "Stop recording" : "Start recording"}
                        >
                          {isRecording ? <MicOff className="w-8 h-8" /> : <Mic className="w-8 h-8" />}
                        </motion.button>
                        <p className="text-xs text-muted-foreground text-center">
                          {isRecording ? "Listening… tap to stop" : "Tap to start speaking"}
                        </p>
                      </div>
                      {transcript && (
                        <div className="p-3 rounded-lg bg-muted/50 border border-border text-sm leading-relaxed">
                          {transcript}
                        </div>
                      )}
                      {transcript && !isRecording && (
                        <Button className="w-full" size="sm" onClick={() => handleParse(transcript)} disabled={parsing}>
                          {parsing ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Sparkles className="w-4 h-4 mr-2" />}
                          {parsing ? "Analysing…" : "Generate & Preview"}
                        </Button>
                      )}
                    </div>
                  )}

                  {/* Form mode */}
                  {mode === "form" && (
                    <div className="space-y-3">
                      {entity === "product" && (
                        <ProductForm
                          data={{ name: formData.name, sku: formData.sku, price: formData.price, category: formData.category, stockQuantity: Number(formData.stockQuantity), description: formData.description, unit: formData.unit }}
                          onChange={(d) => setFormData({ ...d, stockQuantity: String(d.stockQuantity) })}
                        />
                      )}
                      {entity === "order" && (
                        <OrderForm
                          data={{ customerName: formData.customerName, customerEmail: formData.customerEmail, customerPhone: formData.customerPhone, totalAmount: formData.totalAmount, currency: formData.currency, notes: formData.notes, shippingAddress: formData.shippingAddress }}
                          onChange={(d) => setFormData(d as unknown as Record<string, string>)}
                        />
                      )}
                      {entity === "sale" && (
                        <SaleForm
                          data={{ description: formData.description, customerName: formData.customerName, amount: formData.amount, currency: formData.currency }}
                          onChange={(d) => setFormData(d as unknown as Record<string, string>)}
                        />
                      )}
                      <Button className="w-full" size="sm" onClick={handleFormSubmit}>
                        <EntityIcon className="w-4 h-4 mr-2" />
                        Preview & Confirm
                      </Button>
                    </div>
                  )}
                </>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Confirmation dialog */}
      <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <EntityIcon className="w-5 h-5 text-primary" />
              Confirm {activeEntity.label}
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-3 max-h-[60vh] overflow-y-auto py-2">
            <p className="text-sm text-muted-foreground">Review the details below. Edit any field before saving.</p>

            {parsed && entity === "product" && (
              <ProductForm data={parsed as ParsedProduct} onChange={(d) => setParsed(d)} />
            )}
            {parsed && entity === "order" && (
              <OrderForm data={parsed as ParsedOrder} onChange={(d) => setParsed(d)} />
            )}
            {parsed && entity === "sale" && (
              <SaleForm data={parsed as ParsedSale} onChange={(d) => setParsed(d)} />
            )}

            {error && (
              <div className="flex items-start gap-2 p-3 rounded-lg bg-destructive/10 border border-destructive/20 text-sm text-destructive">
                <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                <span>{error}</span>
              </div>
            )}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmOpen(false)} disabled={saving}>Cancel</Button>
            <Button onClick={handleConfirm} disabled={saving}>
              {saving ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Check className="w-4 h-4 mr-2" />}
              {saving ? "Saving…" : `Create ${activeEntity.label}`}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
