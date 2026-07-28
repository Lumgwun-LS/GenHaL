/**
 * Awajimaa AI Dashboard — customer-facing.
 * Gated behind profileCompleted = true.
 * Provides: content generation, image generation, business tools.
 */
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import CustomerLayout from "./layout";

const BASE = import.meta.env.BASE_URL?.replace(/\/$/, "") ?? "";

const TOOLS = [
  { id: "content", icon: "✍️", label: "Content Writer",     desc: "Captions, product descriptions, blog posts, email copy" },
  { id: "image",   icon: "🎨", label: "Image Generator",    desc: "Create product images, banners, and social media visuals" },
  { id: "swot",    icon: "📊", label: "Business Analyzer",  desc: "SWOT analysis, competitor insights, market positioning" },
  { id: "ideas",   icon: "💡", label: "Idea Generator",     desc: "Product ideas, pricing strategies, business name brainstorming" },
];

export default function CustomerAIDashboard() {
  const [activeTool, setActiveTool] = useState<string | null>(null);
  const [prompt, setPrompt] = useState("");
  const [result, setResult] = useState("");
  const [loading, setLoading] = useState(false);

  const { data: me } = useQuery({
    queryKey: ["customer-me"],
    queryFn: () => fetch(`${BASE}/api/customer/me`).then(r => r.json()),
  });

  // Gate: must be onboarded and profileCompleted
  if (me?.code === "NOT_ONBOARDED" || (me && !me.profileCompleted)) {
    return (
      <CustomerLayout>
        <div className="p-6 max-w-2xl mx-auto">
          <div className="rounded-2xl p-8 border-2 border-dashed text-center"
            style={{ borderColor: "#7F50FF40", background: "#7F50FF08" }}>
            <div className="text-5xl mb-4">🤖</div>
            <h2 className="text-xl font-bold text-gray-900 mb-2">Unlock Awajimaa AI Dashboard</h2>
            <p className="text-muted-foreground text-sm mb-6 max-w-sm mx-auto">
              Complete your profile with your phone number and location to access AI-powered content generation, image creation, and business tools.
            </p>
            <Link href="/customer/profile">
              <button className="px-8 py-3 rounded-xl font-bold text-white"
                style={{ background: "linear-gradient(135deg,#7F50FF,#FF7F50)" }}>
                Complete Profile →
              </button>
            </Link>
            <div className="mt-8 grid grid-cols-2 gap-3 opacity-50 pointer-events-none">
              {TOOLS.map(t => (
                <div key={t.id} className="bg-white rounded-xl p-4 border border-gray-100 text-left">
                  <p className="text-lg mb-1.5">{t.icon}</p>
                  <p className="text-sm font-bold text-gray-800">{t.label}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">{t.desc}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </CustomerLayout>
    );
  }

  async function runTool() {
    if (!prompt.trim() || !activeTool) return;
    setLoading(true);
    setResult("");
    try {
      const res = await fetch(`${BASE}/api/ai-quick-create/generate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tool: activeTool, prompt }),
      });
      const data = await res.json();
      setResult(data.result ?? data.text ?? JSON.stringify(data));
    } catch {
      setResult("Something went wrong. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <CustomerLayout>
      <div className="p-6 max-w-4xl mx-auto">
        {/* Header */}
        <div className="mb-8">
          <div className="flex items-center gap-3 mb-2">
            <div className="w-10 h-10 rounded-xl flex items-center justify-center text-xl"
              style={{ background: "linear-gradient(135deg,#7F50FF,#FF7F50)" }}>🤖</div>
            <div>
              <h1 className="text-2xl font-bold text-gray-900">Awajimaa AI</h1>
              <p className="text-xs text-muted-foreground">Powered by Awa Biz Suite</p>
            </div>
          </div>
          <p className="text-muted-foreground text-sm">AI tools to help you grow and create. Pick a tool to get started.</p>
        </div>

        {/* Tool grid */}
        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
          {TOOLS.map(t => (
            <button key={t.id} onClick={() => { setActiveTool(t.id); setResult(""); setPrompt(""); }}
              className={`rounded-2xl p-4 border text-left transition-all ${
                activeTool === t.id
                  ? "border-violet-400 shadow-lg shadow-violet-100"
                  : "border-gray-100 bg-white hover:border-violet-200 hover:shadow-sm"
              }`}
              style={activeTool === t.id ? { background: "linear-gradient(135deg,#7F50FF0d,#FF7F500d)" } : { background: "#fff" }}>
              <span className="text-2xl block mb-2">{t.icon}</span>
              <p className="text-sm font-bold text-gray-800 mb-1">{t.label}</p>
              <p className="text-xs text-muted-foreground leading-relaxed">{t.desc}</p>
            </button>
          ))}
        </div>

        {/* Active tool workspace */}
        {activeTool && (
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6">
            <h3 className="font-bold text-gray-900 mb-4">
              {TOOLS.find(t => t.id === activeTool)?.icon}{" "}
              {TOOLS.find(t => t.id === activeTool)?.label}
            </h3>
            <div className="space-y-4">
              <div>
                <label className="text-xs font-bold text-gray-500 uppercase tracking-wide block mb-1.5">
                  {activeTool === "content" ? "What do you want to write about?" :
                   activeTool === "image"   ? "Describe the image you want to create" :
                   activeTool === "swot"    ? "Describe your business or product" :
                   "What ideas do you need help with?"}
                </label>
                <textarea value={prompt} onChange={e => setPrompt(e.target.value)} rows={4}
                  placeholder={activeTool === "content" ? "e.g. A product description for handmade leather bags targeting young professionals"
                    : activeTool === "image" ? "e.g. A professional product photo of handmade leather bags on a wooden desk"
                    : activeTool === "swot"  ? "e.g. My online clothing store targeting Nigerian youth, selling Afrobeats-inspired fashion"
                    : "e.g. New product ideas for a food business in Lagos targeting working-class millennials"}
                  className="w-full px-4 py-3 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-violet-300 resize-none" />
              </div>
              <button onClick={runTool} disabled={loading || !prompt.trim()}
                className="px-6 py-2.5 rounded-xl font-bold text-white text-sm disabled:opacity-50"
                style={{ background: "linear-gradient(135deg,#7F50FF,#FF7F50)" }}>
                {loading ? "Generating…" : "Generate →"}
              </button>
              {result && (
                <div className="mt-4 p-4 rounded-xl bg-gray-50 border border-gray-100">
                  <p className="text-xs font-bold text-gray-500 mb-2 uppercase tracking-wide">Result</p>
                  <p className="text-sm text-gray-800 whitespace-pre-wrap leading-relaxed">{result}</p>
                  <button onClick={() => { navigator.clipboard?.writeText(result); }}
                    className="mt-3 text-xs text-violet-600 hover:underline font-medium">
                    Copy to clipboard
                  </button>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </CustomerLayout>
  );
}
