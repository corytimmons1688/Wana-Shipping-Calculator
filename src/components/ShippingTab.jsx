import { useState, useMemo, useCallback, useRef } from "react";
import { MO } from "../data/defaults";
import { fm, f$, fC, dF } from "../utils/format";
import { T, tbl, th, td } from "../utils/theme";
import { Bg } from "./Shared";
import { optimize as runOptimize, calcGLD } from "../utils/calc";

// FIXED: safe date formatter - returns "—" for null/undefined instead of crashing
function dFS(d) { return d ? dF(d) : "\u2014"; }

export default function ShippingTab({ ships, prod, frt, gld, weeklyDem, sc, upd, updShipEdit, clearShipEdits, hasShipEdits }) {
  var svState = useState("unified");
  var sv = svState[0], setSv = svState[1];
  var hlState = useState(null);
  var hl = hlState[0], setHl = hlState[1];
  var optState = useState(null); // null | "running" | {saved, original}
  var optStatus = optState[0], setOptStatus = optState[1];
  // Inline editing — which cell is open: { idx, field } | null
  var editingState = useState(null);
  var editing = editingState[0], setEditing = editingState[1];

  var doOptimize = useCallback(function() {
    if (!sc) return;
    setOptStatus("running");
    // Use setTimeout so the UI updates with "running" before the heavy computation
    setTimeout(function() {
      var mkts = JSON.parse(JSON.stringify(sc.markets));
      var origGoLives = mkts.map(function(m) { return m.goLive; });

      // Current baseline cost
      function getCost(markets) {
        var sh = runOptimize(markets, sc.molds, sc.shipping, sc.params, sc.containers, sc.pallet, sc.airCost);
        var t = 0; for (var i = 0; i < sh.length; i++) t += sh[i].cost;
        return t;
      }
      var baseCost = getCost(mkts);

      // Build sort order: non-priority first, then array index, then lowest annual demand
      var indices = [];
      for (var i = 0; i < mkts.length; i++) {
        if (mkts[i].goLive == null) continue; // skip markets with no go-live
        var annDem = 0;
        for (var m = 0; m < 12; m++) annDem += (mkts[i].demand[m] || 0);
        indices.push({ idx: i, priority: mkts[i].priority ? 1 : 0, annDem: annDem });
      }
      indices.sort(function(a, b) {
        if (a.priority !== b.priority) return a.priority - b.priority; // non-priority first
        if (a.idx !== b.idx) return a.idx - b.idx; // array order
        return a.annDem - b.annDem; // lowest demand first
      });

      // Greedy: for each market in order, try pushing goLive later to reduce cost
      var improved = true;
      var passes = 0;
      while (improved && passes < 5) {
        improved = false;
        passes++;
        for (var si = 0; si < indices.length; si++) {
          var mktIdx = indices[si].idx;
          var currentGL = mkts[mktIdx].goLive;
          if (currentGL == null || currentGL >= 12) continue;
          var bestGL = currentGL;
          var bestCost = getCost(mkts);
          // Try each later month
          for (var tryGL = currentGL + 1; tryGL <= 12; tryGL++) {
            mkts[mktIdx].goLive = tryGL;
            var tryCost = getCost(mkts);
            if (tryCost < bestCost) {
              bestCost = tryCost;
              bestGL = tryGL;
            }
          }
          mkts[mktIdx].goLive = bestGL;
          if (bestGL !== currentGL) improved = true;
        }
      }

      var newCost = getCost(mkts);
      var saved = baseCost - newCost;

      // Build list of changes for display
      var changes = [];
      for (var ci = 0; ci < mkts.length; ci++) {
        if (origGoLives[ci] !== mkts[ci].goLive) {
          changes.push({ name: mkts[ci].name, from: origGoLives[ci], to: mkts[ci].goLive });
        }
      }

      if (saved > 0) {
        // Apply the optimized go-live months
        upd(function(s) {
          for (var ui = 0; ui < mkts.length; ui++) {
            s.markets[ui].goLive = mkts[ui].goLive;
          }
        });
        setOptStatus({ saved: saved, original: baseCost, optimized: newCost, changes: changes });
      } else {
        setOptStatus({ saved: 0, original: baseCost, optimized: baseCost, changes: [] });
      }
    }, 50);
  }, [sc, upd]);

  // Inline editing — which cell is open: { idx, field } | null
  var editingState = useState(null);
  var editing = editingState[0], setEditing = editingState[1];
  // Use a ref for the live input value so commitEdit always reads the latest
  // value regardless of which render closure fires onBlur/onKeyDown.
  var editValRef = useRef("");

  var METHODS = ["Standard Ocean", "Fast Boat", "Air"];

  function startEdit(idx, field, curVal) {
    editValRef.current = String(curVal);
    setEditing({ idx: idx, field: field });
  }

  // commitEditWith(idx, field, value) — explicit args, no closure dependency
  function commitEditWith(idx, field, value) {
    if (field === "meth") {
      if (METHODS.indexOf(value) >= 0) updShipEdit(idx, { meth: value });
    } else if (field === "bQ" || field === "lQ") {
      var n = parseInt(value.replace(/,/g, ""), 10);
      if (!isNaN(n) && n >= 0) {
        var patch = {};
        patch[field] = n;
        updShipEdit(idx, patch);
      }
    }
    setEditing(null);
  }

  function commitFromRef() {
    if (!editing) return;
    commitEditWith(editing.idx, editing.field, editValRef.current);
  }

  function cancelEdit() { setEditing(null); }

  function handleQtyKeyDown(e) {
    if (e.key === "Enter")  { e.preventDefault(); commitFromRef(); }
    if (e.key === "Escape") { e.preventDefault(); cancelEdit(); }
  }

  // Check if a shipment has manual edits
  function isEdited(idx) {
    return sc.shipEdits && sc.shipEdits.some(function(e) { return e.idx === idx; });
  }

  var unified = useMemo(function() {
    if (!prod || !ships || !gld) return [];
    var rows = [];
    var cumArrB = 0, cumArrL = 0;
    var cumDemand = 0, lastDemMonth = -1;

    // Map shipments by their SHIP date for the "Shipping Out" columns
    var shipByWeek = {};
    for (var si = 0; si < ships.length; si++) {
      var sh = ships[si];
      var sd = sh.bSd ? sh.bSd.getTime() : 0;
      var bestShipWk = null, bestShipDist = Infinity;
      for (var pi = 0; pi < prod.length; pi++) {
        var dist = Math.abs(prod[pi].wk.getTime() - sd);
        if (dist < bestShipDist) { bestShipDist = dist; bestShipWk = prod[pi].wk.getTime(); }
      }
      if (bestShipWk !== null) {
        if (!shipByWeek[bestShipWk]) shipByWeek[bestShipWk] = [];
        shipByWeek[bestShipWk].push(sh);
      }
    }

    // Map shipments by their ARRIVAL date for the inventory columns.
    // FIXED: bases and lids may arrive on different dates (e.g. Air ships each
    // component on its own deadline). We track them in separate maps so each
    // component shows up in the correct week row.
    var baseArrByWeek = {}, lidArrByWeek = {};
    function snapToWeek(date) {
      var best = null, bestDist = Infinity;
      for (var pi2 = 0; pi2 < prod.length; pi2++) {
        var d2 = Math.abs(prod[pi2].wk.getTime() - date);
        if (d2 < bestDist) { bestDist = d2; best = prod[pi2].wk.getTime(); }
      }
      return best;
    }
    for (var si2 = 0; si2 < ships.length; si2++) {
      var sh2 = ships[si2];
      // Bases: use bAr; lids: use lAr (they differ for component-split Air shipments)
      if (sh2.bQ > 0 && sh2.bAr) {
        var bWk = snapToWeek(sh2.bAr.getTime());
        if (bWk !== null) {
          if (!baseArrByWeek[bWk]) baseArrByWeek[bWk] = [];
          baseArrByWeek[bWk].push(sh2);
        }
      }
      if (sh2.lQ > 0 && sh2.lAr) {
        var lWk = snapToWeek(sh2.lAr.getTime());
        if (lWk !== null) {
          if (!lidArrByWeek[lWk]) lidArrByWeek[lWk] = [];
          lidArrByWeek[lWk].push(sh2);
        }
      }
    }

    var cumShippedB = 0, cumShippedL = 0;

    for (var wi = 0; wi < prod.length; wi++) {
      var w = prod[wi];
      if (w.bC === 0 && w.lC === 0 && w.bW === 0 && w.lW === 0) continue;
      var wt = w.wk.getTime();

      // Shipments DEPARTING this week (for Shipping Out columns)
      var departures = shipByWeek[wt] || [];

      // On-hand at factory BEFORE this week's shipments depart
      var onHandB = w.bC - cumShippedB;
      var onHandL = w.lC - cumShippedL;

      // Now add this week's departures to cumulative shipped
      var depB = 0, depL = 0;
      for (var di = 0; di < departures.length; di++) { depB += departures[di].bQ; depL += departures[di].lQ; }
      cumShippedB += depB; cumShippedL += depL;

      // Shipments ARRIVING this week — bases and lids tracked separately
      // (Air shipments split by component deadline, so bAr ≠ lAr is possible)
      var bArrivals = baseArrByWeek[wt] || [];
      var lArrivals = lidArrByWeek[wt] || [];
      var arrB = 0, arrL = 0;
      for (var ai = 0; ai < bArrivals.length; ai++) arrB += bArrivals[ai].bQ;
      for (var ai2 = 0; ai2 < lArrivals.length; ai2++) arrL += lArrivals[ai2].lQ;
      cumArrB += arrB; cumArrL += arrL;

      var wkMonth = w.wk.getMonth();

      var weekDemand = 0;
      if (weeklyDem) {
        for (var wdi = 0; wdi < weeklyDem.length; wdi++) {
          var diff = Math.abs(weeklyDem[wdi].wk.getTime() - w.wk.getTime());
          if (diff < 2 * 86400000 && weeklyDem[wdi].demand > 0) {
            weekDemand = Math.round(weeklyDem[wdi].demand);
            break;
          }
        }
      } else {
        if (wkMonth > lastDemMonth && gld[wkMonth] > 0) {
          weekDemand = gld[wkMonth];
          lastDemMonth = wkMonth;
        }
      }
      cumDemand += weekDemand;
      var monthDemand = weekDemand;

      // stockB / stockL: per-component surplus at Calyx (negative = shortfall)
      var stockB = cumArrB - cumDemand;
      var stockL = cumArrL - cumDemand;
      // FIXED: a complete unit requires 1 base AND 1 lid.
      // cumArrB + cumArrL double-counts arrivals (e.g. 5K bases + 40K lids ≠ 45K sets).
      // True fulfillable inventory = min(bases, lids) - demand.
      var stockOnHand = Math.min(cumArrB, cumArrL) - cumDemand;

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
        onHandB: onHandB, onHandL: onHandL,
        departures: departures, arrivals: bArrivals.concat(lArrivals),
        arrB: arrB, arrL: arrL, cumArrB: cumArrB, cumArrL: cumArrL,
        cumArrived: cumArrB + cumArrL, monthDemand: monthDemand,
        cumDemand: cumDemand, stockOnHand: stockOnHand, stockB: stockB, stockL: stockL,
        monthsOfStock: mosVal
      });
    }
    return rows;
  }, [prod, ships, gld, weeklyDem]);

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

      <div style={{ display:"flex", gap:8, marginBottom:12, alignItems:"center", flexWrap:"wrap" }}>
        <button onClick={doOptimize} disabled={optStatus === "running"} style={{
          padding:"8px 16px", borderRadius:6, border:"none", cursor: optStatus === "running" ? "default" : "pointer",
          background: optStatus === "running" ? T.S2 : "linear-gradient(135deg, #16a34a, #15803d)",
          color: optStatus === "running" ? T.T2 : "#fff", fontWeight:700, fontSize:12, fontFamily:"inherit",
          boxShadow: optStatus === "running" ? "none" : "0 2px 8px rgba(22,163,74,0.3)",
          transition:"all 0.2s"
        }}>
          {optStatus === "running" ? "⟳ Optimizing…" : "⚡ Optimize Shipping Cost"}
        </button>
        {hasShipEdits && (
          <button onClick={function() { clearShipEdits(); }} style={{
            padding:"6px 14px", borderRadius:6, border:"1px solid #d97706", cursor:"pointer",
            background:"#fffbeb", color:"#d97706", fontWeight:600, fontSize:11, fontFamily:"inherit"
          }}>↺ Reset Manual Edits</button>
        )}
        {hasShipEdits && (
          <span style={{ fontSize:11, color:T.AM, fontWeight:600 }}>
            ✎ {(sc.shipEdits || []).length} manual edit{(sc.shipEdits || []).length !== 1 ? "s" : ""} active
          </span>
        )}
        {optStatus && optStatus !== "running" && (
          <div style={{ display:"flex", gap:12, alignItems:"center", padding:"6px 14px", borderRadius:6, background: optStatus.saved > 0 ? "#dcfce7" : T.S2, border:"1px solid "+(optStatus.saved > 0 ? "#16a34a" : T.BD) }}>
            {optStatus.saved > 0 ? (
              <span style={{ fontSize:12 }}>
                <span style={{ color:"#16a34a", fontWeight:700 }}>Saved {f$(optStatus.saved)}</span>
                <span style={{ color:T.T2 }}>{" \u2014 "}{f$(optStatus.original)}{" \u2192 "}{f$(optStatus.optimized)}</span>
                {optStatus.changes.length > 0 && (
                  <span style={{ color:T.T2, fontSize:10 }}>{" \u2014 Moved: "}{optStatus.changes.map(function(c) { return c.name + " " + MO[c.from - 1] + "\u2192" + MO[c.to - 1]; }).join(", ")}</span>
                )}
              </span>
            ) : (
              <span style={{ fontSize:12, color:T.T2 }}>Already optimal — no go-live changes reduce cost</span>
            )}
            <button onClick={function() { setOptStatus(null); }} style={{ background:"none", border:"none", color:T.T2, cursor:"pointer", fontSize:14, padding:0, lineHeight:1 }}>{"\u00d7"}</button>
          </div>
        )}
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
                <th style={{ ...th, textAlign:"center", borderBottom:"2px solid "+T.GR, color:T.GR, top:0, zIndex:3, borderRight:"3px solid "+T.AC }} colSpan={6}>Production</th>
                <th style={{ ...th, textAlign:"center", borderBottom:"2px solid "+T.AC, color:T.AC, top:0, zIndex:3 }} colSpan={5}>Shipping Out <span style={{fontSize:9,opacity:0.6}}>(↑ departs · ↓ arrives)</span></th>
                <th style={{ ...th, textAlign:"center", borderBottom:"2px solid "+T.AM, color:T.AM, top:0, zIndex:3, borderLeft:"3px solid "+T.AM }} colSpan={7}>Inventory at Calyx</th>
              </tr>
              <tr>
                <th style={{ ...th, textAlign:"right", fontSize:9, color:T.GR, top:28, zIndex:2 }}>Base Wk</th>
                <th style={{ ...th, textAlign:"right", fontSize:9, color:T.AC, top:28, zIndex:2 }}>Lid Wk</th>
                <th style={{ ...th, textAlign:"right", fontSize:9, color:T.GR, top:28, zIndex:2 }}>Base Cumulative</th>
                <th style={{ ...th, textAlign:"right", fontSize:9, color:T.AC, top:28, zIndex:2 }}>Lid Cumulative</th>
                <th style={{ ...th, textAlign:"right", fontSize:9, color:T.GR, top:28, zIndex:2, background:"#f0fdf4" }}>Base OH</th>
                <th style={{ ...th, textAlign:"right", fontSize:9, color:T.AC, top:28, zIndex:2, background:"#eff6ff", borderRight:"3px solid "+T.AC }}>Lid OH</th>
                <th style={{ ...th, textAlign:"left", fontSize:9, top:28, zIndex:2 }}>Method</th>
                <th style={{ ...th, textAlign:"right", fontSize:9, color:T.GR, top:28, zIndex:2 }}>Bases</th>
                <th style={{ ...th, textAlign:"right", fontSize:9, color:T.AC, top:28, zIndex:2 }}>Lids</th>
                <th style={{ ...th, textAlign:"right", fontSize:9, top:28, zIndex:2 }}>Cost</th>
                <th style={{ ...th, textAlign:"left", fontSize:9, top:28, zIndex:2 }}>Transit</th>
                <th style={{ ...th, textAlign:"right", fontSize:9, color:T.GR, top:28, zIndex:2, borderLeft:"3px solid "+T.AM }}>Base Arrived</th>
                <th style={{ ...th, textAlign:"right", fontSize:9, color:T.AC, top:28, zIndex:2 }}>Lid Arrived</th>
                <th style={{ ...th, textAlign:"right", fontSize:9, top:28, zIndex:2 }}>Wk Demand</th>
                <th style={{ ...th, textAlign:"right", fontSize:9, top:28, zIndex:2 }}>Cumulative Demand</th>
                <th style={{ ...th, textAlign:"right", fontSize:9, color:T.GR, top:28, zIndex:2 }}>Base Stk</th>
                <th style={{ ...th, textAlign:"right", fontSize:9, color:T.AC, top:28, zIndex:2 }}>Lid Stk</th>
                <th style={{ ...th, textAlign:"right", fontSize:9, top:28, zIndex:2 }}>Mo. Stock</th>
              </tr>
            </thead>
            <tbody>
              {unified.map(function(r, i) {
                var firstDep = r.departures.length > 0 ? r.departures[0] : null;
                var extraDeps = r.departures.length > 1 ? r.departures.slice(1) : [];
                var isHl = hl === "u"+i;
                var rowBg = isHl ? hlBg : (i%2===0 ? "transparent" : T.S2);
                var prodBorderR = "3px solid "+T.AC;

                var mainRow = (
                  <tr key={"m"+i} onClick={function() { setHl(function(cur) { return cur === "u"+i ? null : "u"+i; }); }} style={{ background: rowBg, cursor:"pointer", transition:"background 0.1s" }}>
                    <td style={td}>{dFS(r.wk)}</td>
                    <td style={{ ...td, textAlign:"right", color:r.bW>0?T.GR:T.T2 }}>{r.bW>0?fm(r.bW):""}</td>
                    <td style={{ ...td, textAlign:"right", color:r.lW>0?T.AC:T.T2 }}>{r.lW>0?fm(r.lW):""}</td>
                    <td style={{ ...td, textAlign:"right", color:T.GR, fontSize:11 }}>{r.bC>0?fm(r.bC):""}</td>
                    <td style={{ ...td, textAlign:"right", color:T.AC, fontSize:11 }}>{r.lC>0?fm(r.lC):""}</td>
                    <td style={{ ...td, textAlign:"right", color:T.GR, fontWeight:600, background:"#f0fdf408" }}>{r.onHandB>0?fm(r.onHandB):""}</td>
                    <td style={{ ...td, textAlign:"right", color:T.AC, fontWeight:600, background:"#eff6ff08", borderRight:prodBorderR }}>{r.onHandL>0?fm(r.onHandL):""}</td>
                    <td style={td}>{firstDep ? <Bg method={firstDep.meth}/> : ""}</td>
                    <td style={{ ...td, textAlign:"right", fontWeight:firstDep?600:400, color:T.GR }}>{firstDep && firstDep.bQ > 0 ? fm(firstDep.bQ) : ""}</td>
                    <td style={{ ...td, textAlign:"right", fontWeight:firstDep?600:400, color:T.AC }}>{firstDep && firstDep.lQ > 0 ? fm(firstDep.lQ) : ""}</td>
                    <td style={{ ...td, textAlign:"right", color:firstDep&&firstDep.cost>0?T.AM:T.GR, fontWeight:firstDep?600:400 }}>{firstDep ? (firstDep.cost===0?"FREE":f$(firstDep.cost)) : ""}</td>
                    <td style={{ ...td, color:T.T2, fontSize:11, lineHeight:"1.5" }}>{firstDep ? <span style={{display:"flex",flexDirection:"column",gap:1}}><span style={{color:T.T3}}>{"↑ "}{dFS(firstDep.bSd)}</span><span style={{color:T.AC}}>{"↓ "}{dFS(firstDep.bAr)}</span></span> : ""}</td>
                    <td style={{ ...td, textAlign:"right", color:T.GR, fontWeight:r.arrB>0?600:400, borderLeft:"3px solid "+T.AM }}>{r.arrB>0?fm(r.arrB):""}</td>
                    <td style={{ ...td, textAlign:"right", color:T.AC, fontWeight:r.arrL>0?600:400 }}>{r.arrL>0?fm(r.arrL):""}</td>
                    <td style={{ ...td, textAlign:"right", color:r.monthDemand>0?"#9333ea":T.T2 }}>{r.monthDemand>0?fm(r.monthDemand):""}</td>
                    <td style={{ ...td, textAlign:"right", color:T.T2, fontSize:11 }}>{r.cumDemand>0?fm(r.cumDemand):""}</td>
                    <td style={{ ...td, textAlign:"right", fontWeight:600, color:r.stockB<0?"#dc2626":r.stockB>0?T.GR:T.T2 }}>{r.cumArrB>0||r.cumDemand>0?fm(r.stockB):""}</td>
                    <td style={{ ...td, textAlign:"right", fontWeight:600, color:r.stockL<0?"#dc2626":r.stockL>0?T.AC:T.T2 }}>{r.cumArrL>0||r.cumDemand>0?fm(r.stockL):""}</td>
                    <td style={{ ...td, textAlign:"right", color:r.monthsOfStock<3&&r.cumDemand>0?"#dc2626":r.monthsOfStock>=3?T.GR:T.T2, fontSize:11 }}>{r.cumDemand>0?r.monthsOfStock.toFixed(1):""}</td>
                  </tr>
                );

                var subRows = extraDeps.map(function(ea, si) {
                  return (
                    <tr key={"s"+i+"-"+si} onClick={function() { setHl(function(cur) { return cur === "u"+i ? null : "u"+i; }); }} style={{ background: isHl ? hlBg : (i%2===0?"transparent":T.S2), cursor:"pointer" }}>
                      <td style={td}></td><td style={td}></td><td style={td}></td><td style={td}></td><td style={td}></td><td style={td}></td><td style={{ ...td, borderRight:prodBorderR }}></td>
                      <td style={td}><Bg method={ea.meth}/></td>
                      <td style={{ ...td, textAlign:"right", fontWeight:600, color:T.GR }}>{ea.bQ > 0 ? fm(ea.bQ) : ""}</td>
                      <td style={{ ...td, textAlign:"right", fontWeight:600, color:T.AC }}>{ea.lQ > 0 ? fm(ea.lQ) : ""}</td>
                      <td style={{ ...td, textAlign:"right", color:ea.cost>0?T.AM:T.GR, fontWeight:600 }}>{ea.cost===0?"FREE":f$(ea.cost)}</td>
                      <td style={{ ...td, color:T.T2, fontSize:11, lineHeight:"1.5" }}><span style={{display:"flex",flexDirection:"column",gap:1}}><span style={{color:T.T3}}>{"↑ "}{dFS(ea.bSd)}</span><span style={{color:T.AC}}>{"↓ "}{dFS(ea.bAr)}</span></span></td>
                      <td style={{ ...td, borderLeft:"3px solid "+T.AM }}></td><td style={td}></td><td style={td}></td><td style={td}></td><td style={td}></td><td style={td}></td><td style={td}></td>
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
        <div style={{ overflowX:"auto", maxHeight:"calc(100vh - 240px)", overflowY:"auto" }}>
          <div style={{ marginBottom:8, fontSize:11, color:T.T2 }}>
            Click <span style={{ color:T.AC, fontWeight:700 }}>method</span>, <span style={{ color:T.GR, fontWeight:700 }}>bases</span>, or <span style={{ color:T.AC, fontWeight:700 }}>lids</span> to edit. Arrival dates and cost update automatically.
          </div>
          <table style={tbl}><thead><tr>
            <th style={th}>#</th><th style={th}>Mo.</th><th style={th}>Method</th><th style={th}>Container</th>
            <th style={{ ...th, textAlign:"center" }}>Pallets</th>
            <th style={{ ...th, textAlign:"right", color:T.GR }}>Bases</th>
            <th style={{ ...th, textAlign:"right", color:T.AC }}>Lids</th>
            <th style={{ ...th, textAlign:"right" }}>Total</th>
            <th style={th}>Ship Date</th><th style={th}>Arrival</th>
            <th style={{ ...th, textAlign:"right" }}>Cost</th>
            <th style={{ ...th, textAlign:"right" }}>$/Unit</th>
            <th style={{ ...th, textAlign:"center" }}>Edit</th>
          </tr></thead><tbody>
            {ships.length===0 && <tr><td colSpan={13} style={{ ...td, textAlign:"center", color:T.T2, padding:18 }}>No shipments</td></tr>}
            {ships.map(function(sh,i) {
              var cpu = sh.tQ>0 ? sh.cost/sh.tQ : 0;
              var isHl2 = hl === "d"+i;
              var edited = isEdited(i);
              var rowBg = isHl2 ? hlBg : edited ? "#fffbeb" : (i%2===0?"transparent":T.S2);

              // Method cell — select commits immediately on change (no blur ambiguity)
              var methCell;
              if (editing && editing.idx === i && editing.field === "meth") {
                methCell = (
                  <td style={td} onClick={function(e) { e.stopPropagation(); }}>
                    <select autoFocus value={editValRef.current}
                      onChange={function(e) {
                        var v = e.target.value;
                        editValRef.current = v;
                        commitEditWith(i, "meth", v);
                      }}
                      onKeyDown={function(e) { if (e.key === "Escape") { e.stopPropagation(); cancelEdit(); } }}
                      style={{ fontFamily:"inherit", fontSize:11, padding:"2px 4px", border:"1px solid "+T.AC, borderRadius:4, background:"#fff", cursor:"pointer" }}>
                      {METHODS.map(function(m) { return <option key={m} value={m}>{m}</option>; })}
                    </select>
                  </td>
                );
              } else {
                methCell = (
                  <td style={{ ...td, cursor:"pointer" }} onClick={function(e) { e.stopPropagation(); startEdit(i, "meth", sh.meth); }}>
                    <span title="Click to change method"><Bg method={sh.meth}/></span>
                    {sh.preShip && <span style={{ marginLeft:4, fontSize:8, color:T.GR, fontWeight:700 }}>PRE</span>}
                    {sh.lateDelivery && <span style={{ marginLeft:4, fontSize:8, color:"#dc2626", fontWeight:700 }}>LATE</span>}
                    {edited && <span style={{ marginLeft:4, fontSize:8, color:T.AM, fontWeight:700 }}>✎</span>}
                  </td>
                );
              }

              // Bases qty cell — input writes to ref, commits on blur or Enter
              var bCell;
              if (editing && editing.idx === i && editing.field === "bQ") {
                bCell = (
                  <td style={{ ...td, textAlign:"right" }} onClick={function(e) { e.stopPropagation(); }}>
                    <input autoFocus type="text" defaultValue={String(sh.bQ)}
                      onChange={function(e) { editValRef.current = e.target.value; }}
                      onBlur={commitFromRef}
                      onKeyDown={handleQtyKeyDown}
                      style={{ width:80, textAlign:"right", fontFamily:"inherit", fontSize:12, padding:"1px 4px", border:"1px solid "+T.GR, borderRadius:4 }} />
                  </td>
                );
              } else {
                bCell = (
                  <td style={{ ...td, textAlign:"right", color:T.GR, fontWeight:600, cursor:"pointer" }}
                    onClick={function(e) { e.stopPropagation(); startEdit(i, "bQ", sh.bQ); }}
                    title="Click to edit bases quantity">
                    {fm(sh.bQ)}
                  </td>
                );
              }

              // Lids qty cell — same pattern
              var lCell;
              if (editing && editing.idx === i && editing.field === "lQ") {
                lCell = (
                  <td style={{ ...td, textAlign:"right" }} onClick={function(e) { e.stopPropagation(); }}>
                    <input autoFocus type="text" defaultValue={String(sh.lQ)}
                      onChange={function(e) { editValRef.current = e.target.value; }}
                      onBlur={commitFromRef}
                      onKeyDown={handleQtyKeyDown}
                      style={{ width:80, textAlign:"right", fontFamily:"inherit", fontSize:12, padding:"1px 4px", border:"1px solid "+T.AC, borderRadius:4 }} />
                  </td>
                );
              } else {
                lCell = (
                  <td style={{ ...td, textAlign:"right", color:T.AC, fontWeight:600, cursor:"pointer" }}
                    onClick={function(e) { e.stopPropagation(); startEdit(i, "lQ", sh.lQ); }}
                    title="Click to edit lids quantity">
                    {fm(sh.lQ)}
                  </td>
                );
              }

              return (
                <tr key={i} onClick={function() { setHl(function(cur) { return cur === "d"+i ? null : "d"+i; }); }}
                  style={{ background: rowBg, cursor:"pointer", transition:"background 0.1s",
                    outline: edited ? "1px solid #f59e0b" : "none", outlineOffset:"-1px" }}>
                  <td style={{ ...td, color:T.T2 }}>{i+1}</td>
                  <td style={{ ...td, fontWeight:600 }}>{MO[sh.mo]}</td>
                  {methCell}
                  <td style={{ ...td, color:T.T2, fontSize:11 }}>{sh.cn}</td>
                  <td style={{ ...td, textAlign:"center", fontSize:10, color:T.T2 }}>{sh.bPal != null ? (sh.bPal + "B/" + sh.lPal + "L") : "\u2014"}</td>
                  {bCell}
                  {lCell}
                  <td style={{ ...td, textAlign:"right", fontWeight:700 }}>{fm(sh.tQ)}</td>
                  <td style={{ ...td, color:T.T2, fontSize:11 }}>{dFS(sh.bSd)}</td>
                  <td style={{ ...td, color:T.T2, fontSize:11 }}>{dFS(sh.bAr)}</td>
                  <td style={{ ...td, textAlign:"right", color:sh.cost>0?T.AM:T.GR, fontWeight:700 }}>{sh.cost===0?"FREE":f$(sh.cost)}</td>
                  <td style={{ ...td, textAlign:"right", color:T.T2, fontSize:11 }}>{sh.cost===0?"$0.00":fC(cpu)}</td>
                  <td style={{ ...td, textAlign:"center" }}>
                    {edited && (
                      <button onClick={function(e) {
                        e.stopPropagation();
                        // Remove this specific shipment's edit
                        upd(function(s) {
                          if (s.shipEdits) s.shipEdits = s.shipEdits.filter(function(e2) { return e2.idx !== i; });
                        });
                      }} title="Revert this shipment to optimized" style={{
                        background:"none", border:"1px solid "+T.BD, borderRadius:4, cursor:"pointer",
                        color:T.T2, fontSize:10, padding:"1px 5px", fontFamily:"inherit"
                      }}>↺</button>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody></table>
        </div>
      )}

      {sv==="production" && (
        <div style={{ overflowX:"auto", maxHeight:"calc(100vh - 240px)", overflowY:"auto" }}>
          <table style={tbl}><thead>
            <tr>
              <th style={{ ...th, top:0, zIndex:3 }} rowSpan={2}>Week Of</th>
              <th style={{ ...th, textAlign:"center", borderBottom:"2px solid #16a34a", color:T.GR, top:0, zIndex:3 }} colSpan={3}>Base (Jar/HDPE)</th>
              <th style={{ ...th, textAlign:"center", borderBottom:"2px solid "+T.AC, color:T.AC, top:0, zIndex:3 }} colSpan={3}>Lid (Cap/PP)</th>
              <th style={{ ...th, textAlign:"center", top:0, zIndex:3 }} colSpan={2}>Combined</th>
            </tr>
            <tr>
              <th style={{ ...th, textAlign:"right", top:28, zIndex:2 }}>Weekly</th>
              <th style={{ ...th, textAlign:"right", top:28, zIndex:2 }}>Cumul</th>
              <th style={{ ...th, textAlign:"right", top:28, zIndex:2 }}>Surplus</th>
              <th style={{ ...th, textAlign:"right", top:28, zIndex:2 }}>Weekly</th>
              <th style={{ ...th, textAlign:"right", top:28, zIndex:2 }}>Cumul</th>
              <th style={{ ...th, textAlign:"right", top:28, zIndex:2 }}>Surplus</th>
              <th style={{ ...th, textAlign:"right", top:28, zIndex:2 }}>Total</th>
              <th style={{ ...th, textAlign:"right", top:28, zIndex:2 }}>Shippable</th>
            </tr>
          </thead><tbody>
            {prod.filter(function(w) { return w.bW>0||w.lW>0||w.bC>0; }).map(function(w,i) {
              var isHl3 = hl === "p"+i;
              return (
                <tr key={i} onClick={function() { setHl(function(cur) { return cur === "p"+i ? null : "p"+i; }); }} style={{ background: isHl3 ? hlBg : (i%2===0?"transparent":T.S2), cursor:"pointer", transition:"background 0.1s" }}>
                  <td style={td}>{dFS(w.wk)}</td>
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
          </tbody></table>
        </div>
      )}
    </div>
  );
}
