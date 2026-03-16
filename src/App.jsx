import { useState, useMemo, useCallback } from "react";
import { useSupabase } from "./hooks/useSupabase";
import { initScenario, initScenarioCOOpt2, mkScenario } from "./data/defaults";
import { calcGLD, calcProd, calcCap, calcWeeklyDemand } from "./utils/calc";
import { fm, f$, fC, dc } from "./utils/format";
import { T, tbl, th, td } from "./utils/theme";
import DemandTab from "./components/DemandTab";
import ShippingTab from "./components/ShippingTab";
import SettingsTab from "./components/SettingsTab";
import AiAssistant from "./components/AiAssistant";

export default function App() {
  const [tab, setTab] = useState("demand");
  const [scenarios, setScenarios] = useState(() => [mkScenario("Base Plan", initScenario()), mkScenario("Colorado Option 2", initScenarioCOOpt2())]);
  const [active, setActive] = useState(0);
  const [cmp, setCmp] = useState(false);
  const [dragIdx, setDragIdx] = useState(null);
  const [dropIdx, setDropIdx] = useState(null);
  const sc = scenarios[active];
  const upd = useCallback(fn => { setScenarios(p => { const nx = dc(p); fn(nx[active]); return nx; }); }, [active]);
  const gld = useMemo(() => calcGLD(sc.markets), [sc]);
  const annD = useMemo(() => gld.reduce((a, b) => a + b, 0), [gld]);
  const weeklyDem = useMemo(() => calcWeeklyDemand(sc.markets), [sc]);
  const prod = useMemo(() => calcProd(sc.molds), [sc]);
  // Optimizer disabled — shipping is managed manually via shipAdditions
  const ships = useMemo(() => [], []);

  // Apply manual edits + deletions on top of base ships (manual-only mode).
  const displayShips = useMemo(() => {
    const deletedSet = new Set(sc.shipDeletions || []);
    const editMap = {};
    for (const e of (sc.shipEdits || [])) editMap[e.idx] = e;

    const airPalletRate = (sc.airCost && sc.airCost.palletRate) || 3000;
    const abPP = sc.pallet.airBasePP || 7500;
    const alPP = sc.pallet.airLidPP || 25000;

    function airCostFor(bQ, lQ) {
      return (Math.ceil((bQ||0) / abPP) + Math.ceil((lQ||0) / alPP)) * airPalletRate;
    }

    const edited = ships
      .map((sh, i) => {
        if (deletedSet.has(i)) return null; // deleted — excluded
        const ed = editMap[i];
        const origIdx = i; // preserve for delete/restore
        if (!ed) return { ...sh, origIdx };
        const meth = ed.meth !== undefined ? ed.meth : sh.meth;
        const bQ   = ed.bQ  !== undefined ? ed.bQ  : sh.bQ;
        const lQ   = ed.lQ  !== undefined ? ed.lQ  : sh.lQ;
        const tQ   = bQ + lQ;
        const methObj = sc.shipping.find(s => s.method === meth) || sc.shipping.find(s => s.method === sh.meth);
        const tDays = methObj ? methObj.transitDays : 10;
        const bAr = new Date(sh.bSd); bAr.setDate(bAr.getDate() + tDays);
        const lAr = new Date(sh.lSd); lAr.setDate(lAr.getDate() + tDays);
        let cost = sh.cost;
        if (meth === "Air") {
          cost = airCostFor(bQ, lQ);
        } else if (meth === "Standard Ocean") {
          cost = 0;
        } else {
          const totalPallets = Math.ceil((bQ||0) / sc.pallet.basePP) + Math.ceil((lQ||0) / sc.pallet.lidPP);
          const c20 = sc.containers["20HC"], c40 = sc.containers["40HC"];
          cost = totalPallets <= c20.pallets ? c20.cost : c40.cost;
        }
        return { ...sh, meth, bQ, lQ, tQ, cost, bAr, lAr, cn: meth === "Air" ? "Air" : sh.cn, origIdx };
      })
      .filter(Boolean);

    // Append manual additions
    for (const add of (sc.shipAdditions || [])) {
      const methObj = sc.shipping.find(s => s.method === add.meth);
      const tDays = methObj ? methObj.transitDays : 10;
      const bSd = new Date(add.wkMs);
      const bAr = new Date(add.wkMs); bAr.setDate(bAr.getDate() + tDays);
      let cost = 0;
      if (add.meth === "Air") cost = airCostFor(add.bQ, add.lQ);
      else if (add.meth === "Fast Boat") {
        const tp = Math.ceil((add.bQ||0) / sc.pallet.basePP) + Math.ceil((add.lQ||0) / sc.pallet.lidPP);
        cost = tp <= sc.containers["20HC"].pallets ? sc.containers["20HC"].cost : sc.containers["40HC"].cost;
      }
      edited.push({ mo: add.mo, meth: add.meth, cn: add.meth === "Air" ? "Air" : "Manual",
        bQ: add.bQ||0, lQ: add.lQ||0, tQ: (add.bQ||0)+(add.lQ||0), cost,
        bSd, lSd: bSd, bAr, lAr: bAr,
        bPal: 0, lPal: 0, preShip: false, isAddition: true, addId: add.id });
    }
    return edited;
  }, [ships, sc.shipEdits, sc.shipDeletions, sc.shipAdditions, sc.shipping, sc.airCost, sc.pallet, sc.containers]);

  const updShipEdit = useCallback((idx, fields) => {
    upd(s => {
      if (!s.shipEdits) s.shipEdits = [];
      const existing = s.shipEdits.findIndex(e => e.idx === idx);
      if (existing >= 0) Object.assign(s.shipEdits[existing], fields);
      else s.shipEdits.push({ idx, ...fields });
    });
  }, [upd]);

  const addShipment = useCallback((wkMs, mo, meth, bQ, lQ) => {
    upd(s => {
      if (!s.shipAdditions) s.shipAdditions = [];
      s.shipAdditions.push({ id: Date.now() + Math.random(), wkMs, mo, meth, bQ, lQ });
    });
  }, [upd]);

  const updShipAddition = useCallback((id, fields) => {
    upd(s => {
      if (!s.shipAdditions) return;
      const idx = s.shipAdditions.findIndex(a => a.id === id);
      if (idx >= 0) Object.assign(s.shipAdditions[idx], fields);
    });
  }, [upd]);

  const removeShipAddition = useCallback((id) => {
    upd(s => { if (s.shipAdditions) s.shipAdditions = s.shipAdditions.filter(a => a.id !== id); });
  }, [upd]);

  const deleteShipment = useCallback((idx) => {
    upd(s => {
      if (!s.shipDeletions) s.shipDeletions = [];
      if (!s.shipDeletions.includes(idx)) s.shipDeletions.push(idx);
    });
  }, [upd]);

  const restoreShipment = useCallback((idx) => {
    upd(s => { if (s.shipDeletions) s.shipDeletions = s.shipDeletions.filter(i => i !== idx); });
  }, [upd]);

  const clearShipEdits = useCallback(() => {
    upd(s => { s.shipEdits = []; s.shipAdditions = []; s.shipDeletions = []; });
  }, [upd]);

  const hasShipEdits = (sc.shipEdits && sc.shipEdits.length > 0) ||
    (sc.shipAdditions && sc.shipAdditions.length > 0) ||
    (sc.shipDeletions && sc.shipDeletions.length > 0);
  const cap = useMemo(() => calcCap(sc.molds, sc.protoMolds, sc.equipment), [sc]);
  const frt = useMemo(() => {
    const s = {}; let tot = 0, units = 0;
    for (const sh of displayShips) { if (!s[sh.meth]) s[sh.meth] = { n:0,u:0,c:0,b:0,l:0 }; s[sh.meth].n++; s[sh.meth].u += sh.tQ; s[sh.meth].c += sh.cost; s[sh.meth].b += sh.bQ; s[sh.meth].l += sh.lQ; tot += sh.cost; units += sh.tQ; }
    return { byM: s, tot, units };
  }, [displayShips]);
  const addSc = () => { const ns = mkScenario("Scenario " + (scenarios.length + 1), sc); setScenarios(p => [...p, ns]); setActive(scenarios.length); };
  const dupeSc = () => { const ns = mkScenario(sc.name + " (copy)", sc); setScenarios(p => [...p, ns]); setActive(scenarios.length); };
  const delSc = (idx) => { if (scenarios.length <= 1) return; setScenarios(p => p.filter((_, i) => i !== idx)); setActive(a => idx < a ? a - 1 : idx === a ? Math.min(a, scenarios.length - 2) : a); };
  const renameSc = (idx, name) => { setScenarios(p => p.map((s, i) => i === idx ? { ...s, name } : s)); };
  const reorderSc = (from, to) => {
    if (from === to) return;
    setScenarios(p => { const nx = [...p]; const [moved] = nx.splice(from, 1); nx.splice(to, 0, moved); return nx; });
    setActive(a => { if (a === from) return to; if (from < a && to >= a) return a - 1; if (from > a && to <= a) return a + 1; return a; });
  };
  const { status: syncStatus, error: syncError } = useSupabase(scenarios, setScenarios);
  const [renaming, setRenaming] = useState(null);
  const [renameVal, setRenameVal] = useState("");
  const CmpView = () => {
    const data = scenarios.map(s => { const g = calcGLD(s.markets).reduce((a, b) => a + b, 0); let ft = 0; const airPR = (s.airCost && s.airCost.palletRate) || 3000; const abPP = s.pallet.airBasePP || 7500, alPP = s.pallet.airLidPP || 25000; for (const add of (s.shipAdditions || [])) { if (add.meth === "Air") ft += (Math.ceil((add.bQ||0)/abPP) + Math.ceil((add.lQ||0)/alPP)) * airPR; else if (add.meth === "Fast Boat") { const tp = Math.ceil((add.bQ||0)/s.pallet.basePP) + Math.ceil((add.lQ||0)/s.pallet.lidPP); ft += tp <= s.containers["20HC"].pallets ? s.containers["20HC"].cost : s.containers["40HC"].cost; } } const cx = calcCap(s.molds, s.protoMolds, s.equipment); return { name: s.name, gld: g, freight: ft, capex: cx.grand, total: ft + cx.grand, bM: s.molds.base.proto.qty + (s.molds.base.proto2 ? s.molds.base.proto2.qty : 0) + s.molds.base.prod.qty, lM: s.molds.lid.proto.qty + (s.molds.lid.proto2 ? s.molds.lid.proto2.qty : 0) + s.molds.lid.prod.qty }; });
    const minFr = Math.min(...data.map(d => d.freight)), minT = Math.min(...data.map(d => d.total));
    const rows = [{ l:"Go-Live Demand", k:"gld", fn:fm },{ l:"Total Freight", k:"freight", fn:f$, best:minFr },{ l:"Base Molds", k:"bM", fn:fm },{ l:"Lid Molds", k:"lM", fn:fm }];
    return (<div style={{ padding:"16px 18px" }}><div style={{ fontSize:15, fontWeight:700, color:T.TX, marginBottom:12 }}>Scenario Comparison</div><div style={{ overflowX:"auto" }}><table style={tbl}><thead><tr><th style={th}>Metric</th>{data.map((d, i) => <th key={i} style={{ ...th, textAlign:"right" }}>{d.name}</th>)}</tr></thead><tbody>{rows.map((r, ri) => (<tr key={ri}><td style={{ ...td, fontWeight:600 }}>{r.l}</td>{data.map((d, i) => { const v = d[r.k]; const best = r.best != null && v === r.best; return <td key={i} style={{ ...td, textAlign:"right", fontWeight:700, color:best ? T.GR : T.TX }}>{r.fn(v)}</td>; })}</tr>))}</tbody></table></div></div>);
  };
const mainTabs = [{ k:"demand", l:"Market Demand", i:"📊" },{ k:"shipping", l:"Shipping Calculator", i:"📦" },{ k:"settings", l:"Settings", i:"⚙️" }];
  return (
    <div style={{ background:T.BG, color:T.TX, minHeight:"100vh", fontFamily:"'DM Sans','Segoe UI',sans-serif", fontSize:14 }}>
      <div style={{ padding:"10px 18px", background:T.S1, borderBottom:"1px solid "+T.BD, display:"flex", justifyContent:"space-between", alignItems:"center", flexWrap:"wrap", gap:8 }}>
        <div><div style={{ fontSize:16, fontWeight:800, letterSpacing:"-0.5px" }}><span style={{ color:T.GR }}>Wana</span> Production & Shipping</div><div style={{ color:T.T2, fontSize:9, marginTop:1 }}>2026 Launch {"—"} Shipping Optimizer</div></div>
        <div style={{ display:"flex", gap:8, alignItems:"center" }}>
          <div style={{ background:T.S2, borderRadius:5, padding:"3px 9px", border:"1px solid "+T.BD }}><span style={{ color:T.T2, fontSize:9 }}>Freight </span><span style={{ color:T.AM, fontWeight:700, fontFamily:"'JetBrains Mono',monospace", fontSize:12 }}>{f$(frt.tot)}</span></div>
          <div title={syncError || ""} style={{ background:T.S2, borderRadius:5, padding:"3px 9px", border:"1px solid "+(syncStatus==="error"?"#dc2626":syncStatus==="saving"?T.AM:syncStatus==="saved"?T.GR:T.BD), display:"flex", alignItems:"center", gap:4 }}>
            <span style={{ fontSize:9, color: syncStatus==="error"?"#dc2626":syncStatus==="saving"?T.AM:syncStatus==="saved"?T.GR:T.T2 }}>
              {syncStatus==="loading"?"⟳ Loading…":syncStatus==="saving"?"⟳ Saving…":syncStatus==="saved"?"✓ Saved":syncStatus==="error"?"✕ Sync error":"○ Connecting…"}
            </span>
          </div>
        </div>
      </div>
      <div style={{ display:"flex", alignItems:"center", gap:6, padding:"7px 18px", background:T.S2, borderBottom:"1px solid "+T.BD, flexWrap:"wrap" }}>
        {scenarios.map((s, i) => { const a = i === active; const isDragging = dragIdx === i; const isDropBefore = dropIdx === i && dragIdx !== i && dragIdx !== i - 1; const isDropAfter = dropIdx === i + 1 && dragIdx !== i && dragIdx !== i + 1; return (
          <div key={s.id} draggable={renaming !== i} onDragStart={e => { setDragIdx(i); e.dataTransfer.effectAllowed = "move"; }} onDragEnd={() => { if (dragIdx != null && dropIdx != null && dragIdx !== dropIdx) { const to = dropIdx > dragIdx ? dropIdx - 1 : dropIdx; reorderSc(dragIdx, to); } setDragIdx(null); setDropIdx(null); }} onDragOver={e => { e.preventDefault(); e.dataTransfer.dropEffect = "move"; const rect = e.currentTarget.getBoundingClientRect(); const mid = rect.left + rect.width / 2; setDropIdx(e.clientX < mid ? i : i + 1); }} onDragLeave={e => { if (!e.currentTarget.contains(e.relatedTarget)) setDropIdx(null); }} style={{ display:"inline-flex", alignItems:"center", position:"relative", opacity: isDragging ? 0.4 : 1, borderLeft: isDropBefore ? "3px solid "+T.AC : "3px solid transparent", borderRight: isDropAfter ? "3px solid "+T.AC : "3px solid transparent", transition:"border-color 0.15s", cursor: renaming === i ? "default" : "grab" }}>
            {renaming === i ? (
              <input autoFocus value={renameVal} onChange={e => setRenameVal(e.target.value)} onBlur={() => { if (renameVal.trim()) renameSc(i, renameVal.trim()); setRenaming(null); }} onKeyDown={e => { if (e.key === "Enter") { if (renameVal.trim()) renameSc(i, renameVal.trim()); setRenaming(null); } if (e.key === "Escape") setRenaming(null); }} style={{ padding:"3px 8px", borderRadius:5, border:"1px solid "+T.AC, background:T.S1, color:T.AC, fontSize:11, fontWeight:700, fontFamily:"inherit", width: Math.max(80, renameVal.length * 7), outline:"none" }} />
            ) : (
              <button onClick={() => { setActive(i); setCmp(false); }} onDoubleClick={() => { setRenaming(i); setRenameVal(s.name); }} style={{ padding:"4px 12px", borderRadius: scenarios.length > 1 ? "5px 0 0 5px" : 5, border:a ? "1px solid "+T.AC : "1px solid "+T.BD, background:a ? T.AC+"15" : "transparent", color:a ? T.AC : T.T2, cursor:"pointer", fontSize:11, fontWeight:a ? 700 : 500, fontFamily:"inherit" }} title="Double-click to rename">{s.name}</button>
            )}
            {scenarios.length > 1 && renaming !== i && (
              <button onClick={e => { e.stopPropagation(); delSc(i); }} style={{ padding:"4px 5px", borderRadius:"0 5px 5px 0", border:a ? "1px solid "+T.AC : "1px solid "+T.BD, borderLeft:"none", background:a ? T.AC+"15" : "transparent", color:T.T2, cursor:"pointer", fontSize:10, fontFamily:"inherit", lineHeight:1 }} title="Delete scenario">{"×"}</button>
            )}
          </div>); })}
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
        {tab === "shipping" && <ShippingTab ships={displayShips} prod={prod} frt={frt} gld={gld} weeklyDem={weeklyDem} sc={sc} upd={upd} updShipEdit={updShipEdit} addShipment={addShipment} updShipAddition={updShipAddition} removeShipAddition={removeShipAddition} deleteShipment={deleteShipment} restoreShipment={restoreShipment} clearShipEdits={clearShipEdits} hasShipEdits={hasShipEdits} />}
        {tab === "settings" && <SettingsTab sc={sc} cap={cap} upd={upd} />}
      </>)}
      <AiAssistant sc={sc} gld={gld} ships={ships} prod={prod} frt={frt} cap={cap} />
    </div>
  );
}
