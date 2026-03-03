import { useState } from "react";
import { MO } from "../data/defaults";
import { fm, f$, fC, dF } from "../utils/format";
import { T, tbl, th, td } from "../utils/theme";
import { Bg } from "./Shared";

export default function ShippingTab({ ships, prod, frt }) {
  const [sv, setSv] = useState("timeline");
  return (
    <div style={{ padding: "14px 18px" }}>
      <div style={{ display: "flex", gap: 8, marginBottom: 12, flexWrap: "wrap" }}>
        {["Standard Ocean","Fast Boat","Air"].map(m => {
          const d = frt.byM[m] || { n:0,u:0,c:0,b:0,l:0 };
          const cl = {"Standard Ocean":{bd:"#2e7d32",ac:T.GR},"Fast Boat":{bd:"#1565c0",ac:T.AC},"Air":{bd:"#e65100",ac:"#ff8a65"}}[m];
          return (
            <div key={m} style={{ flex:"1 1 150px", background:T.S2, borderRadius:7, padding:"8px 12px", border:"1px solid "+cl.bd, minWidth:150 }}>
              <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:4 }}><Bg method={m}/><span style={{ color:cl.ac, fontWeight:700, fontSize:15, fontFamily:"'JetBrains Mono',monospace" }}>{d.n}</span></div>
              <div style={{ color:T.T2, fontSize:10 }}>Bases: <span style={{ color:T.GR, fontWeight:600 }}>{fm(d.b)}</span></div>
              <div style={{ color:T.T2, fontSize:10 }}>Lids: <span style={{ color:T.AC, fontWeight:600 }}>{fm(d.l)}</span></div>
              <div style={{ color:T.T2, fontSize:10 }}>Cost: <span style={{ color:cl.ac, fontWeight:600 }}>{d.c===0?"FREE":f}</span></div>
            </div>);
        })}
        <div style={{ flex:"1 1 150px", background:T.S2, borderRadius:7, padding:"8px 12px", border:"1px solid "+T.BD, minWidth:150 }}>
          <div style={{ color:T.T2, fontSize:9, textTransform:"uppercase", marginBottom:2 }}>Total Freight</div>
          <div style={{ color:T.AM, fontSize:19, fontWeight:700, fontFamily:"'JetBrains Mono',monospace" }}>{f}</div>
          <div style={{ color:T.T2, fontSize:10 }}>Avg: {frt.units>0?fC(frt.tot/frt.units):"—"}/unit</div>
        </div>
      </div>
      <div style={{ display:"flex", gap:5, marginBottom:12 }}>
        {[["timeline","Shipping Timeline"],["production","Production"]].map(v => {
          const [k,l] = v; const a = sv===k;
          return <button key={k} onClick={() => setSv(k)} style={{ padding:"4px 12px", borderRadius:5, border:"1px solid "+(a?T.AC:T.BD), background:a?T.AC+"15":"transparent", color:a?T.AC:T.T2, cursor:"pointer", fontSize:11, fontWeight:600, fontFamily:"inherit" }}>{l}</button>;
        })}
      </div>
      {sv==="timeline" ? (
        <div style={{ overflowX:"auto" }}><table style={tbl}><thead><tr>
          <th style={th}>#</th><th style={th}>Mo.</th><th style={th}>Method</th><th style={th}>Container</th>
          <th style={{ ...th, textAlign:"right", color:T.GR }}>Bases</th><th style={{ ...th, textAlign:"right", color:T.AC }}>Lids</th><th style={{ ...th, textAlign:"right" }}>Total</th>
          <th style={th}>Ship</th><th style={th}>Base Arr.</th><th style={th}>Lid Arr.</th>
          <th style={{ ...th, textAlign:"right" }}>Cost</th><th style={{ ...th, textAlign:"right" }}>$/Unit</th>
        </tr></thead><tbody>
          {ships.length===0 && <tr><td colSpan={12} style={{ ...td, textAlign:"center", color:T.T2, padding:18 }}>No shipments</td></tr>}
          {ships.map((sh,i) => {
            const cpu = sh.tQ>0 ? sh.cost/sh.tQ : 0;
            return (
              <tr key={i} style={{ background: i%2===0?"transparent":T.S2+"28" }}>
                <td style={{ ...td, color:T.T2 }}>{i+1}</td>
                <td style={{ ...td, fontWeight:600 }}>{MO[sh.mo]}</td>
                <td style={td}><Bg method={sh.meth}/></td>
                <td style={{ ...td, color:T.T2, fontSize:11 }}>{sh.cn}</td>
                <td style={{ ...td, textAlign:"right", color:T.GR, fontWeight:600 }}>{fm(sh.bQ)}</td>
                <td style={{ ...td, textAlign:"right", color:T.AC, fontWeight:600 }}>{fm(sh.lQ)}</td>
                <td style={{ ...td, textAlign:"right", fontWeight:700 }}>{fm(sh.tQ)}</td>
                <td style={{ ...td, color:T.T2, fontSize:11 }}>{dF(sh.bSd)}</td>
                <td style={{ ...td, color:T.T2, fontSize:11 }}>{dF(sh.bAr)}</td>
                <td style={{ ...td, color:T.T2, fontSize:11 }}>{dF(sh.lAr)}</td>
                <td style={{ ...td, textAlign:"right", color:sh.cost>0?T.AM:T.GR, fontWeight:700 }}>{sh.cost===0?"FREE":f}</td>
                <td style={{ ...td, textAlign:"right", color:T.T2, fontSize:11 }}>{sh.cost===0?"\/bin/sh.00":fC(cpu)}</td>
              </tr>);
          })}
        </tbody></table></div>
      ) : (
        <div style={{ overflowX:"auto" }}><table style={tbl}><thead>
          <tr><th style={th} rowSpan={2}>Week Of</th><th style={{ ...th, textAlign:"center", borderBottom:"2px solid #2e7d32", color:T.GR }} colSpan={3}>Base (Jar/HDPE)</th><th style={{ ...th, textAlign:"center", borderBottom:"2px solid "+T.AC, color:T.AC }} colSpan={3}>Lid (Cap/PP)</th><th style={{ ...th, textAlign:"center" }} colSpan={2}>Combined</th></tr>
          <tr><th style={{ ...th, textAlign:"right" }}>Weekly</th><th style={{ ...th, textAlign:"right" }}>Cumul</th><th style={{ ...th, textAlign:"right" }}>Surplus</th><th style={{ ...th, textAlign:"right" }}>Weekly</th><th style={{ ...th, textAlign:"right" }}>Cumul</th><th style={{ ...th, textAlign:"right" }}>Surplus</th><th style={{ ...th, textAlign:"right" }}>Total</th><th style={{ ...th, textAlign:"right" }}>Shippable</th></tr>
        </thead><tbody>
          {prod.filter(w => w.bW>0||w.lW>0||w.bC>0).map((w,i) => (
            <tr key={i} style={{ background: i%2===0?"transparent":T.S2+"28" }}>
              <td style={td}>{dF(w.wk)}</td>
              <td style={{ ...td, textAlign:"right", color:w.bW>0?T.GR:T.T2 }}>{fm(w.bW)}</td>
              <td style={{ ...td, textAlign:"right" }}>{fm(w.bC)}</td>
              <td style={{ ...td, textAlign:"right", color:w.surT==="base"?T.AM:T.T2 }}>{w.surT==="base"?fm(w.sur):"—"}</td>
              <td style={{ ...td, textAlign:"right", color:w.lW>0?T.AC:T.T2 }}>{fm(w.lW)}</td>
              <td style={{ ...td, textAlign:"right" }}>{fm(w.lC)}</td>
              <td style={{ ...td, textAlign:"right", color:w.surT==="lid"?T.AM:T.T2 }}>{w.surT==="lid"?fm(w.sur):"—"}</td>
              <td style={{ ...td, textAlign:"right", fontWeight:600 }}>{fm(w.tot)}</td>
              <td style={{ ...td, textAlign:"right", fontWeight:700, color:T.GR }}>{fm(w.ship)}</td>
            </tr>
          ))}
        </tbody></table></div>
      )}
    </div>
  );
}