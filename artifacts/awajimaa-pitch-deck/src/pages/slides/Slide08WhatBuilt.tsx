export default function Slide08WhatBuilt() {
  return (
    <div
      style={{
        width: "100vw", height: "100vh", overflow: "hidden",
        backgroundColor: "#0C0F1A",
        fontFamily: "'Inter', sans-serif",
        display: "flex", flexDirection: "column",
        justifyContent: "center", alignItems: "center",
        position: "relative", color: "#FFFFFF",
      }}
    >
      <div style={{ position:"absolute", top:"-20vh", right:"-10vw", width:"50vw", height:"50vw", borderRadius:"50%", backgroundColor:"#4F7FFF", opacity:0.05, filter:"blur(8vw)" }} />
      <div style={{ position:"absolute", bottom:"-30vh", left:"-15vw", width:"60vw", height:"60vw", borderRadius:"50%", backgroundColor:"#7C6BF0", opacity:0.05, filter:"blur(10vw)" }} />
      <div style={{ position:"absolute", top:0, left:0, width:"100%", height:"100%", backgroundImage:"linear-gradient(rgba(255,255,255,0.03) 1px,transparent 1px),linear-gradient(90deg,rgba(255,255,255,0.03) 1px,transparent 1px)", backgroundSize:"4vw 4vw", opacity:0.5, pointerEvents:"none" }} />

      <div style={{ position:"absolute", top:"5vh", left:"5vw", display:"flex", alignItems:"center", gap:"0.8vw", zIndex:10 }}>
        <div style={{ width:"2vw", height:"2vw", backgroundColor:"#4F7FFF", borderRadius:"0.4vw" }} />
        <div style={{ fontSize:"1.2vw", fontWeight:700, letterSpacing:"-0.02em" }}>awajimaa</div>
      </div>
      <div style={{ position:"absolute", top:"5vh", right:"5vw", fontSize:"1vw", color:"rgba(255,255,255,0.5)", zIndex:10 }}>2026</div>

      <div style={{ position:"relative", zIndex:10, display:"flex", flexDirection:"column", width:"84vw" }}>
        {/* Header */}
        <div style={{ marginBottom:"4vh" }}>
          <div style={{ display:"inline-block", padding:"0.5vh 1.2vw", backgroundColor:"rgba(39,201,63,0.12)", border:"1px solid rgba(39,201,63,0.25)", borderRadius:"2vw", color:"#27C93F", fontSize:"0.9vw", fontWeight:700, textTransform:"uppercase", letterSpacing:"0.1em", marginBottom:"2vh" }}>
            Shipped
          </div>
          <h2 style={{ fontSize:"3.8vw", fontWeight:800, margin:0, lineHeight:1.1, letterSpacing:"-0.03em" }}>
            What we've already built
          </h2>
        </div>

        {/* 2-column checklist */}
        <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:"1.8vh 3vw" }}>
          <div style={{ display:"flex", gap:"1.2vw", alignItems:"flex-start", backgroundColor:"#131726", border:"1px solid rgba(39,201,63,0.15)", borderRadius:"0.8vw", padding:"2vh 2vw" }}>
            <div style={{ width:"2.2vw", height:"2.2vw", backgroundColor:"rgba(39,201,63,0.15)", borderRadius:"50%", flexShrink:0, display:"flex", alignItems:"center", justifyContent:"center" }}>
              <svg width="1.1vw" height="1.1vw" viewBox="0 0 24 24" fill="none" stroke="#27C93F" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
            </div>
            <div>
              <div style={{ fontSize:"1.2vw", fontWeight:700, marginBottom:"0.3vh" }}>Full-stack web platform</div>
              <div style={{ fontSize:"1vw", color:"rgba(255,255,255,0.45)" }}>React + Vite + Express + Drizzle + PostgreSQL</div>
            </div>
          </div>

          <div style={{ display:"flex", gap:"1.2vw", alignItems:"flex-start", backgroundColor:"#131726", border:"1px solid rgba(39,201,63,0.15)", borderRadius:"0.8vw", padding:"2vh 2vw" }}>
            <div style={{ width:"2.2vw", height:"2.2vw", backgroundColor:"rgba(39,201,63,0.15)", borderRadius:"50%", flexShrink:0, display:"flex", alignItems:"center", justifyContent:"center" }}>
              <svg width="1.1vw" height="1.1vw" viewBox="0 0 24 24" fill="none" stroke="#27C93F" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
            </div>
            <div>
              <div style={{ fontSize:"1.2vw", fontWeight:700, marginBottom:"0.3vh" }}>Native mobile app</div>
              <div style={{ fontSize:"1vw", color:"rgba(255,255,255,0.45)" }}>Expo / React Native — iOS + Android</div>
            </div>
          </div>

          <div style={{ display:"flex", gap:"1.2vw", alignItems:"flex-start", backgroundColor:"#131726", border:"1px solid rgba(39,201,63,0.15)", borderRadius:"0.8vw", padding:"2vh 2vw" }}>
            <div style={{ width:"2.2vw", height:"2.2vw", backgroundColor:"rgba(39,201,63,0.15)", borderRadius:"50%", flexShrink:0, display:"flex", alignItems:"center", justifyContent:"center" }}>
              <svg width="1.1vw" height="1.1vw" viewBox="0 0 24 24" fill="none" stroke="#27C93F" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
            </div>
            <div>
              <div style={{ fontSize:"1.2vw", fontWeight:700, marginBottom:"0.3vh" }}>9 payment gateway integrations</div>
              <div style={{ fontSize:"1vw", color:"rgba(255,255,255,0.45)" }}>All fully live — Stripe, Paystack, Flutterwave and six more</div>
            </div>
          </div>

          <div style={{ display:"flex", gap:"1.2vw", alignItems:"flex-start", backgroundColor:"#131726", border:"1px solid rgba(39,201,63,0.15)", borderRadius:"0.8vw", padding:"2vh 2vw" }}>
            <div style={{ width:"2.2vw", height:"2.2vw", backgroundColor:"rgba(39,201,63,0.15)", borderRadius:"50%", flexShrink:0, display:"flex", alignItems:"center", justifyContent:"center" }}>
              <svg width="1.1vw" height="1.1vw" viewBox="0 0 24 24" fill="none" stroke="#27C93F" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
            </div>
            <div>
              <div style={{ fontSize:"1.2vw", fontWeight:700, marginBottom:"0.3vh" }}>4 social publishing platforms</div>
              <div style={{ fontSize:"1vw", color:"rgba(255,255,255,0.45)" }}>With OAuth token refresh — Facebook, Instagram, LinkedIn, X</div>
            </div>
          </div>

          <div style={{ display:"flex", gap:"1.2vw", alignItems:"flex-start", backgroundColor:"#131726", border:"1px solid rgba(39,201,63,0.15)", borderRadius:"0.8vw", padding:"2vh 2vw" }}>
            <div style={{ width:"2.2vw", height:"2.2vw", backgroundColor:"rgba(39,201,63,0.15)", borderRadius:"50%", flexShrink:0, display:"flex", alignItems:"center", justifyContent:"center" }}>
              <svg width="1.1vw" height="1.1vw" viewBox="0 0 24 24" fill="none" stroke="#27C93F" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
            </div>
            <div>
              <div style={{ fontSize:"1.2vw", fontWeight:700, marginBottom:"0.3vh" }}>AI Studio</div>
              <div style={{ fontSize:"1vw", color:"rgba(255,255,255,0.45)" }}>Captions, images, voice, video, data analysis — all live</div>
            </div>
          </div>

          <div style={{ display:"flex", gap:"1.2vw", alignItems:"flex-start", backgroundColor:"#131726", border:"1px solid rgba(39,201,63,0.15)", borderRadius:"0.8vw", padding:"2vh 2vw" }}>
            <div style={{ width:"2.2vw", height:"2.2vw", backgroundColor:"rgba(39,201,63,0.15)", borderRadius:"50%", flexShrink:0, display:"flex", alignItems:"center", justifyContent:"center" }}>
              <svg width="1.1vw" height="1.1vw" viewBox="0 0 24 24" fill="none" stroke="#27C93F" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
            </div>
            <div>
              <div style={{ fontSize:"1.2vw", fontWeight:700, marginBottom:"0.3vh" }}>App Store with developer portal</div>
              <div style={{ fontSize:"1vw", color:"rgba(255,255,255,0.45)" }}>AI review, APK builder, and auto-listing — shipped</div>
            </div>
          </div>

          <div style={{ display:"flex", gap:"1.2vw", alignItems:"flex-start", backgroundColor:"#131726", border:"1px solid rgba(39,201,63,0.15)", borderRadius:"0.8vw", padding:"2vh 2vw", gridColumn:"1 / -1" }}>
            <div style={{ width:"2.2vw", height:"2.2vw", backgroundColor:"rgba(39,201,63,0.15)", borderRadius:"50%", flexShrink:0, display:"flex", alignItems:"center", justifyContent:"center" }}>
              <svg width="1.1vw" height="1.1vw" viewBox="0 0 24 24" fill="none" stroke="#27C93F" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
            </div>
            <div>
              <div style={{ fontSize:"1.2vw", fontWeight:700, marginBottom:"0.3vh" }}>7 marketing videos produced</div>
              <div style={{ fontSize:"1vw", color:"rgba(255,255,255,0.45)" }}>Launch campaigns for Biz Suite, App Store, Schools, Emergency, AwaHub, AI Tools, and the Walkthrough</div>
            </div>
          </div>
        </div>
      </div>

      <div style={{ position:"absolute", bottom:"5vh", left:"5vw", fontSize:"0.9vw", color:"rgba(255,255,255,0.35)", letterSpacing:"0.06em" }}>AWAJIMAA TECHNOLOGIES</div>
      <div style={{ position:"absolute", bottom:"5vh", right:"5vw", fontSize:"0.9vw", color:"rgba(255,255,255,0.35)", letterSpacing:"0.06em" }}>08 / 10</div>
    </div>
  );
}
