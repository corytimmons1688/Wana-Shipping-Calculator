import { MO } from "../data/defaults";
import { fm } from "../utils/format";
import { T, tbl, th, td } from "../utils/theme";
import { Ed } from "./Shared";

export default function DemandTab({ sc, gld, annD, upd }) {
  let allT = 0;
  for (const mk of sc.markets) for (const d of mk.demand) allT += d;
  return (
    <div style={{ padding: "14px 18px" }}>
      <div style={{ display: "flex", gap: 10, marginBottom: 12, flexWrap: "wrap" }}>
        {[{ l: "Annual (All)", v: fm(allT), c: T.TX },{ l: "Go-Live Demand", v: fm(annD), c: T.GR },{ l: "Active Markets", v: sc.markets.filter(m => m.goLive != null).length + "/" + sc.markets.length, c: T.AC }].map((c, i) => (
          <div key={i} style={{ background: T.S2, borderRadius: 7, padding: "8px 14px", border: "1px solid " + T.BD, minWidth: 120 }}>
            <div style={{ color: T.T2, fontSize: 9, textTransform: "uppercase", marginBottom: 2 }}>{c.l}</div>
            <div style={{ color: c.c, fontSize: 17, fontWeight: 700, fontFamily: "'JetBrains Mono',monospace" }}>{c.v}</div>
          </div>
        ))}
      </div>
      <div style={{ overflowX: "auto" }}>
        <table style={tbl}><thead><tr>
          <th style={{ ...th, minWidth: 120 }}>Market</th>
          <th style={{ ...th, width: 55, textAlign: "center" }}>Go-Live</th>
          {MO.map((m, i) => <th key={i} style={{ ...th, textAlign: "right", minWidth: 65 }}>{m}</th>)}
          <th style={{ ...th, textAlign: "right", minWidth: 78 }}>Annual</th>
        </tr></thead><tbody>
          {sc.markets.map((mk, mi) => {
            let ann = 0; for (const d of mk.demand) ann += d;
            return (
              <tr key={mi} style={{ background: mi % 2 === 0 ? "transparent" : T.S2 + "28" }}>
                <td style={{ ...td, fontWeight: 600 }}>
                  {mk.priority && <span style={{ color: T.PU, marginRight: 4, fontSize: 7 }}>{"●"}</span>}{mk.name}
                </td>
                <td style={{ ...td, textAlign: "center" }}>
                  <select value={mk.goLive || ""} onChange={e => { const v = e.target.value === "" ? null : Number(e.target.value); upd(s => { s.markets[mi].goLive = v; }); }} style={{ background: T.S2, border: "1px solid " + T.BD, color: T.AC, borderRadius: 3, padding: "1px 2px", fontSize: 11, fontFamily: "'JetBrains Mono',monospace", width: 42 }}>
                    <option value="">{"—"}</option>
                    {MO.map((m, i) => <option key={i} value={i + 1}>{m}</option>)}
                  </select>
                </td>
                {mk.demand.map((d, di) => {
                  const isGL = mk.goLive === di + 1;
                  const isAct = mk.goLive != null && di + 1 >= mk.goLive;
                  return <td key={di} style={{ ...td, textAlign: "right", background: isGL ? "#0a1f12" : undefined }}><Ed value={d} onChange={v => upd(s => { s.markets[mi].demand[di] = v; })} style={{ color: isGL ? T.GR : isAct ? T.TX : T.T2 + "70" }} /></td>;
                })}
                <td style={{ ...td, textAlign: "right", fontWeight: 700 }}>{fm(ann)}</td>
              </tr>);
          })}
          <tr style={{ background: "#0a1f1228" }}>
            <td style={{ ...td, fontWeight: 700, color: T.GR, borderTop: "2px solid " + T.GR }}>GO-LIVE DEMAND</td>
            <td style={{ ...td, textAlign: "center", color: T.T2, fontSize: 8, borderTop: "2px solid " + T.GR }}>auto</td>
            {gld.map((d, i) => <td key={i} style={{ ...td, textAlign: "right", fontWeight: 700, color: T.GR, borderTop: "2px solid " + T.GR }}>{fm(d)}</td>)}
            <td style={{ ...td, textAlign: "right", fontWeight: 700, color: T.GR, borderTop: "2px solid " + T.GR }}>{fm(annD)}</td>
          </tr>
        </tbody></table>
      </div>
    </div>
  );
}