export default function Slide04BizSuite() {
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

      <div style={{ position:"relative", zIndex:10, display:"flex", flexDirection:"column", width:"86vw" }}>
        {/* Header */}
        <div style={{ marginBottom:"4vh" }}>
          <div style={{ display:"inline-block", padding:"0.5vh 1.2vw", backgroundColor:"rgba(79,127,255,0.15)", border:"1px solid rgba(79,127,255,0.3)", borderRadius:"2vw", color:"#4F7FFF", fontSize:"0.9vw", fontWeight:700, textTransform:"uppercase", letterSpacing:"0.1em", marginBottom:"2vh" }}>
            Awa Biz Suite
          </div>
          <h2 style={{ fontSize:"3.6vw", fontWeight:800, margin:0, lineHeight:1.1, letterSpacing:"-0.03em" }}>
            Run your entire business in one place.
          </h2>
        </div>

        {/* 2x3 feature grid */}
        <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:"1.5vh 2vw" }}>
          {/* Payments */}
          <div style={{ backgroundColor:"#131726", border:"1px solid rgba(79,127,255,0.2)", borderRadius:"0.8vw", padding:"2.2vh 2vw", display:"flex", gap:"1.5vw", alignItems:"flex-start" }}>
            <div style={{ width:"3vw", height:"3vw", backgroundColor:"rgba(79,127,255,0.15)", borderRadius:"0.5vw", flexShrink:0, display:"flex", alignItems:"center", justifyContent:"center" }}>
              <div style={{ width:"1.4vw", height:"1vw", border:"0.15vw solid #4F7FFF", borderRadius:"0.2vw" }} />
            </div>
            <div>
              <div style={{ fontSize:"1.3vw", fontWeight:700, marginBottom:"0.4vh" }}>Payments</div>
              <div style={{ fontSize:"1.05vw", color:"rgba(255,255,255,0.5)", lineHeight:1.4 }}>9 gateways — Stripe, Paystack, Flutterwave, PayPal, Interswitch, Nomba, Squad, Remita, NowPayments</div>
            </div>
          </div>

          {/* Commerce */}
          <div style={{ backgroundColor:"#131726", border:"1px solid rgba(255,255,255,0.07)", borderRadius:"0.8vw", padding:"2.2vh 2vw", display:"flex", gap:"1.5vw", alignItems:"flex-start" }}>
            <div style={{ width:"3vw", height:"3vw", backgroundColor:"rgba(124,107,240,0.12)", borderRadius:"0.5vw", flexShrink:0, display:"flex", alignItems:"center", justifyContent:"center" }}>
              <div style={{ width:"1.2vw", height:"1.2vw", backgroundColor:"#7C6BF0", borderRadius:"0.2vw" }} />
            </div>
            <div>
              <div style={{ fontSize:"1.3vw", fontWeight:700, marginBottom:"0.4vh" }}>Commerce</div>
              <div style={{ fontSize:"1.05vw", color:"rgba(255,255,255,0.5)", lineHeight:1.4 }}>Products, inventory, orders, invoices, storefronts, embedded shop widgets</div>
            </div>
          </div>

          {/* Finance */}
          <div style={{ backgroundColor:"#131726", border:"1px solid rgba(255,255,255,0.07)", borderRadius:"0.8vw", padding:"2.2vh 2vw", display:"flex", gap:"1.5vw", alignItems:"flex-start" }}>
            <div style={{ width:"3vw", height:"3vw", backgroundColor:"rgba(39,201,63,0.1)", borderRadius:"0.5vw", flexShrink:0, display:"flex", alignItems:"center", justifyContent:"center" }}>
              <div style={{ width:"0.2vw", height:"1.4vw", backgroundColor:"#27C93F" }} />
              <div style={{ width:"0.8vw", height:"0.2vw", backgroundColor:"#27C93F", position:"absolute" }} />
            </div>
            <div>
              <div style={{ fontSize:"1.3vw", fontWeight:700, marginBottom:"0.4vh" }}>Finance</div>
              <div style={{ fontSize:"1.05vw", color:"rgba(255,255,255,0.5)", lineHeight:1.4 }}>Sales, expenses, investments, wallet, recurring billing, finance analytics</div>
            </div>
          </div>

          {/* CRM */}
          <div style={{ backgroundColor:"#131726", border:"1px solid rgba(255,255,255,0.07)", borderRadius:"0.8vw", padding:"2.2vh 2vw", display:"flex", gap:"1.5vw", alignItems:"flex-start" }}>
            <div style={{ width:"3vw", height:"3vw", backgroundColor:"rgba(79,127,255,0.12)", borderRadius:"0.5vw", flexShrink:0, display:"flex", alignItems:"center", justifyContent:"center" }}>
              <div style={{ width:"1.2vw", height:"1.2vw", borderRadius:"50%", border:"0.2vw solid #4F7FFF" }} />
            </div>
            <div>
              <div style={{ fontSize:"1.3vw", fontWeight:700, marginBottom:"0.4vh" }}>CRM</div>
              <div style={{ fontSize:"1.05vw", color:"rgba(255,255,255,0.5)", lineHeight:1.4 }}>Lead pipeline, UTM tracking, website pixel, form capture, contact timelines</div>
            </div>
          </div>

          {/* Marketing */}
          <div style={{ backgroundColor:"#131726", border:"1px solid rgba(255,255,255,0.07)", borderRadius:"0.8vw", padding:"2.2vh 2vw", display:"flex", gap:"1.5vw", alignItems:"flex-start" }}>
            <div style={{ width:"3vw", height:"3vw", backgroundColor:"rgba(124,107,240,0.12)", borderRadius:"0.5vw", flexShrink:0, display:"flex", alignItems:"center", justifyContent:"center" }}>
              <div style={{ width:"1.4vw", height:"1vw", borderRadius:"0.2vw", border:"0.15vw solid #7C6BF0", position:"relative" }}>
                <div style={{ position:"absolute", bottom:"-0.4vw", left:"50%", transform:"translateX(-50%)", width:0, height:0, borderLeft:"0.35vw solid transparent", borderRight:"0.35vw solid transparent", borderTop:"0.4vw solid #7C6BF0" }} />
              </div>
            </div>
            <div>
              <div style={{ fontSize:"1.3vw", fontWeight:700, marginBottom:"0.4vh" }}>Marketing</div>
              <div style={{ fontSize:"1.05vw", color:"rgba(255,255,255,0.5)", lineHeight:1.4 }}>Email, SMS, and AI voice call campaigns with automated scheduling</div>
            </div>
          </div>

          {/* Social */}
          <div style={{ backgroundColor:"#131726", border:"1px solid rgba(255,255,255,0.07)", borderRadius:"0.8vw", padding:"2.2vh 2vw", display:"flex", gap:"1.5vw", alignItems:"flex-start" }}>
            <div style={{ width:"3vw", height:"3vw", backgroundColor:"rgba(79,127,255,0.12)", borderRadius:"0.5vw", flexShrink:0, display:"flex", alignItems:"center", justifyContent:"center" }}>
              <div style={{ display:"flex", gap:"0.3vw" }}>
                <div style={{ width:"0.4vw", height:"0.4vw", borderRadius:"50%", backgroundColor:"#4F7FFF" }} />
                <div style={{ width:"0.4vw", height:"0.4vw", borderRadius:"50%", backgroundColor:"rgba(79,127,255,0.6)" }} />
                <div style={{ width:"0.4vw", height:"0.4vw", borderRadius:"50%", backgroundColor:"rgba(79,127,255,0.3)" }} />
              </div>
            </div>
            <div>
              <div style={{ fontSize:"1.3vw", fontWeight:700, marginBottom:"0.4vh" }}>Social</div>
              <div style={{ fontSize:"1.05vw", color:"rgba(255,255,255,0.5)", lineHeight:1.4 }}>Schedule and publish to Facebook, Instagram, LinkedIn, and X/Twitter</div>
            </div>
          </div>
        </div>
      </div>

      <div style={{ position:"absolute", bottom:"5vh", left:"5vw", fontSize:"0.9vw", color:"rgba(255,255,255,0.35)", letterSpacing:"0.06em" }}>AWAJIMAA TECHNOLOGIES</div>
      <div style={{ position:"absolute", bottom:"5vh", right:"5vw", fontSize:"0.9vw", color:"rgba(255,255,255,0.35)", letterSpacing:"0.06em" }}>04 / 10</div>
    </div>
  );
}
