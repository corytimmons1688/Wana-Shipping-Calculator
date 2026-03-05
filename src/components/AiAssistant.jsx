import { useState, useRef, useEffect } from "react";
import { T } from "../utils/theme";
import { fm, f$ } from "../utils/format";

function buildContext(sc, gld, ships, prod, frt, cap, airCost) {
  var mo = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
  var lines = [];
  lines.push("=== CURRENT SCENARIO: " + (sc.name || "Base Plan") + " ===");
  lines.push("");

  // Key metrics
  var annD = gld.reduce(function(a,b){ return a+b; }, 0);
  lines.push("SUMMARY:");
  lines.push("- Annual demand (all markets): " + annD.toLocaleString());
  lines.push("- Go-live demand: " + annD.toLocaleString());
  lines.push("- Total freight cost: $" + frt.tot.toLocaleString());
  lines.push("- CAPEX: $" + cap.grand.toLocaleString());
  lines.push("- Active markets: " + sc.markets.filter(function(m){ return m.goLive != null; }).length + "/" + sc.markets.length);
  lines.push("");

  // Shipping breakdown
  lines.push("FREIGHT BREAKDOWN:");
  for (var meth of ["Standard Ocean", "Fast Boat", "Air"]) {
    var d = frt.byM[meth];
    if (d) lines.push("- " + meth + ": " + d.n + " shipments, " + d.b.toLocaleString() + " bases + " + d.l.toLocaleString() + " lids, cost: $" + d.c.toLocaleString());
  }
  lines.push("");

  // Air detail
  var airShips = ships.filter(function(s){ return s.meth === "Air"; });
  if (airShips.length > 0) {
    lines.push("AIR SHIPMENTS (detail):");
    for (var ash of airShips) {
      lines.push("- " + mo[ash.mo] + ": " + ash.bQ.toLocaleString() + " bases ($" + (ash.bQ * airCost.base).toLocaleString() + ") + " + ash.lQ.toLocaleString() + " lids ($" + (ash.lQ * airCost.lid).toLocaleString() + ") = $" + ash.cost.toLocaleString());
    }
    lines.push("");
  }

  // Production milestones
  lines.push("PRODUCTION:");
  lines.push("- Proto Base: " + sc.molds.base.proto.daily + "/day x " + sc.molds.base.proto.qty + " mold(s), starts " + sc.molds.base.proto.avail + ", lifespan: " + (sc.molds.base.proto.life || "unlimited"));
  lines.push("- Proto Lid: " + sc.molds.lid.proto.daily + "/day x " + sc.molds.lid.proto.qty + " mold(s), starts " + sc.molds.lid.proto.avail + ", lifespan: " + (sc.molds.lid.proto.life || "unlimited"));
  lines.push("- Prod Base: " + sc.molds.base.prod.daily + "/day x " + sc.molds.base.prod.qty + " mold(s), starts " + sc.molds.base.prod.avail);
  lines.push("- Prod Lid: " + sc.molds.lid.prod.daily + "/day x " + sc.molds.lid.prod.qty + " mold(s), starts " + sc.molds.lid.prod.avail);
  lines.push("- Base weekly (prod): " + (sc.molds.base.prod.daily * sc.molds.base.prod.qty * sc.molds.base.prod.days).toLocaleString());
  lines.push("- Lid weekly (prod): " + (sc.molds.lid.prod.daily * sc.molds.lid.prod.qty * sc.molds.lid.prod.days).toLocaleString());
  lines.push("");

  // Shipping settings
  lines.push("SHIPPING SETTINGS:");
  lines.push("- Base lead time: " + sc.params.baseLeadDays + " days before month");
  lines.push("- Lid lead time: " + sc.params.lidLeadDays + " days before month");
  for (var sm of sc.shipping) {
    lines.push("- " + sm.method + ": " + sm.transitDays + " day transit");
  }
  lines.push("- Air cost: $" + airCost.base + "/base, $" + airCost.lid + "/lid");
  lines.push("- Containers: 20'HC $" + sc.containers["20HC"].cost.toLocaleString() + " (" + sc.containers["20HC"].pallets + " pallets, min " + sc.containers["20HC"].minPal + "), 40'HC $" + sc.containers["40HC"].cost.toLocaleString() + " (" + sc.containers["40HC"].pallets + " pallets, min " + sc.containers["40HC"].minPal + ")");
  lines.push("- Ocean/FB pallets: " + sc.pallet.basePP.toLocaleString() + " bases/pallet, " + sc.pallet.lidPP.toLocaleString() + " lids/pallet");
  lines.push("- Air pallets: " + (sc.pallet.airBasePP || 7500).toLocaleString() + " bases/pallet, " + (sc.pallet.airLidPP || 25000).toLocaleString() + " lids/pallet");
  lines.push("");

  // Go-live demand by month
  lines.push("GO-LIVE DEMAND BY MONTH:");
  for (var i = 0; i < 12; i++) {
    if (gld[i] > 0) lines.push("- " + mo[i] + ": " + gld[i].toLocaleString());
  }
  lines.push("");

  // Markets
  lines.push("MARKETS:");
  for (var mk of sc.markets) {
    if (mk.goLive != null) {
      var ann = mk.demand.reduce(function(a,b){ return a+b; }, 0);
      lines.push("- " + mk.name + ": go-live " + mo[mk.goLive - 1] + ", annual " + ann.toLocaleString() + (mk.priority ? " (PRIORITY)" : ""));
    }
  }
  lines.push("");

  // All shipments
  lines.push("ALL SHIPMENTS:");
  for (var si = 0; si < ships.length; si++) {
    var s = ships[si];
    lines.push((si+1) + ". " + mo[s.mo] + " | " + s.meth + " | " + (s.cn || "") + " | B:" + s.bQ.toLocaleString() + " L:" + s.lQ.toLocaleString() + " | $" + s.cost.toLocaleString() + (s.preShip ? " [PRE-SHIP]" : ""));
  }

  // Mold costs
  lines.push("");
  lines.push("CAPITAL EXPENSES:");
  lines.push("- Production molds: $" + cap.mT.toLocaleString() + " (Base: $" + cap.bCost.toLocaleString() + ", Lid: $" + cap.lCost.toLocaleString() + ")");
  lines.push("- Prototype molds: $" + cap.pT.toLocaleString());
  lines.push("- Equipment: $" + cap.eT.toLocaleString());
  lines.push("- TOTAL CAPEX: $" + cap.grand.toLocaleString());

  return lines.join("\n");
}

