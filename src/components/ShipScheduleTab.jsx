import { useMemo } from "react";
import { MASTER_SKUS, BASE_TYPES } from "../data/skuMaster";
import { calcSkuDemand, calcGLD } from "../utils/calc";
import { fm, dF } from "../utils/format";
import { T, tbl, th, td } from "../utils/theme";

var GROUPS = ["Black Sparkle", "White"];
var GROUP_COLORS = { "Black Sparkle": { hd: "#1a1a2e", tx: "#fff" }, "White": { hd: "#6b7280", tx: "#fff" } };

// Build weekly SKU ship schedule from displayShips + skuDemand
function buildSchedule(ships, skuDemand) {
  if (!ships || ships.length === 0) return { weeks: [], bySku: {} };

  var allSkus = Object.keys(skuDemand);

  // Pre-compute annual demand per SKU (fallback for months with zero demand)
  var annualDem = {};
  var totalAnnualDem = 0;
  for (var ai = 0; ai < allSkus.length; ai++) {
    var annSum = 0;
    var d2 = skuDemand[allSkus[ai]];
    if (d2) for (var am = 0; am < 12; am++) annSum += (d2[am] || 0);
    annualDem[allSkus[ai]] = annSum;
    totalAnnualDem += annSum;
  }

  // Snap date to the production-week grid (every 7 days from Mar 9 2026)
  var PROD_START = new Date(2026, 2, 9).getTime();
  var WEEK_MS = 7 * 86400000;
  function snapToProductionWeek(date) {
    var t = date.getTime();
    var diff = t - PROD_START;
    var wkIdx = Math.round(diff / WEEK_MS);
    return new Date(PROD_START + wkIdx * WEEK_MS);
  }

  // Group shipments by production week (same grid as unified view)
  // Include shipments with bQ > 0 OR lQ > 0
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

  var bySku = {};
  for (var si = 0; si < allSkus.length; si++) bySku[allSkus[si]] = new Array(weeks.length).fill(0);

  for (var wki = 0; wki < weeks.length; wki++) {
    var wkShips = weeks[wki].shipments;
    for (var shi = 0; shi < wkShips.length; shi++) {
      var s = wkShips[shi];
      if (s.bQ <= 0) continue; // SKU allocation only for bases

      // Use ARRIVAL month for proportions
      var arrMo = s.bAr ? s.bAr.getMonth() : (s.mo != null ? s.mo : -1);

      var useMonthly = false;
      var totalDem = 0;
      if (arrMo >= 0 && arrMo <= 11) {
        for (var ski = 0; ski < allSkus.length; ski++) {
          var dem = skuDemand[allSkus[ski]];
          if (dem) totalDem += (dem[arrMo] || 0);
        }
        if (totalDem > 0) useMonthly = true;
      }
      if (!useMonthly) totalDem = totalAnnualDem;
      if (totalDem <= 0) continue;

      var allocated = 0;
      var skuAllocs = [];
      for (var ski2 = 0; ski2 < allSkus.length; ski2++) {
        var skuCode = allSkus[ski2];
        var skuDem = useMonthly
          ? ((skuDemand[skuCode] && skuDemand[skuCode][arrMo]) || 0)
          : (annualDem[skuCode] || 0);
        if (skuDem <= 0) { skuAllocs.push(0); continue; }
        var share = Math.round(s.bQ * skuDem / totalDem);
        skuAllocs.push(share);
        allocated += share;
      }
      var remainder = s.bQ - allocated;
      if (remainder !== 0) {
        var maxIdx = 0, maxVal = 0;
        for (var fi = 0; fi < skuAllocs.length; fi++) {
          if (skuAllocs[fi] > maxVal) { maxVal = skuAllocs[fi]; maxIdx = fi; }
        }
        skuAllocs[maxIdx] += remainder;
      }
      for (var ski3 = 0; ski3 < allSkus.length; ski3++) {
        if (!bySku[allSkus[ski3]]) bySku[allSkus[ski3]] = new Array(weeks.length).fill(0);
        bySku[allSkus[ski3]][wki] += skuAllocs[ski3];
      }
    }
  }

  return { weeks: weeks, bySku: bySku };
}

