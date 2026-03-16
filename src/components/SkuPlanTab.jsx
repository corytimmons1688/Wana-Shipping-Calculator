import { useMemo, useState } from "react";
import { MO } from "../data/defaults";
import { MASTER_SKUS, BASE_TYPES } from "../data/skuMaster";
import { calcSkuDemand } from "../utils/calc";
import { fm, dF } from "../utils/format";
import { T, tbl, th, td } from "../utils/theme";
import { Ed } from "./Shared";

var GROUPS = ["Black Sparkle", "White"];
var GROUP_COLORS = { "Black Sparkle": { hd: "#1a1a2e", tx: "#fff", bg: "#1a1a2e18" }, "White": { hd: "#6b7280", tx: "#fff", bg: "#f3f4f618" } };

// Build weekly SKU ship schedule from displayShips + skuDemand
function buildSchedule(ships, skuDemand) {
  if (!ships || ships.length === 0) return { weeks: [], bySku: {} };

  // Collect all SKU codes that have demand
  var allSkus = Object.keys(skuDemand);

  // Group shipments by departure week (snap to start of week — Sunday)
  var weekMap = {};
  for (var i = 0; i < ships.length; i++) {
    var sh = ships[i];
    if (!sh.bSd || sh.bQ <= 0) continue;
    // Snap to Monday of the week
    var d = new Date(sh.bSd);
    var day = d.getDay();
    var diff = day === 0 ? -6 : 1 - day; // Monday = 1
    var monday = new Date(d);
    monday.setDate(monday.getDate() + diff);
    monday.setHours(0,0,0,0);
    var key = monday.getTime();
    if (!weekMap[key]) weekMap[key] = { wk: monday, shipments: [] };
    weekMap[key].shipments.push(sh);
  }

  // Sort weeks chronologically
  var weekKeys = Object.keys(weekMap).map(Number).sort(function(a, b) { return a - b; });
  var weeks = [];
  for (var wi = 0; wi < weekKeys.length; wi++) weeks.push(weekMap[weekKeys[wi]]);

  // For each week, distribute total bQ across SKUs proportionally by target month demand
  var bySku = {};
  for (var si = 0; si < allSkus.length; si++) bySku[allSkus[si]] = new Array(weeks.length).fill(0);

  for (var wki = 0; wki < weeks.length; wki++) {
    var wkShips = weeks[wki].shipments;
    for (var shi = 0; shi < wkShips.length; shi++) {
      var s = wkShips[shi];
      var mo = s.mo;
      if (mo == null || mo < 0 || mo > 11) continue;

      // Compute total demand for this month across all SKUs
      var totalMonthDem = 0;
      for (var ski = 0; ski < allSkus.length; ski++) {
        var dem = skuDemand[allSkus[ski]];
        if (dem) totalMonthDem += (dem[mo] || 0);
      }
      if (totalMonthDem <= 0) continue;

      // Distribute bQ proportionally
      var allocated = 0;
      var skuAllocs = [];
      for (var ski2 = 0; ski2 < allSkus.length; ski2++) {
        var skuCode = allSkus[ski2];
        var skuMoDem = (skuDemand[skuCode] && skuDemand[skuCode][mo]) || 0;
        if (skuMoDem <= 0) { skuAllocs.push(0); continue; }
        var share = Math.round(s.bQ * skuMoDem / totalMonthDem);
        skuAllocs.push(share);
        allocated += share;
      }
      // Fix rounding: add/subtract remainder to largest SKU
      var remainder = s.bQ - allocated;
      if (remainder !== 0) {
        var maxIdx = 0, maxVal = 0;
        for (var fi = 0; fi < skuAllocs.length; fi++) {
          if (skuAllocs[fi] > maxVal) { maxVal = skuAllocs[fi]; maxIdx = fi; }
        }
        skuAllocs[maxIdx] += remainder;
      }
      // Add to bySku
      for (var ski3 = 0; ski3 < allSkus.length; ski3++) {
        if (!bySku[allSkus[ski3]]) bySku[allSkus[ski3]] = new Array(weeks.length).fill(0);
        bySku[allSkus[ski3]][wki] += skuAllocs[ski3];
      }
    }
  }

  return { weeks: weeks, bySku: bySku };
}

