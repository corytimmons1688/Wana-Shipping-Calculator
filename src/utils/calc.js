export function calcGLD(mkts) {
  const r = new Array(12).fill(0);
  for (let m = 0; m < 12; m++)
    for (let i = 0; i < mkts.length; i++)
      if (mkts[i].goLive != null && mkts[i].goLive <= m + 1) r[m] += mkts[i].demand[m];
  return r;
}

// Parse "YYYY-MM-DD" as LOCAL midnight (not UTC) so dates display correctly in all timezones.
function parseLocalDate(s) {
  if (!s) return new Date(NaN);
  const p = s.split("-").map(Number);
  return new Date(p[0], p[1] - 1, p[2]);
}

export function calcProd(molds) {
  const S = new Date(2026, 2, 9), wks = [];  // Mar 9 local
  let bC = 0, lC = 0, bPU = 0, lPU = 0, bP2U = 0, lP2U = 0;
  const bPD = parseLocalDate(molds.base.proto.avail), bMD = parseLocalDate(molds.base.prod.avail);
  const bP2 = molds.base.proto2 || null;
  const bP2D = bP2 ? parseLocalDate(bP2.avail) : null;
  const lPD = parseLocalDate(molds.lid.proto.avail), lMD = parseLocalDate(molds.lid.prod.avail);
  const lP2 = molds.lid.proto2 || null;
  const lP2D = lP2 ? parseLocalDate(lP2.avail) : null;
  for (let w = 0; w < 43; w++) {
    const wk = new Date(S); wk.setDate(wk.getDate() + w * 7);
    let bW = 0, lW = 0;
    if (wk >= bPD && (molds.base.proto.life == null || bPU < molds.base.proto.life)) {
      const o = molds.base.proto.daily * molds.base.proto.qty * molds.base.proto.days;
      const c = molds.base.proto.life ? Math.min(o, molds.base.proto.life - bPU) : o;
      bW += c; bPU += c;
    }
    if (bP2 && bP2D && wk >= bP2D && (bP2.life == null || bP2U < bP2.life)) {
      const o2 = bP2.daily * bP2.qty * bP2.days;
      const c2 = bP2.life ? Math.min(o2, bP2.life - bP2U) : o2;
      bW += c2; bP2U += c2;
    }
    if (wk >= bMD) bW += molds.base.prod.daily * molds.base.prod.qty * molds.base.prod.days;
    if (wk >= lPD && (molds.lid.proto.life == null || lPU < molds.lid.proto.life)) {
      const o3 = molds.lid.proto.daily * molds.lid.proto.qty * molds.lid.proto.days;
      const c3 = molds.lid.proto.life ? Math.min(o3, molds.lid.proto.life - lPU) : o3;
      lW += c3; lPU += c3;
    }
    if (lP2 && lP2D && wk >= lP2D && (lP2.life == null || lP2U < lP2.life)) {
      const o4 = lP2.daily * lP2.qty * lP2.days;
      const c4 = lP2.life ? Math.min(o4, lP2.life - lP2U) : o4;
      lW += c4; lP2U += c4;
    }
    if (wk >= lMD) lW += molds.lid.prod.daily * molds.lid.prod.qty * molds.lid.prod.days;
    bC += bW; lC += lW;
    wks.push({ wk, bW, lW, bC, lC, ship: Math.min(bC, lC), tot: bW + lW,
      sur: Math.abs(bC - lC), surT: bC > lC ? "base" : bC < lC ? "lid" : null });
  }
  return wks;
}

export function calcCap(molds, pm, eq) {
  let bCost = (molds.base.proto.qty * molds.base.proto.cost) + (molds.base.prod.qty * molds.base.prod.cost);
  if (molds.base.proto2) bCost += molds.base.proto2.qty * molds.base.proto2.cost;
  let lCost = (molds.lid.proto.qty * molds.lid.proto.cost) + (molds.lid.prod.qty * molds.lid.prod.cost);
  if (molds.lid.proto2) lCost += molds.lid.proto2.qty * molds.lid.proto2.cost;
  const mT = bCost + lCost;
  let pT = 0; for (const p of pm) pT += p.qty * p.cost;
  let eT = 0; for (const e of eq) eT += e.qty * e.cost;
  return { bCost, lCost, mT, pT, eT, grand: mT + pT + eT };
}

