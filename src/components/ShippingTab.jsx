import { useState, useMemo, useCallback, useRef } from "react";
import { MO } from "../data/defaults";
import { fm, f$, fC, dF } from "../utils/format";
import { T, tbl, th, td } from "../utils/theme";
import { Bg } from "./Shared";
import { calcGLD } from "../utils/calc";

// FIXED: safe date formatter - returns "—" for null/undefined instead of crashing
function dFS(d) { return d ? dF(d) : "\u2014"; }

// Get cumulative production at a given date
function prodAtDate(prodData, date) {
  var best = null;
  for (var i = 0; i < prodData.length; i++) {
    if (prodData[i].wk <= date) best = prodData[i];
  }
  return best ? { bC: best.bC, lC: best.lC } : { bC: 0, lC: 0 };
}

// Max base/lid available for shipment at array index si, accounting for other shipments
function maxAvailForShip(allShips, prodData, si) {
  var s = allShips[si];
  if (!s || !s.bSd || !prodData || prodData.length === 0) return { maxB: Infinity, maxL: Infinity };
  var sd = s.bSd;
  var p = prodAtDate(prodData, sd);
  var commitB = 0, commitL = 0;
  for (var j = 0; j < allShips.length; j++) {
    if (j === si) continue;
    if (allShips[j].bSd && allShips[j].bSd <= sd) {
      commitB += allShips[j].bQ;
      commitL += allShips[j].lQ;
    }
  }
  return { maxB: Math.max(0, p.bC - commitB), maxL: Math.max(0, p.lC - commitL) };
}

// Max base/lid available for a NEW shipment at a given ship date
function maxAvailForNewShip(allShips, prodData, shipDate) {
  if (!shipDate || !prodData || prodData.length === 0) return { maxB: Infinity, maxL: Infinity };
  var p = prodAtDate(prodData, shipDate);
  var commitB = 0, commitL = 0;
  for (var j = 0; j < allShips.length; j++) {
    if (allShips[j].bSd && allShips[j].bSd <= shipDate) {
      commitB += allShips[j].bQ;
      commitL += allShips[j].lQ;
    }
  }
  return { maxB: Math.max(0, p.bC - commitB), maxL: Math.max(0, p.lC - commitL) };
}