export default function ShipScheduleTab({ sc, ships, prod, gld }) {
  var skuDemand = useMemo(function() { return calcSkuDemand(sc.markets); }, [sc.markets]);
  var schedule = useMemo(function() { return buildSchedule(ships, skuDemand); }, [ships, skuDemand]);

  // Build grouped rows
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
    // Add unmapped row if any
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
  var byS = schedule.bySku;
  var noShips = wks.length === 0;

  var totalBasesScheduled = 0, totalLidsScheduled = 0;
  for (var tsi = 0; tsi < (ships || []).length; tsi++) {
    totalBasesScheduled += (ships[tsi].bQ || 0);
    totalLidsScheduled += (ships[tsi].lQ || 0);
  }

  return (
    <div style={{ padding: "14px 18px" }}>
      {/* Pipeline Summary Cards: Bases & Lids */}
      {pipeline && (
        <div style={{ display: "flex", gap: 8, marginBottom: 12, flexWrap: "wrap" }}>
          {[{label:"Bases",color:T.GR,d:pipeline.base},{label:"Lids",color:T.AC,d:pipeline.lid}].map(function(it) {
            var d = it.d;
            var covPct = d.demand > 0 ? Math.round(d.shipped / d.demand * 100) : 0;
            return (
              <div key={it.label} style={{ flex:"1 1 300px", background:T.S2, borderRadius:7, padding:"10px 14px", border:"1px solid "+it.color, minWidth:300 }}>
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
                    <th key={wi2} style={{ ...th, textAlign: "right", minWidth: 72, fontSize: 9 }}>
                      <div>{dF(w.wk)}</div>
                      <div style={{ fontSize: 8, color: T.T2, fontWeight: 400, marginTop: 1 }}>{methList}</div>
                    </th>
                  );
                })}
                <th style={{ ...th, textAlign: "right", minWidth: 80 }}>Total</th>
              </tr>
            </thead>
            <tbody>
              {/* ═══ BASES SECTION ═══ */}
              <tr>
                <td colSpan={2 + wks.length + 1} style={{ ...td, fontWeight: 700, color: T.GR, fontSize: 12, background: T.GR + "10", borderTop: "2px solid " + T.GR, borderBottom: "2px solid " + T.GR, padding: "6px 8px", position: "sticky", left: 0, zIndex: 2 }}>
                  BASES
                </td>
              </tr>

              {groups.map(function(g, gi2) {
                var gc = GROUP_COLORS[g.name];
                var groupWkTotals = new Array(wks.length).fill(0);
                var groupGrand = 0;
                for (var ri2 = 0; ri2 < g.rows.length; ri2++) {
                  var skuWk = byS[g.rows[ri2].sku] || new Array(wks.length).fill(0);
                  for (var wi3 = 0; wi3 < wks.length; wi3++) { groupWkTotals[wi3] += (skuWk[wi3] || 0); groupGrand += (skuWk[wi3] || 0); }
                }

                var headerRow = (
                  <tr key={"shdr-" + gi2}>
                    <td colSpan={2} style={{ ...td, fontWeight: 700, color: gc.tx, background: gc.hd, fontSize: 11, borderBottom: "2px solid " + gc.hd, position: "sticky", left: 0, zIndex: 3 }}>
                      {g.name} ({g.baseSku})
                    </td>
                    {groupWkTotals.map(function(v, wi4) {
                      return <td key={wi4} style={{ ...td, textAlign: "right", fontWeight: 700, color: gc.tx, background: gc.hd, fontSize: 10, borderBottom: "2px solid " + gc.hd }}>{v > 0 ? fm(Math.round(v)) : ""}</td>;
                    })}
                    <td style={{ ...td, textAlign: "right", fontWeight: 700, color: gc.tx, background: gc.hd, fontSize: 10, borderBottom: "2px solid " + gc.hd }}>{fm(Math.round(groupGrand))}</td>
                  </tr>
                );

                var dataRows = g.rows.map(function(row, rowIdx) {
                  var skuWeekly = byS[row.sku] || new Array(wks.length).fill(0);
                  var rowTotal = 0;
                  for (var rti = 0; rti < wks.length; rti++) rowTotal += (skuWeekly[rti] || 0);

                  return (
                    <tr key={"srow-" + gi2 + "-" + rowIdx} style={{ background: rowIdx % 2 === 0 ? "transparent" : T.S2 + "60" }}>
                      <td style={{ ...td, fontWeight: 500, fontSize: 11, position: "sticky", left: 0, zIndex: 2, background: rowIdx % 2 === 0 ? T.S1 : T.S2 + "60" }}>
                        <span style={{ color: T.TX }}>{row.name}</span>
                        <span style={{ marginLeft: 6, fontSize: 9, color: T.T2 + "90" }}>{row.sku !== "_unmapped" ? row.sku : ""}</span>
                      </td>
                      <td style={{ ...td, textAlign: "center", fontSize: 9, color: T.T2 }}>{row.cat}</td>
                      {skuWeekly.map(function(v, wi5) {
                        var hasVal = v > 0;
                        return <td key={wi5} style={{ ...td, textAlign: "right", color: hasVal ? T.TX : T.T2 + "30", fontSize: 11, background: hasVal ? "#f0fdf440" : undefined }}>{hasVal ? fm(Math.round(v)) : ""}</td>;
                      })}
                      <td style={{ ...td, textAlign: "right", fontWeight: 700, fontSize: 11 }}>{rowTotal > 0 ? fm(Math.round(rowTotal)) : ""}</td>
                    </tr>
                  );
                });

                return [headerRow].concat(dataRows);
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
                    {bT.map(function(v, i) { return <td key={i} style={{ ...td, textAlign: "right", fontWeight: 700, color: T.GR, borderTop: "2px solid " + T.GR, fontSize: 11 }}>{v > 0 ? fm(Math.round(v)) : ""}</td>; })}
                    <td style={{ ...td, textAlign: "right", fontWeight: 700, color: T.GR, borderTop: "2px solid " + T.GR, fontSize: 12 }}>{fm(Math.round(basesGrand))}</td>
                  </tr>
                );
              })()}

              {/* ═══ LIDS SECTION ═══ */}
              <tr>
                <td colSpan={2 + wks.length + 1} style={{ ...td, fontWeight: 700, color: T.AC, fontSize: 12, background: T.AC + "10", borderTop: "3px solid " + T.AC, borderBottom: "2px solid " + T.AC, padding: "6px 8px", position: "sticky", left: 0, zIndex: 2 }}>
                  LIDS
                </td>
              </tr>

              {/* Lids per shipment week */}
              {(function() {
                var lT = new Array(wks.length).fill(0);
                for (var wi7 = 0; wi7 < wks.length; wi7++) {
                  for (var sli = 0; sli < wks[wi7].shipments.length; sli++) lT[wi7] += (wks[wi7].shipments[sli].lQ || 0);
                }
                var lidsGrand = 0; for (var gi4 = 0; gi4 < wks.length; gi4++) lidsGrand += lT[gi4];
                return (
                  <tr style={{ background: T.AC + "08" }}>
                    <td colSpan={2} style={{ ...td, fontWeight: 600, color: T.AC, fontSize: 11, position: "sticky", left: 0, zIndex: 2, background: T.AC + "08" }}>Lid Quantity</td>
                    {lT.map(function(v, i) { return <td key={i} style={{ ...td, textAlign: "right", fontWeight: 600, color: T.AC, fontSize: 11, background: v > 0 ? "#eff6ff40" : undefined }}>{v > 0 ? fm(Math.round(v)) : ""}</td>; })}
                    <td style={{ ...td, textAlign: "right", fontWeight: 700, color: T.AC, fontSize: 12 }}>{fm(Math.round(lidsGrand))}</td>
                  </tr>
                );
              })()}

              {/* Lids Subtotal */}
              {(function() {
                var lT2 = new Array(wks.length).fill(0);
                for (var wi8 = 0; wi8 < wks.length; wi8++) {
                  for (var sli2 = 0; sli2 < wks[wi8].shipments.length; sli2++) lT2[wi8] += (wks[wi8].shipments[sli2].lQ || 0);
                }
                var lidsGrand2 = 0; for (var gi5 = 0; gi5 < wks.length; gi5++) lidsGrand2 += lT2[gi5];
                return (
                  <tr style={{ background: T.AC + "10" }}>
                    <td colSpan={2} style={{ ...td, fontWeight: 700, color: T.AC, borderTop: "2px solid " + T.AC, fontSize: 11, position: "sticky", left: 0, zIndex: 2, background: T.AC + "10" }}>LIDS SUBTOTAL</td>
                    {lT2.map(function(v, i) { return <td key={i} style={{ ...td, textAlign: "right", fontWeight: 700, color: T.AC, borderTop: "2px solid " + T.AC, fontSize: 11 }}>{v > 0 ? fm(Math.round(v)) : ""}</td>; })}
                    <td style={{ ...td, textAlign: "right", fontWeight: 700, color: T.AC, borderTop: "2px solid " + T.AC, fontSize: 12 }}>{fm(Math.round(lidsGrand2))}</td>
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
                    {cT.map(function(v, i) { return <td key={i} style={{ ...td, textAlign: "right", fontWeight: 700, color: T.AM, borderTop: "3px solid " + T.AM, fontSize: 11 }}>{v > 0 ? fm(Math.round(v)) : ""}</td>; })}
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
