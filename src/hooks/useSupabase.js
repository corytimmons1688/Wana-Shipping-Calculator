// useSupabase.js
// Syncs the full scenarios array to a Supabase table (single row, id=1).
// No auth required — public RLS policies allow anonymous read/write.
// If DB is empty on first load, immediately saves the default scenarios.

import { useEffect, useRef, useCallback, useState } from "react";
import { MARKETS } from "../data/defaults";

const SUPABASE_URL = "https://fxdyiurjioesdmedmgzu.supabase.co";
const ANON_KEY     = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZ4ZHlpdXJqaW9lc2RtZWRtZ3p1Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzI3MzIzOTYsImV4cCI6MjA4ODMwODM5Nn0.5ueK5iXQ35oThb02ClX3iErPwYR4tPih9GtBAmhDQYk";
const HEADERS      = { "Content-Type": "application/json", "apikey": ANON_KEY, "Authorization": `Bearer ${ANON_KEY}` };
const ROW_URL      = `${SUPABASE_URL}/rest/v1/scenarios?id=eq.1`;
const DEBOUNCE_MS  = 1500;

export function useSupabase(scenarios, setScenarios) {
  const [status, setStatus]   = useState("idle");
  const [error, setError]     = useState(null);
  const saveTimer             = useRef(null);
  const lastSaved             = useRef(null);
  const initialLoadDone       = useRef(false);

  // ── WRITE ─────────────────────────────────────────────────────────────────
  const saveToDB = useCallback(async (data) => {
    const json = JSON.stringify(data);
    if (json === lastSaved.current) return;
    setStatus("saving");
    try {
      const res = await fetch(ROW_URL, {
        method: "PATCH",
        headers: { ...HEADERS, "Prefer": "return=minimal" },
        body: JSON.stringify({ data, updated_at: new Date().toISOString() }),
      });
      if (!res.ok) throw new Error(`Supabase ${res.status}: ${await res.text()}`);
      lastSaved.current = json;
      setStatus("saved");
      setError(null);
    } catch (e) {
      console.error("Supabase save error:", e);
      setError(e.message);
      setStatus("error");
    }
  }, []);

  // ── READ ──────────────────────────────────────────────────────────────────
  // Pass currentScenarios so we can immediately save defaults if DB is empty
  const loadFromDB = useCallback(async (currentScenarios) => {
    setStatus("loading");
    try {
      const res = await fetch(ROW_URL, { headers: HEADERS });
      if (!res.ok) throw new Error(`Supabase ${res.status}: ${await res.text()}`);
      const rows = await res.json();
      if (rows.length > 0 && Array.isArray(rows[0].data) && rows[0].data.length > 0) {
        // DB has data — migrate then load into state
        const loaded = rows[0].data;
        for (const sc of loaded) {
          // Migrate: add lid.proto2 if missing (added Mar 2026)
          if (sc.molds && sc.molds.lid && !sc.molds.lid.proto2) {
            sc.molds.lid.proto2 = { mat:"PP", daily:1750, avail:"2026-04-06", life:50000, days:6, cav:8, qty:1, cost:11500 };
          }
          // Migrate: update proto avail dates from 3/15 to 3/23 if still on old value
          if (sc.molds && sc.molds.base && sc.molds.base.proto && sc.molds.base.proto.avail === "2026-03-15") {
            sc.molds.base.proto.avail = "2026-03-23";
          }
          if (sc.molds && sc.molds.lid && sc.molds.lid.proto && sc.molds.lid.proto.avail === "2026-03-15") {
            sc.molds.lid.proto.avail = "2026-03-23";
          }
          // Migrate: airCost changed from {base, lid} per-unit to {palletRate} model
          if (!sc.airCost || !sc.airCost.palletRate) {
            sc.airCost = { palletRate: 3000 };
          }
          // Migrate: ensure manual ship arrays exist
          if (!sc.shipDeletions) sc.shipDeletions = [];
          if (!sc.shipAdditions) sc.shipAdditions = [];
          if (!sc.shipEdits) sc.shipEdits = [];
          // Migrate: ensure skuPlan object exists (added Mar 2026)
          if (!sc.skuPlan) sc.skuPlan = {};
          // Migrate: patch NY and CO markets with SKU detail + updated demand (Mar 2026 rebrand)
          if (sc.markets) {
            for (const mk of sc.markets) {
              const def = MARKETS.find(d => d.name === mk.name);
              if (def && def.skuDetail && !mk.skuDetail) {
                mk.skuDetail = JSON.parse(JSON.stringify(def.skuDetail));
                mk.demand = [...def.demand];
              }
            }
          }
        }
        setScenarios(loaded);
        setStatus("saved");
      } else {
        // DB is empty — write the current default (Base Plan) up to Supabase now
        await saveToDB(currentScenarios);
      }
      initialLoadDone.current = true;
    } catch (e) {
      console.error("Supabase load error:", e);
      setError(e.message);
      setStatus("error");
      initialLoadDone.current = true;
    }
  }, [setScenarios, saveToDB]);

  // ── AUTO-SAVE (debounced) ─────────────────────────────────────────────────
  useEffect(() => {
    if (!initialLoadDone.current) return;
    clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => saveToDB(scenarios), DEBOUNCE_MS);
    return () => clearTimeout(saveTimer.current);
  }, [scenarios, saveToDB]);

  // ── INITIAL LOAD ──────────────────────────────────────────────────────────
  // Pass scenarios (the default Base Plan) so it can be saved if DB is empty
  useEffect(() => { loadFromDB(scenarios); }, []); // eslint-disable-line

  return { status, error, reload: () => loadFromDB(scenarios) };
}