export default function ShippingTab({ ships, prod, frt, gld, weeklyDem, sc, upd, updShipEdit, addShipment, updShipAddition, removeShipAddition, deleteShipment, restoreShipment, clearShipEdits, hasShipEdits }) {
  var svState = useState("unified");
  var sv = svState[0], setSv = svState[1];
  var hlState = useState(null);
  var hl = hlState[0], setHl = hlState[1];
  // Inline editing state for existing shipments: { idx, field } | null
  var editingState = useState(null);
  var editing = editingState[0], setEditing = editingState[1];
  // Inline add-row state: { wkMs, mo } | null
  var addingState = useState(null);
  var adding = addingState[0], setAdding = addingState[1];
  var newMethState = useState("Standard Ocean");
  var newMeth = newMethState[0], setNewMeth = newMethState[1];
  var newBQState = useState("0");
  var newBQ = newBQState[0], setNewBQ = newBQState[1];
  var newLQState = useState("0");
  var newLQ = newLQState[0], setNewLQ = newLQState[1];
  var newMoState = useState(4);
  var newMo = newMoState[0], setNewMo = newMoState[1];

  // Use a ref for the live input value so commitEdit always reads the latest
  // value regardless of which render closure fires onBlur/onKeyDown.
  var editValRef = useRef("");

  var METHODS = ["Standard Ocean", "Fast Boat", "Air"];

  function startEdit(idx, field, curVal) {
    editValRef.current = String(curVal);
    setEditing({ idx: idx, field: field });
  }

  // commitEditWith(idx, field, value) — explicit args, no closure dependency
  // Clamps bQ/lQ to production on-hand so users can't ship more than available
  function commitEditWith(idx, field, value) {
    if (field === "meth") {
      if (METHODS.indexOf(value) >= 0) updShipEdit(idx, { meth: value });
    } else if (field === "bQ" || field === "lQ") {
      var n = parseInt(value.replace(/,/g, ""), 10);
      if (!isNaN(n) && n >= 0) {
        var mx = maxAvailForShip(ships, prod, idx);
        if (field === "bQ") n = Math.min(n, mx.maxB);
        else n = Math.min(n, mx.maxL);
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

  // Open the "add new shipment" inline form for a given week row
  function openAdd(wkMs, mo) {
    setEditing(null);
    setNewMeth("Standard Ocean");
    setNewBQ("0");
    setNewLQ("0");
    setNewMo(mo);
    setAdding({ wkMs: wkMs, mo: mo });
  }

  function confirmAdd() {
    if (!adding) return;
    var bNum = parseInt(newBQ.replace(/,/g, ""), 10) || 0;
    var lNum = parseInt(newLQ.replace(/,/g, ""), 10) || 0;
    // Clamp to production on-hand at the ship date
    var shipDate = new Date(adding.wkMs);
    var mx = maxAvailForNewShip(ships, prod, shipDate);
    bNum = Math.min(bNum, mx.maxB);
    lNum = Math.min(lNum, mx.maxL);
    if (bNum > 0 || lNum > 0) {
      addShipment(adding.wkMs, newMo, newMeth, bNum, lNum);
    }
    setAdding(null);
  }

  function cancelAdd() { setAdding(null); }

  // Check if a shipment has manual edits (for optimizer-generated ships only)
  function isEdited(idx) {
    return sc.shipEdits && sc.shipEdits.some(function(e) { return e.idx === idx; });
  }

  var unified = useMemo(function() {
    if (!prod || !ships || !gld) return [];
    var rows = [];
    var cumArrB = 0, cumArrL = 0;
    var cumDemand = 0, lastDemMonth = -1;

    // Map shipments by their SHIP date for the "Shipping Out" columns
    // Store { sh, idx } so the unified view can call updShipEdit with the correct index
    var shipByWeek = {};
    for (var si = 0; si < ships.length; si++) {
      var sh = ships[si];
      var origIdx = sh.origIdx !== undefined ? sh.origIdx : si;
      var sd = sh.bSd ? sh.bSd.getTime() : 0;
      var bestShipWk = null, bestShipDist = Infinity;
      for (var pi = 0; pi < prod.length; pi++) {
        var dist = Math.abs(prod[pi].wk.getTime() - sd);
        if (dist < bestShipDist) { bestShipDist = dist; bestShipWk = prod[pi].wk.getTime(); }
      }
      if (bestShipWk !== null) {
        if (!shipByWeek[bestShipWk]) shipByWeek[bestShipWk] = [];
        shipByWeek[bestShipWk].push({ sh: sh, idx: origIdx });
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
      for (var di = 0; di < departures.length; di++) { depB += departures[di].sh.bQ; depL += departures[di].sh.lQ; }
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

      // Mo. Stock: how many months of FUTURE demand does current stockOnHand cover?
      // Uses strictly future weekly demand (weeks after this one) grouped by month,
      // so the current month is handled correctly as a partial bucket — avoiding
      // the double-count that occurs when using gld[wkMonth] (full month) while
      // cumDemand has already consumed some of this month's weekly demand.
      var mosVal = 0;
      if (stockOnHand > 0 && weeklyDem) {
        var remStock = stockOnHand;
        var futureMoMap = {};
        for (var fi = 0; fi < weeklyDem.length; fi++) {
          if (weeklyDem[fi].wk.getTime() <= wt) continue; // only weeks AFTER current
          var fwMo = weeklyDem[fi].wk.getMonth();
          futureMoMap[fwMo] = (futureMoMap[fwMo] || 0) + (weeklyDem[fi].demand || 0);
        }
        var sortedFutureMos = Object.keys(futureMoMap).map(Number).sort(function(a, b) { return a - b; });
        for (var sfi = 0; sfi < sortedFutureMos.length; sfi++) {
          var fmDem = futureMoMap[sortedFutureMos[sfi]] || 0;
          if (fmDem <= 0) continue;
          if (remStock >= fmDem) { remStock -= fmDem; mosVal += 1; }
          else { mosVal += remStock / fmDem; remStock = 0; break; }
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
  }, [prod, ships, gld, weeklyDem, sc.shipEdits, sc.shipDeletions, sc.shipAdditions]);

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
                // departures are now {sh, idx} pairs
                var firstDepEntry = r.departures.length > 0 ? r.departures[0] : null;
                var extraDepEntries = r.departures.length > 1 ? r.departures.slice(1) : [];
                var isHl = hl === "u"+i;
                var rowBg = isHl ? hlBg : (i%2===0 ? "transparent" : T.S2);
                var prodBorderR = "3px solid "+T.AC;

                // Build editable cells for a departure entry {sh, idx}
                // For entries with isAddition=true, show a delete button instead of edit marker
                function makeDepCells(entry, isFirst) {
                  if (!entry) {
                    // Empty shipping columns — show a faint "+ Add" button in the method cell
                    var wkMs = r.wk.getTime();
                    var wkMo = r.wk.getMonth();
                    var isAddingThis = adding && adding.wkMs === wkMs;
                    if (isAddingThis) {
                      // Inline new-shipment form spanning the 5 shipping cells
                      return [
                        <td key="m" style={{...td}} onClick={function(e){e.stopPropagation();}}>
                          <select value={newMeth} onChange={function(e){setNewMeth(e.target.value);}}
                            style={{fontFamily:"inherit",fontSize:11,padding:"2px 4px",border:"1px solid "+T.AC,borderRadius:4,background:"#fff",width:120}}>
                            {METHODS.map(function(m){return <option key={m} value={m}>{m}</option>;})}
                          </select>
                        </td>,
                        <td key="mo" style={{...td}} onClick={function(e){e.stopPropagation();}}>
                          <select value={newMo} onChange={function(e){setNewMo(parseInt(e.target.value,10));}}
                            style={{fontFamily:"inherit",fontSize:11,padding:"2px 4px",border:"1px solid "+T.PU,borderRadius:4,background:"#fff",width:60}}>
                            {MO.map(function(m,mi){return <option key={mi} value={mi}>{m}</option>;})}
                          </select>
                        </td>,
                        <td key="b" style={{...td,textAlign:"right"}} onClick={function(e){e.stopPropagation();}}>
                          <input type="text" value={newBQ} onChange={function(e){setNewBQ(e.target.value);}}
                            style={{width:70,textAlign:"right",fontFamily:"inherit",fontSize:12,padding:"1px 4px",border:"1px solid "+T.GR,borderRadius:4}}/>
                        </td>,
                        <td key="l" style={{...td,textAlign:"right"}} onClick={function(e){e.stopPropagation();}}>
                          <input type="text" value={newLQ} onChange={function(e){setNewLQ(e.target.value);}}
                            style={{width:70,textAlign:"right",fontFamily:"inherit",fontSize:12,padding:"1px 4px",border:"1px solid "+T.AC,borderRadius:4}}/>
                        </td>,
                        <td key="t" style={{...td}} onClick={function(e){e.stopPropagation();}}>
                          <span style={{display:"flex",gap:4}}>
                            <button onClick={confirmAdd} style={{background:T.GR,border:"none",borderRadius:4,color:"#fff",fontSize:10,fontWeight:700,padding:"2px 7px",cursor:"pointer",fontFamily:"inherit"}}>✓</button>
                            <button onClick={cancelAdd} style={{background:"none",border:"1px solid "+T.BD,borderRadius:4,color:T.T2,fontSize:10,padding:"2px 7px",cursor:"pointer",fontFamily:"inherit"}}>✕</button>
                          </span>
                        </td>
                      ];
                    }
                    return [
                      <td key="m" style={{...td}}>
                        <button onClick={function(e){e.stopPropagation(); openAdd(wkMs, wkMo);}}
                          style={{background:"none",border:"1px dashed "+T.BD,borderRadius:4,color:T.T2,fontSize:10,padding:"1px 7px",cursor:"pointer",fontFamily:"inherit",opacity:0.6}}
                          title="Add a shipment this week">+ Add</button>
                      </td>,
                      <td key="b" style={{ ...td, textAlign:"right" }}></td>,
                      <td key="l" style={{ ...td, textAlign:"right" }}></td>,
                      <td key="c" style={{ ...td, textAlign:"right" }}></td>,
                      <td key="t" style={td}></td>
                    ];
                  }
                  var dep = entry.sh, depIdx = entry.idx;
                  var isAdditionEntry = dep.isAddition;
                  var edited = !isAdditionEntry && isEdited(depIdx);
                  // Method cell
                  var methTd;
                  if (!isAdditionEntry && editing && editing.idx === depIdx && editing.field === "meth") {
                    methTd = (
                      <td key="m" style={td} onClick={function(e){e.stopPropagation();}}>
                        <select autoFocus value={editValRef.current}
                          onChange={function(e) { var v=e.target.value; editValRef.current=v; commitEditWith(depIdx,"meth",v); }}
                          onKeyDown={function(e){if(e.key==="Escape"){e.stopPropagation();cancelEdit();}}}
                          style={{fontFamily:"inherit",fontSize:11,padding:"2px 4px",border:"1px solid "+T.AC,borderRadius:4,background:"#fff"}}>
                          {METHODS.map(function(m){return <option key={m} value={m}>{m}</option>;})}
                        </select>
                      </td>
                    );
                  } else {
                    methTd = (
                      <td key="m" style={{...td, cursor: isAdditionEntry ? "default" : "pointer"}}
                        onClick={isAdditionEntry ? undefined : function(e){e.stopPropagation(); startEdit(depIdx,"meth",dep.meth);}}>
                        <Bg method={dep.meth}/>
                        {edited && <span style={{marginLeft:3,fontSize:8,color:T.AM,fontWeight:700}}>✎</span>}
                        {isAdditionEntry && (
                          <button onClick={function(e){e.stopPropagation(); removeShipAddition(dep.addId);}}
                            title="Remove this manual shipment"
                            style={{marginLeft:4,background:"none",border:"1px solid #dc2626",borderRadius:3,color:"#dc2626",fontSize:9,padding:"0 4px",cursor:"pointer",lineHeight:"14px",fontFamily:"inherit"}}>✕</button>
                        )}
                        {!isAdditionEntry && (
                          <button onClick={function(e){e.stopPropagation(); deleteShipment(depIdx);}}
                            title="Delete this shipment"
                            style={{marginLeft:4,background:"none",border:"1px solid #dc2626",borderRadius:3,color:"#dc2626",fontSize:9,padding:"0 4px",cursor:"pointer",lineHeight:"14px",fontFamily:"inherit"}}>🗑</button>
                        )}
                      </td>
                    );
                  }
                  // Bases cell
                  var bTd;
                  if (!isAdditionEntry && editing && editing.idx === depIdx && editing.field === "bQ") {
                    bTd = (
                      <td key="b" style={{...td,textAlign:"right"}} onClick={function(e){e.stopPropagation();}}>
                        <input autoFocus type="text" defaultValue={String(dep.bQ)}
                          onChange={function(e){editValRef.current=e.target.value;}}
                          onBlur={commitFromRef} onKeyDown={handleQtyKeyDown}
                          style={{width:70,textAlign:"right",fontFamily:"inherit",fontSize:12,padding:"1px 4px",border:"1px solid "+T.GR,borderRadius:4}}/>
                      </td>
                    );
                  } else {
                    bTd = (
                      <td key="b" style={{...td,textAlign:"right",color:T.GR,fontWeight:600,cursor:isAdditionEntry?"default":"pointer"}}
                        onClick={isAdditionEntry ? undefined : function(e){e.stopPropagation(); startEdit(depIdx,"bQ",dep.bQ);}}
                        title={isAdditionEntry ? "" : "Click to edit bases"}>
                        {dep.bQ > 0 ? fm(dep.bQ) : ""}
                      </td>
                    );
                  }
                  // Lids cell
                  var lTd;
                  if (!isAdditionEntry && editing && editing.idx === depIdx && editing.field === "lQ") {
                    lTd = (
                      <td key="l" style={{...td,textAlign:"right"}} onClick={function(e){e.stopPropagation();}}>
                        <input autoFocus type="text" defaultValue={String(dep.lQ)}
                          onChange={function(e){editValRef.current=e.target.value;}}
                          onBlur={commitFromRef} onKeyDown={handleQtyKeyDown}
                          style={{width:70,textAlign:"right",fontFamily:"inherit",fontSize:12,padding:"1px 4px",border:"1px solid "+T.AC,borderRadius:4}}/>
                      </td>
                    );
                  } else {
                    lTd = (
                      <td key="l" style={{...td,textAlign:"right",color:T.AC,fontWeight:600,cursor:isAdditionEntry?"default":"pointer"}}
                        onClick={isAdditionEntry ? undefined : function(e){e.stopPropagation(); startEdit(depIdx,"lQ",dep.lQ);}}
                        title={isAdditionEntry ? "" : "Click to edit lids"}>
                        {dep.lQ > 0 ? fm(dep.lQ) : ""}
                      </td>
                    );
                  }
                  var costTd = <td key="c" style={{...td,textAlign:"right",color:dep.cost>0?T.AM:T.GR,fontWeight:600}}>{dep.cost===0?"FREE":f$(dep.cost)}</td>;
                  var transitTd = (
                    <td key="t" style={{...td,color:T.T2,fontSize:11,lineHeight:"1.5"}}>
                      <span style={{display:"flex",flexDirection:"column",gap:1}}>
                        <span style={{color:T.T3}}>{"↑ "}{dFS(dep.bSd)}</span>
                        <span style={{color:T.AC}}>{"↓ "}{dFS(dep.bAr)}</span>
                      </span>
                    </td>
                  );
                  return [methTd, bTd, lTd, costTd, transitTd];
                }

                var firstDepCells = makeDepCells(firstDepEntry, true);
                var mainRow = (
                  <tr key={"m"+i} onClick={function() { setHl(function(cur) { return cur === "u"+i ? null : "u"+i; }); }} style={{ background: rowBg, cursor:"pointer", transition:"background 0.1s" }}>
                    <td style={td}>{dFS(r.wk)}</td>
                    <td style={{ ...td, textAlign:"right", color:r.bW>0?T.GR:T.T2 }}>{r.bW>0?fm(r.bW):""}</td>
                    <td style={{ ...td, textAlign:"right", color:r.lW>0?T.AC:T.T2 }}>{r.lW>0?fm(r.lW):""}</td>
                    <td style={{ ...td, textAlign:"right", color:T.GR, fontSize:11 }}>{r.bC>0?fm(r.bC):""}</td>
                    <td style={{ ...td, textAlign:"right", color:T.AC, fontSize:11 }}>{r.lC>0?fm(r.lC):""}</td>
                    <td style={{ ...td, textAlign:"right", color:T.GR, fontWeight:600, background:"#f0fdf408" }}>{r.onHandB>0?fm(r.onHandB):""}</td>
                    <td style={{ ...td, textAlign:"right", color:T.AC, fontWeight:600, background:"#eff6ff08", borderRight:prodBorderR }}>{r.onHandL>0?fm(r.onHandL):""}</td>
                    {firstDepCells}
                    <td style={{ ...td, textAlign:"right", color:T.GR, fontWeight:r.arrB>0?600:400, borderLeft:"3px solid "+T.AM }}>{r.arrB>0?fm(r.arrB):""}</td>
                    <td style={{ ...td, textAlign:"right", color:T.AC, fontWeight:r.arrL>0?600:400 }}>{r.arrL>0?fm(r.arrL):""}</td>
                    <td style={{ ...td, textAlign:"right", color:r.monthDemand>0?"#9333ea":T.T2 }}>{r.monthDemand>0?fm(r.monthDemand):""}</td>
                    <td style={{ ...td, textAlign:"right", color:T.T2, fontSize:11 }}>{r.cumDemand>0?fm(r.cumDemand):""}</td>
                    <td style={{ ...td, textAlign:"right", fontWeight:600, color:r.stockB<0?"#dc2626":r.stockB>0?T.GR:T.T2 }}>{r.cumArrB>0||r.cumDemand>0?fm(r.stockB):""}</td>
                    <td style={{ ...td, textAlign:"right", fontWeight:600, color:r.stockL<0?"#dc2626":r.stockL>0?T.AC:T.T2 }}>{r.cumArrL>0||r.cumDemand>0?fm(r.stockL):""}</td>
                    <td style={{ ...td, textAlign:"right", color:r.monthsOfStock<3&&r.cumDemand>0?"#dc2626":r.monthsOfStock>=3?T.GR:T.T2, fontSize:11 }}>{r.cumDemand>0?r.monthsOfStock.toFixed(1):""}</td>
                  </tr>
                );

                var subRows = extraDepEntries.map(function(entry, si) {
                  var subDepCells = makeDepCells(entry, false);
                  return (
                    <tr key={"s"+i+"-"+si} onClick={function() { setHl(function(cur) { return cur === "u"+i ? null : "u"+i; }); }} style={{ background: isHl ? hlBg : (i%2===0?"transparent":T.S2), cursor:"pointer" }}>
                      <td style={td}></td><td style={td}></td><td style={td}></td><td style={td}></td><td style={td}></td><td style={td}></td><td style={{ ...td, borderRight:prodBorderR }}></td>
                      {subDepCells}
                      <td style={{ ...td, borderLeft:"3px solid "+T.AM }}></td><td style={td}></td><td style={td}></td><td style={td}></td><td style={td}></td><td style={td}></td><td style={td}></td>
                    </tr>
                  );
                });

                // When there's already a shipment and we're adding another to this week, show a form row at the end
                var wkMs2 = r.wk.getTime();
                var isAddingHere = adding && adding.wkMs === wkMs2 && firstDepEntry !== null;
                var addExtraRow = null;
                if (firstDepEntry !== null && !isAddingHere) {
                  addExtraRow = (
                    <tr key={"add"+i} style={{ background: i%2===0?"transparent":T.S2 }}>
                      <td style={td}></td><td style={td}></td><td style={td}></td><td style={td}></td><td style={td}></td><td style={td}></td><td style={{ ...td, borderRight:prodBorderR }}></td>
                      <td style={{...td}} colSpan={5}>
                        <button onClick={function(e){e.stopPropagation(); openAdd(wkMs2, r.wk.getMonth());}}
                          style={{background:"none",border:"1px dashed "+T.BD,borderRadius:4,color:T.T2,fontSize:10,padding:"1px 7px",cursor:"pointer",fontFamily:"inherit",opacity:0.5}}
                          title="Add another shipment this week">+ Add</button>
                      </td>
                      <td style={{ ...td, borderLeft:"3px solid "+T.AM }}></td><td style={td}></td><td style={td}></td><td style={td}></td><td style={td}></td><td style={td}></td><td style={td}></td>
                    </tr>
                  );
                } else if (firstDepEntry !== null && isAddingHere) {
                  addExtraRow = (
                    <tr key={"add"+i} style={{ background: i%2===0?"transparent":T.S2 }}>
                      <td style={td}></td><td style={td}></td><td style={td}></td><td style={td}></td><td style={td}></td><td style={td}></td><td style={{ ...td, borderRight:prodBorderR }}></td>
                      <td style={{...td}} onClick={function(e){e.stopPropagation();}}>
                        <select value={newMeth} onChange={function(e){setNewMeth(e.target.value);}}
                          style={{fontFamily:"inherit",fontSize:11,padding:"2px 4px",border:"1px solid "+T.AC,borderRadius:4,background:"#fff",width:120}}>
                          {METHODS.map(function(m){return <option key={m} value={m}>{m}</option>;})}
                        </select>
                      </td>
                      <td style={{...td}} onClick={function(e){e.stopPropagation();}}>
                        <select value={newMo} onChange={function(e){setNewMo(parseInt(e.target.value,10));}}
                          style={{fontFamily:"inherit",fontSize:11,padding:"2px 4px",border:"1px solid "+T.PU,borderRadius:4,background:"#fff",width:60}}>
                          {MO.map(function(m,mi){return <option key={mi} value={mi}>{m}</option>;})}
                        </select>
                      </td>
                      <td style={{...td,textAlign:"right"}} onClick={function(e){e.stopPropagation();}}>
                        <input autoFocus type="text" value={newBQ} onChange={function(e){setNewBQ(e.target.value);}}
                          style={{width:70,textAlign:"right",fontFamily:"inherit",fontSize:12,padding:"1px 4px",border:"1px solid "+T.GR,borderRadius:4}}/>
                      </td>
                      <td style={{...td,textAlign:"right"}} onClick={function(e){e.stopPropagation();}}>
                        <input type="text" value={newLQ} onChange={function(e){setNewLQ(e.target.value);}}
                          style={{width:70,textAlign:"right",fontFamily:"inherit",fontSize:12,padding:"1px 4px",border:"1px solid "+T.AC,borderRadius:4}}/>
                      </td>
                      <td style={{...td}} onClick={function(e){e.stopPropagation();}}>
                        <span style={{display:"flex",gap:4}}>
                          <button onClick={confirmAdd} style={{background:T.GR,border:"none",borderRadius:4,color:"#fff",fontSize:10,fontWeight:700,padding:"2px 7px",cursor:"pointer",fontFamily:"inherit"}}>✓</button>
                          <button onClick={cancelAdd} style={{background:"none",border:"1px solid "+T.BD,borderRadius:4,color:T.T2,fontSize:10,padding:"2px 7px",cursor:"pointer",fontFamily:"inherit"}}>✕</button>
                        </span>
                      </td>
                      <td style={{ ...td, borderLeft:"3px solid "+T.AM }}></td><td style={td}></td><td style={td}></td><td style={td}></td><td style={td}></td><td style={td}></td><td style={td}></td>
                    </tr>
                  );
                }

                var result = [mainRow].concat(subRows);
                if (addExtraRow) result.push(addExtraRow);
                return result;
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
