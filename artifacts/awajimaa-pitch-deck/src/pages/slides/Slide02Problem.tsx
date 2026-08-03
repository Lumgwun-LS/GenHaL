export default function Slide02Problem() {
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

      {/* Two-column layout */}
      <div style={{ position:"relative", zIndex:10, display:"flex", width:"88vw", alignItems:"center", gap:"6vw" }}>

        {/* Left: text */}
        <div style={{ flex:"0 0 48vw", display:"flex", flexDirection:"column", gap:"3vh" }}>
          <div style={{ display:"inline-block", padding:"0.5vh 1.2vw", backgroundColor:"rgba(79,127,255,0.15)", border:"1px solid rgba(79,127,255,0.3)", borderRadius:"2vw", color:"#4F7FFF", fontSize:"0.9vw", fontWeight:700, textTransform:"uppercase", letterSpacing:"0.1em", alignSelf:"flex-start" }}>
            The Problem
          </div>
          <h2 style={{ fontSize:"3.8vw", fontWeight:800, margin:0, lineHeight:1.1, letterSpacing:"-0.03em", textWrap:"balance" }}>
            African businesses<br />
            <span style={{ color:"rgba(255,255,255,0.45)" }}>are running on duct tape.</span>
          </h2>
          <div style={{ display:"flex", flexDirection:"column", gap:"2vh" }}>
            <div style={{ display:"flex", gap:"1vw" }}>
              <div style={{ width:"0.3vw", backgroundColor:"#4F7FFF", borderRadius:"0.2vw", flexShrink:0, marginTop:"0.3vh" }} />
              <div>
                <div style={{ fontSize:"1.3vw", fontWeight:600, marginBottom:"0.3vh" }}>44 million SMEs underserved</div>
                <div style={{ fontSize:"1.1vw", color:"rgba(255,255,255,0.5)", lineHeight:1.4 }}>Sub-Saharan Africa's businesses lack integrated digital tools</div>
              </div>
            </div>
            <div style={{ display:"flex", gap:"1vw" }}>
              <div style={{ width:"0.3vw", backgroundColor:"#7C6BF0", borderRadius:"0.2vw", flexShrink:0, marginTop:"0.3vh" }} />
              <div>
                <div style={{ fontSize:"1.3vw", fontWeight:600, marginBottom:"0.3vh" }}>5–10 disconnected apps</div>
                <div style={{ fontSize:"1.1vw", color:"rgba(255,255,255,0.5)", lineHeight:1.4 }}>Payments, CRM, social, inventory, and marketing don't talk to each other</div>
              </div>
            </div>
            <div style={{ display:"flex", gap:"1vw" }}>
              <div style={{ width:"0.3vw", backgroundColor:"#4F7FFF", borderRadius:"0.2vw", flexShrink:0, marginTop:"0.3vh" }} />
              <div>
                <div style={{ fontSize:"1.3vw", fontWeight:600, marginBottom:"0.3vh" }}>Western SaaS doesn't fit</div>
                <div style={{ fontSize:"1.1vw", color:"rgba(255,255,255,0.5)", lineHeight:1.4 }}>No support for local payment infrastructure or African market realities</div>
              </div>
            </div>
            <div style={{ display:"flex", gap:"1vw" }}>
              <div style={{ width:"0.3vw", backgroundColor:"#7C6BF0", borderRadius:"0.2vw", flexShrink:0, marginTop:"0.3vh" }} />
              <div>
                <div style={{ fontSize:"1.3vw", fontWeight:600, marginBottom:"0.3vh" }}>Revenue left on the table</div>
                <div style={{ fontSize:"1.1vw", color:"rgba(255,255,255,0.5)", lineHeight:1.4 }}>Hours lost to manual work every day compounds into lost growth</div>
              </div>
            </div>
          </div>
        </div>

        {/* Right: visual stat card */}
        <div style={{ flex:1, display:"flex", flexDirection:"column", gap:"2vh" }}>
          <div style={{ backgroundColor:"#131726", border:"1px solid rgba(255,255,255,0.08)", borderRadius:"1vw", padding:"3vh 2.5vw", display:"flex", flexDirection:"column", gap:"1vh" }}>
            <div style={{ fontSize:"0.9vw", color:"rgba(255,255,255,0.4)", textTransform:"uppercase", letterSpacing:"0.1em" }}>African SME market</div>
            <div style={{ fontSize:"5.5vw", fontWeight:800, color:"#4F7FFF", lineHeight:1 }}>44M</div>
            <div style={{ fontSize:"1.1vw", color:"rgba(255,255,255,0.6)" }}>businesses with no integrated OS</div>
          </div>
          <div style={{ backgroundColor:"#131726", border:"1px solid rgba(255,255,255,0.08)", borderRadius:"1vw", padding:"3vh 2.5vw", display:"flex", flexDirection:"column", gap:"1vh" }}>
            <div style={{ fontSize:"0.9vw", color:"rgba(255,255,255,0.4)", textTransform:"uppercase", letterSpacing:"0.1em" }}>Tools per business</div>
            <div style={{ fontSize:"5.5vw", fontWeight:800, color:"#7C6BF0", lineHeight:1 }}>5–10</div>
            <div style={{ fontSize:"1.1vw", color:"rgba(255,255,255,0.6)" }}>fragmented apps that don't talk to each other</div>
          </div>
        </div>
      </div>

      <div style={{ position:"absolute", bottom:"5vh", left:"5vw", fontSize:"0.9vw", color:"rgba(255,255,255,0.35)", letterSpacing:"0.06em" }}>AWAJIMAA TECHNOLOGIES</div>
      <div style={{ position:"absolute", bottom:"5vh", right:"5vw", fontSize:"0.9vw", color:"rgba(255,255,255,0.35)", letterSpacing:"0.06em" }}>02 / 10</div>
    </div>
  );
}
