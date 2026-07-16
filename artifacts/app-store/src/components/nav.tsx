import { useState } from "react";
import { Link, useLocation } from "wouter";
import { useUser, SignInButton, UserButton } from "@clerk/react";

export default function Nav() {
  const { isSignedIn } = useUser();
  const [, navigate] = useLocation();
  const [query, setQuery] = useState("");
  const [menuOpen, setMenuOpen] = useState(false);

  function handleSearch(e: React.FormEvent) {
    e.preventDefault();
    if (query.trim()) navigate(`/search?q=${encodeURIComponent(query.trim())}`);
  }

  return (
    <nav style={{ background: "#070a12", borderBottom: "1px solid rgba(255,255,255,0.06)", position: "sticky", top: 0, zIndex: 100 }}>
      <div style={{ maxWidth: 1280, margin: "0 auto", padding: "0 20px", height: 60, display: "flex", alignItems: "center", gap: 20 }}>

        {/* Logo */}
        <Link href="/" style={{ display: "flex", alignItems: "center", gap: 10, flexShrink: 0, textDecoration: "none" }}>
          <span style={{ fontSize: 26 }}>🌍</span>
          <div>
            <div style={{ fontWeight: 800, fontSize: 15, color: "#fff", lineHeight: 1 }}>Africa</div>
            <div style={{ fontWeight: 700, fontSize: 11, color: "#00c853", lineHeight: 1 }}>APP STORE</div>
          </div>
        </Link>

        {/* Search */}
        <form onSubmit={handleSearch} style={{ flex: 1, maxWidth: 500, display: "flex" }}>
          <div style={{ position: "relative", width: "100%" }}>
            <span style={{ position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)", fontSize: 15, opacity: 0.4 }}>🔍</span>
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search apps, categories, developers..."
              style={{
                width: "100%", background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.08)",
                borderRadius: 24, padding: "8px 16px 8px 36px", fontSize: 14, color: "#e8eaf0", outline: "none",
              }}
            />
          </div>
        </form>

        {/* Desktop links */}
        <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
          <Link href="/" style={{ padding: "6px 12px", borderRadius: 8, fontSize: 14, fontWeight: 500, color: "#c0c8d8", textDecoration: "none" }}>Browse</Link>
          <Link href="/developer" style={{ padding: "6px 12px", borderRadius: 8, fontSize: 14, fontWeight: 500, color: "#c0c8d8", textDecoration: "none" }}>Publish</Link>
          <Link href="/admin" style={{ padding: "6px 12px", borderRadius: 8, fontSize: 14, fontWeight: 500, color: "#c0c8d8", textDecoration: "none" }}>Admin</Link>

          <div style={{ width: 1, height: 20, background: "rgba(255,255,255,0.1)", margin: "0 8px" }} />

          {isSignedIn ? (
            <UserButton afterSignOutUrl="/app-store/" />
          ) : (
            <SignInButton mode="modal">
              <button className="btn-green" style={{ fontSize: 13, padding: "6px 16px" }}>Sign in</button>
            </SignInButton>
          )}
        </div>
      </div>
    </nav>
  );
}
