/**
 * ReportIntegrationError
 *
 * A self-contained "Report this error" button + dialog that vendors can use
 * anywhere an integration failure surfaces (Social Hub, Ads, Checkout, etc.)
 *
 * Usage:
 *   <ReportIntegrationError
 *     platform="meta"
 *     errorMessage="Failed to publish post: (#200) The user hasn't authorized the application"
 *     errorLogId={42}          // optional — auto-links the raw log entry
 *     trigger={<Button variant="outline" size="sm">Report this error</Button>}
 *   />
 *
 * When no `trigger` is provided, a default "Report this error" link is shown.
 */

import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { authFetch } from "@/lib/authFetch";
import { AlertTriangle } from "lucide-react";

const BASE_URL = import.meta.env.BASE_URL?.replace(/\/$/, "") ?? "";

const PLATFORM_LABELS: Record<string, string> = {
  meta:        "Meta (Facebook / Instagram)",
  linkedin:    "LinkedIn",
  x_twitter:   "X / Twitter",
  paystack:    "Paystack",
  stripe:      "Stripe",
  paypal:      "PayPal",
  flutterwave: "Flutterwave",
  nomba:       "Nomba",
  remita:      "Remita",
  twilio:      "Twilio (Voice / SMS)",
  elevenlabs:  "ElevenLabs (AI Voice)",
  openai:      "OpenAI (AI)",
  gemini:      "Gemini (AI)",
  other:       "Other / Unknown",
};

interface Props {
  /** Pre-filled platform slug. If omitted the vendor picks from a dropdown. */
  platform?: string;
  /** Pre-filled description starter (e.g. the raw error message). */
  errorMessage?: string;
  /** Optional auto-captured error log id to link this report to. */
  errorLogId?: number;
  /** Custom trigger element. Defaults to a small "Report this error" link button. */
  trigger?: React.ReactNode;
  /** Extra CSS classes for the default trigger. */
  className?: string;
}

export default function ReportIntegrationError({
  platform: platformProp,
  errorMessage,
  errorLogId,
  trigger,
  className,
}: Props) {
  const [open, setOpen] = useState(false);
  const [platform, setPlatform] = useState(platformProp ?? "other");
  const [description, setDescription] = useState(
    errorMessage ? `Error received: ${errorMessage}\n\nAdditional context: ` : ""
  );
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  async function handleSubmit() {
    if (description.trim().length < 5) {
      toast.error("Please describe the issue (at least 5 characters).");
      return;
    }
    setSubmitting(true);
    try {
      const res = await authFetch(`${BASE_URL}/api/integration-errors/report`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ platform, description: description.trim(), errorLogId }),
      });
      if (!res.ok) throw new Error(await res.text());
      setSubmitted(true);
      toast.success("Report submitted. Our team will follow up.");
    } catch {
      toast.error("Failed to submit report. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  function handleOpenChange(o: boolean) {
    setOpen(o);
    if (!o) {
      // Reset state when dialog closes
      setTimeout(() => {
        setSubmitted(false);
        setPlatform(platformProp ?? "other");
        setDescription(errorMessage ? `Error received: ${errorMessage}\n\nAdditional context: ` : "");
      }, 300);
    }
  }

  const defaultTrigger = (
    <button
      type="button"
      className={`text-xs text-muted-foreground underline underline-offset-2 hover:text-foreground transition-colors ${className ?? ""}`}
    >
      <AlertTriangle className="w-3 h-3 inline mr-1" />
      Report this error
    </button>
  );

  return (
    <>
      <span onClick={() => setOpen(true)} className="cursor-pointer">
        {trigger ?? defaultTrigger}
      </span>

      <Dialog open={open} onOpenChange={handleOpenChange}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <AlertTriangle className="w-5 h-5 text-orange-500" />
              Report an Integration Issue
            </DialogTitle>
            <DialogDescription>
              Describe what happened and our team will investigate and follow up with you.
            </DialogDescription>
          </DialogHeader>

          {submitted ? (
            <div className="py-6 text-center space-y-2">
              <p className="text-2xl">✅</p>
              <p className="font-medium">Report submitted!</p>
              <p className="text-sm text-muted-foreground">
                Our team will investigate and notify you when it&apos;s resolved.
              </p>
              <Button className="mt-4" onClick={() => handleOpenChange(false)}>
                Close
              </Button>
            </div>
          ) : (
            <>
              <div className="space-y-4">
                {/* Platform picker — shown only if not pre-set */}
                {!platformProp && (
                  <div className="space-y-1">
                    <Label htmlFor="rie-platform">Platform</Label>
                    <Select value={platform} onValueChange={setPlatform}>
                      <SelectTrigger id="rie-platform">
                        <SelectValue placeholder="Select platform" />
                      </SelectTrigger>
                      <SelectContent>
                        {Object.entries(PLATFORM_LABELS).map(([k, v]) => (
                          <SelectItem key={k} value={k}>{v}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                )}

                {platformProp && (
                  <div className="rounded-md bg-orange-50 border border-orange-200 px-3 py-2 text-sm">
                    Platform: <strong>{PLATFORM_LABELS[platformProp] ?? platformProp}</strong>
                  </div>
                )}

                <div className="space-y-1">
                  <Label htmlFor="rie-description">
                    What went wrong?{" "}
                    <span className="text-muted-foreground font-normal">(be as specific as possible)</span>
                  </Label>
                  <Textarea
                    id="rie-description"
                    rows={5}
                    placeholder="e.g. My Facebook post failed to publish. The error said 'invalid token'. This started happening after I reconnected my account yesterday."
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                  />
                  <p className="text-xs text-muted-foreground">
                    Include what you were trying to do, the exact error message if any, and when it started.
                  </p>
                </div>
              </div>

              <DialogFooter>
                <Button variant="outline" onClick={() => handleOpenChange(false)}>
                  Cancel
                </Button>
                <Button onClick={handleSubmit} disabled={submitting}>
                  {submitting ? "Submitting…" : "Submit Report"}
                </Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
