const base = import.meta.env.BASE_URL;

export default function Slide10CTA() {
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
      {/* Network image — full bleed, very subtle */}
      <img
        src={`${base}hero-network.jpg`}
        crossOrigin="anonymous"
        alt=""
        style={{
          position: "absolute", top: 0, left: 0, width: "100%", height: "100%",
          objectFit: "cover", opacity: 0.08,
        }}
      />

      {/* Central glow */}
      <div style={{ position:"absolute", top:"50%", left:"50%", transform:"translate(-50%,-50%)", width:"60vw", height:"60vw", borderRadius:"50%", backgroundColor:"#4F7FFF", opacity:0.08, filter:"blur(15vw)" }} />
      <div style={{ position:"absolute", bottom:"-20vh", right:"-10vw", width:"40vw", height:"40vw", borderRadius:"50%", backgroundColor:"#7C6BF0", opacity:0.1, filter:"blur(8vw)" }} />
      <div style={{ position:"absolute", top:0, left:0, width:"100%", height:"100%", backgroundImage:"linear-gradient(rgba(255,255,255,0.03) 1px,transparent 1px),linear-gradient(90deg,rgba(255,255,255,0.03) 1px,transparent 1px)", backgroundSize:"4vw 4vw", opacity:0.5, pointerEvents:"none" }} />

      <div style={{ position:"absolute", top:"5vh", left:"5vw", display:"flex", alignItems:"center", gap:"0.8vw", zIndex:10 }}>
        <div style={{ width:"2vw", height:"2vw", backgroundColor:"#4F7FFF", borderRadius:"0.4vw" }} />
        <div style={{ fontSize:"1.2vw", fontWeight:700, letterSpacing:"-0.02em" }}>awajimaa</div>
      </div>
      <div style={{ position:"absolute", top:"5vh", right:"5vw", fontSize:"1vw", color:"rgba(255,255,255,0.5)", zIndex:10 }}>2026</div>

      {/* Glass card */}
      <div
        style={{
          position:"relative", zIndex:10,
          display:"flex", flexDirection:"column",
          alignItems:"center", textAlign:"center",
          maxWidth:"58vw",
          padding:"5.5vw",
          backgroundColor:"rgba(19,23,38,0.65)",
          backdropFilter:"blur(2vw)",
          WebkitBackdropFilter:"blur(2vw)",
          border:"1px solid rgba(255,255,255,0.1)",
          borderRadius:"2vw",
          boxShadow:"0 4vh 8vh rgba(0,0,0,0.5)",
        }}
      >
        {/* Icon */}
        <div style={{ width:"5vw", height:"5vw", backgroundColor:"#4F7FFF", borderRadius:"1.2vw", marginBottom:"3.5vh", display:"flex", alignItems:"center", justifyContent:"center" }}>
          <svg width="2.5vw" height="2.5vw" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M3 12a9 9 0 1 0 18 0 9 9 0 0 0-18 0"/>
            <path d="M11.38 6.7 8 12h4l-.38 5.3 3.38-5.3H11l.38-5.3"/>
          </svg>
        </div>

        <h2 style={{ fontSize:"3.5vw", fontWeight:800, margin:"0 0 2vh 0", lineHeight:1.1, letterSpacing:"-0.03em", textWrap:"balance" }}>
          Let's build Africa's business infrastructure together.
        </h2>
        <p style={{ fontSize:"1.4vw", fontWeight:300, color:"rgba(255,255,255,0.65)", margin:"0 0 4vh 0", lineHeight:1.5, textWrap:"pretty" }}>
          We're looking for partners, investors, and enterprise customers who believe African businesses deserve world-class tools.
        </p>

        {/* Contact info */}
        <div style={{ display:"flex", gap:"3vw", alignItems:"center", flexWrap:"wrap", justifyContent:"center", marginBottom:"3.5vh" }}>
          <div style={{ display:"flex", flexDirection:"column", alignItems:"center", gap:"0.4vh" }}>
            <div style={{ fontSize:"0.9vw", color:"rgba(255,255,255,0.4)", textTransform:"uppercase", letterSpacing:"0.08em" }}>Website</div>
            <div style={{ fontSize:"1.3vw", fontWeight:600, color:"#4F7FFF" }}>lumgwunsolutions.com</div>
          </div>
          <div style={{ width:"0.1vw", height:"4vh", backgroundColor:"rgba(255,255,255,0.15)" }} />
          <div style={{ display:"flex", flexDirection:"column", alignItems:"center", gap:"0.4vh" }}>
            <div style={{ fontSize:"0.9vw", color:"rgba(255,255,255,0.4)", textTransform:"uppercase", letterSpacing:"0.08em" }}>Email</div>
            <div style={{ fontSize:"1.3vw", fontWeight:600, color:"#7C6BF0" }}>admin@lumgwunsolutions.com</div>
          </div>
        </div>

        {/* Product suite pills */}
        <div style={{ display:"flex", gap:"1vw", flexWrap:"wrap", justifyContent:"center" }}>
          <div style={{ padding:"0.7vh 1.5vw", backgroundColor:"rgba(79,127,255,0.12)", border:"1px solid rgba(79,127,255,0.25)", borderRadius:"2vw", fontSize:"0.95vw", fontWeight:500, color:"rgba(255,255,255,0.7)" }}>Awa Biz Suite</div>
          <div style={{ padding:"0.7vh 1.5vw", backgroundColor:"rgba(124,107,240,0.12)", border:"1px solid rgba(124,107,240,0.25)", borderRadius:"2vw", fontSize:"0.95vw", fontWeight:500, color:"rgba(255,255,255,0.7)" }}>App Store</div>
          <div style={{ padding:"0.7vh 1.5vw", backgroundColor:"rgba(255,255,255,0.06)", border:"1px solid rgba(255,255,255,0.1)", borderRadius:"2vw", fontSize:"0.95vw", fontWeight:500, color:"rgba(255,255,255,0.7)" }}>Mobile</div>
          <div style={{ padding:"0.7vh 1.5vw", backgroundColor:"rgba(79,127,255,0.08)", border:"1px solid rgba(79,127,255,0.2)", borderRadius:"2vw", fontSize:"0.95vw", fontWeight:500, color:"rgba(255,255,255,0.7)" }}>AI Studio</div>
        </div>
      </div>

      <div style={{ position:"absolute", bottom:"5vh", left:"5vw", fontSize:"0.9vw", color:"rgba(255,255,255,0.35)", letterSpacing:"0.06em" }}>AWAJIMAA TECHNOLOGIES</div>
      <div style={{ position:"absolute", bottom:"5vh", right:"5vw", fontSize:"0.9vw", color:"rgba(255,255,255,0.35)", letterSpacing:"0.06em" }}>10 / 10</div>
    </div>
  );
}
