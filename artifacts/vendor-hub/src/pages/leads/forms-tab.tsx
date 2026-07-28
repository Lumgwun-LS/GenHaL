import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  useListLeadForms,
  useCreateLeadForm,
  useUpdateLeadForm,
  useDeleteLeadForm,
  getListLeadFormsQueryKey,
} from "@workspace/api-client-react";
import type { LeadForm } from "@workspace/api-zod";

type LeadFormField = {
  name: string;
  label: string;
  type: "text" | "email" | "phone" | "textarea" | "select";
  required: boolean;
  options?: string[];
  placeholder?: string;
};
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Switch } from "@/components/ui/switch";
import { Trash2, Plus, Copy, Eye, ExternalLink, FileText } from "lucide-react";
import { format } from "date-fns";

const BASE_URL = import.meta.env.BASE_URL?.replace(/\/$/, "") ?? "";

const EMPTY_FIELD: LeadFormField = { name: "", label: "", type: "text", required: false };

function copyEmbed(form: LeadForm) {
  const formId = form.id;
  const scriptUrl = `${window.location.origin}${BASE_URL}/api/public/crm/forms/${formId}`;
  const html = `<form id="awa-form-${formId}" onsubmit="awaSubmitForm(event, ${formId})">
  ${(form.fields as LeadFormField[]).map((f) => `
  <label>${f.label}${f.required ? " *" : ""}</label>
  <input type="${f.type === "textarea" ? "text" : f.type}" name="${f.name}" ${f.required ? "required" : ""} placeholder="${f.placeholder ?? f.label}" />`).join("")}
  <button type="submit">${form.buttonText}</button>
</form>
<script>
async function awaSubmitForm(e, formId) {
  e.preventDefault();
  const data = Object.fromEntries(new FormData(e.target));
  data._visitor_token = localStorage.getItem('awa_vid') || '';
  const r = await fetch('${window.location.origin}${BASE_URL}/api/public/crm/forms/' + formId + '/submit', {
    method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify(data)
  });
  const j = await r.json();
  if (j.redirectUrl) window.location.href = j.redirectUrl;
  else alert(j.thankYouMessage || 'Thank you!');
}
</script>`;
  navigator.clipboard.writeText(html).then(() => toast.success("Embed code copied!"));
}

interface Props {
  vendorId: number;
}