function prodAt(prod, date) {
  let best = null;
  for (const p of prod) { if (p.wk <= date) best = p; }
  return best ? { bC: best.bC, lC: best.lC } : { bC: 0, lC: 0 };
}

function addDays(date, n) {
  const d = new Date(date); d.setDate(d.getDate() + n); return d;
}

function packOne(bAvail, lAvail, maxPal, minPal, bPP, lPP) {
  for (let lp = Math.min(maxPal, Math.floor(lAvail / lPP)); lp >= 0; lp--) {
    const bp = Math.min(maxPal - lp, Math.floor(bAvail / bPP));
    if (lp + bp >= minPal) return { bQ: bp * bPP, lQ: lp * lPP, bPallets: bp, lPallets: lp };
  }
  return null;
}

// ============================================================
// SHIPPING OPTIMIZER
// Architecture:
//   committedBy(date) = date-filtered (only counts shipments with shipDate <= date)
//   This is correct because production is cumulative and nested:
//   units at week 8 are a subset of week 12. Each availAt(date) check
//   uses prodAt(date) which bounds the pool to that date's cumulative.
//
//   Phase 1:   Ocean (free full containers) — fills greedily for all months
//   Phase 1.5: Consolidate sub-pallet lid residuals into one free Ocean container
//   Phase 2:   FB lids (multi-week scan, cost-checked vs Air)
//   Phase 3:   FB bases (cost-checked against ACTUAL available quantity)
//   Phase 4:   Air (production-constrained — never ships phantom units)
//   Post-pass: Remove Air made redundant by cumulative surplus
// ============================================================

