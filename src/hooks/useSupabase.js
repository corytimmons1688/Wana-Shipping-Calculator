// useSupabase.js
// Syncs the full scenarios array to a Supabase table (single row, id=1).
// No auth required — public RLS policies allow anonymous read/write.
// If DB is empty on first load, immediately saves the default scenarios.

import { useEffect, useRef, useCallback, useState } from "react";

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
        // DB has data — load it into state
        setScenarios(rows[0].data);
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