var SYSTEM_PROMPT = "You are the Wana Shipping Optimizer AI assistant. You help users analyze their production and shipping logistics data, identify cost optimization opportunities, and explain why the optimizer makes specific decisions.\n\nYou have access to the current scenario data provided below. Answer questions specifically about this data. Be concise and use numbers. When suggesting optimizations, quantify the expected savings.\n\nKey concepts:\n- Ocean shipping is FREE but requires full containers (min pallet utilization)\n- Fast Boat costs per container ($9,500 for 20'HC, $14,300 for 40'HC)\n- Air is per-unit pricing, different for bases vs lids\n- The optimizer prioritizes: Ocean (free) > Fast Boat > Air\n- Bases and lids are separate components with different production timelines\n- The lid production mold starts later than base, creating a bottleneck\n- Shipments must arrive before the demand month (base lead time and lid lead time)\n\nDo NOT suggest changes outside the shipping/logistics domain. Focus on actionable insights from the data.";

export default function AiAssistant({ sc, gld, ships, prod, frt, cap }) {
  var openState = useState(false);
  var isOpen = openState[0], setOpen = openState[1];
  var msgsState = useState([]);
  var msgs = msgsState[0], setMsgs = msgsState[1];
  var inputState = useState("");
  var input = inputState[0], setInput = inputState[1];
  var loadState = useState(false);
  var loading = loadState[0], setLoading = loadState[1];
  var endRef = useRef(null);

  useEffect(function() {
    if (endRef.current) endRef.current.scrollIntoView({ behavior: "smooth" });
  }, [msgs]);

  function sendMessage() {
    if (!input.trim() || loading) return;
    var userMsg = input.trim();
    setInput("");
    var newMsgs = msgs.concat([{ role: "user", content: userMsg }]);
    setMsgs(newMsgs);
    setLoading(true);

    var context = buildContext(sc, gld, ships, prod, frt, cap, sc.airCost);

    var apiMsgs = [{ role: "user", content: "Here is the current scenario data:\n\n" + context }];
    apiMsgs.push({ role: "assistant", content: "I've reviewed the current scenario data. I can see all the production timelines, shipping plan, costs, and market demand. What would you like to know?" });

    for (var i = 0; i < newMsgs.length; i++) {
      apiMsgs.push({ role: newMsgs[i].role, content: newMsgs[i].content });
    }

    fetch("/api/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "claude-sonnet-4-5-20250514",
        max_tokens: 1000,
        system: SYSTEM_PROMPT,
        messages: apiMsgs
      })
    })
    .then(function(r) { return r.json(); })
    .then(function(data) {
      var text = "";
      if (data.error) {
        text = "API Error: " + (typeof data.error === "string" ? data.error : JSON.stringify(data.error));
      } else if (data.content) {
        for (var j = 0; j < data.content.length; j++) {
          if (data.content[j].type === "text") text += data.content[j].text;
        }
      }
      setMsgs(function(prev) { return prev.concat([{ role: "assistant", content: text || "No response content received. Raw: " + JSON.stringify(data).substring(0, 200) }]); });
      setLoading(false);
    })
    .catch(function(err) {
      setMsgs(function(prev) { return prev.concat([{ role: "assistant", content: "Error connecting to AI: " + err.message }]); });
      setLoading(false);
    });
  }

  if (!isOpen) {
    return (
      <button onClick={function() { setOpen(true); }} style={{
        position: "fixed", bottom: 20, right: 20, width: 52, height: 52,
        borderRadius: "50%", border: "none", background: T.AC, color: "#fff",
        fontSize: 22, cursor: "pointer", boxShadow: "0 4px 16px rgba(37,99,235,0.4)",
        display: "flex", alignItems: "center", justifyContent: "center", zIndex: 999,
        transition: "transform 0.2s"
      }} title="AI Assistant">
        <span style={{ lineHeight: 1 }}>{"\u2728"}</span>
      </button>
    );
  }

  return (
    <div style={{
      position: "fixed", bottom: 20, right: 20, width: 400, height: 520,
      background: T.S1, borderRadius: 12, border: "1px solid " + T.BD,
      boxShadow: "0 8px 32px rgba(0,0,0,0.15)", display: "flex", flexDirection: "column",
      zIndex: 999, overflow: "hidden"
    }}>
      <div style={{
        padding: "12px 16px", background: T.AC, color: "#fff",
        display: "flex", justifyContent: "space-between", alignItems: "center"
      }}>
        <div>
          <div style={{ fontWeight: 700, fontSize: 13 }}>{"\u2728"} Shipping AI Assistant</div>
          <div style={{ fontSize: 10, opacity: 0.8 }}>Ask about your shipping data</div>
        </div>
        <button onClick={function() { setOpen(false); }} style={{
          border: "none", background: "rgba(255,255,255,0.2)", color: "#fff",
          width: 28, height: 28, borderRadius: "50%", cursor: "pointer", fontSize: 16,
          display: "flex", alignItems: "center", justifyContent: "center"
        }}>{"\u00d7"}</button>
      </div>

      <div style={{
        flex: 1, overflowY: "auto", padding: 12, display: "flex", flexDirection: "column", gap: 10
      }}>
        {msgs.length === 0 && (
          <div style={{ color: T.T2, fontSize: 12, textAlign: "center", padding: "24px 12px" }}>
            <div style={{ fontSize: 28, marginBottom: 8 }}>{"\u{1F4E6}"}</div>
            <div style={{ fontWeight: 600, color: T.TX, marginBottom: 6 }}>Ask me anything about your shipping plan</div>
            <div style={{ fontSize: 11, lineHeight: 1.5 }}>
              Try: "Why are lids going Air in July?" or "What if we add a 3rd lid mold?" or "How can I reduce freight costs?"
            </div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 6, justifyContent: "center", marginTop: 12 }}>
              {["Why is Air cost so high?", "What drives the lid bottleneck?", "Which months have the most Air?", "How to reduce freight?"].map(function(q) {
                return <button key={q} onClick={function() { setInput(q); }} style={{
                  padding: "5px 10px", borderRadius: 6, border: "1px solid " + T.BD,
                  background: T.S2, color: T.TX, fontSize: 10, cursor: "pointer",
                  fontFamily: "inherit"
                }}>{q}</button>;
              })}
            </div>
          </div>
        )}

        {msgs.map(function(m, i) {
          var isUser = m.role === "user";
          return (
            <div key={i} style={{
              alignSelf: isUser ? "flex-end" : "flex-start",
              maxWidth: "85%",
              padding: "8px 12px",
              borderRadius: isUser ? "12px 12px 2px 12px" : "12px 12px 12px 2px",
              background: isUser ? T.AC : T.S2,
              color: isUser ? "#fff" : T.TX,
              fontSize: 12, lineHeight: 1.5,
              whiteSpace: "pre-wrap",
              wordBreak: "break-word"
            }}>{m.content}</div>
          );
        })}

        {loading && (
          <div style={{
            alignSelf: "flex-start", maxWidth: "85%", padding: "8px 12px",
            borderRadius: "12px 12px 12px 2px", background: T.S2, color: T.T2, fontSize: 12
          }}>
            <span style={{ display: "inline-block", animation: "pulse 1.5s infinite" }}>Analyzing...</span>
          </div>
        )}

        <div ref={endRef} />
      </div>

      <div style={{
        padding: "10px 12px", borderTop: "1px solid " + T.BD,
        display: "flex", gap: 8, background: T.S1
      }}>
        <input
          value={input}
          onChange={function(e) { setInput(e.target.value); }}
          onKeyDown={function(e) { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendMessage(); } }}
          placeholder="Ask about your shipping data..."
          style={{
            flex: 1, padding: "8px 12px", borderRadius: 8,
            border: "1px solid " + T.BD, background: T.S2, color: T.TX,
            fontSize: 12, fontFamily: "inherit", outline: "none"
          }}
        />
        <button
          onClick={sendMessage}
          disabled={loading || !input.trim()}
          style={{
            padding: "8px 14px", borderRadius: 8, border: "none",
            background: loading || !input.trim() ? T.BD : T.AC,
            color: "#fff", fontSize: 12, fontWeight: 600, cursor: loading ? "default" : "pointer",
            fontFamily: "inherit"
          }}
        >{"\u2191"}</button>
      </div>
    </div>
  );
}
