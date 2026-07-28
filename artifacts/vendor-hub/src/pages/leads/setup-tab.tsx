import { useState } from "react";
import { toast } from "sonner";
import { Copy, Code, Globe, CheckCircle2 } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

const BASE_URL = import.meta.env.BASE_URL?.replace(/\/$/, "") ?? "";

interface Props {
  vendorId: number;
}

function buildScript(vendorId: number): string {
  const origin = window.location.origin;
  const apiBase = `${origin}${BASE_URL}`;
  return `<!-- Awa CRM Tracking Pixel -->
<script>
(function() {
  var vid = ${vendorId};
  var base = '${apiBase}';
  // Persist an anonymous visitor token across pages
  var t = localStorage.getItem('awa_vid');
  if (!t) { t = Math.random().toString(36).slice(2) + Date.now().toString(36); localStorage.setItem('awa_vid', t); }
  // Parse UTM params
  var p = new URLSearchParams(window.location.search);
  fetch(base + '/api/public/crm/visit', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      vendorId: vid,
      visitorToken: t,
      page: window.location.pathname,
      referrer: document.referrer || null,
      utmSource: p.get('utm_source') || null,
      utmMedium: p.get('utm_medium') || null,
      utmCampaign: p.get('utm_campaign') || null,
      utmContent: p.get('utm_content') || null
    })
  }).catch(function() {});
})();
</script>
<!-- End Awa CRM Tracking Pixel -->`;
}

export function SetupTab({ vendorId }: Props) {
  const [copied, setCopied] = useState(false);

  const script = buildScript(vendorId);

  function copyScript() {
    navigator.clipboard.writeText(script).then(() => {
      setCopied(true);
      toast.success("Tracking script copied!");
      setTimeout(() => setCopied(false), 3000);
    });
  }

  return (
    <div className="max-w-2xl space-y-6">
      <div>
        <h3 className="font-semibold text-base mb-1">Website Tracking Script</h3>
        <p className="text-sm text-muted-foreground">
          Paste this snippet just before the closing <code className="bg-muted px-1 rounded text-xs">&lt;/body&gt;</code> tag on every page of your website. Every visitor will automatically appear in your CRM with their channel, UTM source, and page history.
        </p>
      </div>

      <Card>
        <CardHeader className="pb-2 flex-row items-center justify-between">
          <CardTitle className="text-sm font-medium flex items-center gap-2">
            <Globe className="w-4 h-4" />
            Website Pixel
          </CardTitle>
          <Button size="sm" variant="outline" onClick={copyScript} className="h-7 text-xs gap-1.5">
            {copied ? <CheckCircle2 className="w-3 h-3 text-emerald-500" /> : <Copy className="w-3 h-3" />}
            {copied ? "Copied!" : "Copy Script"}
          </Button>
        </CardHeader>
        <CardContent>
          <pre className="bg-muted rounded-lg p-4 text-xs overflow-x-auto whitespace-pre leading-relaxed">
            <code>{script}</code>
          </pre>
        </CardContent>
      </Card>

      <div className="space-y-3">
        <h3 className="font-semibold text-sm">How Visitors Enter Your CRM</h3>
        <div className="grid gap-3 sm:grid-cols-2">
          {[
            {
              icon: <Globe className="w-4 h-4 text-blue-500" />,
              title: "Website",
              desc: "Install the tracking script above. Each page visit is recorded automatically.",
            },
            {
              icon: <Code className="w-4 h-4 text-violet-500" />,
              title: "Lead Forms",
              desc: "Create a form in the Forms tab and embed it on your site or share the link.",
            },
            {
              icon: <Badge className="w-4 h-4" variant="outline"><span className="text-[9px]">UTM</span></Badge>,
              title: "UTM Links",
              desc: "Create trackable links in the UTM Links tab and use them in your ads and bio.",
            },
            {
              icon: <Globe className="w-4 h-4 text-amber-500" />,
              title: "Orders",
              desc: "Customers who place an order are automatically added to your CRM as Converted.",
            },
          ].map((item) => (
            <div key={item.title} className="rounded-lg border p-4 flex gap-3">
              <div className="shrink-0 mt-0.5">{item.icon}</div>
              <div>
                <div className="font-medium text-sm mb-0.5">{item.title}</div>
                <p className="text-xs text-muted-foreground">{item.desc}</p>
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="rounded-lg bg-muted/50 border p-4 text-sm">
        <div className="font-medium mb-1">Your Vendor ID</div>
        <code className="bg-background border rounded px-2 py-1 text-sm">{vendorId}</code>
        <p className="text-xs text-muted-foreground mt-1.5">This is embedded in the tracking script above — you don't need to do anything with it separately.</p>
      </div>
    </div>
  );
}
