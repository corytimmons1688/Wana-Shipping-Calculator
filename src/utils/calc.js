export function calcGLD(mkts) {
  const r = new Array(12).fill(0);
  for (let m = 0; m < 12; m++)
    for (let i = 0; i < mkts.length; i++)
      if (mkts[i].goLive != null && mkts[i].goLive <= m + 1) r[m] += mkts[i].demand[m];
  return r;
}

export function calcProd(molds) {
  const S = new Date("2026-03-09"), wks = [];
  let bC = 0, lC = 0, bPU = 0, lPU = 0, bP2U = 0, lP2U = 0;
  const bPD = new Date(molds.base.proto.avail), bMD = new Date(molds.base.prod.avail);
  const bP2 = molds.base.proto2 || null;
  const bP2D = bP2 ? new Date(bP2.avail) : null;
  const lPD = new Date(molds.lid.proto.avail), lMD = new Date(molds.lid.prod.avail);
  const lP2 = molds.lid.proto2 || null;
  const lP2D = lP2 ? new Date(lP2.avail) : null;
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
// SHIPPING OPTIMIZER — Production-Forward Architecture
//
// Priorities:
//   P1: Product on hand at Calyx to support demand (coverage first)
//   P2: Minimize shipping cost (Ocean > Fast Boat > Air)
//   P3: Build inventory at Calyx; don't store at factory unless
//       holding for a full Ocean container
//
// Phase 1A: Fast Boat / Air for months Ocean physically cannot reach
//           (production doesn't exist by Ocean ship-by deadline).
//           Runs FIRST to claim production before Ocean does.
//
// Phase 1B: Pre-reserve Fast Boat for months where Ocean can serve
//           but can't fully cover demand. Draws from the FB-only
//           window (between Ocean deadline and FB deadline) via
//           drawNewest(), so it doesn't cannibalize production
//           that Ocean needs for its earlier ship-by date.
//
// Phase 2:  Production-forward Ocean — walk forward week by week,
//           ship a full container the moment inventory fills one.
//           Never holds units at the factory.
//
// Phase 3:  Fast Boat mop-up for any remaining gaps.
// Phase 4:  Air — last resort, production-constrained only.
// ============================================================

export function optimize(mkts, molds, ship, par, cont, pal, airCost) {
  const gld = calcGLD(mkts), prod = calcProd(molds), res = [];


  // ── Resolve shipping method configs ───────────────────────────
  let oc = null, fb = null, ar = null;
  for (const s of ship) {
    if (s.method === "Standard Ocean") oc = s;
    if (s.method === "Fast Boat") fb = s;
    if (s.method === "Air") ar = s;
  }

  // ── Demand events (go-live filtered, monthly) ─────────────────
  const demands = [];
  for (let m = 0; m < 12; m++) {
    if (gld[m] <= 0) continue;
    const ms = new Date(2026, m, 1);
    demands.push({
      mo: m, dem: gld[m], remaining: gld[m],
      bDL: addDays(ms, -par.baseLeadDays),
      lDL: addDays(ms, -par.lidLeadDays),
    });
  }

  // ── Bucket-based inventory ────────────────────────────────────
  // Each production week is a discrete pool. drawFrom() physically
  // removes units so they can't be double-counted across phases.
  const buckets = prod.filter(p => p.bW > 0 || p.lW > 0)
                      .map(p => ({ wk: p.wk, bR: p.bW, lR: p.lW }));

  function availAt(date) {
    let bS = 0, lS = 0;
    for (const bk of buckets) { if (bk.wk <= date) { bS += bk.bR; lS += bk.lR; } }
    return { bS, lS };
  }

  function drawFrom(date, bQty, lQty) {
    let bL = bQty, lL = lQty;
    for (const bk of buckets) {
      if (bk.wk > date) continue;
      if (bL > 0 && bk.bR > 0) { const t = Math.min(bL, bk.bR); bk.bR -= t; bL -= t; }
      if (lL > 0 && bk.lR > 0) { const t = Math.min(lL, bk.lR); bk.lR -= t; lL -= t; }
    }
  }

  // drawNewest: draws from buckets within (fromDate, toDate] newest-first,
  // then falls back to oldest-first from before fromDate if still needed.
  // Used in Phase 1B so FB reservations don't consume Ocean's early production.
  function drawNewest(fromDate, toDate, bQty, lQty) {
    const inWindow = buckets
      .filter(b => b.wk > fromDate && b.wk <= toDate)
      .sort((a, b) => b.wk - a.wk);
    let bL = bQty, lL = lQty;
    for (const bk of inWindow) {
      if (bL > 0 && bk.bR > 0) { const t = Math.min(bL, bk.bR); bk.bR -= t; bL -= t; }
      if (lL > 0 && bk.lR > 0) { const t = Math.min(lL, bk.lR); bk.lR -= t; lL -= t; }
    }
    // Fall back to oldest-first from before fromDate
    if (bL > 0 || lL > 0) drawFrom(fromDate, bL, lL);
  }

  // ── Container packer ──────────────────────────────────────────
  function packCont(bAv, lAv, contKey) {
    const ck = cont[contKey];
    if (!ck) return null;
    const maxP = ck.pallets, minP = ck.minPal || (maxP <= 10 ? 8 : 16);
    for (let lp = Math.min(maxP, Math.floor(lAv / pal.lidPP)); lp >= 0; lp--) {
      const bp = Math.min(maxP - lp, Math.floor(bAv / pal.basePP));
      if (lp + bp >= minP) return { bQ: bp * pal.basePP, lQ: lp * pal.lidPP, bPal: bp, lPal: lp };
    }
    return null;
  }

  // Can Ocean physically reach demand month d?
  // True if cumulative production >= one minimum container by Ocean ship-by date.
  const MIN_PKG = (cont["20HC"] ? cont["20HC"].minPal || 8 : 8) * pal.basePP;
  function oceanCanServe(d) {
    if (!oc) return false;
    const shipBy = addDays(d.bDL, -oc.transitDays);
    return prod.some(w => w.wk <= shipBy && w.bC >= MIN_PKG);
  }

  // Simulate max Ocean delivery to month d given current bucket state.
  // Read-only — clones relevant buckets.
  function maxOceanDelivery(d) {
    if (!oc) return 0;
    const oceanBy = addDays(d.bDL, -oc.transitDays);
    const sim = buckets.filter(b => b.wk <= oceanBy).map(b => ({ bR: b.bR, lR: b.lR }));
    let total = 0;
    for (const ckKey of ["40HC", "20HC"]) {
      const ck = cont[ckKey]; if (!ck) continue;
      const maxP = ck.pallets, minP = ck.minPal || (maxP <= 10 ? 8 : 16);
      while (true) {
        let bS = 0, lS = 0; for (const b of sim) { bS += b.bR; lS += b.lR; }
        let found = false;
        for (let lp = Math.min(maxP, Math.floor(lS / pal.lidPP)); lp >= 0; lp--) {
          const bp = Math.min(maxP - lp, Math.floor(bS / pal.basePP));
          if (lp + bp >= minP) {
            const bQ = bp * pal.basePP, lQ = lp * pal.lidPP;
            let bL = bQ, lL = lQ;
            for (const b of sim) {
              if (bL > 0 && b.bR > 0) { const t = Math.min(bL, b.bR); b.bR -= t; bL -= t; }
              if (lL > 0 && b.lR > 0) { const t = Math.min(lL, b.lR); b.lR -= t; lL -= t; }
            }
            total += bQ + lQ; found = true; break;
          }
        }
        if (!found) break;
      }
    }
    return total;
  }

  // ── PHASE 1A: Fast Boat / Air for months Ocean can't reach ────
  for (const d of demands) {
    if (oceanCanServe(d)) continue;

    // Fast Boat
    if (fb) {
      const fbBy = addDays(d.bDL, -fb.transitDays);
      for (const ckKey of ["40HC", "20HC"]) {
        const ck = cont[ckKey]; if (!ck) continue;
        while (d.remaining > 0) {
          const { bS, lS } = availAt(fbBy);
          const r = packCont(Math.min(bS, d.remaining), Math.min(lS, d.remaining), ckKey);
          if (!r) break;
          const airEq = r.bQ * airCost.base + r.lQ * airCost.lid;
          if (ck.cost >= airEq) break;
          drawFrom(fbBy, r.bQ, r.lQ);
          const qty = r.bQ + r.lQ;
          d.remaining -= Math.min(qty, d.remaining);
          res.push({ mo: d.mo, meth: "Fast Boat", cn: ck.label, bQ: r.bQ, lQ: r.lQ,
            tQ: qty, cost: ck.cost,
            bSd: new Date(fbBy), lSd: new Date(fbBy),
            bAr: addDays(fbBy, fb.transitDays), lAr: addDays(fbBy, fb.transitDays),
            bPal: r.bPal, lPal: r.lPal });
        }
      }
    }

    // Air for whatever Fast Boat couldn't cover
    if (d.remaining > 0 && ar) {
      const airBy = addDays(d.bDL, -ar.transitDays);
      const { bS, lS } = availAt(airBy);
      const bShip = Math.min(d.remaining, bS);
      const lShip = Math.min(Math.max(0, d.remaining - bShip), lS);
      const qty = bShip + lShip;
      if (qty > 0) {
        drawFrom(airBy, bShip, lShip);
        d.remaining -= qty;
        res.push({ mo: d.mo, meth: "Air", cn: "Air", bQ: bShip, lQ: lShip,
          tQ: qty, cost: bShip * airCost.base + lShip * airCost.lid,
          bSd: new Date(airBy), lSd: new Date(airBy),
          bAr: addDays(airBy, ar.transitDays), lAr: addDays(airBy, ar.transitDays),
          bPal: 0, lPal: 0 });
      }
    }
  }

  // ── PHASE 1B: Pre-reserve Fast Boat for Ocean shortfalls ──────
  // For each Ocean-eligible month, simulate how much Ocean can deliver.
  // If demand exceeds that, reserve the shortfall via Fast Boat now —
  // drawing from the FB-only window (between Ocean ship-by and FB ship-by)
  // newest-first, so we don't consume production that Ocean needs.
  if (fb && oc) {
    for (const d of demands) {
      if (!oceanCanServe(d) || d.remaining <= 0) continue;

      const maxOcean  = maxOceanDelivery(d);
      const shortfall = Math.max(0, d.remaining - maxOcean);
      if (shortfall <= 0) continue;

      const oceanBy = addDays(d.bDL, -oc.transitDays);
      const fbBy    = addDays(d.bDL, -fb.transitDays);
      let reserved  = 0;

      for (const ckKey of ["40HC", "20HC"]) {
        const ck = cont[ckKey]; if (!ck) continue;
        while (reserved < shortfall) {
          const { bS, lS } = availAt(fbBy);
          const need = shortfall - reserved;
          const r = packCont(Math.min(bS, need), Math.min(lS, need), ckKey);
          if (!r) break;
          const airEq = r.bQ * airCost.base + r.lQ * airCost.lid;
          if (ck.cost >= airEq) break;
          // Draw newest-first from FB-only window to preserve Ocean's buckets
          drawNewest(oceanBy, fbBy, r.bQ, r.lQ);
          const qty = r.bQ + r.lQ;
          reserved += qty;
          d.remaining -= Math.min(qty, d.remaining);
          res.push({ mo: d.mo, meth: "Fast Boat", cn: ck.label, bQ: r.bQ, lQ: r.lQ,
            tQ: qty, cost: ck.cost,
            bSd: new Date(fbBy), lSd: new Date(fbBy),
            bAr: addDays(fbBy, fb.transitDays), lAr: addDays(fbBy, fb.transitDays),
            bPal: r.bPal, lPal: r.lPal });
        }
      }

      // Air for anything FB couldn't cover in this pre-reserve pass
      if (reserved < shortfall && ar) {
        const airBy = addDays(d.bDL, -ar.transitDays);
        const { bS, lS } = availAt(airBy);
        const need = shortfall - reserved;
        const bShip = Math.min(need, bS);
        const lShip = Math.min(Math.max(0, need - bShip), lS);
        const qty = bShip + lShip;
        if (qty > 0) {
          drawFrom(airBy, bShip, lShip);
          d.remaining -= Math.min(qty, d.remaining);
          res.push({ mo: d.mo, meth: "Air", cn: "Air", bQ: bShip, lQ: lShip,
            tQ: qty, cost: bShip * airCost.base + lShip * airCost.lid,
            bSd: new Date(airBy), lSd: new Date(airBy),
            bAr: addDays(airBy, ar.transitDays), lAr: addDays(airBy, ar.transitDays),
            bPal: 0, lPal: 0 });
        }
      }
    }
  }

  // ── PHASE 2: Production-Forward Ocean ─────────────────────────
  // Walk forward week by week. The moment buckets contain enough for
  // a full container AND there's remaining demand the arrival can serve,
  // ship immediately. Never hold a full container's worth at the factory.
  if (oc) {
    for (const wk of prod) {
      if (wk.bW === 0 && wk.lW === 0) continue;
      const totalRem = demands.reduce((s, d) => s + d.remaining, 0);
      if (totalRem <= 0) break;

      const shipDate = wk.wk;
      const arrDate  = addDays(shipDate, oc.transitDays);

      // Skip if no demand month can benefit from this arrival
      const futRem = demands.filter(d => d.bDL >= arrDate && d.remaining > 0)
                            .reduce((s, d) => s + d.remaining, 0);
      if (futRem <= 0) continue;

      for (const ckKey of ["40HC", "20HC"]) {
        const ck = cont[ckKey]; if (!ck) continue;
        while (true) {
          const totalR = demands.reduce((s, d) => s + d.remaining, 0);
          if (totalR <= 0) break;
          const { bS, lS } = availAt(shipDate);
          const r = packCont(Math.min(bS, totalR), Math.min(lS, totalR), ckKey);
          if (!r) break;
          const futR2 = demands.filter(d => d.bDL >= arrDate && d.remaining > 0)
                               .reduce((s, d) => s + d.remaining, 0);
          if (futR2 <= 0) break;

          drawFrom(shipDate, r.bQ, r.lQ);

          // Allocate to earliest eligible demand months (for tracking remaining)
          let toAlloc = r.bQ + r.lQ;
          for (const d of demands) {
            if (toAlloc <= 0) break;
            if (d.remaining <= 0 || d.bDL < arrDate) continue;
            const a = Math.min(d.remaining, toAlloc);
            d.remaining -= a; toAlloc -= a;
          }

          res.push({ mo: demands.find(d => d.bDL >= arrDate)?.mo ?? 0,
            meth: "Standard Ocean", cn: ck.label,
            bQ: r.bQ, lQ: r.lQ, tQ: r.bQ + r.lQ, cost: 0,
            bSd: new Date(shipDate), lSd: new Date(shipDate),
            bAr: new Date(arrDate), lAr: new Date(arrDate),
            bPal: r.bPal, lPal: r.lPal });
        }
      }
    }
  }

  // ── PHASE 3: Fast Boat mop-up ─────────────────────────────────
  if (fb) {
    for (const d of demands) {
      if (d.remaining <= 0) continue;
      const fbBy = addDays(d.bDL, -fb.transitDays);
      for (const ckKey of ["40HC", "20HC"]) {
        const ck = cont[ckKey]; if (!ck) continue;
        while (d.remaining > 0) {
          const { bS, lS } = availAt(fbBy);
          const r = packCont(Math.min(bS, d.remaining), Math.min(lS, d.remaining), ckKey);
          if (!r) break;
          const airEq = r.bQ * airCost.base + r.lQ * airCost.lid;
          if (ck.cost >= airEq) break;
          drawFrom(fbBy, r.bQ, r.lQ);
          const qty = r.bQ + r.lQ;
          d.remaining -= Math.min(qty, d.remaining);
          res.push({ mo: d.mo, meth: "Fast Boat", cn: ck.label, bQ: r.bQ, lQ: r.lQ,
            tQ: qty, cost: ck.cost,
            bSd: new Date(fbBy), lSd: new Date(fbBy),
            bAr: addDays(fbBy, fb.transitDays), lAr: addDays(fbBy, fb.transitDays),
            bPal: r.bPal, lPal: r.lPal });
        }
      }
    }
  }

  // ── PHASE 4: Air — last resort ────────────────────────────────
  if (ar) {
    for (const d of demands) {
      if (d.remaining <= 0) continue;
      const airBy = addDays(d.bDL, -ar.transitDays);
      const { bS, lS } = availAt(airBy);
      const bShip = Math.min(d.remaining, bS);
      const lShip = Math.min(Math.max(0, d.remaining - bShip), lS);
      const qty = bShip + lShip;
      if (qty <= 0) continue;
      drawFrom(airBy, bShip, lShip);
      d.remaining -= qty;
      res.push({ mo: d.mo, meth: "Air", cn: "Air", bQ: bShip, lQ: lShip,
        tQ: qty, cost: bShip * airCost.base + lShip * airCost.lid,
        bSd: new Date(airBy), lSd: new Date(airBy),
        bAr: addDays(airBy, ar.transitDays), lAr: addDays(airBy, ar.transitDays),
        bPal: 0, lPal: 0 });
    }
  }

  res.sort((a, b) => a.bSd - b.bSd);
  return res;
}

export function calcWeeklyDemand(mkts) {
  const S = new Date("2026-03-09");
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
          const skuDate = new Date(det.weeks[wi]);
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
