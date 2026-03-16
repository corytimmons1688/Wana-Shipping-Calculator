import { useMemo } from "react";
import { MASTER_SKUS, BASE_TYPES } from "../data/skuMaster";
import { calcSkuDemand, calcGLD } from "../utils/calc";
import { fm, dF } from "../utils/format";
import { T, tbl, th, td } from "../utils/theme";

var GROUPS = ["Black Sparkle", "White"];
var GROUP_COLORS = { "Black Sparkle": { hd: "#334155", tx: "#fff" }, "White": { hd: "#94a3b8", tx: "#fff" } };
var LID_GROUP_NAMES = { "Black Sparkle": "Black Sparkle Lids", "White": "Custom Color Lids" };
var METHOD_COLORS = { "Standard Ocean": T.GR, "Fast Boat": T.AC, "Air": T.AM };

// Build weekly schedule: bQ → base types, lQ → lid SKUs
function buildSchedule(ships, skuDemand) {
  if (!ships || ships.length === 0) return { weeks: [], byBase: {}, byLid: {} };

  var allSkus = Object.keys(skuDemand);

  // Pre-compute annual demand per lid SKU
  var annualDem = {};
  var totalAnnualDem = 0;
  for (var ai = 0; ai < allSkus.length; ai++) {
    var annSum = 0;
    var d2 = skuDemand[allSkus[ai]];
    if (d2) for (var am = 0; am < 12; am++) annSum += (d2[am] || 0);
    annualDem[allSkus[ai]] = annSum;
    totalAnnualDem += annSum;
  }

  // Pre-compute demand per base type (sum of their associated lid SKU demands)
  var baseAnnual = {};
  var baseMonthly = {};
  var totalBaseAnnual = 0;
  for (var bgi = 0; bgi < GROUPS.length; bgi++) {
    var gName = GROUPS[bgi];
    var gSkus = MASTER_SKUS.filter(function(s) { return s.base === gName; });
    var gAnn = 0;
    var gMo = new Array(12).fill(0);
    for (var gsi = 0; gsi < gSkus.length; gsi++) {
      gAnn += (annualDem[gSkus[gsi].sku] || 0);
      var dem = skuDemand[gSkus[gsi].sku];
      if (dem) for (var m = 0; m < 12; m++) gMo[m] += (dem[m] || 0);
    }
    baseAnnual[gName] = gAnn;
    baseMonthly[gName] = gMo;
    totalBaseAnnual += gAnn;
  }

  // Snap date to production-week grid (every 7 days from Mar 9 2026)
  var PROD_START = new Date(2026, 2, 9).getTime();
  var WEEK_MS = 7 * 86400000;
  function snapToProductionWeek(date) {
    var t = date.getTime();
    var diff = t - PROD_START;
    var wkIdx = Math.round(diff / WEEK_MS);
    return new Date(PROD_START + wkIdx * WEEK_MS);
  }

  // Group shipments by production week
  var weekMap = {};
  for (var i = 0; i < ships.length; i++) {
    var sh = ships[i];
    if (!sh.bSd || (sh.bQ <= 0 && sh.lQ <= 0)) continue;
    var snapped = snapToProductionWeek(new Date(sh.bSd));
    snapped.setHours(0,0,0,0);
    var key = snapped.getTime();
    if (!weekMap[key]) weekMap[key] = { wk: snapped, shipments: [] };
    weekMap[key].shipments.push(sh);
  }

  var weekKeys = Object.keys(weekMap).map(Number).sort(function(a, b) { return a - b; });
  var weeks = [];
  for (var wi = 0; wi < weekKeys.length; wi++) weeks.push(weekMap[weekKeys[wi]]);

  // Initialize byBase (bQ allocation) and byLid (lQ allocation)
  var byBase = {};
  for (var bi = 0; bi < GROUPS.length; bi++) byBase[GROUPS[bi]] = new Array(weeks.length).fill(0);
  var byLid = {};
  for (var li = 0; li < allSkus.length; li++) byLid[allSkus[li]] = new Array(weeks.length).fill(0);

  for (var wki = 0; wki < weeks.length; wki++) {
    var wkShips = weeks[wki].shipments;
    for (var shi = 0; shi < wkShips.length; shi++) {
      var s = wkShips[shi];
      var arrMo = s.bAr ? s.bAr.getMonth() : (s.mo != null ? s.mo : -1);

      // === BASES: Allocate bQ to base types (Black Sparkle / White) ===
      if (s.bQ > 0) {
        var useMoB = false;
        var totBDem = 0;
        if (arrMo >= 0 && arrMo <= 11) {
          for (var bk1 = 0; bk1 < GROUPS.length; bk1++) totBDem += (baseMonthly[GROUPS[bk1]][arrMo] || 0);
          if (totBDem > 0) useMoB = true;
        }
        if (!useMoB) totBDem = totalBaseAnnual;
        if (totBDem > 0) {
          var bAlloc = 0, bArr = [];
          for (var bk2 = 0; bk2 < GROUPS.length; bk2++) {
            var bDem = useMoB ? (baseMonthly[GROUPS[bk2]][arrMo] || 0) : baseAnnual[GROUPS[bk2]];
            var bSh = Math.round(s.bQ * bDem / totBDem);
            bArr.push(bSh); bAlloc += bSh;
          }
          var bRem = s.bQ - bAlloc;
          if (bRem !== 0) { var bMx = 0; for (var bf = 1; bf < bArr.length; bf++) if (bArr[bf] > bArr[bMx]) bMx = bf; bArr[bMx] += bRem; }
          for (var bk3 = 0; bk3 < GROUPS.length; bk3++) byBase[GROUPS[bk3]][wki] += bArr[bk3];
        }
      }

      // === LIDS: Allocate lQ to individual lid SKUs ===
      if (s.lQ > 0) {
        var useMoL = false;
        var totLDem = 0;
        if (arrMo >= 0 && arrMo <= 11) {
          for (var lk1 = 0; lk1 < allSkus.length; lk1++) {
            var ld = skuDemand[allSkus[lk1]];
            if (ld) totLDem += (ld[arrMo] || 0);
          }
          if (totLDem > 0) useMoL = true;
        }
        if (!useMoL) totLDem = totalAnnualDem;
        if (totLDem > 0) {
          var lAlloc = 0, lArr = [];
          for (var lk2 = 0; lk2 < allSkus.length; lk2++) {
            var skuCode = allSkus[lk2];
            var lDem = useMoL ? ((skuDemand[skuCode] && skuDemand[skuCode][arrMo]) || 0) : (annualDem[skuCode] || 0);
            if (lDem <= 0) { lArr.push(0); continue; }
            var lSh = Math.round(s.lQ * lDem / totLDem);
            lArr.push(lSh); lAlloc += lSh;
          }
          var lRem = s.lQ - lAlloc;
          if (lRem !== 0) { var lMx = 0; for (var lf = 1; lf < lArr.length; lf++) if (lArr[lf] > lArr[lMx]) lMx = lf; lArr[lMx] += lRem; }
          for (var lk3 = 0; lk3 < allSkus.length; lk3++) byLid[allSkus[lk3]][wki] += lArr[lk3];
        }
      }
    }
  }

  return { weeks: weeks, byBase: byBase, byLid: byLid };
}

