export default function Slide09BusinessModel() {
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
      <div style={{ position:"absolute", top:"5vh", left:"15vw", width:"40vw", height:"40vw", borderRadius:"50%", backgroundColor:"#7C6BF0", opacity:0.07, filter:"blur(12vw)" }} />
      <div style={{ position:"absolute", bottom:"5vh", right:"15vw", width:"35vw", height:"35vw", borderRadius:"50%", backgroundColor:"#4F7FFF", opacity:0.05, filter:"blur(10vw)" }} />
      <div style={{ position:"absolute", top:0, left:0, width:"100%", height:"100%", backgroundImage:"linear-gradient(rgba(255,255,255,0.03) 1px,transparent 1px),linear-gradient(90deg,rgba(255,255,255,0.03) 1px,transparent 1px)", backgroundSize:"4vw 4vw", opacity:0.5, pointerEvents:"none" }} />

      <div style={{ position:"absolute", top:"5vh", left:"5vw", display:"flex", alignItems:"center", gap:"0.8vw", zIndex:10 }}>
        <div style={{ width:"2vw", height:"2vw", backgroundColor:"#4F7FFF", borderRadius:"0.4vw" }} />
        <div style={{ fontSize:"1.2vw", fontWeight:700, letterSpacing:"-0.02em" }}>awajimaa</div>
      </div>
      <div style={{ position:"absolute", top:"5vh", right:"5vw", fontSize:"1vw", color:"rgba(255,255,255,0.5)", zIndex:10 }}>2026</div>

      <div style={{ position:"relative", zIndex:10, display:"flex", width:"88vw", gap:"6vw", alignItems:"flex-start" }}>

        {/* Left: header + labels */}
        <div style={{ flex:"0 0 28vw", display:"flex", flexDirection:"column", gap:"2.5vh", paddingTop:"1vh" }}>
          <div style={{ display:"inline-block", padding:"0.5vh 1.2vw", backgroundColor:"rgba(79,127,255,0.15)", border:"1px solid rgba(79,127,255,0.3)", borderRadius:"2vw", color:"#4F7FFF", fontSize:"0.9vw", fontWeight:700, textTransform:"uppercase", letterSpacing:"0.1em", alignSelf:"flex-start" }}>
            Revenue Model
          </div>
          <h2 style={{ fontSize:"3.8vw", fontWeight:800, margin:0, lineHeight:1.1, letterSpacing:"-0.03em" }}>
            How we<br />make money.
          </h2>
          <p style={{ fontSize:"1.2vw", color:"rgba(255,255,255,0.5)", lineHeight:1.5, margin:0 }}>
            Five diversified revenue streams across subscriptions, marketplace fees, and usage billing.
          </p>
        </div>

        {/* Right: revenue stream list */}
        <div style={{ flex:1, display:"flex", flexDirection:"column", gap:"1.6vh" }}>
          <div style={{ display:"flex", gap:"2vw", alignItems:"center", backgroundColor:"#131726", border:"1px solid rgba(79,127,255,0.2)", borderRadius:"0.8vw", padding:"2.2vh 2.5vw" }}>
            <div style={{ width:"0.4vw", height:"4vh", backgroundColor:"#4F7FFF", borderRadius:"0.2vw", flexShrink:0 }} />
            <div style={{ flex:1 }}>
              <div style={{ fontSize:"1.3vw", fontWeight:700 }}>SaaS Subscriptions</div>
              <div style={{ fontSize:"1.05vw", color:"rgba(255,255,255,0.5)", marginTop:"0.3vh" }}>Free · Growth · Pro · Enterprise tiers for Biz Suite vendors</div>
            </div>
            <div style={{ fontSize:"1.1vw", color:"#4F7FFF", fontWeight:600, flexShrink:0 }}>Primary</div>
          </div>

          <div style={{ display:"flex", gap:"2vw", alignItems:"center", backgroundColor:"#131726", border:"1px solid rgba(124,107,240,0.2)", borderRadius:"0.8vw", padding:"2.2vh 2.5vw" }}>
            <div style={{ width:"0.4vw", height:"4vh", backgroundColor:"#7C6BF0", borderRadius:"0.2vw", flexShrink:0 }} />
            <div style={{ flex:1 }}>
              <div style={{ fontSize:"1.3vw", fontWeight:700 }}>App Store Publishing Fee</div>
              <div style={{ fontSize:"1.05vw", color:"rgba(255,255,255,0.5)", marginTop:"0.3vh" }}>One-time $15 per app — paid via Stripe or Paystack</div>
            </div>
            <div style={{ fontSize:"1.1vw", color:"#7C6BF0", fontWeight:600, flexShrink:0 }}>Marketplace</div>
          </div>

          <div style={{ display:"flex", gap:"2vw", alignItems:"center", backgroundColor:"#131726", border:"1px solid rgba(255,255,255,0.08)", borderRadius:"0.8vw", padding:"2.2vh 2.5vw" }}>
            <div style={{ width:"0.4vw", height:"4vh", backgroundColor:"rgba(255,255,255,0.4)", borderRadius:"0.2vw", flexShrink:0 }} />
            <div style={{ flex:1 }}>
              <div style={{ fontSize:"1.3vw", fontWeight:700 }}>Pay-as-you-go Overage</div>
              <div style={{ fontSize:"1.05vw", color:"rgba(255,255,255,0.5)", marginTop:"0.3vh" }}>AI credits, voice minutes, SMS beyond plan quota — auto-billed</div>
            </div>
            <div style={{ fontSize:"1.1vw", color:"rgba(255,255,255,0.5)", fontWeight:600, flexShrink:0 }}>Usage</div>
          </div>

          <div style={{ display:"flex", gap:"2vw", alignItems:"center", backgroundColor:"#131726", border:"1px solid rgba(79,127,255,0.15)", borderRadius:"0.8vw", padding:"2.2vh 2.5vw" }}>
            <div style={{ width:"0.4vw", height:"4vh", backgroundColor:"rgba(79,127,255,0.6)", borderRadius:"0.2vw", flexShrink:0 }} />
            <div style={{ flex:1 }}>
              <div style={{ fontSize:"1.3vw", fontWeight:700 }}>Platform Partnerships</div>
              <div style={{ fontSize:"1.05vw", color:"rgba(255,255,255,0.5)", marginTop:"0.3vh" }}>Revenue share with connected businesses and marketplace integrations</div>
            </div>
            <div style={{ fontSize:"1.1vw", color:"rgba(79,127,255,0.8)", fontWeight:600, flexShrink:0 }}>B2B</div>
          </div>

          <div style={{ display:"flex", gap:"2vw", alignItems:"center", backgroundColor:"#131726", border:"1px solid rgba(124,107,240,0.15)", borderRadius:"0.8vw", padding:"2.2vh 2.5vw" }}>
            <div style={{ width:"0.4vw", height:"4vh", backgroundColor:"rgba(124,107,240,0.6)", borderRadius:"0.2vw", flexShrink:0 }} />
            <div style={{ flex:1 }}>
              <div style={{ fontSize:"1.3vw", fontWeight:700 }}>Mobile App Builder</div>
              <div style={{ fontSize:"1.05vw", color:"rgba(255,255,255,0.5)", marginTop:"0.3vh" }}>Premium add-on — branded APK generation for any vendor</div>
            </div>
            <div style={{ fontSize:"1.1vw", color:"rgba(124,107,240,0.8)", fontWeight:600, flexShrink:0 }}>Add-on</div>
          </div>
        </div>
      </div>

      <div style={{ position:"absolute", bottom:"5vh", left:"5vw", fontSize:"0.9vw", color:"rgba(255,255,255,0.35)", letterSpacing:"0.06em" }}>AWAJIMAA TECHNOLOGIES</div>
      <div style={{ position:"absolute", bottom:"5vh", right:"5vw", fontSize:"0.9vw", color:"rgba(255,255,255,0.35)", letterSpacing:"0.06em" }}>09 / 10</div>
    </div>
  );
}
