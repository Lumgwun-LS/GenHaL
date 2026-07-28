import { useQuery } from "@tanstack/react-query";
import { useParams } from "wouter";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Globe, BookOpen, Key, Zap, Terminal, ChevronRight, FileText, ArrowLeft,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { useLocation } from "wouter";

const BASE_URL = import.meta.env.BASE_URL?.replace(/\/$/, "") ?? "";

interface DocEndpoint {
  method: string;
  path: string;
  summary: string;
  description?: string;
  tags?: string[];
  codeExample?: string;
}

interface DocSection {
  title: string;
  content: string;
}

interface DocPortal {
  title: string;
  version: string;
  overview: string;
  authGuide: string;
  baseUrl?: string;
  endpoints: DocEndpoint[];
  sections: DocSection[];
  generatedAt: string;
}

interface DocsResponse {
  partner: {
    id: number;
    name: string;
    slug: string;
    description: string | null;
    logoUrl: string | null;
    websiteUrl: string | null;
    baseUrl: string | null;
    pricingTier: string;
  };
  doc: DocPortal;
  docGeneratedAt: string;
  docVersion: number;
  changelog: string | null;
}

const METHOD_COLORS: Record<string, string> = {
  GET: "bg-emerald-100 text-emerald-700",
  POST: "bg-blue-100 text-blue-700",
  PUT: "bg-amber-100 text-amber-700",
  PATCH: "bg-orange-100 text-orange-700",
  DELETE: "bg-red-100 text-red-700",
};

function MethodBadge({ method }: { method: string }) {
  const cls = METHOD_COLORS[method.toUpperCase()] ?? "bg-zinc-100 text-zinc-700";
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-mono font-semibold ${cls}`}>
      {method.toUpperCase()}
    </span>
  );
}

/** Very lightweight markdown → HTML renderer (bold, inline code, paragraphs, bullet lists). */
function SimpleMarkdown({ content }: { content: string }) {
  const lines = content.split("\n");
  const elements: React.ReactNode[] = [];
  let listItems: string[] = [];

  const flushList = (key: string) => {
    if (!listItems.length) return;
    elements.push(
      <ul key={key} className="list-disc pl-5 space-y-1 text-sm text-muted-foreground mb-3">
        {listItems.map((item, i) => <li key={i}>{renderInline(item)}</li>)}
      </ul>
    );
    listItems = [];
  };

  const renderInline = (text: string): React.ReactNode => {
    const parts = text.split(/(`[^`]+`|\*\*[^*]+\*\*)/g);
    return parts.map((part, i) => {
      if (part.startsWith("`") && part.endsWith("`"))
        return <code key={i} className="bg-muted px-1 py-0.5 rounded text-xs font-mono">{part.slice(1, -1)}</code>;
      if (part.startsWith("**") && part.endsWith("**"))
        return <strong key={i}>{part.slice(2, -2)}</strong>;
      return part;
    });
  };

  lines.forEach((line, idx) => {
    if (line.startsWith("- ") || line.startsWith("* ")) {
      listItems.push(line.slice(2));
    } else {
      flushList(`list-${idx}`);
      if (line.startsWith("### "))
        elements.push(<h3 key={idx} className="font-semibold text-sm mt-4 mb-1">{line.slice(4)}</h3>);
      else if (line.startsWith("## "))
        elements.push(<h2 key={idx} className="font-semibold text-base mt-5 mb-2">{line.slice(3)}</h2>);
      else if (line.startsWith("# "))
        elements.push(<h1 key={idx} className="font-bold text-lg mt-5 mb-2">{line.slice(2)}</h1>);
      else if (line.trim())
        elements.push(<p key={idx} className="text-sm text-muted-foreground mb-2 leading-relaxed">{renderInline(line)}</p>);
    }
  });
  flushList("list-end");

  return <div>{elements}</div>;
}

