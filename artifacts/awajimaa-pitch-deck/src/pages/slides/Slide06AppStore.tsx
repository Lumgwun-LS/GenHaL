export default function Slide06AppStore() {
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
      <div style={{ position:"absolute", top:"-20vh", right:"-10vw", width:"50vw", height:"50vw", borderRadius:"50%", backgroundColor:"#7C6BF0", opacity:0.06, filter:"blur(8vw)" }} />
      <div style={{ position:"absolute", bottom:"-30vh", left:"-15vw", width:"60vw", height:"60vw", borderRadius:"50%", backgroundColor:"#4F7FFF", opacity:0.05, filter:"blur(10vw)" }} />
      <div style={{ position:"absolute", top:0, left:0, width:"100%", height:"100%", backgroundImage:"linear-gradient(rgba(255,255,255,0.03) 1px,transparent 1px),linear-gradient(90deg,rgba(255,255,255,0.03) 1px,transparent 1px)", backgroundSize:"4vw 4vw", opacity:0.5, pointerEvents:"none" }} />

      <div style={{ position:"absolute", top:"5vh", left:"5vw", display:"flex", alignItems:"center", gap:"0.8vw", zIndex:10 }}>
        <div style={{ width:"2vw", height:"2vw", backgroundColor:"#4F7FFF", borderRadius:"0.4vw" }} />
        <div style={{ fontSize:"1.2vw", fontWeight:700, letterSpacing:"-0.02em" }}>awajimaa</div>
      </div>
      <div style={{ position:"absolute", top:"5vh", right:"5vw", fontSize:"1vw", color:"rgba(255,255,255,0.5)", zIndex:10 }}>2026</div>

      <div style={{ position:"relative", zIndex:10, display:"flex", width:"88vw", alignItems:"center", gap:"6vw" }}>

        {/* Left: text */}
        <div style={{ flex:"0 0 44vw", display:"flex", flexDirection:"column", gap:"2.5vh" }}>
          <div style={{ display:"inline-block", padding:"0.5vh 1.2vw", backgroundColor:"rgba(124,107,240,0.15)", border:"1px solid rgba(124,107,240,0.3)", borderRadius:"2vw", color:"#7C6BF0", fontSize:"0.9vw", fontWeight:700, textTransform:"uppercase", letterSpacing:"0.1em", alignSelf:"flex-start" }}>
            App Store
          </div>
          <h2 style={{ fontSize:"3.5vw", fontWeight:800, margin:0, lineHeight:1.1, letterSpacing:"-0.03em" }}>
            Africa's developer<br />marketplace.
          </h2>
          <div style={{ display:"flex", flexDirection:"column", gap:"1.8vh" }}>
            <div style={{ display:"flex", gap:"1vw", alignItems:"flex-start" }}>
              <svg width="1.4vw" height="1.4vw" viewBox="0 0 24 24" fill="none" stroke="#7C6BF0" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink:0, marginTop:"0.2vh" }}><polyline points="20 6 9 17 4 12"/></svg>
              <div style={{ fontSize:"1.2vw", color:"rgba(255,255,255,0.75)", lineHeight:1.4 }}>Developers publish Android apps and reach African consumers directly</div>
            </div>
            <div style={{ display:"flex", gap:"1vw", alignItems:"flex-start" }}>
              <svg width="1.4vw" height="1.4vw" viewBox="0 0 24 24" fill="none" stroke="#7C6BF0" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink:0, marginTop:"0.2vh" }}><polyline points="20 6 9 17 4 12"/></svg>
              <div style={{ fontSize:"1.2vw", color:"rgba(255,255,255,0.75)", lineHeight:1.4 }}>AI-powered quality review before every app approval</div>
            </div>
            <div style={{ display:"flex", gap:"1vw", alignItems:"flex-start" }}>
              <svg width="1.4vw" height="1.4vw" viewBox="0 0 24 24" fill="none" stroke="#4F7FFF" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink:0, marginTop:"0.2vh" }}><polyline points="20 6 9 17 4 12"/></svg>
              <div style={{ fontSize:"1.2vw", color:"rgba(255,255,255,0.75)", lineHeight:1.4 }}>Ratings, reviews, and version management built in</div>
            </div>
            <div style={{ display:"flex", gap:"1vw", alignItems:"flex-start" }}>
              <svg width="1.4vw" height="1.4vw" viewBox="0 0 24 24" fill="none" stroke="#4F7FFF" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink:0, marginTop:"0.2vh" }}><polyline points="20 6 9 17 4 12"/></svg>
              <div style={{ fontSize:"1.2vw", color:"rgba(255,255,255,0.75)", lineHeight:1.4 }}>Update subscriptions — users notified when downloaded apps release new versions</div>
            </div>
            <div style={{ display:"flex", gap:"1vw", alignItems:"flex-start" }}>
              <svg width="1.4vw" height="1.4vw" viewBox="0 0 24 24" fill="none" stroke="#7C6BF0" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink:0, marginTop:"0.2vh" }}><polyline points="20 6 9 17 4 12"/></svg>
              <div style={{ fontSize:"1.2vw", color:"rgba(255,255,255,0.75)", lineHeight:1.4 }}>Vendors who build apps through Biz Suite are auto-listed</div>
            </div>
            <div style={{ display:"flex", gap:"1vw", alignItems:"flex-start" }}>
              <svg width="1.4vw" height="1.4vw" viewBox="0 0 24 24" fill="none" stroke="#7C6BF0" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink:0, marginTop:"0.2vh" }}><polyline points="20 6 9 17 4 12"/></svg>
              <div style={{ fontSize:"1.2vw", color:"rgba(255,255,255,0.75)", lineHeight:1.4 }}>One-time $15 publishing fee — paid via Stripe or Paystack</div>
            </div>
          </div>
        </div>

        {/* Right: App Store UI mockup */}
        <div style={{ flex:1, height:"62vh", backgroundColor:"#131726", border:"1px solid rgba(255,255,255,0.08)", borderRadius:"1vw", overflow:"hidden", display:"flex", flexDirection:"column" }}>
          {/* Mock browser bar */}
          <div style={{ padding:"1.2vw", borderBottom:"1px solid rgba(255,255,255,0.05)", display:"flex", alignItems:"center", gap:"0.5vw" }}>
            <div style={{ width:"0.7vw", height:"0.7vw", borderRadius:"50%", backgroundColor:"#FF5F56" }} />
            <div style={{ width:"0.7vw", height:"0.7vw", borderRadius:"50%", backgroundColor:"#FFBD2E" }} />
            <div style={{ width:"0.7vw", height:"0.7vw", borderRadius:"50%", backgroundColor:"#27C93F" }} />
            <div style={{ flex:1, height:"1.5vh", backgroundColor:"rgba(255,255,255,0.05)", borderRadius:"0.3vw", marginLeft:"0.8vw" }} />
          </div>
          {/* Mock store grid */}
          <div style={{ padding:"1.5vw", flex:1, display:"flex", flexDirection:"column", gap:"1.5vh" }}>
            <div style={{ height:"1vh", width:"40%", backgroundColor:"rgba(124,107,240,0.4)", borderRadius:"0.2vw" }} />
            <div style={{ display:"flex", gap:"1vw" }}>
              <div style={{ flex:1, height:"10vh", backgroundColor:"rgba(79,127,255,0.1)", border:"1px solid rgba(79,127,255,0.2)", borderRadius:"0.6vw", padding:"0.8vw", display:"flex", flexDirection:"column", justifyContent:"space-between" }}>
                <div style={{ width:"2.5vw", height:"2.5vw", backgroundColor:"#4F7FFF", borderRadius:"0.4vw" }} />
                <div style={{ height:"0.6vh", width:"80%", backgroundColor:"rgba(255,255,255,0.15)", borderRadius:"0.2vw" }} />
              </div>
              <div style={{ flex:1, height:"10vh", backgroundColor:"rgba(124,107,240,0.1)", border:"1px solid rgba(124,107,240,0.2)", borderRadius:"0.6vw", padding:"0.8vw", display:"flex", flexDirection:"column", justifyContent:"space-between" }}>
                <div style={{ width:"2.5vw", height:"2.5vw", backgroundColor:"#7C6BF0", borderRadius:"0.4vw" }} />
                <div style={{ height:"0.6vh", width:"70%", backgroundColor:"rgba(255,255,255,0.15)", borderRadius:"0.2vw" }} />
              </div>
              <div style={{ flex:1, height:"10vh", backgroundColor:"rgba(255,255,255,0.03)", border:"1px solid rgba(255,255,255,0.07)", borderRadius:"0.6vw", padding:"0.8vw", display:"flex", flexDirection:"column", justifyContent:"space-between" }}>
                <div style={{ width:"2.5vw", height:"2.5vw", backgroundColor:"rgba(255,255,255,0.2)", borderRadius:"0.4vw" }} />
                <div style={{ height:"0.6vh", width:"60%", backgroundColor:"rgba(255,255,255,0.1)", borderRadius:"0.2vw" }} />
              </div>
            </div>
            <div style={{ height:"0.6vh", width:"60%", backgroundColor:"rgba(255,255,255,0.05)", borderRadius:"0.2vw" }} />
            <div style={{ display:"flex", gap:"1vw" }}>
              <div style={{ flex:1, height:"8vh", backgroundColor:"rgba(255,255,255,0.03)", border:"1px solid rgba(255,255,255,0.05)", borderRadius:"0.6vw" }} />
              <div style={{ flex:1, height:"8vh", backgroundColor:"rgba(255,255,255,0.03)", border:"1px solid rgba(255,255,255,0.05)", borderRadius:"0.6vw" }} />
              <div style={{ flex:1, height:"8vh", backgroundColor:"rgba(255,255,255,0.03)", border:"1px solid rgba(255,255,255,0.05)", borderRadius:"0.6vw" }} />
            </div>
            <div style={{ height:"0.6vh", width:"45%", backgroundColor:"rgba(255,255,255,0.04)", borderRadius:"0.2vw" }} />
            <div style={{ height:"0.6vh", width:"30%", backgroundColor:"rgba(255,255,255,0.04)", borderRadius:"0.2vw" }} />
          </div>
        </div>
      </div>

      <div style={{ position:"absolute", bottom:"5vh", left:"5vw", fontSize:"0.9vw", color:"rgba(255,255,255,0.35)", letterSpacing:"0.06em" }}>AWAJIMAA TECHNOLOGIES</div>
      <div style={{ position:"absolute", bottom:"5vh", right:"5vw", fontSize:"0.9vw", color:"rgba(255,255,255,0.35)", letterSpacing:"0.06em" }}>06 / 10</div>
    </div>
  );
}
