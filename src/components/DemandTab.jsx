import { useState } from "react";
import { MO } from "../data/defaults";
import { fm } from "../utils/format";
import { T, tbl, th, td } from "../utils/theme";
import { Ed } from "./Shared";

export default function DemandTab({ sc, gld, annD, upd }) {
  var expandState = useState({});
  var expanded = expandState[0], setExpanded = expandState[1];

  function toggleExpand(mi) {
    setExpanded(function(prev) {
      var next = Object.assign({}, prev);
      next[mi] = !next[mi];
      return next;
    });
  }

  var allT = 0;
  for (var ai = 0; ai < sc.markets.length; ai++)
    for (var aj = 0; aj < sc.markets[ai].demand.length; aj++)
      allT += sc.markets[ai].demand[aj];

  return (
    <div style={{ padding: "14px 18px" }}>
      <div style={{ display: "flex", gap: 10, marginBottom: 12, flexWrap: "wrap" }}>
        {[{ l: "Annual (All)", v: fm(allT), c: T.TX },{ l: "Go-Live Demand", v: fm(annD), c: T.GR },{ l: "Active Markets", v: sc.markets.filter(function(m){ return m.goLive != null; }).length + "/" + sc.markets.length, c: T.AC }].map(function(c2, i) {
          return (
            <div key={i} style={{ background: T.S2, borderRadius: 7, padding: "8px 14px", border: "1px solid " + T.BD, minWidth: 120 }}>
              <div style={{ color: T.T2, fontSize: 9, textTransform: "uppercase", marginBottom: 2 }}>{c2.l}</div>
              <div style={{ color: c2.c, fontSize: 17, fontWeight: 700, fontFamily: "'JetBrains Mono',monospace" }}>{c2.v}</div>
            </div>
          );
        })}
      </div>
      <div style={{ overflowX: "auto" }}>
        <table style={tbl}><thead><tr>
          <th style={{ ...th, minWidth: 140 }}>Market</th>
          <th style={{ ...th, width: 72, textAlign: "center" }}>Go-Live</th>
          {MO.map(function(m, i) { return <th key={i} style={{ ...th, textAlign: "right", minWidth: 65 }}>{m}</th>; })}
          <th style={{ ...th, textAlign: "right", minWidth: 78 }}>Annual</th>
        </tr></thead><tbody>
          {sc.markets.map(function(mk, mi) {
            var ann = 0; for (var di = 0; di < mk.demand.length; di++) ann += mk.demand[di];
            var hasSku = mk.skuDetail && mk.skuDetail.skus && mk.skuDetail.skus.length > 0;
            var isExp = expanded[mi];

            var mainRow = (
              <tr key={mi} style={{ background: mi % 2 === 0 ? "transparent" : T.S2 }}>
                <td style={{ ...td, fontWeight: 600, cursor: hasSku ? "pointer" : "default" }} onClick={hasSku ? function() { toggleExpand(mi); } : undefined}>
                  {mk.priority && <span style={{ color: T.PU, marginRight: 4, fontSize: 7 }}>{"\u25CF"}</span>}
                  {hasSku && <span style={{ marginRight: 4, fontSize: 10, color: T.AC }}>{isExp ? "\u25BC" : "\u25B6"}</span>}
                  {mk.name}
                  {hasSku && <span style={{ marginLeft: 4, fontSize: 9, color: T.T2 }}>({mk.skuDetail.skus.length} SKUs)</span>}
                </td>
                <td style={{ ...td, textAlign: "center" }}>
                  <select value={mk.goLive || ""} onChange={function(e) { var v = e.target.value === "" ? null : Number(e.target.value); upd(function(s) { s.markets[mi].goLive = v; }); }} style={{ background: T.S2, border: "1px solid " + T.BD, color: T.AC, borderRadius: 3, padding: "1px 2px", fontSize: 11, fontFamily: "'JetBrains Mono',monospace", width: 56 }}>
                    <option value="">{"\u2014"}</option>
                    {MO.map(function(m, i) { return <option key={i} value={i + 1}>{m}</option>; })}
                  </select>
                </td>
                {mk.demand.map(function(d, di) {
                  var isGL = mk.goLive === di + 1;
                  var isAct = mk.goLive != null && di + 1 >= mk.goLive;
                  return <td key={di} style={{ ...td, textAlign: "right", background: isGL ? "#bbf7d0" : undefined }}><Ed value={d} onChange={function(v) { upd(function(s) { s.markets[mi].demand[di] = v; }); }} style={{ color: isGL ? T.GR : isAct ? T.TX : T.T2 }} /></td>;
                })}
                <td style={{ ...td, textAlign: "right", fontWeight: 700 }}>{fm(ann)}</td>
              </tr>
            );

            var skuRows = [];
            if (hasSku && isExp) {
              var detail = mk.skuDetail;
              // Group weeks into months for display
              for (var si = 0; si < detail.skus.length; si++) {
                var sku = detail.skus[si];
                // Sum weekly into monthly
                var skuMonthly = [0,0,0,0,0,0,0,0,0,0,0,0];
                for (var wi = 0; wi < sku.weekly.length && wi < detail.weeks.length; wi++) {
                  var wkDate = new Date(detail.weeks[wi]);
                  var mo = wkDate.getMonth();
                  skuMonthly[mo] += sku.weekly[wi];
                }
                var skuAnn = 0;
                for (var smi = 0; smi < 12; smi++) skuAnn += skuMonthly[smi];

                // Find first demand week for highlight
                var startMo = -1;
                if (sku.startWk != null && sku.startWk < detail.weeks.length) {
                  startMo = new Date(detail.weeks[sku.startWk]).getMonth();
                }

                skuRows.push(
                  <tr key={"sku-"+mi+"-"+si} style={{ background: si % 2 === 0 ? T.S2+"40" : T.S2+"80" }}>
                    <td style={{ ...td, paddingLeft: 28, fontSize: 11, color: T.T2, borderLeft: "3px solid "+T.AC+"40" }}>
                      <span style={{ color: T.AC, fontSize: 8, marginRight: 4 }}>{"\u25CB"}</span>
                      {sku.name}
                      {sku.sku && <span style={{ marginLeft: 4, fontSize: 9, color: T.T2+"90" }}>{sku.sku}</span>}
                    </td>
                    <td style={{ ...td, textAlign: "center", fontSize: 9, color: T.T2, borderLeft: "3px solid "+T.AC+"40" }}>{sku.cat}</td>
                    {skuMonthly.map(function(v, smi2) {
                      var isStart = smi2 === startMo;
                      return <td key={smi2} style={{ ...td, textAlign: "right", fontSize: 10, color: v > 0 ? T.T2 : T.T2+"30", fontStyle: "italic", background: isStart ? "#bbf7d0" : undefined }}>{v > 0 ? fm(Math.round(v)) : ""}</td>;
                    })}
                    <td style={{ ...td, textAlign: "right", fontSize: 10, fontStyle: "italic", color: T.T2 }}>{fm(Math.round(skuAnn))}</td>
                  </tr>
                );
              }
            }

            return [mainRow].concat(skuRows);
          })}
          <tr style={{ background: "#bbf7d040" }}>
            <td style={{ ...td, fontWeight: 700, color: T.GR, borderTop: "2px solid " + T.GR }}>GO-LIVE DEMAND</td>
            <td style={{ ...td, textAlign: "center", color: T.T2, fontSize: 8, borderTop: "2px solid " + T.GR }}>auto</td>
            {gld.map(function(d, i) { return <td key={i} style={{ ...td, textAlign: "right", fontWeight: 700, color: T.GR, borderTop: "2px solid " + T.GR }}>{fm(d)}</td>; })}
            <td style={{ ...td, textAlign: "right", fontWeight: 700, color: T.GR, borderTop: "2px solid " + T.GR }}>{fm(annD)}</td>
          </tr>
        </tbody></table>
      </div>
    </div>
  );
}
