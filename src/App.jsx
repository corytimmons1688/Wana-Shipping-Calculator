import { useState, useMemo, useCallback } from "react";
import { initScenario, mkScenario } from "./data/defaults";
import { calcGLD, calcProd, calcCap, optimize } from "./utils/calc";
import { fm, f$, fC, dc } from "./utils/format";
import { T, tbl, th, td } from "./utils/theme";
import DemandTab from "./components/DemandTab";
import ShippingTab from "./components/ShippingTab";
import SettingsTab from "./components/SettingsTab";

export default function App() {
  const [tab, setTab] = useState("demand");
  const [scenarios, setScenarios] = useState(() => [mkScenario("Base Plan", initScenario())]);
  const [active, setActive] = useState(0);
  const [cmp, setCmp] = useState(false);
  const sc = scenarios[active];
  const upd = useCallback(fn => { setScenarios(p => { const nx = dc(p); fn(nx[active]); return nx; }); }, [active]);
  const gld = useMemo(() => calcGLD(sc.markets), [sc.markets]);
  const annD = useMemo(() => gld.reduce((a, b) => a + b, 0), [gld]);
  const prod = useMemo(() => calcProd(sc.molds), [sc.molds]);
  const ships = useMemo(() => optimize(sc.markets, sc.molds, sc.shipping, sc.params, sc.containers, sc.pallet, sc.airCost), [sc.markets, sc.molds, sc.shipping, sc.params, sc.containers, sc.pallet, sc.airCost]);
  const cap = useMemo(() => calcCap(sc.molds, sc.protoMolds, sc.equipment), [sc.molds, sc.protoMolds, sc.equipment]);
  const frt = useMemo(() => {
    const s = {}; let tot = 0, units = 0;
    for (const sh of ships) { if (!s[sh.meth]) s[sh.meth] = { n:0,u:0,c:0,b:0,l:0 }; s[sh.meth].n++; s[sh.meth].u += sh.tQ; s[sh.meth].c += sh.cost; s[sh.meth].b += sh.bQ; s[sh.meth].l += sh.lQ; tot += sh.cost; units += sh.tQ; }
    return { byM: s, tot, units };
  }, [ships]);
  const addSc = () => { const ns = mkScenario("Scenario " + (scenarios.length + 1), sc); setScenarios(p => [...p, ns]); setActive(scenarios.length); };
  const dupeSc = () => { const ns = mkScenario(sc.name + " (copy)", sc); setScenarios(p => [...p, ns]); setActive(scenarios.length); };
  const CmpView = () => {
    const data = scenarios.map(s => { const g = calcGLD(s.markets).reduce((a, b) => a + b, 0); const sh = optimize(s.markets, s.molds, s.shipping, s.params, s.containers, s.pallet, s.airCost); let ft = 0; for (const x of sh) ft += x.cost; const cx = calcCap(s.molds, s.protoMolds, s.equipment); return { name: s.name, gld: g, freight: ft, capex: cx.grand, total: ft + cx.grand, bM: s.molds.base.proto.qty + s.molds.base.prod.qty, lM: s.molds.lid.proto.qty + s.molds.lid.prod.qty }; });
    const minFr = Math.min(...data.map(d => d.freight)), minT = Math.min(...data.map(d => d.total));
    const rows = [{ l:"Go-Live Demand", k:"gld", fn:fm },{ l:"Total Freight", k:"freight", fn:f$, best:minFr },{ l:"Capital Expense", k:"capex", fn:f$ },{ l:"Total Cost", k:"total", fn:f$, best:minT },{ l:"Base Molds", k:"bM", fn:fm },{ l:"Lid Molds", k:"lM", fn:fm }];
    return (<div style={{ padding:"16px 18px" }}><div style={{ fontSize:15, fontWeight:700, color:T.TX, marginBottom:12 }}>Scenario Comparison</div><div style={{ overflowX:"auto" }}><table style={tbl}><thead><tr><th style={th}>Metric</th>{data.map((d, i) => <th key={i} style={{ ...th, textAlign:"right" }}>{d.name}</th>)}</tr></thead><tbody>{rows.map((r, ri) => (<tr key={ri}><td style={{ ...td, fontWeight:600 }}>{r.l}</td>{data.map((d, i) => { const v = d[r.k]; const best = r.best != null && v === r.best; return <td key={i} style={{ ...td, textAlign:"right", fontWeight:700, color:best ? T.GR : T.TX }}>{r.fn(v)}</td>; })}</tr>))}</tbody></table></div></div>);
  };
const mainTabs = [{ k:"demand", l:"Market Demand", i:"📊" },{ k:"shipping", l:"Shipping Calculator", i:"📦" },{ k:"settings", l:"Settings", i:"⚙️" }];
  return (
    <div style={{ background:T.BG, color:T.TX, minHeight:"100vh", fontFamily:"'DM Sans','Segoe UI',sans-serif", fontSize:14 }}>
      <div style={{ padding:"10px 18px", background:T.S1, borderBottom:"1px solid "+T.BD, display:"flex", justifyContent:"space-between", alignItems:"center", flexWrap:"wrap", gap:8 }}>
        <div><div style={{ fontSize:16, fontWeight:800, letterSpacing:"-0.5px" }}><span style={{ color:T.GR }}>Wana</span> Production & Shipping</div><div style={{ color:T.T2, fontSize:9, marginTop:1 }}>2026 Launch {"—"} Shipping Optimizer</div></div>
        <div style={{ display:"flex", gap:8, alignItems:"center" }}>
          <div style={{ background:T.S2, borderRadius:5, padding:"3px 9px", border:"1px solid "+T.BD }}><span style={{ color:T.T2, fontSize:9 }}>CAPEX </span><span style={{ color:T.AC, fontWeight:700, fontFamily:"'JetBrains Mono',monospace", fontSize:12 }}>{f$(cap.grand)}</span></div>
          <div style={{ background:T.S2, borderRadius:5, padding:"3px 9px", border:"1px solid "+T.BD }}><span style={{ color:T.T2, fontSize:9 }}>Freight </span><span style={{ color:T.AM, fontWeight:700, fontFamily:"'JetBrains Mono',monospace", fontSize:12 }}>{f$(frt.tot)}</span></div>
        </div>
      </div>
      <div style={{ display:"flex", alignItems:"center", gap:6, padding:"7px 18px", background:T.S2, borderBottom:"1px solid "+T.BD, flexWrap:"wrap" }}>
        {scenarios.map((s, i) => { const a = i === active; return <button key={s.id} onClick={() => { setActive(i); setCmp(false); }} style={{ padding:"4px 12px", borderRadius:5, border:a ? "1px solid "+T.AC : "1px solid "+T.BD, background:a ? T.AC+"15" : "transparent", color:a ? T.AC : T.T2, cursor:"pointer", fontSize:11, fontWeight:a ? 700 : 500, fontFamily:"inherit" }}>{s.name}</button>; })}
        <div style={{ borderLeft:"1px solid "+T.BD, height:20, margin:"0 2px" }} />
        <button onClick={addSc} style={{ padding:"4px 10px", borderRadius:5, border:"1px solid "+T.GR, background:T.GR+"10", color:T.GR, cursor:"pointer", fontSize:10, fontWeight:600 }}>+ New</button>
        <button onClick={dupeSc} style={{ padding:"4px 10px", borderRadius:5, border:"1px solid "+T.AM, background:T.AM+"10", color:T.AM, cursor:"pointer", fontSize:10, fontWeight:600 }}>Duplicate</button>
        <button onClick={() => setCmp(!cmp)} style={{ padding:"4px 10px", borderRadius:5, border:cmp ? "1px solid "+T.PU : "1px solid "+T.BD, background:cmp ? T.PU+"15" : "transparent", color:cmp ? T.PU : T.T2, cursor:"pointer", fontSize:10, fontWeight:600 }}>{cmp ? "Close" : "Compare All"}</button>
      </div>
      {cmp ? <CmpView /> : (<>
        <div style={{ display:"flex", background:T.S1, borderBottom:"1px solid "+T.BD, padding:"0 18px", overflowX:"auto" }}>
          {mainTabs.map(t => { const a = tab === t.k; return <button key={t.k} onClick={() => setTab(t.k)} style={{ padding:"9px 16px", cursor:"pointer", border:"none", borderBottom:a ? "2px solid "+T.AC : "2px solid transparent", background:"transparent", color:a ? T.AC : T.T2, fontWeight:a ? 700 : 500, fontSize:12, display:"flex", alignItems:"center", gap:4, whiteSpace:"nowrap", fontFamily:"inherit" }}><span>{t.i}</span>{t.l}</button>; })}
        </div>
        {tab === "demand" && <DemandTab sc={sc} gld={gld} annD={annD} upd={upd} />}
        {tab === "shipping" && <ShippingTab ships={ships} prod={prod} frt={frt} />}
        {tab === "settings" && <SettingsTab sc={sc} cap={cap} upd={upd} />}
      </>)}
    </div>
  );
}
