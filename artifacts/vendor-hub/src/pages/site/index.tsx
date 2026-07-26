/**
 * Public site page — rendered at /site/:slug
 * No authentication required. Full-page, no app chrome.
 */
import { useEffect, useState } from "react";
import { useParams } from "wouter";
import { SiteRenderer, type SiteData } from "@/components/site-renderer";

const BASE_URL = import.meta.env.BASE_URL?.replace(/\/$/, "") ?? "";

export default function PublicSitePage() {
  const { slug } = useParams<{ slug: string }>();
  const [data, setData] = useState<SiteData | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!slug) return;
    fetch(`${BASE_URL}/api/sites/${encodeURIComponent(slug)}`)
      .then(async (r) => {
        if (r.status === 404) { setNotFound(true); return; }
        const json = await r.json();
        setData(json);
        // Update document title
        document.title = json.pageTitle ?? json.vendor?.name ?? "Business";
        // Update meta description
        const metaEl = document.querySelector<HTMLMetaElement>('meta[name="description"]');
        if (metaEl) metaEl.content = json.metaDescription ?? "";
      })
      .catch(() => setNotFound(true))
      .finally(() => setLoading(false));
  }, [slug]);

  if (loading) {
    return (
      <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "Inter, sans-serif" }}>
        <div style={{ textAlign: "center", color: "#666" }}>
          <div style={{ fontSize: "2rem", marginBottom: "1rem" }}>⏳</div>
          <p>Loading…</p>
        </div>
      </div>
    );
  }

  if (notFound || !data) {
    return (
      <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "Inter, sans-serif", background: "#fafafa" }}>
        <div style={{ textAlign: "center" }}>
          <div style={{ fontSize: "4rem", marginBottom: "1rem" }}>🔍</div>
          <h1 style={{ fontSize: "1.8rem", fontWeight: 700, marginBottom: ".5rem" }}>Site Not Found</h1>
          <p style={{ color: "#666" }}>This business site isn't published yet or the link may be incorrect.</p>
        </div>
      </div>
    );
  }

  return <SiteRenderer data={data} />;
}
