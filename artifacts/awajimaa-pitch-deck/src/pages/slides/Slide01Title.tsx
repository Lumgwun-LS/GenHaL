const base = import.meta.env.BASE_URL;

export default function Slide01Title() {
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
      {/* Hero city image — bottom right, partially visible */}
      <img
        src={`${base}hero-city.jpg`}
        crossOrigin="anonymous"
        alt=""
        style={{
          position: "absolute", bottom: 0, right: 0,
          width: "55vw", height: "60vh",
          objectFit: "cover", objectPosition: "center top",
          opacity: 0.18,
          maskImage: "linear-gradient(to left, rgba(0,0,0,0.9) 0%, transparent 100%), linear-gradient(to top, rgba(0,0,0,0.9) 0%, transparent 50%)",
          WebkitMaskImage: "linear-gradient(to left, rgba(0,0,0,0.8) 30%, transparent 100%)",
        }}
      />

      {/* BG blurred circles */}
      <div style={{ position:"absolute", top:"-20vh", right:"-10vw", width:"50vw", height:"50vw", borderRadius:"50%", backgroundColor:"#4F7FFF", opacity:0.06, filter:"blur(8vw)" }} />
      <div style={{ position:"absolute", bottom:"-30vh", left:"-15vw", width:"60vw", height:"60vw", borderRadius:"50%", backgroundColor:"#7C6BF0", opacity:0.06, filter:"blur(10vw)" }} />

      {/* Grid overlay */}
      <div style={{ position:"absolute", top:0, left:0, width:"100%", height:"100%", backgroundImage:"linear-gradient(rgba(255,255,255,0.03) 1px,transparent 1px),linear-gradient(90deg,rgba(255,255,255,0.03) 1px,transparent 1px)", backgroundSize:"4vw 4vw", opacity:0.5, pointerEvents:"none" }} />

      {/* Header */}
      <div style={{ position:"absolute", top:"5vh", left:"5vw", display:"flex", alignItems:"center", gap:"0.8vw", zIndex:10 }}>
        <div style={{ width:"2vw", height:"2vw", backgroundColor:"#4F7FFF", borderRadius:"0.4vw" }} />
        <div style={{ fontSize:"1.2vw", fontWeight:700, letterSpacing:"-0.02em" }}>awajimaa</div>
      </div>
      <div style={{ position:"absolute", top:"5vh", right:"5vw", fontSize:"1vw", color:"rgba(255,255,255,0.5)", zIndex:10 }}>2026</div>

      {/* Main content */}
      <div style={{ position:"relative", zIndex:10, display:"flex", flexDirection:"column", alignItems:"center", textAlign:"center", maxWidth:"68vw" }}>
        {/* Badge */}
        <div style={{ display:"inline-flex", alignItems:"center", padding:"0.6vh 1.4vw", backgroundColor:"rgba(124,107,240,0.15)", border:"1px solid rgba(124,107,240,0.35)", borderRadius:"2vw", color:"#7C6BF0", fontSize:"1vw", fontWeight:600, marginBottom:"4vh", letterSpacing:"0.06em", textTransform:"uppercase" }}>
          Introducing the Awajimaa Ecosystem
        </div>

        {/* Title */}
        <h1 style={{ fontSize:"7.5vw", fontWeight:800, margin:"0 0 2.5vh 0", lineHeight:1.0, letterSpacing:"-0.04em" }}>
          Awajimaa
        </h1>

        {/* Subtitle */}
        <p style={{ fontSize:"2vw", fontWeight:300, color:"rgba(255,255,255,0.75)", margin:"0 0 2vh 0", lineHeight:1.4, maxWidth:"54vw", textWrap:"balance" }}>
          Africa's All-in-One Business Operating System
        </p>
        <p style={{ fontSize:"1.4vw", fontWeight:400, color:"rgba(255,255,255,0.4)", margin:"0 0 6vh 0", letterSpacing:"0.1em" }}>
          AWA BIZ SUITE&nbsp;&nbsp;·&nbsp;&nbsp;APP STORE&nbsp;&nbsp;·&nbsp;&nbsp;MOBILE&nbsp;&nbsp;·&nbsp;&nbsp;AI STUDIO
        </p>

        {/* Feature pills */}
        <div style={{ display:"flex", gap:"1.5vw", flexWrap:"wrap", justifyContent:"center" }}>
          {[
            { label: "9 Payment Gateways" },
            { label: "AI-Native Platform" },
            { label: "Live & Shipping" },
          ].map((pill, i) => (
            <div
              key={i}
              style={{ display:"flex", alignItems:"center", gap:"0.5vw", padding:"1vh 1.8vw", backgroundColor:"rgba(255,255,255,0.06)", border:"1px solid rgba(255,255,255,0.1)", borderRadius:"0.5vw", fontSize:"1.05vw", fontWeight:500, color:"rgba(255,255,255,0.8)" }}
            >
              {pill.label}
            </div>
          ))}
        </div>
      </div>

      {/* Footer */}
      <div style={{ position:"absolute", bottom:"5vh", left:"5vw", fontSize:"0.9vw", color:"rgba(255,255,255,0.35)", letterSpacing:"0.06em" }}>AWAJIMAA TECHNOLOGIES</div>
      <div style={{ position:"absolute", bottom:"5vh", right:"5vw", fontSize:"0.9vw", color:"rgba(255,255,255,0.35)", letterSpacing:"0.06em" }}>01 / 10</div>
    </div>
  );
}