export function optimize(mkts, molds, ship, par, cont, pal, airCost) {
  const gld = calcGLD(mkts), prod = calcProd(molds), res = [];
  // Air pallet sizes — used in Phases 0, 2, 3, 4 for cost comparisons
  const abPP = pal.airBasePP || 7500, alPP = pal.airLidPP || 25000;
  // Safe pallet rate — fallback guards against stale/missing airCost shape
  const palletRate = (airCost && airCost.palletRate) || 3000;

  let oc = null, fb = null, ar = null;
  for (const s of ship) {
    if (s.method === "Standard Ocean") oc = s;
    if (s.method === "Fast Boat") fb = s;
    if (s.method === "Air") ar = s;
  }

  const demands = [];
  for (let m = 0; m < 12; m++) {
    if (gld[m] <= 0) continue;
    const ms = new Date(2026, m, 1);
    demands.push({
      mo: m, dem: gld[m],
      bDeadline: addDays(ms, -par.baseLeadDays),
      lDeadline: addDays(ms, -par.lidLeadDays),
      bNeed: gld[m], lNeed: gld[m]
    });
  }

  // BUCKET-BASED INVENTORY TRACKING
  // Each production week is a discrete bucket of units. When a shipment draws
  // from date X, it depletes from buckets ≤ X (oldest first). Once depleted,
  // units are gone everywhere. This prevents double-counting without blocking
  // future phases from using genuinely available production.
  const buckets = prod.filter(p => p.bW > 0 || p.lW > 0).map(p => ({
    wk: p.wk, bR: p.bW, lR: p.lW  // bR/lR = remaining in this bucket
  }));

  function availAt(date) {
    let bS = 0, lS = 0;
    for (const bk of buckets) { if (bk.wk <= date) { bS += bk.bR; lS += bk.lR; } }
    return { bS, lS };
  }

  function drawFrom(date, bQty, lQty) {
    let bTaken = 0, lTaken = 0;
    for (const bk of buckets) {
      if (bk.wk > date) continue;
      if (bQty > bTaken && bk.bR > 0) {
        const take = Math.min(bQty - bTaken, bk.bR);
        bk.bR -= take; bTaken += take;
      }
      if (lQty > lTaken && bk.lR > 0) {
        const take = Math.min(lQty - lTaken, bk.lR);
        bk.lR -= take; lTaken += take;
      }
    }
    return { bTaken, lTaken };
  }

  function fillAt(method, d, shipDate, transitDays, bMax, lMax, preShip, stopWhenLidsDone, minPalOverride) {
    const arrDate = addDays(shipDate, transitDays);
    for (const ckKey of ["40HC", "20HC"]) {
      const ck = cont[ckKey];
      const maxPal = ck.pallets;
      const minPal = minPalOverride != null ? minPalOverride : (ck.minPal || (maxPal <= 10 ? 8 : 16));
      const cost = method === "Standard Ocean" ? 0 : ck.cost;
      while (true) {
        if (stopWhenLidsDone && d.lNeed <= 0) break;
        const a = availAt(shipDate);
        const remB = Math.min(a.bS, Math.max(0, bMax - (d.dem - d.bNeed - bMax < 0 ? 0 : 0)));
        const remL = Math.min(a.lS, Math.max(0, lMax));
        if (remB + remL <= 0) break;
        const r = packOne(Math.min(remB, d.bNeed > 0 ? d.bNeed : remB), Math.min(remL, d.lNeed > 0 ? d.lNeed : remL), maxPal, minPal, pal.basePP, pal.lidPP);
        if (!r) break;
        // Draw from production buckets (physically removes units)
        drawFrom(shipDate, r.bQ, r.lQ);
        res.push({ mo: d.mo, meth: method, cn: ck.label,
          bQ: r.bQ, lQ: r.lQ, tQ: r.bQ + r.lQ, cost,
          bSd: new Date(shipDate), lSd: new Date(shipDate), bAr: arrDate, lAr: arrDate,
          preShip: !!preShip, bPal: r.bPallets, lPal: r.lPallets });
        d.bNeed -= r.bQ; d.lNeed -= r.lQ;
        bMax = Math.max(0, bMax - r.bQ);
        lMax = Math.max(0, lMax - r.lQ);
      }
    }
  }

  const minContPal = Math.min(...Object.values(cont).map(c => c.minPal || (c.pallets <= 10 ? 8 : 16)));
  const padBases = minContPal * pal.basePP;

  // Helper: find the earliest date when there is any production available
  function earliestProdDate(after) {
    for (const bk of buckets) {
      if (bk.wk < after) continue;
      if (bk.bR > 0 || bk.lR > 0) return bk.wk;
    }
    return null;
  }

  // ── PHASE 0 — Reserve Air/FB ONLY for months where Ocean is impossible ───
  // A month needs Phase 0 only when ZERO production weeks exist before the
  // Ocean lid ship-by date (the later of the two deadlines). If any production
  // week exists in the Ocean window, Phase 1 should handle it — even if the
  // snapshot at a single date looks low due to earlier bucket draws.
  if (ar) {
    for (const d of demands) {
      // Use the LATER lid deadline — gives Ocean the maximum window
      const ocLD = addDays(d.lDeadline, -(oc ? oc.transitDays : 45));
      const anyOceanProd = prod.some(pw => pw.wk <= ocLD && (pw.bW > 0 || pw.lW > 0));
      if (anyOceanProd) continue; // Production exists in Ocean window → Phase 1 handles it

      // Try FB first (cheaper than Air if enough volume)
      if (fb) {
        const fbLD = addDays(d.lDeadline, -fb.transitDays);
        const fbBD = addDays(d.bDeadline, -fb.transitDays);
        const fbDate = fbBD < fbLD ? fbBD : fbLD;
        const fbWeeks = prod.filter(pw => pw.wk <= fbDate);
        for (let wi = fbWeeks.length - 1; wi >= 0 && (d.bNeed > 0 || d.lNeed > 0); wi--) {
          const a = availAt(fbWeeks[wi].wk);
          if (a.lS < pal.lidPP && a.bS < pal.basePP) continue;
          for (const ckKey of ["20HC", "40HC"]) {
            const ck = cont[ckKey];
            const maxP = ck.pallets, minP = ck.minPal || (maxP <= 10 ? 8 : 16);
            const r = packOne(Math.min(a.bS, d.bNeed), Math.min(a.lS, d.lNeed), maxP, minP, pal.basePP, pal.lidPP);
            if (!r) continue;
            const airEquiv = Math.ceil(r.bQ / abPP) * palletRate + Math.ceil(r.lQ / alPP) * palletRate;
            if (ck.cost >= airEquiv) continue; // Air cheaper, skip FB
            const arrDate = addDays(fbWeeks[wi].wk, fb.transitDays);
            res.push({ mo: d.mo, meth: "Fast Boat", cn: ck.label,
              bQ: r.bQ, lQ: r.lQ, tQ: r.bQ + r.lQ, cost: ck.cost,
              bSd: new Date(fbWeeks[wi].wk), lSd: new Date(fbWeeks[wi].wk),
              bAr: arrDate, lAr: arrDate, preShip: false, bPal: r.bPallets, lPal: r.lPallets });
            drawFrom(fbWeeks[wi].wk, r.bQ, r.lQ);
            d.bNeed -= r.bQ; d.lNeed -= r.lQ;
            break;
          }
        }
      }

      // Air for whatever FB couldn't cover — ship bases and lids independently
      // because they have different lead times and Air doesn't require containers
      if (d.bNeed > 0 || d.lNeed > 0) {
        const bSD0 = addDays(d.bDeadline, -ar.transitDays);
        const lSD0 = addDays(d.lDeadline, -ar.transitDays);
        // FIXED: use earliest available production if strict deadline has nothing
        const bSD = availAt(bSD0).bS > 0 ? bSD0 : (earliestProdDate(bSD0) || bSD0);
        const lSD = availAt(lSD0).lS > 0 ? lSD0 : (earliestProdDate(lSD0) || lSD0);
        // Ship bases on base deadline
        if (d.bNeed > 0) {
          const aB = availAt(bSD);
          let bShip = Math.max(0, Math.min(d.bNeed, aB.bS));
          if (bShip > 0 && aB.bS >= abPP) bShip = Math.min(Math.ceil(bShip / abPP) * abPP, aB.bS);
          if (bShip > 0) {
            res.push({ mo: d.mo, meth: "Air", cn: "Air", bQ: bShip, lQ: 0, tQ: bShip,
              cost: Math.ceil(bShip / abPP) * palletRate,
              bSd: new Date(bSD), lSd: new Date(bSD),
              bAr: addDays(bSD, ar.transitDays), lAr: addDays(bSD, ar.transitDays),
              bPal: Math.ceil(bShip / abPP), lPal: 0, preShip: false,
              lateDelivery: bSD > bSD0 });
            drawFrom(bSD, bShip, 0);
            d.bNeed -= bShip;
          }
        }
        // Ship lids on lid deadline
        if (d.lNeed > 0) {
          const aL = availAt(lSD);
          let lShip = Math.max(0, Math.min(d.lNeed, aL.lS));
          if (lShip > 0 && aL.lS >= alPP) lShip = Math.min(Math.ceil(lShip / alPP) * alPP, aL.lS);
          if (lShip > 0) {
            res.push({ mo: d.mo, meth: "Air", cn: "Air", bQ: 0, lQ: lShip, tQ: lShip,
              cost: Math.ceil(lShip / alPP) * palletRate,
              bSd: new Date(lSD), lSd: new Date(lSD),
              bAr: addDays(lSD, ar.transitDays), lAr: addDays(lSD, ar.transitDays),
              bPal: 0, lPal: Math.ceil(lShip / alPP), preShip: false,
              lateDelivery: lSD > lSD0 });
            drawFrom(lSD, 0, lShip);
            d.lNeed -= lShip;
          }
        }
      }
    }
  }

  // ── PHASE 1 — Ocean (free full containers) ──────────────────────
  if (oc) {
    // Pass 1a: fill containers using base deadline (tighter)
    for (const d of demands) {
      const ocBD = addDays(d.bDeadline, -oc.transitDays);
      const validWeeks = prod.filter(pw => pw.wk <= ocBD);
      for (let i = validWeeks.length - 1; i >= 0 && (d.bNeed > 0 || d.lNeed > 0); i--) {
        fillAt("Standard Ocean", d, validWeeks[i].wk, oc.transitDays, d.bNeed, d.lNeed, false, false, null);
      }
    }
    // Pass 1b: lids have shorter lead time — extra Ocean window for lid-only containers
    for (const d of demands) {
      if (d.lNeed <= 0) continue;
      const ocLD = addDays(d.lDeadline, -oc.transitDays);
      const ocBD = addDays(d.bDeadline, -oc.transitDays);
      if (ocLD <= ocBD) continue;
      const extraWeeks = prod.filter(pw => pw.wk > ocBD && pw.wk <= ocLD);
      for (let i = extraWeeks.length - 1; i >= 0 && d.lNeed > 0; i--) {
        fillAt("Standard Ocean", d, extraWeeks[i].wk, oc.transitDays, padBases, d.lNeed, false, true, null);
      }
    }

  }

  // ── PHASE 2 — Fast Boat lids (multi-week scan, cost-checked) ────
  if (fb) {
    for (const d of demands) {
      if (d.lNeed <= 0 || d.lNeed < pal.lidPP) continue;
      const lSD = addDays(d.lDeadline, -fb.transitDays);
      const fbWeeks = prod.filter(pw => pw.wk <= lSD);
      for (let wi = fbWeeks.length - 1; wi >= 0 && d.lNeed >= pal.lidPP; wi--) {
        const shipDate = fbWeeks[wi].wk;
        const a = availAt(shipDate);
        if (a.lS < pal.lidPP) continue;
        const bMaxFB = Math.max(d.bNeed, padBases);
        let remB = Math.min(a.bS, bMaxFB);
        let remL = Math.min(a.lS, d.lNeed);
        for (const ckKey of ["40HC", "20HC"]) {
          const ck = cont[ckKey];
          const maxPal = ck.pallets;
          const minPal = ck.minPal || (maxPal <= 10 ? 8 : 16);
          while (d.lNeed >= pal.lidPP && remL >= pal.lidPP) {
            const r = packOne(remB, remL, maxPal, minPal, pal.basePP, pal.lidPP, false);
            if (!r || r.lQ === 0) break;
            const airEquiv = Math.ceil(r.lQ / alPP) * palletRate + Math.ceil(r.bQ / abPP) * palletRate;
            if (ck.cost >= airEquiv) break;
            const arrDate = addDays(shipDate, fb.transitDays);
            res.push({ mo: d.mo, meth: "Fast Boat", cn: ck.label,
              bQ: r.bQ, lQ: r.lQ, tQ: r.bQ + r.lQ, cost: ck.cost,
              bSd: new Date(shipDate), lSd: new Date(shipDate), bAr: arrDate, lAr: arrDate,
              preShip: false, bPal: r.bPallets, lPal: r.lPallets });
            drawFrom(shipDate, r.bQ, r.lQ);
            d.bNeed -= r.bQ; d.lNeed -= r.lQ;
            remB -= r.bQ; remL -= r.lQ;
            const a2 = availAt(shipDate);
            remB = Math.min(a2.bS, Math.max(0, Math.max(d.bNeed, padBases)));
            remL = Math.min(a2.lS, Math.max(0, d.lNeed));
          }
        }
      }
    }
  }

  // ── PHASE 3 — Fast Boat bases (cost-checked against ACTUAL available qty) ──
  if (fb) {
    for (const d of demands) {
      if (d.bNeed < pal.basePP) continue;
      const bSD = addDays(d.bDeadline, -fb.transitDays);
      const a = availAt(bSD);
      const actualBasesAvail = Math.min(d.bNeed, a.bS);
      if (actualBasesAvail < pal.basePP) continue;
      const actualPals = Math.floor(actualBasesAvail / pal.basePP);
      const actualUnits = actualPals * pal.basePP;
      for (const ckKey of ["20HC", "40HC"]) {
        if (d.bNeed <= 0) break;
        const ck = cont[ckKey];
        if (actualPals > ck.pallets) continue;
        const airCostForQty = Math.ceil(actualUnits / abPP) * palletRate;
        if (ck.cost >= airCostForQty) continue; // Air is cheaper or equal
        const arrDate = addDays(bSD, fb.transitDays);
        res.push({ mo: d.mo, meth: "Fast Boat", cn: ck.label,
          bQ: actualUnits, lQ: 0, tQ: actualUnits, cost: ck.cost,
          bSd: new Date(bSD), lSd: new Date(bSD),
          bAr: arrDate, lAr: arrDate, preShip: false, bPal: actualPals, lPal: 0 });
        drawFrom(bSD, actualUnits, 0);
        d.bNeed -= actualUnits;
        break;
      }
      // Lid residuals NOT shipped via FB — fall through to Phase 4 Air.
    }
  }

  // ── PHASE 4 — Air (production-constrained, independent base/lid deadlines) ──
  if (ar) {
    for (const d of demands) {
      if (d.bNeed < 0) d.bNeed = 0;
      if (d.lNeed < 0) d.lNeed = 0;
      if (d.bNeed <= 0 && d.lNeed <= 0) continue;
      const bSD0 = addDays(d.bDeadline, -ar.transitDays);
      const lSD0 = addDays(d.lDeadline, -ar.transitDays);
      // FIXED: if strict deadline has no production, use earliest available date
      // so demand doesn't vanish silently (late delivery flagged in display).
      const bSD = availAt(bSD0).bS > 0 ? bSD0 : (earliestProdDate(bSD0) || bSD0);
      const lSD = availAt(lSD0).lS > 0 ? lSD0 : (earliestProdDate(lSD0) || lSD0);
      // Ship bases on base deadline (arrives baseLeadDays before month, or best effort)
      if (d.bNeed > 0) {
        const aB = availAt(bSD);
        let bShip = Math.max(0, Math.min(d.bNeed, aB.bS));
        if (bShip > 0 && aB.bS >= abPP) bShip = Math.min(Math.ceil(bShip / abPP) * abPP, aB.bS);
        if (bShip > 0) {
          res.push({ mo: d.mo, meth: "Air", cn: "Air", bQ: bShip, lQ: 0, tQ: bShip,
            cost: Math.ceil(bShip / abPP) * palletRate,
            bSd: new Date(bSD), lSd: new Date(bSD),
            bAr: addDays(bSD, ar.transitDays), lAr: addDays(bSD, ar.transitDays),
            bPal: Math.ceil(bShip / abPP), lPal: 0, preShip: false,
            lateDelivery: bSD > bSD0 }); // flag if best-effort late
          drawFrom(bSD, bShip, 0);
          d.bNeed -= bShip;
        }
      }
      // Ship lids on lid deadline (arrives lidLeadDays before month, or best effort)
      if (d.lNeed > 0) {
        const aL = availAt(lSD);
        let lShip = Math.max(0, Math.min(d.lNeed, aL.lS));
        if (lShip > 0 && aL.lS >= alPP) lShip = Math.min(Math.ceil(lShip / alPP) * alPP, aL.lS);
        if (lShip > 0) {
          res.push({ mo: d.mo, meth: "Air", cn: "Air", bQ: 0, lQ: lShip, tQ: lShip,
            cost: Math.ceil(lShip / alPP) * palletRate,
            bSd: new Date(lSD), lSd: new Date(lSD),
            bAr: addDays(lSD, ar.transitDays), lAr: addDays(lSD, ar.transitDays),
            bPal: 0, lPal: Math.ceil(lShip / alPP), preShip: false,
            lateDelivery: lSD > lSD0 }); // flag if best-effort late
          drawFrom(lSD, 0, lShip);
          d.lNeed -= lShip;
        }
      }
    }
  }

  // ── Sort and post-pass cleanup ──────────────────────────────────
  const moOrder = { "Standard Ocean": 0, "Fast Boat": 1, "Air": 2 };
  res.sort((a, b) => a.mo - b.mo || moOrder[a.meth] - moOrder[b.meth] || a.bSd - b.bSd);

  // Remove Air shipments made redundant by cumulative surplus
  {
    const toRemove = new Set();
    const moShipped = {};
    for (const s of res) {
      if (s.meth === "Air") continue;
      if (!moShipped[s.mo]) moShipped[s.mo] = { b: 0, l: 0 };
      moShipped[s.mo].b += s.bQ;
      moShipped[s.mo].l += s.lQ;
    }
    let carryB = 0, carryL = 0;
    const months = [...new Set(res.map(s => s.mo))].sort((a, b) => a - b);
    for (const m of months) {
      const shipped = moShipped[m] || { b: 0, l: 0 };
      const dem = gld[m] || 0;
      carryB += shipped.b;
      carryL += shipped.l;
      for (let i = 0; i < res.length; i++) {
        const s = res[i];
        if (s.mo !== m || s.meth !== "Air") continue;
        const hasB = s.bQ > 0, hasL = s.lQ > 0;
        const bCov = carryB >= dem;
        const lCov = carryL >= dem;
        if (hasB && hasL && bCov && lCov) { toRemove.add(i); }
        else if (hasB && !hasL && bCov)   { toRemove.add(i); }
        else if (hasL && !hasB && lCov)   { toRemove.add(i); }
        else {
          if (hasB) carryB += s.bQ;
          if (hasL) carryL += s.lQ;
        }
      }
      carryB = Math.max(0, carryB - dem);
      carryL = Math.max(0, carryL - dem);
    }
    const removeList = [...toRemove].sort((a, b) => b - a);
    for (const i of removeList) res.splice(i, 1);
  }

  res.sort((a, b) => a.mo - b.mo || moOrder[a.meth] - moOrder[b.meth] || a.bSd - b.bSd);
  return res;
}

