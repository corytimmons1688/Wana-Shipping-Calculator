import { useState } from "react";
import { fm } from "../utils/format";

export function QC({ value, onChange, min = 0, max = 20 }) {
  const bs = { width: 22, height: 22, border: "none", borderRadius: 3, fontSize: 13, fontWeight: 700, display: "flex", alignItems: "center", justifyContent: "center" };
  return (
    <div style={{ display: "inline-flex", alignItems: "center", gap: 3, background: "#1a1a30", borderRadius: 5, padding: "2px 4px" }}>
      <button onClick={() => value > min && onChange(value - 1)} disabled={value <= min} style={{ ...bs, background: value <= min ? "#151528" : "#2a2a44", color: value <= min ? "#444" : "#ccc", cursor: value <= min ? "default" : "pointer" }}>-</button>
      <span style={{ minWidth: 24, textAlign: "center", fontWeight: 700, fontSize: 13, color: "#7cb3ff", fontFamily: "JetBrains Mono, monospace" }}>{value}</span>
      <button onClick={() => value < max && onChange(value + 1)} disabled={value >= max} style={{ ...bs, background: value >= max ? "#151528" : "#2a2a44", color: value >= max ? "#444" : "#ccc", cursor: value >= max ? "default" : "pointer" }}>+</button>
    </div>
  );
}

export function Ed({ value, onChange, type = "number", style: sx = {} }) {
  const [ed, setEd] = useState(false);
  const [tmp, setTmp] = useState(String(value));
  if (ed) return (
    <input autoFocus value={tmp} onChange={(e) => setTmp(e.target.value)} onBlur={() => { setEd(false); const v = type === "number" ? Number(tmp) : tmp; if (!isNaN(v) || type !== "number") onChange(v); }} onKeyDown={(e) => { if (e.key === "Enter") e.target.blur(); if (e.key === "Escape") { setEd(false); setTmp(String(value)); } }} style={{ background: "#0a0a1a", border: "1px solid #7cb3ff", color: "#7cb3ff", fontFamily: "JetBrains Mono, monospace", fontSize: 12, padding: "2px 6px", borderRadius: 3, width: "100%", textAlign: "right", outline: "none", ...sx }} />
  );
  return (
    <span onClick={() => { setTmp(String(value)); setEd(true); }} style={{ cursor: "pointer", color: "#7cb3ff", fontFamily: "JetBrains Mono, monospace", fontSize: 12, borderBottom: "1px dashed #333", ...sx }}>
      {type === "number" ? fm(value) : value}
    </span>
  );
}

export function Badge({ method }) {
  const colors = { "Standard Ocean": { bg: "#0a1f12", bd: "#2e7d32", tx: "#66bb6a" }, "Fast Boat": { bg: "#0a1528", bd: "#1565c0", tx: "#64b5f6" }, "Air": { bg: "#281008", bd: "#e65100", tx: "#ff8a65" } };
  const c = colors[method] || { bg: "#222", bd: "#555", tx: "#ccc" };
  return <span style={{ display: "inline-block", padding: "2px 7px", borderRadius: 4, background: c.bg, border: "1px solid " + c.bd, color: c.tx, fontSize: 10, fontWeight: 700, fontFamily: "JetBrains Mono, monospace" }}>{method}</span>;
}

export function Sec({ title, color, bg, children }) {
  return (
    <div style={{ marginBottom: 14 }}>
      <div style={{ background: bg, padding: "6px 10px", borderRadius: "5px 5px 0 0", fontWeight: 700, color, fontSize: 11 }}>{title}</div>
      <div style={{ background: "#14143a", borderRadius: "0 0 5px 5px", border: "1px solid #222250", overflow: "hidden" }}>{children}</div>
    </div>
  );
}