export default function ShipScheduleTab({ sc, ships, prod, gld }) {
  var skuDemand = useMemo(function() { return calcSkuDemand(sc.markets); }, [sc.markets]);
  var schedule = useMemo(function() { return buildSchedule(ships, skuDemand); }, [ships, skuDemand]);

  // Build grouped lid rows (for LIDS section)
  var groups = useMemo(function() {
    var out = [];
    for (var gi = 0; gi < GROUPS.length; gi++) {
      var gName = GROUPS[gi];
      var skus = MASTER_SKUS.filter(function(s) { return s.base === gName; });
      var rows = [];
      for (var si = 0; si < skus.length; si++) {
        var s = skus[si];
        var dem = skuDemand[s.sku] || new Array(12).fill(0);
        rows.push({ sku: s.sku, name: s.name, cat: s.cat, demand: dem });
      }
      out.push({ name: gName, baseSku: BASE_TYPES[gName].sku, rows: rows });
    }
    if (skuDemand._unmapped) {
      var mappedSkus = {};
      for (var mi = 0; mi < MASTER_SKUS.length; mi++) mappedSkus[MASTER_SKUS[mi].sku] = true;
      var unmappedDem = new Array(12).fill(0);
      var keys = Object.keys(skuDemand);
      for (var ki = 0; ki < keys.length; ki++) {
        var k = keys[ki];
        if (k === "_unmapped" || !mappedSkus[k]) {
          for (var um = 0; um < 12; um++) unmappedDem[um] += skuDemand[k][um];
        }
      }
      out[1].rows.push({ sku: "_unmapped", name: "Assorted / Unmapped (CO HD, etc.)", cat: "Other", demand: unmappedDem });
    }
    return out;
  }, [skuDemand]);

  // Pipeline summary: totals for bases and lids at each stage
  var pipeline = useMemo(function() {
    if (!prod || prod.length === 0 || !ships) return null;
    var last = prod[prod.length - 1];
    var shippedB = 0, shippedL = 0;
    for (var i = 0; i < ships.length; i++) { shippedB += (ships[i].bQ || 0); shippedL += (ships[i].lQ || 0); }
    var totalDemand = 0;
    if (gld) for (var m = 0; m < 12; m++) totalDemand += (gld[m] || 0);
    return {
      base: { prod: last.bC, shipped: shippedB, demand: totalDemand, delta: shippedB - totalDemand },
      lid:  { prod: last.lC, shipped: shippedL, demand: totalDemand, delta: shippedL - totalDemand }
    };
  }, [prod, ships, gld]);

  var wks = schedule.weeks;
  var byBase = schedule.byBase;
  var byLid = schedule.byLid;
  var noShips = wks.length === 0;

  // Compute dominant shipping method color per week column
  var weekMC = [];
  for (var wci = 0; wci < wks.length; wci++) {
    var mq = {};
    for (var wsi = 0; wsi < wks[wci].shipments.length; wsi++) {
      var sh2 = wks[wci].shipments[wsi];
      var mt = sh2.meth || "Standard Ocean";
      mq[mt] = (mq[mt] || 0) + (sh2.bQ || 0) + (sh2.lQ || 0);
    }
    var bestM = "Standard Ocean", bestQ = 0;
    var mk = Object.keys(mq);
    for (var mki = 0; mki < mk.length; mki++) {
      if (mq[mk[mki]] > bestQ) { bestQ = mq[mk[mki]]; bestM = mk[mki]; }
    }
    weekMC.push(METHOD_COLORS[bestM] || T.TX);
  }

  var totalBasesScheduled = 0, totalLidsScheduled = 0;
  for (var tsi = 0; tsi < (ships || []).length; tsi++) {
    totalBasesScheduled += (ships[tsi].bQ || 0);
    totalLidsScheduled += (ships[tsi].lQ || 0);
  }

  return (
    <div style={{ padding: "14px 18px" }}>
      {/* Pipeline Summary Cards: Bases & Lids */}
      {pipeline && (
        <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 12 }}>
          {[{label:"Bases",color:T.GR,d:pipeline.base},{label:"Lids",color:T.AC,d:pipeline.lid}].map(function(it) {
            var d = it.d;
            var covPct = d.demand > 0 ? Math.round(d.shipped / d.demand * 100) : 0;
            return (
              <div key={it.label} style={{ background:T.S2, borderRadius:7, padding:"10px 14px", border:"1px solid "+it.color }}>
                <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:8 }}>
                  <span style={{ color:it.color, fontWeight:700, fontSize:13 }}>{it.label}</span>
                  <span style={{ color:T.T2, fontSize:10 }}>{covPct}% of demand shipped</span>
                </div>
                <div style={{ display:"flex", alignItems:"center", gap:8, flexWrap:"wrap" }}>
                  <div style={{ textAlign:"center" }}>
                    <div style={{ color:T.T2, fontSize:9, textTransform:"uppercase" }}>Produced</div>
                    <div style={{ color:it.color, fontWeight:700, fontSize:14, fontFamily:"'JetBrains Mono',monospace" }}>{fm(d.prod)}</div>
                  </div>
                  <span style={{ color:T.T2, fontSize:14 }}>{"\u2192"}</span>
                  <div style={{ textAlign:"center" }}>
                    <div style={{ color:T.T2, fontSize:9, textTransform:"uppercase" }}>Shipped</div>
                    <div style={{ color:it.color, fontWeight:700, fontSize:14, fontFamily:"'JetBrains Mono',monospace" }}>{fm(d.shipped)}</div>
                  </div>
                  <span style={{ color:T.T2, fontSize:14 }}>{"\u2192"}</span>
                  <div style={{ textAlign:"center" }}>
                    <div style={{ color:T.T2, fontSize:9, textTransform:"uppercase" }}>Demand</div>
                    <div style={{ fontWeight:700, fontSize:14, fontFamily:"'JetBrains Mono',monospace" }}>{fm(d.demand)}</div>
                  </div>
                  <span style={{ color:T.T2, fontSize:14 }}>=</span>
                  <div style={{ textAlign:"center" }}>
                    <div style={{ color:T.T2, fontSize:9, textTransform:"uppercase" }}>{d.delta >= 0 ? "Surplus" : "Shortfall"}</div>
                    <div style={{ color:d.delta<0?"#dc2626":it.color, fontWeight:700, fontSize:14, fontFamily:"'JetBrains Mono',monospace" }}>{d.delta>=0?"+":""}{fm(d.delta)}</div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Counts row */}
      <div style={{ display: "flex", gap: 10, marginBottom: 12, flexWrap: "wrap" }}>
        {[
          { l: "Bases Shipped", v: fm(Math.round(totalBasesScheduled)), c: T.GR },
          { l: "Lids Shipped", v: fm(Math.round(totalLidsScheduled)), c: T.AC },
          { l: "Shipments", v: (ships || []).length, c: T.T2 },
          { l: "Ship Weeks", v: wks.length, c: T.AM },
        ].map(function(c2, i) {
          return (
            <div key={i} style={{ background: T.S2, borderRadius: 7, padding: "8px 14px", border: "1px solid " + T.BD, minWidth: 110 }}>
              <div style={{ color: T.T2, fontSize: 9, textTransform: "uppercase", marginBottom: 2 }}>{c2.l}</div>
              <div style={{ color: c2.c, fontSize: 17, fontWeight: 700, fontFamily: "'JetBrains Mono',monospace" }}>{c2.v}</div>
            </div>
          );
        })}
      </div>

      {noShips ? (
        <div style={{ padding: 24, textAlign: "center", color: T.T2, fontSize: 13 }}>
          No shipments in the schedule yet. Add shipments in the Shipment Details view first.
        </div>
      ) : (
        <div style={{ overflowX: "auto", maxHeight: "calc(100vh - 300px)", overflowY: "auto" }}>
          <table style={tbl}>
            <thead>
              <tr>
                <th style={{ ...th, minWidth: 200, position: "sticky", left: 0, zIndex: 4, background: T.S1 }}>SKU</th>
                <th style={{ ...th, width: 50, textAlign: "center" }}>Cat</th>
                {wks.map(function(w, wi2) {
                  var meths = {};
                  for (var si2 = 0; si2 < w.shipments.length; si2++) meths[w.shipments[si2].meth] = true;
                  var methList = Object.keys(meths).join(", ");
                  return (
                    <th key={wi2} style={{ ...th, textAlign: "right", minWidth: 72, fontSize: 9, borderTop: "3px solid " + weekMC[wi2] }}>
                      <div>{dF(w.wk)}</div>
                      <div style={{ fontSize: 8, color: weekMC[wi2], fontWeight: 600, marginTop: 1 }}>{methList}</div>
                    </th>
                  );
                })}
                <th style={{ ...th, textAlign: "right", minWidth: 80 }}>Total</th>
              </tr>
            </thead>
            <tbody>
              {/* ═══ BASES SECTION (PB- base types, from bQ) ═══ */}
              <tr>
                <td colSpan={2 + wks.length + 1} style={{ ...td, fontWeight: 700, color: T.GR, fontSize: 12, background: T.GR + "10", borderTop: "2px solid " + T.GR, borderBottom: "2px solid " + T.GR, padding: "6px 8px", position: "sticky", left: 0, zIndex: 2 }}>
                  BASES
                </td>
              </tr>

              {GROUPS.map(function(gName, gi2) {
                var gc = GROUP_COLORS[gName];
                var baseWk = byBase[gName] || new Array(wks.length).fill(0);
                var baseGrand = 0;
                for (var bwi = 0; bwi < wks.length; bwi++) baseGrand += (baseWk[bwi] || 0);
                return (
                  <tr key={"base-" + gi2} style={{ background: gi2 % 2 === 0 ? "transparent" : T.S2 + "60" }}>
                    <td style={{ ...td, fontWeight: 600, fontSize: 11, position: "sticky", left: 0, zIndex: 2, background: gi2 % 2 === 0 ? T.S1 : T.S2 + "60" }}>
                      <span style={{ display: "inline-block", width: 10, height: 10, borderRadius: 2, background: gc.hd, marginRight: 6, verticalAlign: "middle" }}></span>
                      <span style={{ color: T.TX }}>{gName}</span>
                      <span style={{ marginLeft: 6, fontSize: 9, color: T.T2 + "90" }}>{BASE_TYPES[gName].sku}</span>
                    </td>
                    <td style={{ ...td, textAlign: "center", fontSize: 9, color: T.T2 }}>Base</td>
                    {baseWk.map(function(v, wi3) {
                      var hasVal = v > 0;
                      return <td key={wi3} style={{ ...td, textAlign: "right", color: hasVal ? weekMC[wi3] : T.T2 + "30", fontWeight: hasVal ? 600 : 400, fontSize: 11, background: hasVal ? weekMC[wi3] + "10" : undefined }}>{hasVal ? fm(Math.round(v)) : ""}</td>;
                    })}
                    <td style={{ ...td, textAlign: "right", fontWeight: 700, fontSize: 11 }}>{baseGrand > 0 ? fm(Math.round(baseGrand)) : ""}</td>
                  </tr>
                );
              })}

              {/* Bases Subtotal */}
              {(function() {
                var bT = new Array(wks.length).fill(0);
                for (var wi6 = 0; wi6 < wks.length; wi6++) {
                  for (var sbi = 0; sbi < wks[wi6].shipments.length; sbi++) bT[wi6] += (wks[wi6].shipments[sbi].bQ || 0);
                }
                var basesGrand = 0; for (var gi3 = 0; gi3 < wks.length; gi3++) basesGrand += bT[gi3];
                return (
                  <tr style={{ background: T.GR + "10" }}>
                    <td colSpan={2} style={{ ...td, fontWeight: 700, color: T.GR, borderTop: "2px solid " + T.GR, fontSize: 11, position: "sticky", left: 0, zIndex: 2, background: T.GR + "10" }}>BASES SUBTOTAL</td>
                    {bT.map(function(v, i) { return <td key={i} style={{ ...td, textAlign: "right", fontWeight: 700, color: v > 0 ? weekMC[i] : T.GR, borderTop: "2px solid " + T.GR, fontSize: 11 }}>{v > 0 ? fm(Math.round(v)) : ""}</td>; })}
                    <td style={{ ...td, textAlign: "right", fontWeight: 700, color: T.GR, borderTop: "2px solid " + T.GR, fontSize: 12 }}>{fm(Math.round(basesGrand))}</td>
                  </tr>
                );
              })()}

              {/* ═══ LIDS SECTION (PL- lid SKUs, from lQ) ═══ */}
              <tr>
                <td colSpan={2 + wks.length + 1} style={{ ...td, fontWeight: 700, color: T.AC, fontSize: 12, background: T.AC + "10", borderTop: "3px solid " + T.AC, borderBottom: "2px solid " + T.AC, padding: "6px 8px", position: "sticky", left: 0, zIndex: 2 }}>
                  LIDS
                </td>
              </tr>

              {groups.map(function(g, gi2) {
                var gc = GROUP_COLORS[g.name];
                var groupWkTotals = new Array(wks.length).fill(0);
                var groupGrand = 0;
                for (var ri2 = 0; ri2 < g.rows.length; ri2++) {
                  var skuWk = byLid[g.rows[ri2].sku] || new Array(wks.length).fill(0);
                  for (var wi3 = 0; wi3 < wks.length; wi3++) { groupWkTotals[wi3] += (skuWk[wi3] || 0); groupGrand += (skuWk[wi3] || 0); }
                }

                var headerRow = (
                  <tr key={"lhdr-" + gi2}>
                    <td colSpan={2} style={{ ...td, fontWeight: 700, color: gc.tx, background: gc.hd, fontSize: 11, borderBottom: "2px solid " + gc.hd, position: "sticky", left: 0, zIndex: 3 }}>
                      {LID_GROUP_NAMES[g.name] || g.name + " Lids"}
                    </td>
                    {groupWkTotals.map(function(v, wi4) {
                      return <td key={wi4} style={{ ...td, textAlign: "right", fontWeight: 700, color: v > 0 ? weekMC[wi4] : gc.tx, background: gc.hd, fontSize: 10, borderBottom: "2px solid " + gc.hd }}>{v > 0 ? fm(Math.round(v)) : ""}</td>;
                    })}
                    <td style={{ ...td, textAlign: "right", fontWeight: 700, color: gc.tx, background: gc.hd, fontSize: 10, borderBottom: "2px solid " + gc.hd }}>{fm(Math.round(groupGrand))}</td>
                  </tr>
                );

                var dataRows = g.rows.map(function(row, rowIdx) {
                  var skuWeekly = byLid[row.sku] || new Array(wks.length).fill(0);
                  var rowTotal = 0;
                  for (var rti = 0; rti < wks.length; rti++) rowTotal += (skuWeekly[rti] || 0);

                  return (
                    <tr key={"lrow-" + gi2 + "-" + rowIdx} style={{ background: rowIdx % 2 === 0 ? "transparent" : T.S2 + "60" }}>
                      <td style={{ ...td, fontWeight: 500, fontSize: 11, position: "sticky", left: 0, zIndex: 2, background: rowIdx % 2 === 0 ? T.S1 : T.S2 + "60" }}>
                        <span style={{ color: T.TX }}>{row.name}</span>
                        <span style={{ marginLeft: 6, fontSize: 9, color: T.T2 + "90" }}>{row.sku !== "_unmapped" ? row.sku : ""}</span>
                      </td>
                      <td style={{ ...td, textAlign: "center", fontSize: 9, color: T.T2 }}>{row.cat}</td>
                      {skuWeekly.map(function(v, wi5) {
                        var hasVal = v > 0;
                        return <td key={wi5} style={{ ...td, textAlign: "right", color: hasVal ? weekMC[wi5] : T.T2 + "30", fontWeight: hasVal ? 600 : 400, fontSize: 11, background: hasVal ? weekMC[wi5] + "10" : undefined }}>{hasVal ? fm(Math.round(v)) : ""}</td>;
                      })}
                      <td style={{ ...td, textAlign: "right", fontWeight: 700, fontSize: 11 }}>{rowTotal > 0 ? fm(Math.round(rowTotal)) : ""}</td>
                    </tr>
                  );
                });

                return [headerRow].concat(dataRows);
              })}

              {/* Lids Subtotal */}
              {(function() {
                var lT = new Array(wks.length).fill(0);
                for (var wi7 = 0; wi7 < wks.length; wi7++) {
                  for (var sli = 0; sli < wks[wi7].shipments.length; sli++) lT[wi7] += (wks[wi7].shipments[sli].lQ || 0);
                }
                var lidsGrand = 0; for (var gi4 = 0; gi4 < wks.length; gi4++) lidsGrand += lT[gi4];
                return (
                  <tr style={{ background: T.AC + "10" }}>
                    <td colSpan={2} style={{ ...td, fontWeight: 700, color: T.AC, borderTop: "2px solid " + T.AC, fontSize: 11, position: "sticky", left: 0, zIndex: 2, background: T.AC + "10" }}>LIDS SUBTOTAL</td>
                    {lT.map(function(v, i) { return <td key={i} style={{ ...td, textAlign: "right", fontWeight: 700, color: v > 0 ? weekMC[i] : T.AC, borderTop: "2px solid " + T.AC, fontSize: 11 }}>{v > 0 ? fm(Math.round(v)) : ""}</td>; })}
                    <td style={{ ...td, textAlign: "right", fontWeight: 700, color: T.AC, borderTop: "2px solid " + T.AC, fontSize: 12 }}>{fm(Math.round(lidsGrand))}</td>
                  </tr>
                );
              })()}

              {/* ═══ COMBINED TOTAL ═══ */}
              {(function() {
                var cT = new Array(wks.length).fill(0);
                for (var wi9 = 0; wi9 < wks.length; wi9++) {
                  for (var sci = 0; sci < wks[wi9].shipments.length; sci++) {
                    cT[wi9] += (wks[wi9].shipments[sci].bQ || 0) + (wks[wi9].shipments[sci].lQ || 0);
                  }
                }
                var combinedGrand = 0; for (var gi6 = 0; gi6 < wks.length; gi6++) combinedGrand += cT[gi6];
                return (
                  <tr style={{ background: T.AM + "10" }}>
                    <td colSpan={2} style={{ ...td, fontWeight: 700, color: T.AM, borderTop: "3px solid " + T.AM, fontSize: 11, position: "sticky", left: 0, zIndex: 2, background: T.AM + "10" }}>TOTAL (B + L)</td>
                    {cT.map(function(v, i) { return <td key={i} style={{ ...td, textAlign: "right", fontWeight: 700, color: v > 0 ? weekMC[i] : T.AM, borderTop: "3px solid " + T.AM, fontSize: 11 }}>{v > 0 ? fm(Math.round(v)) : ""}</td>; })}
                    <td style={{ ...td, textAlign: "right", fontWeight: 700, color: T.AM, borderTop: "3px solid " + T.AM, fontSize: 12 }}>{fm(Math.round(combinedGrand))}</td>
                  </tr>
                );
              })()}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
