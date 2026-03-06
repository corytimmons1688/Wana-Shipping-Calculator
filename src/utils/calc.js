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

export function optimize(mkts, molds, ship, par, cont, pal, airCost) {
  const gld = calcGLD(mkts), prod = calcProd(molds), res = [];

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

  function committedBy(date) {
    let bC = 0, lC = 0;
    for (const s of res) { if (s.bSd <= date) { bC += s.bQ; lC += s.lQ; } }
    return { bC, lC };
  }

  function availAt(date) {
    const p = prodAt(prod, date), c = committedBy(date);
    return { bS: Math.max(0, p.bC - c.bC), lS: Math.max(0, p.lC - c.lC) };
  }

  function fillAt(method, d, shipDate, transitDays, bMax, lMax, preShip, stopWhenLidsDone, minPalOverride) {
    const a = availAt(shipDate);
    let remB = Math.min(a.bS, Math.max(0, bMax));
    let remL = Math.min(a.lS, Math.max(0, lMax));
    const arrDate = addDays(shipDate, transitDays);
    for (const ckKey of ["40HC", "20HC"]) {
      const ck = cont[ckKey];
      const maxPal = ck.pallets;
      const minPal = minPalOverride != null ? minPalOverride : (ck.minPal || (maxPal <= 10 ? 8 : 16));
      const cost = method === "Standard Ocean" ? 0 : ck.cost;
      while (remB + remL > 0) {
        if (stopWhenLidsDone && d.lNeed <= 0) break;
        const r = packOne(remB, remL, maxPal, minPal, pal.basePP, pal.lidPP);
        if (!r) break;
        res.push({ mo: d.mo, meth: method, cn: ck.label,
          bQ: r.bQ, lQ: r.lQ, tQ: r.bQ + r.lQ, cost,
          bSd: new Date(shipDate), lSd: new Date(shipDate), bAr: arrDate, lAr: arrDate,
          preShip: !!preShip, bPal: r.bPallets, lPal: r.lPallets });
        d.bNeed -= r.bQ; d.lNeed -= r.lQ;
        remB -= r.bQ; remL -= r.lQ;
        const a2 = availAt(shipDate);
        remB = Math.min(a2.bS, remB);
        remL = Math.min(a2.lS, remL);
      }
    }
  }

  const minContPal = Math.min(...Object.values(cont).map(c => c.minPal || (c.pallets <= 10 ? 8 : 16)));
  const padBases = minContPal * pal.basePP;

  // PHASE 1 — Ocean
  if (oc) {
    for (const d of demands) {
      const ocBD = addDays(d.bDeadline, -oc.transitDays);
      const validWeeks = prod.filter(pw => pw.wk <= ocBD);
      for (let i = validWeeks.length - 1; i >= 0 && (d.bNeed > 0 || d.lNeed > 0); i--) {
        fillAt("Standard Ocean", d, validWeeks[i].wk, oc.transitDays, d.bNeed, d.lNeed, false, false, null);
      }
    }
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

    // PHASE 1.5 — Consolidate sub-pallet lid residuals into Ocean pre-shipment.
    // After Phase 1, Ocean container rounding leaves small lid residuals (<1 pallet)
    // per month. These accumulate (e.g. Sep 16K + Oct 9K + Nov 5K + Dec 28K = 59K)
    // and the last month's residual falls to expensive Air. Fix: sum all sub-pallet
    // lid residuals where ocean is feasible, round up to full pallets, and pre-ship
    // via free Ocean container with base padding.
    {
      const subPalletDemands = demands.filter(d => d.lNeed > 0 && d.lNeed < pal.lidPP);
      if (subPalletDemands.length > 0) {
        // Find earliest sub-pallet month where Ocean is actually feasible (production exists)
        let feasibleDemands = [];
        let shipByDate = null;
        for (const d of subPalletDemands) {
          const ocLD = addDays(d.lDeadline, -oc.transitDays);
          const hasProduction = prod.some(pw => pw.wk <= ocLD);
          if (hasProduction) {
            feasibleDemands.push(d);
            if (!shipByDate || ocLD < shipByDate) shipByDate = ocLD;
          }
        }
        const totalLidResidual = feasibleDemands.reduce((a, d) => a + d.lNeed, 0);
        if (totalLidResidual > 0 && shipByDate) {
          const lidPals = Math.ceil(totalLidResidual / pal.lidPP);
          const lidQty = lidPals * pal.lidPP;
          // Try to find a production week with available lids
          const validWeeks = prod.filter(pw => pw.wk <= shipByDate);
          let shipped = false;
          for (let i = validWeeks.length - 1; i >= 0 && !shipped; i--) {
            const shipDate = validWeeks[i].wk;
            const a = availAt(shipDate);
            if (a.lS < lidQty) continue;
            // Find a container that fits lid pallets + base padding
            for (const ckKey of ["20HC", "40HC"]) {
              const ck = cont[ckKey];
              const maxPal = ck.pallets;
              const minPal = ck.minPal || (maxPal <= 10 ? 8 : 16);
              if (lidPals > maxPal) continue;
              const basePals = Math.min(maxPal - lidPals, Math.floor(a.bS / pal.basePP));
              if (basePals + lidPals < minPal) continue;
              const bQ = basePals * pal.basePP;
              const arrDate = addDays(shipDate, oc.transitDays);
              res.push({ mo: feasibleDemands[0].mo, meth: "Standard Ocean", cn: ck.label,
                bQ, lQ: lidQty, tQ: bQ + lidQty, cost: 0,
                bSd: new Date(shipDate), lSd: new Date(shipDate),
                bAr: arrDate, lAr: arrDate, preShip: true, bPal: basePals, lPal: lidPals });
              // Credit lid residuals across all feasible months
              let rem = lidQty;
              for (const sd of feasibleDemands) {
                const credit = Math.min(rem, sd.lNeed);
                sd.lNeed -= credit; rem -= credit;
                if (rem <= 0) break;
              }
              feasibleDemands[0].bNeed = Math.max(0, feasibleDemands[0].bNeed - bQ);
              shipped = true;
              break;
            }
          }
        }
      }
    }
  }

  // PHASE 2 — Fast Boat lid shipments (scan multiple production weeks)
  // FIX: Instead of checking a single ship-by date, iterate backwards through
  // production weeks. The lid production ramp (168K/wk from May 25) creates
  // large available pools at specific weeks that a single-date check misses.
  if (fb) {
    for (const d of demands) {
      if (d.lNeed <= 0 || d.lNeed < pal.lidPP) continue;
      const lSD = addDays(d.lDeadline, -fb.transitDays);
      // Get all production weeks that can ship FB and arrive on time
      const fbWeeks = prod.filter(pw => pw.wk <= lSD);
      // Try each week from latest to earliest, looking for available lids
      for (let wi = fbWeeks.length - 1; wi >= 0 && d.lNeed >= pal.lidPP; wi--) {
        const shipDate = fbWeeks[wi].wk;
        const a = availAt(shipDate);
        if (a.lS < pal.lidPP) continue; // need at least 1 pallet of lids
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
            // Only ship via FB if cheaper than equivalent Air cost for this container
            const airEquiv = (r.lQ * airCost.lid) + (r.bQ * airCost.base);
            if (ck.cost >= airEquiv) break;
            const arrDate = addDays(shipDate, fb.transitDays);
            res.push({ mo: d.mo, meth: "Fast Boat", cn: ck.label,
              bQ: r.bQ, lQ: r.lQ, tQ: r.bQ + r.lQ, cost: ck.cost,
              bSd: new Date(shipDate), lSd: new Date(shipDate), bAr: arrDate, lAr: arrDate,
              preShip: false, bPal: r.bPallets, lPal: r.lPallets });
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

  // PHASE 3 — Fast Boat base residuals (only when cheaper than Air per unit)
  if (fb) {
    for (const d of demands) {
      const bSD = addDays(d.bDeadline, -fb.transitDays);

      if (d.bNeed >= pal.basePP) {
        const shipDate = bSD;
        const a = availAt(shipDate);
        const actualBasesAvail = Math.min(d.bNeed, a.bS);
        if (actualBasesAvail < pal.basePP) continue; // not enough for even 1 pallet
        const actualPals = Math.floor(actualBasesAvail / pal.basePP);
        const actualUnits = actualPals * pal.basePP;
        // Try smallest container first — check cost against ACTUAL shippable quantity
        for (const ckKey of ["20HC", "40HC"]) {
          if (d.bNeed <= 0) break;
          const ck = cont[ckKey];
          if (actualPals > ck.pallets) continue; // doesn't fit
          const fbPerUnit = ck.cost / actualUnits;
          // Only ship if FB is genuinely cheaper than Air per unit
          if (fbPerUnit >= airCost.base) continue;
          const arrDate = addDays(shipDate, fb.transitDays);
          res.push({ mo: d.mo, meth: "Fast Boat", cn: ck.label,
            bQ: actualUnits, lQ: 0, tQ: actualUnits, cost: ck.cost,
            bSd: new Date(shipDate), lSd: new Date(shipDate),
            bAr: arrDate, lAr: arrDate, preShip: false, bPal: actualPals, lPal: 0 });
          d.bNeed -= actualUnits;
          break; // shipped, don't try larger container
        }
      }

      // Lid residuals NOT shipped via FB here — if Phase 2 rejected them
      // (Air is cheaper), they correctly fall through to Phase 4 Air.
    }
  }

  // PHASE 4 — Air: last resort, but ONLY ship what's actually produced
  if (ar) {
    const abPP = pal.airBasePP || 7500, alPP = pal.airLidPP || 25000;
    for (const d of demands) {
      if (d.bNeed <= 0 && d.lNeed <= 0) continue;
      const bSD = addDays(d.bDeadline, -ar.transitDays);
      const lSD = addDays(d.lDeadline, -ar.transitDays);
      // Use the LATER date so both bases and lids exist when shipped
      const shipDate = bSD > lSD ? bSD : lSD;
      const a = availAt(shipDate);
      // Ship what's available, capped to what's needed — no phantom units
      let bShip = Math.min(d.bNeed, a.bS);
      let lShip = Math.min(d.lNeed, a.lS);
      // Round UP to air pallets only if production supports it, otherwise ship exact available
      if (bShip > 0 && bShip < abPP && a.bS >= abPP) bShip = abPP;
      else if (bShip >= abPP) bShip = Math.min(Math.ceil(bShip / abPP) * abPP, a.bS);
      if (lShip > 0 && lShip < alPP && a.lS >= alPP) lShip = alPP;
      else if (lShip >= alPP) lShip = Math.min(Math.ceil(lShip / alPP) * alPP, a.lS);
      if (bShip + lShip > 0) {
        res.push({ mo: d.mo, meth: "Air", cn: "Air", bQ: bShip, lQ: lShip, tQ: bShip + lShip,
          cost: bShip * airCost.base + lShip * airCost.lid,
          bSd: new Date(shipDate), lSd: new Date(shipDate), bAr: addDays(shipDate, ar.transitDays), lAr: addDays(shipDate, ar.transitDays),
          bPal: bShip > 0 ? Math.ceil(bShip / abPP) : 0, lPal: lShip > 0 ? Math.ceil(lShip / alPP) : 0, preShip: false });
        d.bNeed -= bShip; d.lNeed -= lShip;
      }
    }
  }

  const moOrder = { "Standard Ocean": 0, "Fast Boat": 1, "Air": 2 };
  res.sort((a, b) => a.mo - b.mo || moOrder[a.meth] - moOrder[b.meth] || a.bSd - b.bSd);

  // POST-PASS: Remove Air shipments made unnecessary by cumulative surplus.
  // FIX: Track per-month shipped vs needed rather than cumulative totals.
  // Cumulative comparison was masking genuine per-month shortfalls and
  // failing to remove redundant Air when earlier months had small Air residuals.
  {
    const toRemove = new Set();
    // Build per-month non-Air totals first
    const moShipped = {}; // mo -> { b, l }
    for (const s of res) {
      if (s.meth === "Air") continue;
      if (!moShipped[s.mo]) moShipped[s.mo] = { b: 0, l: 0 };
      moShipped[s.mo].b += s.bQ;
      moShipped[s.mo].l += s.lQ;
    }
    // Accumulate carry-over: surplus from earlier months can cover later months
    let carryB = 0, carryL = 0;
    const months = [...new Set(res.map(s => s.mo))].sort((a, b) => a - b);
    for (const m of months) {
      const shipped = moShipped[m] || { b: 0, l: 0 };
      const dem = gld[m] || 0;
      // Carry-over from previous months plus this month's non-Air shipments
      carryB += shipped.b;
      carryL += shipped.l;
      for (let i = 0; i < res.length; i++) {
        const s = res[i];
        if (s.mo !== m || s.meth !== "Air") continue;
        const hasB = s.bQ > 0, hasL = s.lQ > 0;
        // Air is redundant if carry-over already covers this month's demand
        const bCov = carryB >= dem;
        const lCov = carryL >= dem;
        if (hasB && hasL && bCov && lCov) { toRemove.add(i); }
        else if (hasB && !hasL && bCov)   { toRemove.add(i); }
        else if (hasL && !hasB && lCov)   { toRemove.add(i); }
        else {
          // Genuinely needed — count it and reduce carry-over accordingly
          if (hasB) carryB += s.bQ;
          if (hasL) carryL += s.lQ;
        }
      }
      // Carry forward surplus over demand into next month
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
      const goLiveMonth = mk.goLive; // 1-indexed: 1=Jan, 4=Apr, etc.
      for (const sku of det.skus) {
        for (let wi = 0; wi < sku.weekly.length && wi < det.weeks.length; wi++) {
          if (sku.weekly[wi] <= 0) continue;
          const skuDate = new Date(det.weeks[wi]);
          // Skip SKU weeks that fall before the market's go-live month
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