export function calcWeeklyDemand(mkts) {
  const S = new Date(2026, 2, 9);  // Mar 9 local
  const weeks = [];
  for (let w = 0; w < 43; w++) {
    const wk = new Date(S); wk.setDate(wk.getDate() + w * 7);
    weeks.push({ wk, demand: 0 });
  }
  for (const mk of mkts) {
    if (mk.goLive == null) continue;
    if (mk.skuDetail && mk.skuDetail.weeks && mk.skuDetail.skus) {
      const det = mk.skuDetail;
      const goLiveMonth = mk.goLive;
      for (const sku of det.skus) {
        for (let wi = 0; wi < sku.weekly.length && wi < det.weeks.length; wi++) {
          if (sku.weekly[wi] <= 0) continue;
          const skuDate = parseLocalDate(det.weeks[wi]);
          if (skuDate.getMonth() + 1 < goLiveMonth) continue;
          for (let pwi = 0; pwi < weeks.length; pwi++) {
            if (Math.abs(weeks[pwi].wk - skuDate) < 4 * 86400000) { weeks[pwi].demand += sku.weekly[wi]; break; }
          }
        }
      }
    } else {
      for (let mo = 0; mo < 12; mo++) {
        if (mo + 1 < mk.goLive) continue;
        const mDem = mk.demand[mo] || 0;
        if (mDem <= 0) continue;
        const mWeeks = weeks.filter(w => w.wk.getMonth() === mo);
        if (mWeeks.length > 0) mWeeks.forEach(w => { w.demand += mDem / mWeeks.length; });
      }
    }
  }
  return weeks;
}
