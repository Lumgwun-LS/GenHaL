export default function Slide05AI() {
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
      <div style={{ position:"absolute", top:"-10vh", right:"5vw", width:"45vw", height:"45vw", borderRadius:"50%", backgroundColor:"#7C6BF0", opacity:0.07, filter:"blur(10vw)" }} />
      <div style={{ position:"absolute", bottom:"-20vh", left:"-10vw", width:"50vw", height:"50vw", borderRadius:"50%", backgroundColor:"#4F7FFF", opacity:0.05, filter:"blur(8vw)" }} />
      <div style={{ position:"absolute", top:0, left:0, width:"100%", height:"100%", backgroundImage:"linear-gradient(rgba(255,255,255,0.03) 1px,transparent 1px),linear-gradient(90deg,rgba(255,255,255,0.03) 1px,transparent 1px)", backgroundSize:"4vw 4vw", opacity:0.5, pointerEvents:"none" }} />

      <div style={{ position:"absolute", top:"5vh", left:"5vw", display:"flex", alignItems:"center", gap:"0.8vw", zIndex:10 }}>
        <div style={{ width:"2vw", height:"2vw", backgroundColor:"#4F7FFF", borderRadius:"0.4vw" }} />
        <div style={{ fontSize:"1.2vw", fontWeight:700, letterSpacing:"-0.02em" }}>awajimaa</div>
      </div>
      <div style={{ position:"absolute", top:"5vh", right:"5vw", fontSize:"1vw", color:"rgba(255,255,255,0.5)", zIndex:10 }}>2026</div>

      <div style={{ position:"relative", zIndex:10, display:"flex", width:"88vw", alignItems:"center", gap:"6vw" }}>

        {/* Left: text */}
        <div style={{ flex:"0 0 46vw", display:"flex", flexDirection:"column", gap:"2.5vh" }}>
          <div style={{ display:"inline-block", padding:"0.5vh 1.2vw", backgroundColor:"rgba(124,107,240,0.15)", border:"1px solid rgba(124,107,240,0.3)", borderRadius:"2vw", color:"#7C6BF0", fontSize:"0.9vw", fontWeight:700, textTransform:"uppercase", letterSpacing:"0.1em", alignSelf:"flex-start" }}>
            AI Studio
          </div>
          <h2 style={{ fontSize:"3.6vw", fontWeight:800, margin:0, lineHeight:1.1, letterSpacing:"-0.03em" }}>
            AI is built in —<br />
            <span style={{ color:"rgba(255,255,255,0.45)" }}>not bolted on.</span>
          </h2>
          <div style={{ display:"flex", flexDirection:"column", gap:"1.6vh" }}>
            <div style={{ display:"flex", gap:"1vw", alignItems:"flex-start" }}>
              <svg width="1.4vw" height="1.4vw" viewBox="0 0 24 24" fill="none" stroke="#7C6BF0" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink:0, marginTop:"0.2vh" }}><polyline points="20 6 9 17 4 12"/></svg>
              <div><span style={{ fontSize:"1.2vw", fontWeight:600 }}>AI captions and images</span><span style={{ fontSize:"1.1vw", color:"rgba(255,255,255,0.5)" }}> — generated for every social post</span></div>
            </div>
            <div style={{ display:"flex", gap:"1vw", alignItems:"flex-start" }}>
              <svg width="1.4vw" height="1.4vw" viewBox="0 0 24 24" fill="none" stroke="#7C6BF0" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink:0, marginTop:"0.2vh" }}><polyline points="20 6 9 17 4 12"/></svg>
              <div><span style={{ fontSize:"1.2vw", fontWeight:600 }}>Multi-scene promo video generator</span><span style={{ fontSize:"1.1vw", color:"rgba(255,255,255,0.5)" }}> — ElevenLabs music + ffmpeg rendering</span></div>
            </div>
            <div style={{ display:"flex", gap:"1vw", alignItems:"flex-start" }}>
              <svg width="1.4vw" height="1.4vw" viewBox="0 0 24 24" fill="none" stroke="#7C6BF0" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink:0, marginTop:"0.2vh" }}><polyline points="20 6 9 17 4 12"/></svg>
              <div><span style={{ fontSize:"1.2vw", fontWeight:600 }}>Floor plan and diagram generator</span><span style={{ fontSize:"1.1vw", color:"rgba(255,255,255,0.5)" }}> — architectural AI assistant</span></div>
            </div>
            <div style={{ display:"flex", gap:"1vw", alignItems:"flex-start" }}>
              <svg width="1.4vw" height="1.4vw" viewBox="0 0 24 24" fill="none" stroke="#4F7FFF" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink:0, marginTop:"0.2vh" }}><polyline points="20 6 9 17 4 12"/></svg>
              <div><span style={{ fontSize:"1.2vw", fontWeight:600 }}>AI voice calls</span><span style={{ fontSize:"1.1vw", color:"rgba(255,255,255,0.5)" }}> — Twilio + ElevenLabs TTS for campaigns</span></div>
            </div>
            <div style={{ display:"flex", gap:"1vw", alignItems:"flex-start" }}>
              <svg width="1.4vw" height="1.4vw" viewBox="0 0 24 24" fill="none" stroke="#4F7FFF" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink:0, marginTop:"0.2vh" }}><polyline points="20 6 9 17 4 12"/></svg>
              <div><span style={{ fontSize:"1.2vw", fontWeight:600 }}>Automated data analysis</span><span style={{ fontSize:"1.1vw", color:"rgba(255,255,255,0.5)" }}> — spreadsheet upload + AI business insights</span></div>
            </div>
            <div style={{ display:"flex", gap:"1vw", alignItems:"flex-start" }}>
              <svg width="1.4vw" height="1.4vw" viewBox="0 0 24 24" fill="none" stroke="#7C6BF0" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink:0, marginTop:"0.2vh" }}><polyline points="20 6 9 17 4 12"/></svg>
              <div><span style={{ fontSize:"1.2vw", fontWeight:600 }}>AI app review</span><span style={{ fontSize:"1.1vw", color:"rgba(255,255,255,0.5)" }}> — automated quality gate on the App Store</span></div>
            </div>
            <div style={{ display:"flex", gap:"1vw", alignItems:"flex-start" }}>
              <svg width="1.4vw" height="1.4vw" viewBox="0 0 24 24" fill="none" stroke="#7C6BF0" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink:0, marginTop:"0.2vh" }}><polyline points="20 6 9 17 4 12"/></svg>
              <div><span style={{ fontSize:"1.2vw", fontWeight:600 }}>AI Content Studio</span><span style={{ fontSize:"1.1vw", color:"rgba(255,255,255,0.5)" }}> — social and marketing campaign generation</span></div>
            </div>
          </div>
        </div>

        {/* Right: decorative AI visual */}
        <div style={{ flex:1, height:"60vh", display:"flex", flexDirection:"column", gap:"1.5vh", alignItems:"stretch" }}>
          {/* Mock AI generation card */}
          <div style={{ flex:1, backgroundColor:"#131726", border:"1px solid rgba(124,107,240,0.2)", borderRadius:"1vw", padding:"2vh 2vw", display:"flex", flexDirection:"column", gap:"1vh", overflow:"hidden" }}>
            <div style={{ display:"flex", alignItems:"center", gap:"0.8vw", marginBottom:"0.5vh" }}>
              <div style={{ width:"1vw", height:"1vw", borderRadius:"50%", backgroundColor:"#FF5F56" }} />
              <div style={{ width:"1vw", height:"1vw", borderRadius:"50%", backgroundColor:"#FFBD2E" }} />
              <div style={{ width:"1vw", height:"1vw", borderRadius:"50%", backgroundColor:"#27C93F" }} />
              <div style={{ flex:1, height:"0.8vh", backgroundColor:"rgba(255,255,255,0.05)", borderRadius:"0.2vw", marginLeft:"0.5vw" }} />
            </div>
            <div style={{ display:"flex", gap:"1vw" }}>
              <div style={{ flex:2, display:"flex", flexDirection:"column", gap:"1vh" }}>
                <div style={{ height:"0.8vh", width:"70%", backgroundColor:"rgba(124,107,240,0.3)", borderRadius:"0.2vw" }} />
                <div style={{ height:"0.6vh", width:"90%", backgroundColor:"rgba(255,255,255,0.07)", borderRadius:"0.2vw" }} />
                <div style={{ height:"0.6vh", width:"60%", backgroundColor:"rgba(255,255,255,0.07)", borderRadius:"0.2vw" }} />
              </div>
              <div style={{ flex:1, height:"7vh", backgroundColor:"rgba(124,107,240,0.15)", borderRadius:"0.5vw", border:"1px solid rgba(124,107,240,0.2)" }} />
            </div>
            <div style={{ flex:1, backgroundColor:"rgba(124,107,240,0.06)", borderRadius:"0.5vw", border:"1px dashed rgba(124,107,240,0.2)", display:"flex", alignItems:"center", justifyContent:"center" }}>
              <div style={{ fontSize:"0.9vw", color:"rgba(124,107,240,0.7)", fontWeight:500 }}>Generating post caption...</div>
            </div>
          </div>

          {/* Stats bar */}
          <div style={{ display:"flex", gap:"1.5vw" }}>
            <div style={{ flex:1, backgroundColor:"#131726", border:"1px solid rgba(79,127,255,0.15)", borderRadius:"0.8vw", padding:"1.5vh 1.5vw", textAlign:"center" }}>
              <div style={{ fontSize:"2.2vw", fontWeight:800, color:"#4F7FFF", lineHeight:1 }}>7</div>
              <div style={{ fontSize:"0.85vw", color:"rgba(255,255,255,0.4)", marginTop:"0.4vh" }}>AI capabilities</div>
            </div>
            <div style={{ flex:1, backgroundColor:"#131726", border:"1px solid rgba(124,107,240,0.15)", borderRadius:"0.8vw", padding:"1.5vh 1.5vw", textAlign:"center" }}>
              <div style={{ fontSize:"2.2vw", fontWeight:800, color:"#7C6BF0", lineHeight:1 }}>3</div>
              <div style={{ fontSize:"0.85vw", color:"rgba(255,255,255,0.4)", marginTop:"0.4vh" }}>AI providers</div>
            </div>
            <div style={{ flex:1, backgroundColor:"#131726", border:"1px solid rgba(255,255,255,0.07)", borderRadius:"0.8vw", padding:"1.5vh 1.5vw", textAlign:"center" }}>
              <div style={{ fontSize:"2.2vw", fontWeight:800, color:"rgba(255,255,255,0.8)", lineHeight:1 }}>0</div>
              <div style={{ fontSize:"0.85vw", color:"rgba(255,255,255,0.4)", marginTop:"0.4vh" }}>Extra charge</div>
            </div>
          </div>
        </div>
      </div>

      <div style={{ position:"absolute", bottom:"5vh", left:"5vw", fontSize:"0.9vw", color:"rgba(255,255,255,0.35)", letterSpacing:"0.06em" }}>AWAJIMAA TECHNOLOGIES</div>
      <div style={{ position:"absolute", bottom:"5vh", right:"5vw", fontSize:"0.9vw", color:"rgba(255,255,255,0.35)", letterSpacing:"0.06em" }}>05 / 10</div>
    </div>
  );
}
