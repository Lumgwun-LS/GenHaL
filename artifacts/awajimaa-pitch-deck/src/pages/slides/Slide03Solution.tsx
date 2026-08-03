export default function Slide03Solution() {
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
      <div style={{ position:"absolute", top:"10vh", left:"20vw", width:"40vw", height:"40vw", borderRadius:"50%", backgroundColor:"#7C6BF0", opacity:0.07, filter:"blur(12vw)" }} />
      <div style={{ position:"absolute", bottom:"10vh", right:"10vw", width:"45vw", height:"45vw", borderRadius:"50%", backgroundColor:"#4F7FFF", opacity:0.05, filter:"blur(10vw)" }} />
      <div style={{ position:"absolute", top:0, left:0, width:"100%", height:"100%", backgroundImage:"linear-gradient(rgba(255,255,255,0.03) 1px,transparent 1px),linear-gradient(90deg,rgba(255,255,255,0.03) 1px,transparent 1px)", backgroundSize:"4vw 4vw", opacity:0.5, pointerEvents:"none" }} />

      <div style={{ position:"absolute", top:"5vh", left:"5vw", display:"flex", alignItems:"center", gap:"0.8vw", zIndex:10 }}>
        <div style={{ width:"2vw", height:"2vw", backgroundColor:"#4F7FFF", borderRadius:"0.4vw" }} />
        <div style={{ fontSize:"1.2vw", fontWeight:700, letterSpacing:"-0.02em" }}>awajimaa</div>
      </div>
      <div style={{ position:"absolute", top:"5vh", right:"5vw", fontSize:"1vw", color:"rgba(255,255,255,0.5)", zIndex:10 }}>2026</div>

      <div style={{ position:"relative", zIndex:10, display:"flex", flexDirection:"column", alignItems:"center", width:"84vw" }}>
        {/* Header */}
        <div style={{ textAlign:"center", marginBottom:"6vh" }}>
          <div style={{ display:"inline-block", padding:"0.5vh 1.2vw", backgroundColor:"rgba(124,107,240,0.15)", border:"1px solid rgba(124,107,240,0.3)", borderRadius:"2vw", color:"#7C6BF0", fontSize:"0.9vw", fontWeight:700, textTransform:"uppercase", letterSpacing:"0.1em", marginBottom:"2.5vh" }}>
            The Solution
          </div>
          <h2 style={{ fontSize:"4vw", fontWeight:800, margin:"0 0 1.5vh 0", lineHeight:1.1, letterSpacing:"-0.03em" }}>
            One platform. Everything a business needs.
          </h2>
          <p style={{ fontSize:"1.4vw", fontWeight:300, color:"rgba(255,255,255,0.6)", maxWidth:"52vw", margin:"0 auto", lineHeight:1.5 }}>
            Awajimaa is a connected suite of three products sharing a single backend — built for African businesses from the ground up.
          </p>
        </div>

        {/* Three product cards */}
        <div style={{ display:"flex", gap:"2vw", width:"100%", justifyContent:"center" }}>
          {/* Awa Biz Suite */}
          <div style={{ flex:1, backgroundColor:"#131726", border:"1px solid rgba(79,127,255,0.25)", borderRadius:"1vw", padding:"3.5vh 2.5vw", display:"flex", flexDirection:"column", gap:"1.5vh" }}>
            <div style={{ width:"4vw", height:"4vw", backgroundColor:"rgba(79,127,255,0.15)", borderRadius:"0.8vw", display:"flex", alignItems:"center", justifyContent:"center" }}>
              <div style={{ width:"1.8vw", height:"1.8vw", backgroundColor:"#4F7FFF", borderRadius:"0.3vw" }} />
            </div>
            <div style={{ fontSize:"1.6vw", fontWeight:700 }}>Awa Biz Suite</div>
            <div style={{ fontSize:"1.1vw", color:"rgba(255,255,255,0.55)", lineHeight:1.5 }}>
              Full business management — payments, CRM, social, inventory, finance, marketing, and AI. Web + mobile.
            </div>
            <div style={{ marginTop:"auto", paddingTop:"1.5vh", borderTop:"1px solid rgba(255,255,255,0.06)", fontSize:"1vw", color:"#4F7FFF", fontWeight:600 }}>
              Primary product
            </div>
          </div>

          {/* App Store */}
          <div style={{ flex:1, backgroundColor:"#131726", border:"1px solid rgba(124,107,240,0.25)", borderRadius:"1vw", padding:"3.5vh 2.5vw", display:"flex", flexDirection:"column", gap:"1.5vh" }}>
            <div style={{ width:"4vw", height:"4vw", backgroundColor:"rgba(124,107,240,0.15)", borderRadius:"0.8vw", display:"flex", alignItems:"center", justifyContent:"center" }}>
              <div style={{ width:"1.8vw", height:"1.8vw", backgroundColor:"#7C6BF0", borderRadius:"50%" }} />
            </div>
            <div style={{ fontSize:"1.6vw", fontWeight:700 }}>Awajimaa App Store</div>
            <div style={{ fontSize:"1.1vw", color:"rgba(255,255,255,0.55)", lineHeight:1.5 }}>
              Africa's developer app marketplace — publish, discover, and download Android apps built for local markets.
            </div>
            <div style={{ marginTop:"auto", paddingTop:"1.5vh", borderTop:"1px solid rgba(255,255,255,0.06)", fontSize:"1vw", color:"#7C6BF0", fontWeight:600 }}>
              Developer platform
            </div>
          </div>

          {/* Mobile App Builder */}
          <div style={{ flex:1, backgroundColor:"#131726", border:"1px solid rgba(255,255,255,0.1)", borderRadius:"1vw", padding:"3.5vh 2.5vw", display:"flex", flexDirection:"column", gap:"1.5vh" }}>
            <div style={{ width:"4vw", height:"4vw", backgroundColor:"rgba(255,255,255,0.06)", borderRadius:"0.8vw", display:"flex", alignItems:"center", justifyContent:"center" }}>
              <div style={{ width:"0", height:"0", borderLeft:"0.9vw solid transparent", borderRight:"0.9vw solid transparent", borderBottom:"1.6vw solid rgba(255,255,255,0.6)" }} />
            </div>
            <div style={{ fontSize:"1.6vw", fontWeight:700 }}>Mobile App Builder</div>
            <div style={{ fontSize:"1.1vw", color:"rgba(255,255,255,0.55)", lineHeight:1.5 }}>
              Vendors generate their own branded Android APK in 20 minutes — no code required. Auto-listed on the App Store.
            </div>
            <div style={{ marginTop:"auto", paddingTop:"1.5vh", borderTop:"1px solid rgba(255,255,255,0.06)", fontSize:"1vw", color:"rgba(255,255,255,0.5)", fontWeight:600 }}>
              No-code tool
            </div>
          </div>
        </div>
      </div>

      <div style={{ position:"absolute", bottom:"5vh", left:"5vw", fontSize:"0.9vw", color:"rgba(255,255,255,0.35)", letterSpacing:"0.06em" }}>AWAJIMAA TECHNOLOGIES</div>
      <div style={{ position:"absolute", bottom:"5vh", right:"5vw", fontSize:"0.9vw", color:"rgba(255,255,255,0.35)", letterSpacing:"0.06em" }}>03 / 10</div>
    </div>
  );
}
