import { useState, useMemo } from "react";
import { MO } from "../data/defaults";
import { fm, f$, fC, dF } from "../utils/format";
import { T, tbl, th, td } from "../utils/theme";
import { Bg } from "./Shared";

export default function ShippingTab({ ships, prod, frt, gld }) {
  var svState = useState("unified");
  var sv = svState[0], setSv = svState[1];
  var hlState = useState(null);
  var hl = hlState[0], setHl = hlState[1];

  var unified = useMemo(function() {
    if (!prod || !ships || !gld) return [];
    var rows = [];
    var cumArrB = 0, cumArrL = 0;
    var cumDemand = 0, lastDemMonth = -1;

    var arrByWeek = {};
    for (var si = 0; si < ships.length; si++) {
      var sh = ships[si];
      var aw = sh.bAr ? sh.bAr.getTime() : 0;
      var bestWk = null, bestDist = Infinity;
      for (var pi = 0; pi < prod.length; pi++) {
        var dist = Math.abs(prod[pi].wk.getTime() - aw);
        if (dist < bestDist) { bestDist = dist; bestWk = prod[pi].wk.getTime(); }
      }
      if (bestWk !== null) {
        if (!arrByWeek[bestWk]) arrByWeek[bestWk] = [];
        arrByWeek[bestWk].push(sh);
      }
    }

    var shipByWeek = {};
    for (var si2 = 0; si2 < ships.length; si2++) {
      var sh2 = ships[si2];
      var sw = sh2.bSd ? sh2.bSd.getTime() : 0;
      var bestWk2 = null, bestDist2 = Infinity;
      for (var pi2 = 0; pi2 < prod.length; pi2++) {
        var dist2 = Math.abs(prod[pi2].wk.getTime() - sw);
        if (dist2 < bestDist2) { bestDist2 = dist2; bestWk2 = prod[pi2].wk.getTime(); }
      }
      if (bestWk2 !== null) {
        if (!shipByWeek[bestWk2]) shipByWeek[bestWk2] = [];
        shipByWeek[bestWk2].push(sh2);
      }
    }

    for (var wi = 0; wi < prod.length; wi++) {
      var w = prod[wi];
      if (w.bC === 0 && w.lC === 0 && w.bW === 0 && w.lW === 0) continue;
      var wt = w.wk.getTime();

      var shipping = shipByWeek[wt] || [];
      var arrivals = arrByWeek[wt] || [];
      var arrB = 0, arrL = 0;
      for (var ai = 0; ai < arrivals.length; ai++) { arrB += arrivals[ai].bQ; arrL += arrivals[ai].lQ; }
      cumArrB += arrB; cumArrL += arrL;

      var wkMonth = w.wk.getMonth();
      var monthDemand = 0;
      if (wkMonth > lastDemMonth && gld[wkMonth] > 0) {
        monthDemand = gld[wkMonth];
        cumDemand += monthDemand;
        lastDemMonth = wkMonth;
      }

      var cumArrived = cumArrB + cumArrL;
      var stockOnHand = cumArrived - cumDemand;
      var stockB = cumArrB - cumDemand;
      var stockL = cumArrL - cumDemand;

      var mosVal = 0;
      if (stockOnHand > 0 && wkMonth < 12) {
        var remStock = stockOnHand;
        for (var fm2 = wkMonth; fm2 < 12; fm2++) {
          var mDem = gld[fm2] || 0;
          if (mDem <= 0) continue;
          if (remStock >= mDem) { remStock -= mDem; mosVal += 1; }
          else { mosVal += remStock / mDem; remStock = 0; break; }
        }
      }

      rows.push({
        wk: w.wk, bW: w.bW, lW: w.lW, bC: w.bC, lC: w.lC,
        shipping: shipping, arrivals: arrivals,
        arrB: arrB, arrL: arrL, cumArrB: cumArrB, cumArrL: cumArrL,
        cumArrived: cumArrived, monthDemand: monthDemand,
        cumDemand: cumDemand, stockOnHand: stockOnHand, stockB: stockB, stockL: stockL,
        monthsOfStock: mosVal
      });
    }
    return rows;
  }, [prod, ships, gld]);

  var hlBg = "#dbeafe";

  return (
    <div style={{ padding: "14px 18px" }}>
      <div style={{ display: "flex", gap: 8, marginBottom: 12, flexWrap: "wrap" }}>
        {["Standard Ocean","Fast Boat","Air"].map(function(m) {
          var d = frt.byM[m] || { n:0,u:0,c:0,b:0,l:0 };
          var cl = {"Standard Ocean":{bd:"#16a34a",ac:T.GR},"Fast Boat":{bd:"#2563eb",ac:T.AC},"Air":{bd:"#d97706",ac:T.AM}}[m];
          return (
            <div key={m} style={{ flex:"1 1 150px", background:T.S2, borderRadius:7, padding:"8px 12px", border:"1px solid "+cl.bd, minWidth:150 }}>
              <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:4 }}><Bg method={m}/><span style={{ color:cl.ac, fontWeight:700, fontSize:15, fontFamily:"'JetBrains Mono',monospace" }}>{d.n}</span></div>
              <div style={{ color:T.T2, fontSize:10 }}>Bases: <span style={{ color:T.GR, fontWeight:600 }}>{fm(d.b)}</span></div>
              <div style={{ color:T.T2, fontSize:10 }}>Lids: <span style={{ color:T.AC, fontWeight:600 }}>{fm(d.l)}</span></div>
              <div style={{ color:T.T2, fontSize:10 }}>Cost: <span style={{ color:cl.ac, fontWeight:600 }}>{d.c===0?"FREE":f$(d.c)}</span></div>
            </div>);
        })}
        <div style={{ flex:"1 1 150px", background:T.S2, borderRadius:7, padding:"8px 12px", border:"1px solid "+T.BD, minWidth:150 }}>
          <div style={{ color:T.T2, fontSize:9, textTransform:"uppercase", marginBottom:2 }}>Total Freight</div>
          <div style={{ color:T.AM, fontSize:19, fontWeight:700, fontFamily:"'JetBrains Mono',monospace" }}>{f$(frt.tot)}</div>
          <div style={{ color:T.T2, fontSize:10 }}>Avg: {frt.units>0?fC(frt.tot/frt.units):"\u2014"}/unit</div>
        </div>
      </div>
      <div style={{ display:"flex", gap:5, marginBottom:12 }}>
        {[["unified","Production \u2192 Shipping \u2192 Inventory"],["shipments","Shipment Details"],["production","Production Only"]].map(function(v) {
          var k = v[0], l = v[1], a = sv===k;
          return <button key={k} onClick={function() { setSv(k); setHl(null); }} style={{ padding:"4px 12px", borderRadius:5, border:"1px solid "+(a?T.AC:T.BD), background:a?T.AC+"15":"transparent", color:a?T.AC:T.T2, cursor:"pointer", fontSize:11, fontWeight:600, fontFamily:"inherit" }}>{l}</button>;
        })}
      </div>

      {sv==="unified" && (
        <div style={{ overflowX:"auto", maxHeight:"calc(100vh - 240px)", overflowY:"auto" }}>
          <table style={tbl}>
            <thead>
              <tr>
                <th style={{ ...th, top:0, zIndex:3 }} rowSpan={2}>Week Of</th>
                <th style={{ ...th, textAlign:"center", borderBottom:"2px solid "+T.GR, color:T.GR, top:0, zIndex:3 }} colSpan={4}>Production</th>
                <th style={{ ...th, textAlign:"center", borderBottom:"2px solid "+T.AC, color:T.AC, top:0, zIndex:3 }} colSpan={5}>Shipping</th>
                <th style={{ ...th, textAlign:"center", borderBottom:"2px solid "+T.AM, color:T.AM, top:0, zIndex:3 }} colSpan={6}>Inventory at Calyx</th>
              </tr>
              <tr>
                <th style={{ ...th, textAlign:"right", fontSize:9, color:T.GR, top:28, zIndex:2 }}>Base Wk</th>
                <th style={{ ...th, textAlign:"right", fontSize:9, color:T.AC, top:28, zIndex:2 }}>Lid Wk</th>
                <th style={{ ...th, textAlign:"right", fontSize:9, color:T.GR, top:28, zIndex:2 }}>Base Cum</th>
                <th style={{ ...th, textAlign:"right", fontSize:9, color:T.AC, top:28, zIndex:2 }}>Lid Cum</th>
                <th style={{ ...th, textAlign:"left", fontSize:9, top:28, zIndex:2 }}>Method</th>
                <th style={{ ...th, textAlign:"right", fontSize:9, color:T.GR, top:28, zIndex:2 }}>Bases</th>
                <th style={{ ...th, textAlign:"right", fontSize:9, color:T.AC, top:28, zIndex:2 }}>Lids</th>
                <th style={{ ...th, textAlign:"right", fontSize:9, top:28, zIndex:2 }}>Cost</th>
                <th style={{ ...th, textAlign:"left", fontSize:9, top:28, zIndex:2 }}>Arrival</th>
                <th style={{ ...th, textAlign:"right", fontSize:9, color:T.GR, top:28, zIndex:2 }}>Base Arr</th>
                <th style={{ ...th, textAlign:"right", fontSize:9, color:T.AC, top:28, zIndex:2 }}>Lid Arr</th>
                <th style={{ ...th, textAlign:"right", fontSize:9, top:28, zIndex:2 }}>Demand</th>
                <th style={{ ...th, textAlign:"right", fontSize:9, color:T.GR, top:28, zIndex:2 }}>Base Stk</th>
                <th style={{ ...th, textAlign:"right", fontSize:9, color:T.AC, top:28, zIndex:2 }}>Lid Stk</th>
                <th style={{ ...th, textAlign:"right", fontSize:9, top:28, zIndex:2 }}>Mo. Stock</th>
              </tr>
            </thead>
            <tbody>
              {unified.map(function(r, i) {
                var firstShip = r.shipping.length > 0 ? r.shipping[0] : null;
                var extraShips = r.shipping.length > 1 ? r.shipping.slice(1) : [];
                var negStock = r.stockOnHand < 0;
                var isHl = hl === "u"+i;

                var rowBg = isHl ? hlBg : (i%2===0 ? "transparent" : T.S2);

                var mainRow = (
                  <tr key={"m"+i} onClick={function() { setHl(hl === "u"+i ? null : "u"+i); }} style={{ background: rowBg, cursor:"pointer", transition:"background 0.1s" }}>
                    <td style={td}>{dF(r.wk)}</td>
                    <td style={{ ...td, textAlign:"right", color:r.bW>0?T.GR:T.T2 }}>{r.bW>0?fm(r.bW):""}</td>
                    <td style={{ ...td, textAlign:"right", color:r.lW>0?T.AC:T.T2 }}>{r.lW>0?fm(r.lW):""}</td>
                    <td style={{ ...td, textAlign:"right", color:T.GR, fontSize:11 }}>{r.bC>0?fm(r.bC):""}</td>
                    <td style={{ ...td, textAlign:"right", color:T.AC, fontSize:11 }}>{r.lC>0?fm(r.lC):""}</td>
                    <td style={td}>{firstShip ? <Bg method={firstShip.meth}/> : ""}</td>
                    <td style={{ ...td, textAlign:"right", fontWeight:firstShip?600:400, color:T.GR }}>{firstShip && firstShip.bQ > 0 ? fm(firstShip.bQ) : ""}</td>
                    <td style={{ ...td, textAlign:"right", fontWeight:firstShip?600:400, color:T.AC }}>{firstShip && firstShip.lQ > 0 ? fm(firstShip.lQ) : ""}</td>
                    <td style={{ ...td, textAlign:"right", color:firstShip&&firstShip.cost>0?T.AM:T.GR, fontWeight:firstShip?600:400 }}>{firstShip ? (firstShip.cost===0?"FREE":f$(firstShip.cost)) : ""}</td>
                    <td style={{ ...td, color:T.T2, fontSize:11 }}>{firstShip ? dF(firstShip.bAr) : ""}</td>
                    <td style={{ ...td, textAlign:"right", color:T.GR }}>{r.cumArrB>0?fm(r.cumArrB):""}</td>
                    <td style={{ ...td, textAlign:"right", color:T.AC }}>{r.cumArrL>0?fm(r.cumArrL):""}</td>
                    <td style={{ ...td, textAlign:"right", color:r.monthDemand>0?"#9333ea":T.T2 }}>{r.cumDemand>0?fm(r.cumDemand):""}</td>
                    <td style={{ ...td, textAlign:"right", fontWeight:600, color:r.stockB<0?"#dc2626":r.stockB>0?T.GR:T.T2 }}>{r.cumArrB>0||r.cumDemand>0?fm(r.stockB):""}</td>
                    <td style={{ ...td, textAlign:"right", fontWeight:600, color:r.stockL<0?"#dc2626":r.stockL>0?T.AC:T.T2 }}>{r.cumArrL>0||r.cumDemand>0?fm(r.stockL):""}</td>
                    <td style={{ ...td, textAlign:"right", color:r.monthsOfStock<3&&r.cumDemand>0?"#dc2626":r.monthsOfStock>=3?T.GR:T.T2, fontSize:11 }}>{r.cumDemand>0?r.monthsOfStock.toFixed(1):""}</td>
                  </tr>
                );

                var subRows = extraShips.map(function(esh, si) {
                  var subHl = hl === "u"+i;
                  return (
                    <tr key={"s"+i+"-"+si} onClick={function() { setHl(hl === "u"+i ? null : "u"+i); }} style={{ background: subHl ? hlBg : (i%2===0?"transparent":T.S2), cursor:"pointer" }}>
                      <td style={td}></td><td style={td}></td><td style={td}></td><td style={td}></td><td style={td}></td>
                      <td style={td}><Bg method={esh.meth}/></td>
                      <td style={{ ...td, textAlign:"right", fontWeight:600, color:T.GR }}>{esh.bQ > 0 ? fm(esh.bQ) : ""}</td>
                      <td style={{ ...td, textAlign:"right", fontWeight:600, color:T.AC }}>{esh.lQ > 0 ? fm(esh.lQ) : ""}</td>
                      <td style={{ ...td, textAlign:"right", color:esh.cost>0?T.AM:T.GR, fontWeight:600 }}>{esh.cost===0?"FREE":f$(esh.cost)}</td>
                      <td style={{ ...td, color:T.T2, fontSize:11 }}>{dF(esh.bAr)}</td>
                      <td style={td}></td><td style={td}></td><td style={td}></td><td style={td}></td><td style={td}></td><td style={td}></td>
                    </tr>
                  );
                });

                return [mainRow].concat(subRows);
              })}
            </tbody>
          </table>
        </div>
      )}

      {sv==="shipments" && (
        <div style={{ overflowX:"auto", maxHeight:"calc(100vh - 240px)", overflowY:"auto" }}><table style={tbl}><thead><tr>
          <th style={th}>#</th><th style={th}>Mo.</th><th style={th}>Method</th><th style={th}>Container</th><th style={{ ...th, textAlign:"center" }}>Pallets</th>
          <th style={{ ...th, textAlign:"right", color:T.GR }}>Bases</th><th style={{ ...th, textAlign:"right", color:T.AC }}>Lids</th><th style={{ ...th, textAlign:"right" }}>Total</th>
          <th style={th}>Ship</th><th style={th}>Arrival</th>
          <th style={{ ...th, textAlign:"right" }}>Cost</th><th style={{ ...th, textAlign:"right" }}>$/Unit</th>
        </tr></thead><tbody>
          {ships.length===0 && <tr><td colSpan={12} style={{ ...td, textAlign:"center", color:T.T2, padding:18 }}>No shipments</td></tr>}
          {ships.map(function(sh,i) {
            var cpu = sh.tQ>0 ? sh.cost/sh.tQ : 0;
            var isHl2 = hl === "d"+i;
            return (
              <tr key={i} onClick={function() { setHl(hl === "d"+i ? null : "d"+i); }} style={{ background: isHl2 ? hlBg : (i%2===0?"transparent":T.S2), cursor:"pointer", transition:"background 0.1s" }}>
                <td style={{ ...td, color:T.T2 }}>{i+1}</td>
                <td style={{ ...td, fontWeight:600 }}>{MO[sh.mo]}</td>
                <td style={td}><Bg method={sh.meth}/>{sh.preShip && <span style={{ marginLeft:4, fontSize:8, color:T.GR, fontWeight:700 }}>PRE</span>}{sh.consolidated && <span style={{ marginLeft:4, fontSize:8, color:T.AM, fontWeight:700 }}>COMB</span>}</td>
                <td style={{ ...td, color:T.T2, fontSize:11 }}>{sh.cn}</td><td style={{ ...td, textAlign:"center", fontSize:10, color:T.T2 }}>{sh.bPal != null ? (sh.bPal + "B/" + sh.lPal + "L") : "\u2014"}</td>
                <td style={{ ...td, textAlign:"right", color:T.GR, fontWeight:600 }}>{fm(sh.bQ)}</td>
                <td style={{ ...td, textAlign:"right", color:T.AC, fontWeight:600 }}>{fm(sh.lQ)}</td>
                <td style={{ ...td, textAlign:"right", fontWeight:700 }}>{fm(sh.tQ)}</td>
                <td style={{ ...td, color:T.T2, fontSize:11 }}>{dF(sh.bSd)}</td>
                <td style={{ ...td, color:T.T2, fontSize:11 }}>{dF(sh.bAr)}</td>
                <td style={{ ...td, textAlign:"right", color:sh.cost>0?T.AM:T.GR, fontWeight:700 }}>{sh.cost===0?"FREE":f$(sh.cost)}</td>
                <td style={{ ...td, textAlign:"right", color:T.T2, fontSize:11 }}>{sh.cost===0?"$0.00":fC(cpu)}</td>
              </tr>);
          })}
        </tbody></table></div>
      )}

      {sv==="production" && (
        <div style={{ overflowX:"auto", maxHeight:"calc(100vh - 240px)", overflowY:"auto" }}><table style={tbl}><thead>
          <tr><th style={{ ...th, top:0, zIndex:3 }} rowSpan={2}>Week Of</th><th style={{ ...th, textAlign:"center", borderBottom:"2px solid #16a34a", color:T.GR, top:0, zIndex:3 }} colSpan={3}>Base (Jar/HDPE)</th><th style={{ ...th, textAlign:"center", borderBottom:"2px solid "+T.AC, color:T.AC, top:0, zIndex:3 }} colSpan={3}>Lid (Cap/PP)</th><th style={{ ...th, textAlign:"center", top:0, zIndex:3 }} colSpan={2}>Combined</th></tr>
          <tr><th style={{ ...th, textAlign:"right", top:28, zIndex:2 }}>Weekly</th><th style={{ ...th, textAlign:"right", top:28, zIndex:2 }}>Cumul</th><th style={{ ...th, textAlign:"right", top:28, zIndex:2 }}>Surplus</th><th style={{ ...th, textAlign:"right", top:28, zIndex:2 }}>Weekly</th><th style={{ ...th, textAlign:"right", top:28, zIndex:2 }}>Cumul</th><th style={{ ...th, textAlign:"right", top:28, zIndex:2 }}>Surplus</th><th style={{ ...th, textAlign:"right", top:28, zIndex:2 }}>Total</th><th style={{ ...th, textAlign:"right", top:28, zIndex:2 }}>Shippable</th></tr>
        </thead><tbody>
          {prod.filter(function(w) { return w.bW>0||w.lW>0||w.bC>0; }).map(function(w,i) {
            var isHl3 = hl === "p"+i;
            return (
              <tr key={i} onClick={function() { setHl(hl === "p"+i ? null : "p"+i); }} style={{ background: isHl3 ? hlBg : (i%2===0?"transparent":T.S2), cursor:"pointer", transition:"background 0.1s" }}>
                <td style={td}>{dF(w.wk)}</td>
                <td style={{ ...td, textAlign:"right", color:w.bW>0?T.GR:T.T2 }}>{fm(w.bW)}</td>
                <td style={{ ...td, textAlign:"right" }}>{fm(w.bC)}</td>
                <td style={{ ...td, textAlign:"right", color:w.surT==="base"?T.AM:T.T2 }}>{w.surT==="base"?fm(w.sur):"\u2014"}</td>
                <td style={{ ...td, textAlign:"right", color:w.lW>0?T.AC:T.T2 }}>{fm(w.lW)}</td>
                <td style={{ ...td, textAlign:"right" }}>{fm(w.lC)}</td>
                <td style={{ ...td, textAlign:"right", color:w.surT==="lid"?T.AM:T.T2 }}>{w.surT==="lid"?fm(w.sur):"\u2014"}</td>
                <td style={{ ...td, textAlign:"right", fontWeight:600 }}>{fm(w.tot)}</td>
                <td style={{ ...td, textAlign:"right", fontWeight:700, color:T.GR }}>{fm(w.ship)}</td>
              </tr>
            );
          })}
        </tbody></table></div>
      )}
    </div>
  );
}
