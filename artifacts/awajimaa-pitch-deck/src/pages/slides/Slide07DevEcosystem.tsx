export default function Slide07DevEcosystem() {
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
      <div style={{ position:"absolute", top:"5vh", left:"20vw", width:"40vw", height:"40vw", borderRadius:"50%", backgroundColor:"#4F7FFF", opacity:0.06, filter:"blur(12vw)" }} />
      <div style={{ position:"absolute", bottom:"5vh", right:"10vw", width:"40vw", height:"40vw", borderRadius:"50%", backgroundColor:"#7C6BF0", opacity:0.06, filter:"blur(10vw)" }} />
      <div style={{ position:"absolute", top:0, left:0, width:"100%", height:"100%", backgroundImage:"linear-gradient(rgba(255,255,255,0.03) 1px,transparent 1px),linear-gradient(90deg,rgba(255,255,255,0.03) 1px,transparent 1px)", backgroundSize:"4vw 4vw", opacity:0.5, pointerEvents:"none" }} />

      <div style={{ position:"absolute", top:"5vh", left:"5vw", display:"flex", alignItems:"center", gap:"0.8vw", zIndex:10 }}>
        <div style={{ width:"2vw", height:"2vw", backgroundColor:"#4F7FFF", borderRadius:"0.4vw" }} />
        <div style={{ fontSize:"1.2vw", fontWeight:700, letterSpacing:"-0.02em" }}>awajimaa</div>
      </div>
      <div style={{ position:"absolute", top:"5vh", right:"5vw", fontSize:"1vw", color:"rgba(255,255,255,0.5)", zIndex:10 }}>2026</div>

      <div style={{ position:"relative", zIndex:10, display:"flex", flexDirection:"column", alignItems:"center", width:"84vw" }}>
        {/* Header */}
        <div style={{ textAlign:"center", marginBottom:"5vh" }}>
          <div style={{ display:"inline-block", padding:"0.5vh 1.2vw", backgroundColor:"rgba(79,127,255,0.15)", border:"1px solid rgba(79,127,255,0.3)", borderRadius:"2vw", color:"#4F7FFF", fontSize:"0.9vw", fontWeight:700, textTransform:"uppercase", letterSpacing:"0.1em", marginBottom:"2vh" }}>
            Developer Platform
          </div>
          <h2 style={{ fontSize:"3.8vw", fontWeight:800, margin:0, lineHeight:1.1, letterSpacing:"-0.03em" }}>
            The developer &amp; partner ecosystem
          </h2>
        </div>

        {/* 3-column grid */}
        <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr 1fr", gap:"1.8vw", width:"100%" }}>
          <div style={{ backgroundColor:"#131726", border:"1px solid rgba(79,127,255,0.2)", borderRadius:"1vw", padding:"3vh 2.5vw", display:"flex", flexDirection:"column", gap:"1.5vh" }}>
            <div style={{ width:"3.5vw", height:"3.5vw", backgroundColor:"rgba(79,127,255,0.15)", borderRadius:"0.7vw", display:"flex", alignItems:"center", justifyContent:"center" }}>
              <div style={{ width:"1.5vw", height:"1vw", border:"0.15vw solid #4F7FFF", borderRadius:"0.8vw" }}>
                <div style={{ width:"0.8vw", height:"0.15vw", backgroundColor:"#4F7FFF", margin:"0.35vw auto 0" }} />
              </div>
            </div>
            <div style={{ fontSize:"1.4vw", fontWeight:700 }}>OAuth 2.0 Server</div>
            <div style={{ fontSize:"1.05vw", color:"rgba(255,255,255,0.5)", lineHeight:1.5 }}>Third parties build on top of Awajimaa with a standards-compliant OAuth authorization server</div>
          </div>

          <div style={{ backgroundColor:"#131726", border:"1px solid rgba(124,107,240,0.2)", borderRadius:"1vw", padding:"3vh 2.5vw", display:"flex", flexDirection:"column", gap:"1.5vh" }}>
            <div style={{ width:"3.5vw", height:"3.5vw", backgroundColor:"rgba(124,107,240,0.15)", borderRadius:"0.7vw", display:"flex", alignItems:"center", justifyContent:"center" }}>
              <div style={{ fontSize:"1.2vw", fontWeight:800, color:"#7C6BF0", fontFamily:"monospace" }}>{"{ }"}</div>
            </div>
            <div style={{ fontSize:"1.4vw", fontWeight:700 }}>REST API + API Keys</div>
            <div style={{ fontSize:"1.05vw", color:"rgba(255,255,255,0.5)", lineHeight:1.5 }}>Full REST API with scoped API key management for secure programmatic access</div>
          </div>

          <div style={{ backgroundColor:"#131726", border:"1px solid rgba(255,255,255,0.08)", borderRadius:"1vw", padding:"3vh 2.5vw", display:"flex", flexDirection:"column", gap:"1.5vh" }}>
            <div style={{ width:"3.5vw", height:"3.5vw", backgroundColor:"rgba(255,255,255,0.06)", borderRadius:"0.7vw", display:"flex", alignItems:"center", justifyContent:"center" }}>
              <div style={{ width:"1.2vw", height:"1.2vw", borderRadius:"0.2vw", backgroundColor:"rgba(255,255,255,0.4)", position:"relative" }}>
                <div style={{ position:"absolute", top:"-0.4vw", right:"-0.4vw", width:"0.6vw", height:"0.6vw", borderRadius:"50%", backgroundColor:"rgba(255,255,255,0.7)" }} />
              </div>
            </div>
            <div style={{ fontSize:"1.4vw", fontWeight:700 }}>Webhook System</div>
            <div style={{ fontSize:"1.05vw", color:"rgba(255,255,255,0.5)", lineHeight:1.5 }}>Real-time event delivery to partner endpoints for payments, orders, and platform events</div>
          </div>

          <div style={{ backgroundColor:"#131726", border:"1px solid rgba(79,127,255,0.15)", borderRadius:"1vw", padding:"3vh 2.5vw", display:"flex", flexDirection:"column", gap:"1.5vh" }}>
            <div style={{ width:"3.5vw", height:"3.5vw", backgroundColor:"rgba(79,127,255,0.12)", borderRadius:"0.7vw", display:"flex", alignItems:"center", justifyContent:"center" }}>
              <div style={{ display:"flex", gap:"0.3vw" }}>
                <div style={{ width:"0.4vw", height:"1.2vw", backgroundColor:"#4F7FFF", borderRadius:"0.1vw" }} />
                <div style={{ width:"0.4vw", height:"0.8vw", backgroundColor:"rgba(79,127,255,0.6)", borderRadius:"0.1vw", marginTop:"0.4vw" }} />
                <div style={{ width:"0.4vw", height:"1vw", backgroundColor:"rgba(79,127,255,0.4)", borderRadius:"0.1vw", marginTop:"0.2vw" }} />
              </div>
            </div>
            <div style={{ fontSize:"1.4vw", fontWeight:700 }}>Marketplace Integration</div>
            <div style={{ fontSize:"1.05vw", color:"rgba(255,255,255,0.5)", lineHeight:1.5 }}>Connected businesses and marketplace partners get a dedicated integration layer with revenue sharing</div>
          </div>

          <div style={{ backgroundColor:"#131726", border:"1px solid rgba(124,107,240,0.15)", borderRadius:"1vw", padding:"3vh 2.5vw", display:"flex", flexDirection:"column", gap:"1.5vh" }}>
            <div style={{ width:"3.5vw", height:"3.5vw", backgroundColor:"rgba(124,107,240,0.12)", borderRadius:"0.7vw", display:"flex", alignItems:"center", justifyContent:"center" }}>
              <div style={{ width:"1.4vw", height:"1vw", backgroundColor:"rgba(124,107,240,0.5)", borderRadius:"0.2vw" }}>
                <div style={{ width:"100%", height:"0.2vw", backgroundColor:"#7C6BF0", borderRadius:"0.1vw", marginBottom:"0.2vw" }} />
                <div style={{ width:"70%", height:"0.2vw", backgroundColor:"rgba(124,107,240,0.6)", borderRadius:"0.1vw" }} />
              </div>
            </div>
            <div style={{ fontSize:"1.4vw", fontWeight:700 }}>Developer Portal</div>
            <div style={{ fontSize:"1.05vw", color:"rgba(255,255,255,0.5)", lineHeight:1.5 }}>Docs, analytics, credential management, and partner onboarding — all in one place</div>
          </div>

          <div style={{ backgroundColor:"#131726", border:"1px solid rgba(255,255,255,0.08)", borderRadius:"1vw", padding:"3vh 2.5vw", display:"flex", flexDirection:"column", gap:"1.5vh" }}>
            <div style={{ width:"3.5vw", height:"3.5vw", backgroundColor:"rgba(255,255,255,0.05)", borderRadius:"0.7vw", display:"flex", alignItems:"center", justifyContent:"center" }}>
              <div style={{ display:"flex", flexDirection:"column", gap:"0.2vw" }}>
                <div style={{ width:"1.2vw", height:"0.2vw", backgroundColor:"rgba(255,255,255,0.5)", borderRadius:"0.1vw" }} />
                <div style={{ width:"0.8vw", height:"0.2vw", backgroundColor:"rgba(255,255,255,0.3)", borderRadius:"0.1vw" }} />
                <div style={{ width:"1vw", height:"0.2vw", backgroundColor:"rgba(255,255,255,0.4)", borderRadius:"0.1vw" }} />
              </div>
            </div>
            <div style={{ fontSize:"1.4vw", fontWeight:700 }}>White-Label Ready</div>
            <div style={{ fontSize:"1.05vw", color:"rgba(255,255,255,0.5)", lineHeight:1.5 }}>Platform supports white-label and connected-business partnerships with branded storefronts</div>
          </div>
        </div>
      </div>

      <div style={{ position:"absolute", bottom:"5vh", left:"5vw", fontSize:"0.9vw", color:"rgba(255,255,255,0.35)", letterSpacing:"0.06em" }}>AWAJIMAA TECHNOLOGIES</div>
      <div style={{ position:"absolute", bottom:"5vh", right:"5vw", fontSize:"0.9vw", color:"rgba(255,255,255,0.35)", letterSpacing:"0.06em" }}>07 / 10</div>
    </div>
  );
}
