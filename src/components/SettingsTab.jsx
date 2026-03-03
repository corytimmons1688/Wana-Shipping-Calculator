import { useState } from "react";
import { MO } from "../data/defaults";
import { fm, f$, fC } from "../utils/format";
import { T, tbl, th, td } from "../utils/theme";
import { QC, Ed, Bg, Sec } from "./Shared";

export default function SettingsTab({ sc, cap, upd }) {
  const [stab, setStab] = useState("molds");
  const tabs = [
    { k: "molds", l: "Mold Specs" }, { k: "ptl", l: "Proto Timeline" },
    { k: "mtl", l: "Prod Timeline" }, { k: "fc", l: "Forecast" },
    { k: "pkl", l: "Packing List" }, { k: "ship", l: "Shipping" },
    { k: "capex", l: "Capital Expenses" }, { k: "par", l: "Parameters" },
  ];

  function MoldPanel({ label, type, color, icon }) {
    const m = sc.molds[type];
    return (
      <div style={{ flex: "1 1 280px", minWidth: 280, background: T.S2, borderRadius: 7, padding: 12, border: "1px solid " + T.BD }}>
        <div style={{ fontSize: 13, fontWeight: 700, color, marginBottom: 8 }}>{icon} {label}</div>
        {["proto", "prod"].map(ph => {
          const d = m[ph]; const pL = ph === "proto" ? "Prototype" : "Production"; const wk = d.daily * d.qty * d.days;
          return (
            <div key={ph} style={{ marginBottom: 8, padding: 9, background: T.BG, borderRadius: 5 }}>
              <div style={{ fontSize: 10, fontWeight: 700, color: T.T2, marginBottom: 5, textTransform: "uppercase" }}>{pL} {"\u2014"} {d.mat}</div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "5px 12px" }}>
                <div><div style={{ color: T.T2, fontSize: 8 }}>Daily/Mold</div><Ed value={d.daily} onChange={v => upd(s => { s.molds[type][ph].daily = v; })} /></div>
                <div><div style={{ color: T.T2, fontSize: 8 }}>Num Molds</div><QC value={d.qty} onChange={v => upd(s => { s.molds[type][ph].qty = v; })} /></div>
                <div><div style={{ color: T.T2, fontSize: 8 }}>Cavities</div><Ed value={d.cav} onChange={v => upd(s => { s.molds[type][ph].cav = v; })} /></div>
                <div><div style={{ color: T.T2, fontSize: 8 }}>Cost/Mold</div><Ed value={d.cost} onChange={v => upd(s => { s.molds[type][ph].cost = v; })} /></div>
                <div><div style={{ color: T.T2, fontSize: 8 }}>Avail Date</div><Ed value={d.avail} type="text" onChange={v => upd(s => { s.molds[type][ph].avail = v; })} /></div>
                <div><div style={{ color: T.T2, fontSize: 8 }}>Days/Wk</div><Ed value={d.days} onChange={v => upd(s => { s.molds[type][ph].days = v; })} /></div>
                <div><div style={{ color: T.T2, fontSize: 8 }}>Lifespan</div><span style={{ color: T.T2, fontSize: 12, fontFamily: "'JetBrains Mono',monospace" }}>{d.life ? fm(d.life) : "Unlimited"}</span></div>
              </div>
              <div style={{ marginTop: 6, padding: "4px 7px", background: T.S2, borderRadius: 4, display: "flex", justifyContent: "space-between" }}>
                <span style={{ color: T.T2, fontSize: 9 }}>Weekly Cap</span>
                <span style={{ color, fontWeight: 700, fontSize: 12, fontFamily: "'JetBrains Mono',monospace" }}>{fm(wk)}</span>
              </div>
            </div>
          );
        })}
      </div>
    );
  }

  const MoldSet = () => (
    <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
      <MoldPanel label="Base (Jar / HDPE)" type="base" color={T.GR} icon={"\u2B22"} />
      <MoldPanel label="Lid (Cap / PP)" type="lid" color={T.AC} icon={"\u2B21"} />
    </div>
  );

  const TLTbl = ({ data, title }) => (
    <div><div style={{ fontSize: 13, fontWeight: 700, color: T.TX, marginBottom: 8 }}>{title}</div>
      <table style={{ ...tbl, maxWidth: 550 }}><thead><tr><th style={th}>Step</th><th style={th}>Start</th><th style={th}>End</th><th style={{ ...th, textAlign: "right" }}>Days</th></tr></thead><tbody>
        {data.map((r, i) => <tr key={i} style={{ background: i % 2 === 0 ? "transparent" : T.S2 + "28" }}><td style={{ ...td, fontWeight: 600 }}>{r.step}</td><td style={{ ...td, color: T.T2 }}>{r.start}</td><td style={{ ...td, color: T.T2 }}>{r.end}</td><td style={{ ...td, textAlign: "right", fontWeight: 600 }}>{r.days}</td></tr>)}
      </tbody></table></div>
  );

  const FCTbl = () => {
    let t = 0; for (const r of sc.forecast) t += r.qty;
    return (
      <div><div style={{ fontSize: 13, fontWeight: 700, color: T.TX, marginBottom: 8 }}>Supplier Forecast (Canopy Cube)</div>
        <table style={{ ...tbl, maxWidth: 650 }}><thead><tr><th style={th}>Period</th><th style={{ ...th, textAlign: "right" }}>Qty</th><th style={{ ...th, textAlign: "right" }}>Days</th><th style={th}>Start</th><th style={th}>End</th></tr></thead><tbody>
          {sc.forecast.map((r, i) => <tr key={i} style={{ background: i % 2 === 0 ? "transparent" : T.S2 + "28" }}><td style={{ ...td, fontWeight: 600 }}>{r.period}</td><td style={{ ...td, textAlign: "right" }}>{fm(r.qty)}</td><td style={{ ...td, textAlign: "right", color: T.T2 }}>{r.days}</td><td style={{ ...td, color: T.T2 }}>{r.start}</td><td style={{ ...td, color: T.T2 }}>{r.end}</td></tr>)}
          <tr style={{ background: "#0a1f1228" }}><td style={{ ...td, fontWeight: 700, color: T.GR, borderTop: "2px solid " + T.GR }}>TOTAL</td><td style={{ ...td, textAlign: "right", fontWeight: 700, color: T.GR, borderTop: "2px solid " + T.GR }}>{fm(t)}</td><td colSpan={3} style={{ ...td, borderTop: "2px solid " + T.GR }} /></tr>
        </tbody></table></div>
    );
  };

  const PKTbl = () => (
    <div><div style={{ fontSize: 13, fontWeight: 700, color: T.TX, marginBottom: 8 }}>Packing List</div>
      <table style={{ ...tbl, maxWidth: 750 }}><thead><tr><th style={th}>Container</th><th style={th}>Item</th><th style={{ ...th, textAlign: "right" }}>Pallets</th><th style={{ ...th, textAlign: "right" }}>Qty/Cont</th><th style={{ ...th, textAlign: "right" }}>Weight</th><th style={{ ...th, textAlign: "right" }}>CBM</th></tr></thead><tbody>
        {sc.pkl.map((r, i) => <tr key={i} style={{ background: i % 2 === 0 ? "transparent" : T.S2 + "28" }}><td style={{ ...td, fontWeight: 600 }}>{r.cont}</td><td style={td}>{r.item}</td><td style={{ ...td, textAlign: "right" }}>{r.pallets}</td><td style={{ ...td, textAlign: "right" }}>{fm(r.qpc)}</td><td style={{ ...td, textAlign: "right", color: T.T2 }}>{r.wt}</td><td style={{ ...td, textAlign: "right", color: T.T2 }}>{r.cbm}</td></tr>)}
      </tbody></table></div>
  );

  const ShipSet = () => (
    <div style={{ maxWidth: 600 }}>
      <table style={tbl}><thead><tr><th style={th}>Method</th><th style={{ ...th, textAlign: "right" }}>Transit</th><th style={{ ...th, textAlign: "right" }}>Cost/Unit</th><th style={th}>Notes</th></tr></thead><tbody>
        {sc.shipping.map((s, i) => <tr key={i}><td style={td}><Bg method={s.method} /></td><td style={{ ...td, textAlign: "right" }}><Ed value={s.transitDays} onChange={v => upd(sc2 => { sc2.shipping[i].transitDays = v; })} /></td><td style={{ ...td, textAlign: "right" }}><Ed value={s.costPerUnit} onChange={v => upd(sc2 => { sc2.shipping[i].costPerUnit = v; })} /></td><td style={{ ...td, color: T.T2, fontSize: 11 }}>{s.notes}</td></tr>)}
      </tbody></table>
      <div style={{ marginTop: 14, fontSize: 12, fontWeight: 700, color: T.TX, marginBottom: 6 }}>Container Rates</div>
      <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
        {Object.entries(sc.containers).map(([k, c]) => (
          <div key={k} style={{ background: T.S2, borderRadius: 6, padding: "8px 12px", border: "1px solid " + T.BD, minWidth: 140 }}>
            <div style={{ fontWeight: 700, color: T.AC, fontSize: 12, marginBottom: 4 }}>{c.label}</div>
            <div style={{ color: T.T2, fontSize: 10 }}>Cost: <Ed value={c.cost} onChange={v => upd(s => { s.containers[k].cost = v; })} /></div>
            <div style={{ color: T.T2, fontSize: 10 }}>Min: <Ed value={c.min} onChange={v => upd(s => { s.containers[k].min = v; })} /></div>
            <div style={{ color: T.T2, fontSize: 10 }}>Max: <Ed value={c.max} onChange={v => upd(s => { s.containers[k].max = v; })} /></div>
          </div>
        ))}
      </div>
    </div>
  );

  const CXSet = () => (
    <div style={{ maxWidth: 600 }}>
      <Sec title="Production Molds" color={T.GR} bg="#0a1f12"><table style={{ ...tbl, marginBottom: 0 }}><thead><tr><th style={th}>Item</th><th style={{ ...th, textAlign: "center" }}>Qty</th><th style={{ ...th, textAlign: "right" }}>Each</th><th style={{ ...th, textAlign: "right" }}>Total</th></tr></thead><tbody>
        {[{ n: "Base Proto Jar", q: sc.molds.base.proto.qty, c: sc.molds.base.proto.cost },{ n: "Base Prod Jar", q: sc.molds.base.prod.qty, c: sc.molds.base.prod.cost },{ n: "Lid Proto", q: sc.molds.lid.proto.qty, c: sc.molds.lid.proto.cost },{ n: "Lid Prod", q: sc.molds.lid.prod.qty, c: sc.molds.lid.prod.cost }].map((r, i) => <tr key={i}><td style={td}>{r.n}</td><td style={{ ...td, textAlign: "center", color: T.AC, fontWeight: 700 }}>{r.q}</td><td style={{ ...td, textAlign: "right" }}>{fC(r.c)}</td><td style={{ ...td, textAlign: "right", fontWeight: 600 }}>{fC(r.q * r.c)}</td></tr>)}
        <tr style={{ background: "#0a1f1228" }}><td colSpan={3} style={{ ...td, fontWeight: 700, borderTop: "2px solid " + T.GR }}>Subtotal</td><td style={{ ...td, textAlign: "right", fontWeight: 700, color: T.GR, borderTop: "2px solid " + T.GR }}>{fC(cap.mT)}</td></tr>
      </tbody></table></Sec>
      <Sec title="Prototype Molds" color={T.PU} bg="#180a28"><table style={{ ...tbl, marginBottom: 0 }}><thead><tr><th style={th}>Item</th><th style={{ ...th, textAlign: "center" }}>Qty</th><th style={{ ...th, textAlign: "right" }}>Each</th><th style={{ ...th, textAlign: "right" }}>Total</th></tr></thead><tbody>
        {sc.protoMolds.map((p, i) => <tr key={i}><td style={td}>{p.name}</td><td style={{ ...td, textAlign: "center" }}><QC value={p.qty} onChange={v => upd(s => { s.protoMolds[i].qty = v; })} /></td><td style={{ ...td, textAlign: "right" }}><Ed value={p.cost} onChange={v => upd(s => { s.protoMolds[i].cost = v; })} /></td><td style={{ ...td, textAlign: "right", fontWeight: 600 }}>{fC(p.qty * p.cost)}</td></tr>)}
        <tr style={{ background: "#180a2828" }}><td colSpan={3} style={{ ...td, fontWeight: 700, borderTop: "2px solid " + T.PU }}>Subtotal</td><td style={{ ...td, textAlign: "right", fontWeight: 700, color: T.PU, borderTop: "2px solid " + T.PU }}>{fC(cap.pT)}</td></tr>
      </tbody></table></Sec>
      <Sec title="Equipment Change Parts" color={T.AM} bg="#281508"><table style={{ ...tbl, marginBottom: 0 }}><thead><tr><th style={th}>Item</th><th style={{ ...th, textAlign: "center" }}>Qty</th><th style={{ ...th, textAlign: "right" }}>Each</th><th style={{ ...th, textAlign: "right" }}>Total</th></tr></thead><tbody>
        {sc.equipment.map((e, i) => <tr key={i}><td style={td}>{e.name}</td><td style={{ ...td, textAlign: "center" }}><QC value={e.qty} onChange={v => upd(s => { s.equipment[i].qty = v; })} /></td><td style={{ ...td, textAlign: "right" }}><Ed value={e.cost} onChange={v => upd(s => { s.equipment[i].cost = v; })} /></td><td style={{ ...td, textAlign: "right", fontWeight: 600 }}>{fC(e.qty * e.cost)}</td></tr>)}
        <tr style={{ background: "#28150828" }}><td colSpan={3} style={{ ...td, fontWeight: 700, borderTop: "2px solid " + T.AM }}>Subtotal</td><td style={{ ...td, textAlign: "right", fontWeight: 700, color: T.AM, borderTop: "2px solid " + T.AM }}>{fC(cap.eT)}</td></tr>
      </tbody></table></Sec>
      <div style={{ marginTop: 14, background: "linear-gradient(135deg," + T.S2 + "," + T.BG + ")", borderRadius: 7, padding: "12px 16px", border: "1px solid " + T.AC, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div style={{ fontSize: 11, color: T.T2, textTransform: "uppercase", letterSpacing: 1, fontWeight: 600 }}>Total Capital Expense</div>
        <div style={{ fontSize: 22, fontWeight: 800, color: T.AC, fontFamily: "'JetBrains Mono',monospace" }}>{f$(cap.grand)}</div>
      </div>
    </div>
  );

  const ParSet = () => (
    <div style={{ maxWidth: 420 }}>
      <div style={{ background: T.S2, borderRadius: 7, padding: 12, border: "1px solid " + T.BD }}>
        <div style={{ display: "grid", gridTemplateColumns: "1fr auto", gap: "8px 16px", alignItems: "center" }}>
          <div><div style={{ color: T.TX, fontSize: 12, fontWeight: 600 }}>Base Lead Time</div><div style={{ color: T.T2, fontSize: 8 }}>Days before month start</div></div>
          <Ed value={sc.params.baseLeadDays} onChange={v => upd(s => { s.params.baseLeadDays = v; })} />
          <div><div style={{ color: T.TX, fontSize: 12, fontWeight: 600 }}>Lid Lead Time</div><div style={{ color: T.T2, fontSize: 8 }}>Days before month start</div></div>
          <Ed value={sc.params.lidLeadDays} onChange={v => upd(s => { s.params.lidLeadDays = v; })} />
          <div><div style={{ color: T.TX, fontSize: 12, fontWeight: 600 }}>Shipment Rounding</div><div style={{ color: T.T2, fontSize: 8 }}>Round air qty to increment</div></div>
          <Ed value={sc.params.rounding} onChange={v => upd(s => { s.params.rounding = v; })} />
        </div>
      </div>
    </div>
  );

  return (
    <div style={{ padding: "14px 18px" }}>
      <div style={{ display: "flex", gap: 0, marginBottom: 14, borderBottom: "1px solid " + T.BD, overflowX: "auto" }}>
        {tabs.map(t => {
          const a = stab === t.k;
          return <button key={t.k} onClick={() => setStab(t.k)} style={{ padding: "7px 14px", border: "none", borderBottom: a ? "2px solid " + T.AC : "2px solid transparent", background: "transparent", color: a ? T.AC : T.T2, cursor: "pointer", fontSize: 11, fontWeight: a ? 700 : 500, whiteSpace: "nowrap", fontFamily: "inherit" }}>{t.l}</button>;
        })}
      </div>
      {stab === "molds" && <MoldSet />}
      {stab === "ptl" && <TLTbl data={sc.protoTL} title="Prototype Timeline" />}
      {stab === "mtl" && <TLTbl data={sc.prodTL} title="Production Timeline" />}
      {stab === "fc" && <FCTbl />}
      {stab === "pkl" && <PKTbl />}
      {stab === "ship" && <ShipSet />}
      {stab === "capex" && <CXSet />}
      {stab === "par" && <ParSet />}
    </div>
  );
}