export function FormsTab({ vendorId }: Props) {
  const qc = useQueryClient();
  const { data: forms = [], isLoading } = useListLeadForms();
  const createForm = useCreateLeadForm();
  const updateForm = useUpdateLeadForm();
  const deleteForm = useDeleteLeadForm();

  const [open, setOpen] = useState(false);
  const [editingForm, setEditingForm] = useState<LeadForm | null>(null);

  // Form state
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [fields, setFields] = useState<LeadFormField[]>([
    { name: "name", label: "Full Name", type: "text", required: true },
    { name: "email", label: "Email", type: "email", required: true },
    { name: "phone", label: "Phone", type: "phone", required: false },
  ]);
  const [buttonText, setButtonText] = useState("Submit");
  const [thankYouMessage, setThankYouMessage] = useState("Thank you! We'll be in touch.");
  const [redirectUrl, setRedirectUrl] = useState("");

  function openCreate() {
    setEditingForm(null);
    setName(""); setDescription("");
    setFields([
      { name: "name", label: "Full Name", type: "text", required: true },
      { name: "email", label: "Email", type: "email", required: true },
      { name: "phone", label: "Phone", type: "phone", required: false },
    ]);
    setButtonText("Submit");
    setThankYouMessage("Thank you! We'll be in touch.");
    setRedirectUrl("");
    setOpen(true);
  }

  function openEdit(form: LeadForm) {
    setEditingForm(form);
    setName(form.name);
    setDescription(form.description ?? "");
    setFields((form.fields as LeadFormField[]) ?? []);
    setButtonText(form.buttonText);
    setThankYouMessage(form.thankYouMessage ?? "");
    setRedirectUrl(form.redirectUrl ?? "");
    setOpen(true);
  }

  function addField() {
    setFields((f) => [...f, { ...EMPTY_FIELD }]);
  }

  function removeField(i: number) {
    setFields((f) => f.filter((_, idx) => idx !== i));
  }

  function updateField(i: number, patch: Partial<LeadFormField>) {
    setFields((f) => f.map((field, idx) => idx === i ? { ...field, ...patch } : field));
  }

  async function handleSave() {
    if (!name.trim()) { toast.error("Form name is required"); return; }
    const payload = { name, description, fields, buttonText, thankYouMessage, redirectUrl: redirectUrl || undefined };
    try {
      if (editingForm) {
        await updateForm.mutateAsync({ id: editingForm.id, data: payload });
        toast.success("Form updated");
      } else {
        await createForm.mutateAsync({ data: payload });
        toast.success("Form created");
      }
      qc.invalidateQueries({ queryKey: getListLeadFormsQueryKey() });
      setOpen(false);
    } catch { toast.error("Failed to save form"); }
  }

  async function handleToggle(form: LeadForm) {
    const newStatus = form.status === "active" ? "paused" : "active";
    try {
      await updateForm.mutateAsync({ id: form.id, data: { status: newStatus } });
      qc.invalidateQueries({ queryKey: getListLeadFormsQueryKey() });
    } catch { toast.error("Failed to update form"); }
  }

  async function handleDelete(form: LeadForm) {
    if (!confirm(`Delete "${form.name}"?`)) return;
    try {
      await deleteForm.mutateAsync({ id: form.id });
      qc.invalidateQueries({ queryKey: getListLeadFormsQueryKey() });
      toast.success("Form deleted");
    } catch { toast.error("Failed to delete form"); }
  }

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm text-muted-foreground">Create embeddable forms to capture visitors on your website or social pages.</p>
        </div>
        <Button onClick={openCreate}><Plus className="w-4 h-4 mr-2" />New Form</Button>
      </div>

      {isLoading ? (
        <div className="text-center text-muted-foreground py-8">Loading forms…</div>
      ) : forms.length === 0 ? (
        <div className="rounded-xl border border-dashed p-12 text-center">
          <FileText className="w-10 h-10 text-muted-foreground mx-auto mb-3" />
          <p className="font-medium mb-1">No lead forms yet</p>
          <p className="text-sm text-muted-foreground mb-4">Create a form and embed it anywhere to capture leads.</p>
          <Button onClick={openCreate}><Plus className="w-4 h-4 mr-2" />Create First Form</Button>
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {forms.map((form) => (
            <Card key={form.id}>
              <CardHeader className="pb-3">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <CardTitle className="text-base truncate">{form.name}</CardTitle>
                    {form.description && <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">{form.description}</p>}
                  </div>
                  <Switch
                    checked={form.status === "active"}
                    onCheckedChange={() => handleToggle(form)}
                    className="shrink-0"
                  />
                </div>
              </CardHeader>
              <CardContent className="pt-0">
                <div className="flex items-center gap-2 text-sm text-muted-foreground mb-3">
                  <span>{(form.fields as LeadFormField[]).length} fields</span>
                  <span>·</span>
                  <span>{form.submissionsCount} submissions</span>
                </div>
                <div className="flex gap-1.5 flex-wrap">
                  <Button size="sm" variant="outline" className="h-7 text-xs gap-1" onClick={() => copyEmbed(form)}>
                    <Copy className="w-3 h-3" />Embed
                  </Button>
                  <Button size="sm" variant="outline" className="h-7 text-xs gap-1" onClick={() => openEdit(form)}>
                    <Eye className="w-3 h-3" />Edit
                  </Button>
                  <Button size="sm" variant="outline" className="h-7 text-xs gap-1 text-destructive hover:text-destructive" onClick={() => handleDelete(form)}>
                    <Trash2 className="w-3 h-3" />
                  </Button>
                </div>
                <p className="text-[10px] text-muted-foreground mt-2">{format(new Date(form.createdAt), "MMM d, yyyy")}</p>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Create / Edit dialog */}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editingForm ? "Edit Form" : "New Lead Form"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label>Form Name *</Label>
              <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Contact Us" />
            </div>
            <div className="space-y-1.5">
              <Label>Description</Label>
              <Input value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Optional description" />
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label>Fields</Label>
                <Button variant="ghost" size="sm" onClick={addField} className="h-6 text-xs">
                  <Plus className="w-3 h-3 mr-1" />Add Field
                </Button>
              </div>
              {fields.map((field, i) => (
                <div key={i} className="rounded-lg border p-3 space-y-2">
                  <div className="grid grid-cols-2 gap-2">
                    <div className="space-y-1">
                      <Label className="text-xs">Label</Label>
                      <Input className="h-7 text-xs" value={field.label} onChange={(e) => updateField(i, { label: e.target.value, name: e.target.value.toLowerCase().replace(/\s+/g, "_") })} placeholder="Full Name" />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs">Type</Label>
                      <Select value={field.type} onValueChange={(v: typeof field.type) => updateField(i, { type: v })}>
                        <SelectTrigger className="h-7 text-xs"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="text">Text</SelectItem>
                          <SelectItem value="email">Email</SelectItem>
                          <SelectItem value="phone">Phone</SelectItem>
                          <SelectItem value="textarea">Long Text</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2 text-xs">
                      <Switch
                        checked={field.required}
                        onCheckedChange={(v) => updateField(i, { required: v })}
                        className="scale-75"
                      />
                      <span>Required</span>
                    </div>
                    {fields.length > 1 && (
                      <Button variant="ghost" size="sm" className="h-6 w-6 p-0 text-destructive hover:text-destructive" onClick={() => removeField(i)}>
                        <Trash2 className="w-3 h-3" />
                      </Button>
                    )}
                  </div>
                </div>
              ))}
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Button Text</Label>
                <Input value={buttonText} onChange={(e) => setButtonText(e.target.value)} placeholder="Submit" />
              </div>
              <div className="space-y-1.5">
                <Label>Redirect URL (optional)</Label>
                <Input value={redirectUrl} onChange={(e) => setRedirectUrl(e.target.value)} placeholder="https://..." />
              </div>
            </div>

            <div className="space-y-1.5">
              <Label>Thank You Message</Label>
              <Textarea value={thankYouMessage} onChange={(e) => setThankYouMessage(e.target.value)} rows={2} placeholder="Thank you! We'll be in touch." />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
            <Button onClick={handleSave} disabled={createForm.isPending || updateForm.isPending}>
              {createForm.isPending || updateForm.isPending ? "Saving…" : editingForm ? "Save Changes" : "Create Form"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
