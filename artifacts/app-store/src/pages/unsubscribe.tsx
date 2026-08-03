import { useEffect, useState } from "react";
import { useLocation, Link } from "wouter";
import { apiFetch } from "../lib/api";

export default function Unsubscribe() {
  const [location] = useLocation();
  const params = new URLSearchParams(window.location.search);
  const token = params.get("t") ?? "";

  const [status, setStatus] = useState<"loading" | "success" | "error" | "invalid">("loading");
  const [message, setMessage] = useState("");

  useEffect(() => {
    if (!token) {
      setStatus("invalid");
      return;
    }
    apiFetch<{ ok: boolean; app?: string }>("/unsubscribe", {
      method: "DELETE",
      body: JSON.stringify({ token }),
    })
      .then((data) => {
        setMessage(data.app ?? "");
        setStatus("success");
      })
      .catch((err: any) => {
        if (err?.status === 400 || err?.status === 404) {
          setStatus("invalid");
        } else {
          setStatus("error");
        }
      });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div style={{ minHeight: "70vh", display: "flex", alignItems: "center", justifyContent: "center", padding: "40px 20px" }}>
      <div style={{
        maxWidth: 480, width: "100%", background: "#0d1117",
        border: "1px solid rgba(255,255,255,0.08)", borderRadius: 16, padding: "40px 32px",
        textAlign: "center",
      }}>
        {status === "loading" && (
          <>
            <div style={{ fontSize: 40, marginBottom: 16 }}>⏳</div>
            <p style={{ color: "#8892a4", fontSize: 15 }}>Processing your request…</p>
          </>
        )}

        {status === "success" && (
          <>
            <div style={{ fontSize: 44, marginBottom: 16 }}>✅</div>
            <h1 style={{ fontSize: 22, fontWeight: 700, color: "#e8eaf0", margin: "0 0 12px" }}>
              You've been unsubscribed
            </h1>
            <p style={{ color: "#8892a4", fontSize: 14, margin: "0 0 28px", lineHeight: 1.6 }}>
              {message
                ? <>You won't receive update notifications for <strong style={{ color: "#e8eaf0" }}>{message}</strong> anymore.</>
                : "You won't receive app update notifications from us anymore."}
            </p>
            <Link href="/">
              <a style={{
                display: "inline-block", background: "#00c853", color: "#000",
                fontWeight: 700, padding: "10px 28px", borderRadius: 8,
                textDecoration: "none", fontSize: 14,
              }}>
                Browse the App Store
              </a>
            </Link>
          </>
        )}

        {status === "invalid" && (
          <>
            <div style={{ fontSize: 44, marginBottom: 16 }}>🔗</div>
            <h1 style={{ fontSize: 22, fontWeight: 700, color: "#e8eaf0", margin: "0 0 12px" }}>
              Link expired or invalid
            </h1>
            <p style={{ color: "#8892a4", fontSize: 14, margin: "0 0 28px", lineHeight: 1.6 }}>
              This unsubscribe link is no longer valid. You may have already been removed, or the link may have expired.
            </p>
            <Link href="/">
              <a style={{
                display: "inline-block", background: "rgba(255,255,255,0.07)", color: "#e8eaf0",
                fontWeight: 600, padding: "10px 28px", borderRadius: 8,
                textDecoration: "none", fontSize: 14, border: "1px solid rgba(255,255,255,0.12)",
              }}>
                Go to App Store
              </a>
            </Link>
          </>
        )}

        {status === "error" && (
          <>
            <div style={{ fontSize: 44, marginBottom: 16 }}>⚠️</div>
            <h1 style={{ fontSize: 22, fontWeight: 700, color: "#e8eaf0", margin: "0 0 12px" }}>
              Something went wrong
            </h1>
            <p style={{ color: "#8892a4", fontSize: 14, margin: "0 0 28px", lineHeight: 1.6 }}>
              We couldn't process your unsubscribe request. Please try again or reply to the email.
            </p>
            <button
              onClick={() => { setStatus("loading"); setMessage(""); }}
              style={{
                background: "#00c853", color: "#000", fontWeight: 700,
                padding: "10px 28px", borderRadius: 8, border: "none",
                fontSize: 14, cursor: "pointer",
              }}
            >
              Retry
            </button>
          </>
        )}
      </div>
    </div>
  );
}
