import { useState } from "react";
import { fm } from "../utils/format";
import { T } from "../utils/theme";

export function QC({ value, onChange, min = 0, max = 20 }) {
  const bs = { width: 22, height: 22, border: "none", borderRadius: 3, fontSize: 13, fontWeight: 700, display: "flex", alignItems: "center", justifyContent: "center" };
  return (
    <div style={{ display: "inline-flex", alignItems: "center", gap: 3, background: T.S2, borderRadius: 5, padding: "2px 4px" }}>
      <button onClick={() => value > min && onChange(value - 1)} disabled={value <= min} style={{ ...bs, background: value <= min ? T.BD : T.S1, color: value <= min ? T.BD : T.TX, cursor: value <= min ? "default" : "pointer" }}>-</button>
      <span style={{ minWidth: 24, textAlign: "center", fontWeight: 700, fontSize: 13, color: "#1e40af", fontFamily: "JetBrains Mono, monospace" }}>{value}</span>
      <button onClick={() => value < max && onChange(value + 1)} disabled={value >= max} style={{ ...bs, background: value >= max ? T.BD : T.S1, color: value >= max ? T.BD : T.TX, cursor: value >= max ? "default" : "pointer" }}>+</button>
    </div>
  );
}

export function Ed({ value, onChange, type = "number", style: sx = {} }) {
  const [ed, setEd] = useState(false);
  const [tmp, setTmp] = useState(String(value));
  if (ed) return (
    <input autoFocus value={tmp} onChange={(e) => setTmp(e.target.value)} onBlur={() => { setEd(false); const v = type === "number" ? Number(tmp) : tmp; if (!isNaN(v) || type !== "number") onChange(v); }} onKeyDown={(e) => { if (e.key === "Enter") e.target.blur(); if (e.key === "Escape") { setEd(false); setTmp(String(value)); } }} style={{ background: T.S1, border: "1px solid " + T.AC, color: "#1e40af", fontFamily: "JetBrains Mono, monospace", fontSize: 12, padding: "2px 6px", borderRadius: 3, width: "100%", textAlign: "right", outline: "none", ...sx }} />
  );
  return (
    <span onClick={() => { setTmp(String(value)); setEd(true); }} style={{ cursor: "pointer", color: "#1e40af", fontFamily: "JetBrains Mono, monospace", fontSize: 12, borderBottom: "1px dashed " + T.BD, ...sx }}>
      {type === "number" ? fm(value) : value}
    </span>
  );
}

export function Bg({ method }) {
  const colors = { "Standard Ocean": { bg: "#dcfce7", bd: "#16a34a", tx: "#15803d" }, "Fast Boat": { bg: "#dbeafe", bd: "#2563eb", tx: "#1d4ed8" }, "Air": { bg: "#ffedd5", bd: "#d97706", tx: "#b45309" } };
  const c = colors[method] || { bg: "#f3f4f6", bd: "#9ca3af", tx: "#6b7280" };
  return <span style={{ display: "inline-block", padding: "2px 7px", borderRadius: 4, background: c.bg, border: "1px solid " + c.bd, color: c.tx, fontSize: 10, fontWeight: 700, fontFamily: "JetBrains Mono, monospace" }}>{method}</span>;
}

export function Sec({ title, color, bg, children }) {
  return (
    <div style={{ marginBottom: 14 }}>
      <div style={{ background: bg, padding: "6px 10px", borderRadius: "5px 5px 0 0", fontWeight: 700, color, fontSize: 11 }}>{title}</div>
      <div style={{ background: T.S1, borderRadius: "0 0 5px 5px", border: "1px solid " + T.BD, overflow: "hidden" }}>{children}</div>
    </div>
  );
}