export default function SkuPlanTab({ sc, upd, ships }) {
  var viewState = useState("demand"); // "demand" | "prod" | "ship" | "schedule"
  var view = viewState[0], setView = viewState[1];

  var skuDemand = useMemo(function() { return calcSkuDemand(sc.markets); }, [sc.markets]);

  // Build weekly ship schedule from actual shipments
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

  function getPlan(skuCode) {
    return (sc.skuPlan && sc.skuPlan[skuCode]) || null;
  }

  function updPlan(skuCode, field, moIdx, val) {
    upd(function(s) {
      if (!s.skuPlan) s.skuPlan = {};
      if (!s.skuPlan[skuCode]) s.skuPlan[skuCode] = { prod: [0,0,0,0,0,0,0,0,0,0,0,0], ship: [0,0,0,0,0,0,0,0,0,0,0,0] };
      s.skuPlan[skuCode][field][moIdx] = val;
    });
  }

  function fillFromDemand(groupName) {
    upd(function(s) {
      if (!s.skuPlan) s.skuPlan = {};
      var dem = calcSkuDemand(s.markets);
      var skus = MASTER_SKUS.filter(function(sk) { return sk.base === groupName; });
      for (var i = 0; i < skus.length; i++) {
        var code = skus[i].sku;
        var d = dem[code] || new Array(12).fill(0);
        if (!s.skuPlan[code]) s.skuPlan[code] = { prod: [0,0,0,0,0,0,0,0,0,0,0,0], ship: [0,0,0,0,0,0,0,0,0,0,0,0] };
        for (var m = 0; m < 12; m++) {
          s.skuPlan[code].prod[m] = Math.round(d[m]);
          s.skuPlan[code].ship[m] = Math.round(d[m]);
        }
      }
    });
  }

  function fillAllFromDemand() {
    upd(function(s) {
      if (!s.skuPlan) s.skuPlan = {};
      var dem = calcSkuDemand(s.markets);
      for (var i = 0; i < MASTER_SKUS.length; i++) {
        var code = MASTER_SKUS[i].sku;
        var d = dem[code] || new Array(12).fill(0);
        if (!s.skuPlan[code]) s.skuPlan[code] = { prod: [0,0,0,0,0,0,0,0,0,0,0,0], ship: [0,0,0,0,0,0,0,0,0,0,0,0] };
        for (var m = 0; m < 12; m++) {
          s.skuPlan[code].prod[m] = Math.round(d[m]);
          s.skuPlan[code].ship[m] = Math.round(d[m]);
        }
      }
      if (dem._unmapped) {
        if (!s.skuPlan._unmapped) s.skuPlan._unmapped = { prod: [0,0,0,0,0,0,0,0,0,0,0,0], ship: [0,0,0,0,0,0,0,0,0,0,0,0] };
        for (var um = 0; um < 12; um++) {
          s.skuPlan._unmapped.prod[um] = Math.round(dem._unmapped[um]);
          s.skuPlan._unmapped.ship[um] = Math.round(dem._unmapped[um]);
        }
      }
    });
  }

  // Compute summary totals
  var totalDem = 0, bsDem = 0, whDem = 0;
  for (var gi = 0; gi < groups.length; gi++) {
    for (var ri = 0; ri < groups[gi].rows.length; ri++) {
      var rowDem = groups[gi].rows[ri].demand;
      for (var di = 0; di < 12; di++) {
        totalDem += rowDem[di];
        if (groups[gi].name === "Black Sparkle") bsDem += rowDem[di];
        else whDem += rowDem[di];
      }
    }
  }

  // Schedule totals
  var totalScheduled = 0;
  if (view === "schedule") {
    for (var tsi = 0; tsi < (ships || []).length; tsi++) totalScheduled += ((ships[tsi].bQ || 0));
  }

  var isEditView = view === "prod" || view === "ship";
  var isSchedule = view === "schedule";

  // ── SCHEDULE VIEW ────────────────────────────────────────────────────────────
  if (isSchedule) {
    var wks = schedule.weeks;
    var byS = schedule.bySku;
    var noShips = wks.length === 0;

    return (
      <div style={{ padding: "14px 18px" }}>
        {/* Summary Cards */}
        <div style={{ display: "flex", gap: 10, marginBottom: 12, flexWrap: "wrap" }}>
          {[
            { l: "Total Scheduled", v: fm(Math.round(totalScheduled)), c: T.AC },
            { l: "Shipments", v: (ships || []).length, c: T.GR },
            { l: "Ship Weeks", v: wks.length, c: T.AM },
          ].map(function(c2, i) {
            return (
              <div key={i} style={{ background: T.S2, borderRadius: 7, padding: "8px 14px", border: "1px solid " + T.BD, minWidth: 120 }}>
                <div style={{ color: T.T2, fontSize: 9, textTransform: "uppercase", marginBottom: 2 }}>{c2.l}</div>
                <div style={{ color: c2.c, fontSize: 17, fontWeight: 700, fontFamily: "'JetBrains Mono',monospace" }}>{c2.v}</div>
              </div>
            );
          })}
        </div>

        {/* View Toggle */}
        <div style={{ display: "flex", gap: 5, marginBottom: 12, alignItems: "center", flexWrap: "wrap" }}>
          {[["demand","Demand"],["prod","Production Plan"],["ship","Ship Plan"],["schedule","Ship Schedule"]].map(function(v) {
            var k = v[0], l = v[1], a = view === k;
            return <button key={k} onClick={function() { setView(k); }} style={{ padding: "4px 12px", borderRadius: 5, border: "1px solid " + (a ? T.AC : T.BD), background: a ? T.AC + "15" : "transparent", color: a ? T.AC : T.T2, cursor: "pointer", fontSize: 11, fontWeight: 600, fontFamily: "inherit" }}>{l}</button>;
          })}
        </div>

        {noShips ? (
          <div style={{ padding: 24, textAlign: "center", color: T.T2, fontSize: 13 }}>
            No shipments in the schedule yet. Add shipments in the Shipment Details view first.
          </div>
        ) : (
          <div style={{ overflowX: "auto", maxHeight: "calc(100vh - 280px)", overflowY: "auto" }}>
            <table style={tbl}>
              <thead>
                <tr>
                  <th style={{ ...th, minWidth: 200, position: "sticky", left: 0, zIndex: 4, background: T.S1 }}>SKU</th>
                  <th style={{ ...th, width: 50, textAlign: "center" }}>Cat</th>
                  {wks.map(function(w, wi2) {
                    // Show method badges for this week's shipments
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
                {groups.map(function(g, gi2) {
                  var gc = GROUP_COLORS[g.name];
                  // Group subtotals per week
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

                {/* Grand Total Row */}
                {(function() {
                  var gT = new Array(wks.length).fill(0);
                  for (var tgi = 0; tgi < groups.length; tgi++) {
                    for (var tri = 0; tri < groups[tgi].rows.length; tri++) {
                      var skuW = byS[groups[tgi].rows[tri].sku] || new Array(wks.length).fill(0);
                      for (var twi = 0; twi < wks.length; twi++) gT[twi] += (skuW[twi] || 0);
                    }
                  }
                  var grandTotal = 0; for (var gti = 0; gti < wks.length; gti++) grandTotal += gT[gti];
                  return (
                    <tr style={{ background: T.AC + "10" }}>
                      <td colSpan={2} style={{ ...td, fontWeight: 700, color: T.AC, borderTop: "2px solid " + T.AC, position: "sticky", left: 0, zIndex: 2, background: T.AC + "10" }}>TOTAL</td>
                      {gT.map(function(v, i) { return <td key={i} style={{ ...td, textAlign: "right", fontWeight: 700, color: T.AC, borderTop: "2px solid " + T.AC }}>{v > 0 ? fm(Math.round(v)) : ""}</td>; })}
                      <td style={{ ...td, textAlign: "right", fontWeight: 700, color: T.AC, borderTop: "2px solid " + T.AC }}>{fm(Math.round(grandTotal))}</td>
                    </tr>
                  );
                })()}

                {/* Per-week shipment total row (bQ totals for validation) */}
                <tr style={{ background: T.GR + "08" }}>
                  <td colSpan={2} style={{ ...td, fontWeight: 600, color: T.GR, fontSize: 10, position: "sticky", left: 0, zIndex: 2, background: T.GR + "08" }}>Shipment bQ</td>
                  {wks.map(function(w, wi6) {
                    var wkBQ = 0;
                    for (var sbi = 0; sbi < w.shipments.length; sbi++) wkBQ += (w.shipments[sbi].bQ || 0);
                    return <td key={wi6} style={{ ...td, textAlign: "right", fontWeight: 600, color: T.GR, fontSize: 10 }}>{wkBQ > 0 ? fm(wkBQ) : ""}</td>;
                  })}
                  <td style={{ ...td, textAlign: "right", fontWeight: 700, color: T.GR, fontSize: 10 }}>{fm(Math.round(totalScheduled))}</td>
                </tr>
              </tbody>
            </table>
          </div>
        )}
      </div>
    );
  }

  // ── MONTHLY VIEWS (Demand / Prod / Ship) ─────────────────────────────────────
  return (
    <div style={{ padding: "14px 18px" }}>
      {/* Summary Cards */}
      <div style={{ display: "flex", gap: 10, marginBottom: 12, flexWrap: "wrap" }}>
        {[
          { l: "Total SKU Demand", v: fm(Math.round(totalDem)), c: T.AC },
          { l: "Black Sparkle", v: fm(Math.round(bsDem)), c: "#1a1a2e" },
          { l: "White Base", v: fm(Math.round(whDem)), c: T.T2 },
        ].map(function(c2, i) {
          return (
            <div key={i} style={{ background: T.S2, borderRadius: 7, padding: "8px 14px", border: "1px solid " + T.BD, minWidth: 120 }}>
              <div style={{ color: T.T2, fontSize: 9, textTransform: "uppercase", marginBottom: 2 }}>{c2.l}</div>
              <div style={{ color: c2.c, fontSize: 17, fontWeight: 700, fontFamily: "'JetBrains Mono',monospace" }}>{c2.v}</div>
            </div>
          );
        })}
      </div>

      {/* View Toggle + Fill Button */}
      <div style={{ display: "flex", gap: 5, marginBottom: 12, alignItems: "center", flexWrap: "wrap" }}>
        {[["demand","Demand"],["prod","Production Plan"],["ship","Ship Plan"],["schedule","Ship Schedule"]].map(function(v) {
          var k = v[0], l = v[1], a = view === k;
          return <button key={k} onClick={function() { setView(k); }} style={{ padding: "4px 12px", borderRadius: 5, border: "1px solid " + (a ? T.AC : T.BD), background: a ? T.AC + "15" : "transparent", color: a ? T.AC : T.T2, cursor: "pointer", fontSize: 11, fontWeight: 600, fontFamily: "inherit" }}>{l}</button>;
        })}
        <div style={{ flex: 1 }} />
        {isEditView && (
          <button onClick={function() { fillAllFromDemand(); }} style={{ padding: "4px 12px", borderRadius: 5, border: "1px solid " + T.GR, background: T.GR + "15", color: T.GR, cursor: "pointer", fontSize: 10, fontWeight: 700, fontFamily: "inherit" }}>
            Fill All from Demand
          </button>
        )}
      </div>

      {/* Table */}
      <div style={{ overflowX: "auto", maxHeight: "calc(100vh - 280px)", overflowY: "auto" }}>
        <table style={tbl}>
          <thead>
            <tr>
              <th style={{ ...th, minWidth: 200, position: "sticky", left: 0, zIndex: 4, background: T.S1 }}>SKU</th>
              <th style={{ ...th, width: 60, textAlign: "center" }}>Cat</th>
              {MO.map(function(m, i) { return <th key={i} style={{ ...th, textAlign: "right", minWidth: 68 }}>{m}</th>; })}
              <th style={{ ...th, textAlign: "right", minWidth: 80 }}>Annual</th>
            </tr>
          </thead>
          <tbody>
            {groups.map(function(g, gi2) {
              var gc = GROUP_COLORS[g.name];
              var groupAnn = new Array(12).fill(0);
              var groupProdAnn = new Array(12).fill(0);
              var groupShipAnn = new Array(12).fill(0);
              for (var ri2 = 0; ri2 < g.rows.length; ri2++) {
                for (var mi2 = 0; mi2 < 12; mi2++) {
                  groupAnn[mi2] += g.rows[ri2].demand[mi2];
                  var p2 = getPlan(g.rows[ri2].sku);
                  if (p2) { groupProdAnn[mi2] += (p2.prod[mi2] || 0); groupShipAnn[mi2] += (p2.ship[mi2] || 0); }
                }
              }
              var groupTotal = 0; for (var gt = 0; gt < 12; gt++) groupTotal += groupAnn[gt];
              var groupProdTotal = 0; for (var gp = 0; gp < 12; gp++) groupProdTotal += groupProdAnn[gp];
              var groupShipTotal = 0; for (var gs = 0; gs < 12; gs++) groupShipTotal += groupShipAnn[gs];

              var headerRow = (
                <tr key={"hdr-" + gi2}>
                  <td colSpan={2} style={{ ...td, fontWeight: 700, color: gc.tx, background: gc.hd, fontSize: 11, borderBottom: "2px solid " + gc.hd, position: "sticky", left: 0, zIndex: 3 }}>
                    {g.name} ({g.baseSku})
                    {isEditView && (
                      <button onClick={function() { var n = g.name; fillFromDemand(n); }} style={{ marginLeft: 8, padding: "1px 8px", borderRadius: 3, border: "1px solid " + gc.tx + "60", background: "transparent", color: gc.tx, cursor: "pointer", fontSize: 9, fontWeight: 600, fontFamily: "inherit", opacity: 0.8 }}>
                        Fill from Demand
                      </button>
                    )}
                  </td>
                  {MO.map(function(m, mi3) {
                    var val = view === "demand" ? groupAnn[mi3] : view === "prod" ? groupProdAnn[mi3] : groupShipAnn[mi3];
                    return <td key={mi3} style={{ ...td, textAlign: "right", fontWeight: 700, color: gc.tx, background: gc.hd, fontSize: 10, borderBottom: "2px solid " + gc.hd }}>{val > 0 ? fm(Math.round(val)) : ""}</td>;
                  })}
                  <td style={{ ...td, textAlign: "right", fontWeight: 700, color: gc.tx, background: gc.hd, fontSize: 10, borderBottom: "2px solid " + gc.hd }}>{fm(Math.round(view === "demand" ? groupTotal : view === "prod" ? groupProdTotal : groupShipTotal))}</td>
                </tr>
              );

              var dataRows = g.rows.map(function(row, rowIdx) {
                var plan = getPlan(row.sku);
                var values = view === "demand" ? row.demand : view === "prod" ? (plan ? plan.prod : new Array(12).fill(0)) : (plan ? plan.ship : new Array(12).fill(0));
                var ann = 0; for (var ai = 0; ai < 12; ai++) ann += (values[ai] || 0);

                return (
                  <tr key={"row-" + gi2 + "-" + rowIdx} style={{ background: rowIdx % 2 === 0 ? "transparent" : T.S2 + "60" }}>
                    <td style={{ ...td, fontWeight: 500, fontSize: 11, position: "sticky", left: 0, zIndex: 2, background: rowIdx % 2 === 0 ? T.S1 : T.S2 + "60" }}>
                      <span style={{ color: T.TX }}>{row.name}</span>
                      <span style={{ marginLeft: 6, fontSize: 9, color: T.T2 + "90" }}>{row.sku !== "_unmapped" ? row.sku : ""}</span>
                    </td>
                    <td style={{ ...td, textAlign: "center", fontSize: 9, color: T.T2 }}>{row.cat}</td>
                    {MO.map(function(m, mi4) {
                      var demVal = row.demand[mi4];
                      var cellVal = values[mi4] || 0;
                      var hasDem = demVal > 0;
                      var isShort = isEditView && hasDem && cellVal < demVal;

                      if (isEditView) {
                        var field = view;
                        var skuCode = row.sku;
                        return (
                          <td key={mi4} style={{ ...td, textAlign: "right", background: isShort ? "#fef3c7" : hasDem ? "#f0fdf4" : undefined }}>
                            <Ed value={Math.round(cellVal)} onChange={(function(code, f, idx) { return function(v) { updPlan(code, f, idx, v); }; })(skuCode, field, mi4)} style={{ color: isShort ? T.AM : hasDem ? T.GR : T.T2 + "40", fontSize: 11 }} />
                          </td>
                        );
                      }
                      return (
                        <td key={mi4} style={{ ...td, textAlign: "right", color: hasDem ? T.TX : T.T2 + "30", fontSize: 11, background: hasDem ? "#f0fdf440" : undefined }}>
                          {cellVal > 0 ? fm(Math.round(cellVal)) : ""}
                        </td>
                      );
                    })}
                    <td style={{ ...td, textAlign: "right", fontWeight: 700, fontSize: 11 }}>{ann > 0 ? fm(Math.round(ann)) : ""}</td>
                  </tr>
                );
              });

              return [headerRow].concat(dataRows);
            })}

            {/* Grand Total Row */}
            {(function() {
              var gT = new Array(12).fill(0);
              for (var tgi = 0; tgi < groups.length; tgi++) {
                for (var tri = 0; tri < groups[tgi].rows.length; tri++) {
                  var vals = view === "demand" ? groups[tgi].rows[tri].demand : (function(sku) { var p = getPlan(sku); return view === "prod" ? (p ? p.prod : new Array(12).fill(0)) : (p ? p.ship : new Array(12).fill(0)); })(groups[tgi].rows[tri].sku);
                  for (var tmi = 0; tmi < 12; tmi++) gT[tmi] += (vals[tmi] || 0);
                }
              }
              var grandTotal = 0; for (var gti = 0; gti < 12; gti++) grandTotal += gT[gti];
              return (
                <tr style={{ background: T.AC + "10" }}>
                  <td colSpan={2} style={{ ...td, fontWeight: 700, color: T.AC, borderTop: "2px solid " + T.AC, position: "sticky", left: 0, zIndex: 2, background: T.AC + "10" }}>TOTAL</td>
                  {gT.map(function(v, i) { return <td key={i} style={{ ...td, textAlign: "right", fontWeight: 700, color: T.AC, borderTop: "2px solid " + T.AC }}>{v > 0 ? fm(Math.round(v)) : ""}</td>; })}
                  <td style={{ ...td, textAlign: "right", fontWeight: 700, color: T.AC, borderTop: "2px solid " + T.AC }}>{fm(Math.round(grandTotal))}</td>
                </tr>
              );
            })()}
          </tbody>
        </table>
      </div>
    </div>
  );
}