export default function DocsPage() {
  const { slug } = useParams<{ slug: string }>();
  const [, navigate] = useLocation();

  const { data, isLoading, isError } = useQuery<DocsResponse>({
    queryKey: ["docs", slug],
    queryFn: async () => {
      const res = await fetch(`${BASE_URL}/api/docs/${slug}`);
      if (res.status === 404) throw new Error("not-found");
      if (res.status === 202) throw new Error("generating");
      if (!res.ok) throw new Error("error");
      return res.json();
    },
    retry: false,
  });

  if (isLoading) {
    return (
      <div className="p-8 max-w-5xl mx-auto space-y-4 animate-pulse">
        <div className="h-8 bg-muted rounded w-1/3" />
        <div className="h-4 bg-muted rounded w-2/3" />
        <div className="h-64 bg-muted rounded" />
      </div>
    );
  }

  if (isError || !data) {
    return (
      <div className="p-8 max-w-5xl mx-auto text-center py-20">
        <FileText className="w-12 h-12 mx-auto mb-4 text-muted-foreground opacity-40" />
        <h2 className="text-xl font-semibold mb-2">Documentation not available</h2>
        <p className="text-sm text-muted-foreground mb-6">
          This platform's documentation hasn't been generated yet, or is still being prepared.
        </p>
        <Button variant="outline" onClick={() => navigate("/marketplace")}>
          <ArrowLeft className="w-4 h-4 mr-2" />
          Back to Marketplace
        </Button>
      </div>
    );
  }

  const { partner, doc, docVersion, changelog } = data;
  const tagGroups = new Map<string, DocEndpoint[]>();
  tagGroups.set("All", doc.endpoints);
  for (const ep of doc.endpoints) {
    for (const tag of ep.tags ?? ["Other"]) {
      if (!tagGroups.has(tag)) tagGroups.set(tag, []);
      tagGroups.get(tag)!.push(ep);
    }
  }

  return (
    <div className="min-h-screen bg-background">
      {/* Hero header */}
      <div className="border-b bg-muted/30 px-6 py-8">
        <div className="max-w-5xl mx-auto">
          <Button variant="ghost" size="sm" className="mb-4 -ml-2 gap-1.5" onClick={() => navigate("/marketplace")}>
            <ArrowLeft className="w-4 h-4" /> Back to Marketplace
          </Button>
          <div className="flex items-start gap-4">
            {partner.logoUrl ? (
              <img src={partner.logoUrl} alt={partner.name} className="w-14 h-14 rounded-lg border object-contain" />
            ) : (
              <div className="w-14 h-14 rounded-lg bg-muted border flex items-center justify-center">
                <Globe className="w-7 h-7 text-muted-foreground" />
              </div>
            )}
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-3 flex-wrap">
                <h1 className="text-2xl font-bold">{doc.title}</h1>
                <Badge variant="outline">v{doc.version}</Badge>
                {docVersion > 1 && <Badge variant="secondary" className="text-xs">Revision {docVersion}</Badge>}
              </div>
              {partner.description && (
                <p className="text-sm text-muted-foreground mt-1">{partner.description}</p>
              )}
              {doc.baseUrl && (
                <p className="text-xs font-mono text-muted-foreground mt-1.5 flex items-center gap-1">
                  <Globe className="w-3 h-3" />
                  {doc.baseUrl}
                </p>
              )}
            </div>
            {partner.websiteUrl && (
              <a href={partner.websiteUrl} target="_blank" rel="noopener noreferrer">
                <Button variant="outline" size="sm" className="gap-1.5">
                  <Globe className="w-3.5 h-3.5" />
                  Website
                </Button>
              </a>
            )}
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="max-w-5xl mx-auto px-6 py-8">
        <Tabs defaultValue="overview">
          <TabsList className="mb-6">
            <TabsTrigger value="overview" className="gap-1.5"><BookOpen className="w-3.5 h-3.5" />Overview</TabsTrigger>
            <TabsTrigger value="auth" className="gap-1.5"><Key className="w-3.5 h-3.5" />Authentication</TabsTrigger>
            <TabsTrigger value="endpoints" className="gap-1.5"><Zap className="w-3.5 h-3.5" />Endpoints</TabsTrigger>
            {doc.sections.length > 0 && (
              <TabsTrigger value="guides" className="gap-1.5"><FileText className="w-3.5 h-3.5" />Guides</TabsTrigger>
            )}
            {changelog && (
              <TabsTrigger value="changelog" className="gap-1.5"><Terminal className="w-3.5 h-3.5" />Changelog</TabsTrigger>
            )}
          </TabsList>

          {/* Overview */}
          <TabsContent value="overview">
            <Card>
              <CardHeader><CardTitle>Overview</CardTitle></CardHeader>
              <CardContent><SimpleMarkdown content={doc.overview} /></CardContent>
            </Card>
          </TabsContent>

          {/* Auth */}
          <TabsContent value="auth">
            <Card>
              <CardHeader><CardTitle>Authentication</CardTitle></CardHeader>
              <CardContent><SimpleMarkdown content={doc.authGuide} /></CardContent>
            </Card>
          </TabsContent>

          {/* Endpoints */}
          <TabsContent value="endpoints">
            <div className="space-y-3">
              <p className="text-sm text-muted-foreground">{doc.endpoints.length} endpoints</p>
              {doc.endpoints.map((ep, i) => (
                <Card key={i} className="overflow-hidden">
                  <CardContent className="p-4 space-y-3">
                    <div className="flex items-center gap-3 flex-wrap">
                      <MethodBadge method={ep.method} />
                      <code className="text-sm font-mono font-medium">{ep.path}</code>
                      {ep.tags?.map((t) => (
                        <Badge key={t} variant="outline" className="text-xs">{t}</Badge>
                      ))}
                    </div>
                    <div>
                      <p className="text-sm font-medium">{ep.summary}</p>
                      {ep.description && <p className="text-sm text-muted-foreground mt-0.5">{ep.description}</p>}
                    </div>
                    {ep.codeExample && (
                      <pre className="bg-muted rounded-md p-3 text-xs font-mono overflow-x-auto whitespace-pre-wrap">
                        {ep.codeExample}
                      </pre>
                    )}
                  </CardContent>
                </Card>
              ))}
            </div>
          </TabsContent>

          {/* Guides */}
          {doc.sections.length > 0 && (
            <TabsContent value="guides">
              <div className="space-y-4">
                {doc.sections.map((section, i) => (
                  <Card key={i}>
                    <CardHeader><CardTitle className="text-base">{section.title}</CardTitle></CardHeader>
                    <CardContent><SimpleMarkdown content={section.content} /></CardContent>
                  </Card>
                ))}
              </div>
            </TabsContent>
          )}

          {/* Changelog */}
          {changelog && (
            <TabsContent value="changelog">
              <Card>
                <CardHeader><CardTitle>What changed</CardTitle></CardHeader>
                <CardContent><SimpleMarkdown content={changelog} /></CardContent>
              </Card>
            </TabsContent>
          )}
        </Tabs>
      </div>
    </div>
  );
}
