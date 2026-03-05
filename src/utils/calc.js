export function calcGLD(mkts) {
  const r = new Array(12).fill(0);
  for (let m = 0; m < 12; m++)
    for (let i = 0; i < mkts.length; i++)
      if (mkts[i].goLive != null && mkts[i].goLive <= m + 1) r[m] += mkts[i].demand[m];
  return r;
}

export function calcProd(molds) {
  const S = new Date("2026-03-09"), wks = [];
  let bC = 0, lC = 0, bPU = 0, lPU = 0;
  const bPD = new Date(molds.base.proto.avail), bMD = new Date(molds.base.prod.avail);
  const lPD = new Date(molds.lid.proto.avail), lMD = new Date(molds.lid.prod.avail);
  for (let w = 0; w < 43; w++) {
    const wk = new Date(S); wk.setDate(wk.getDate() + w * 7);
    let bW = 0, lW = 0;
    if (wk >= bPD && (molds.base.proto.life == null || bPU < molds.base.proto.life)) {
      const o = molds.base.proto.daily * molds.base.proto.qty * molds.base.proto.days;
      const c = molds.base.proto.life ? Math.min(o, molds.base.proto.life - bPU) : o;
      bW += c; bPU += c;
    }
    if (wk >= bMD) bW += molds.base.prod.daily * molds.base.prod.qty * molds.base.prod.days;
    if (wk >= lPD && (molds.lid.proto.life == null || lPU < molds.lid.proto.life)) {
      const o2 = molds.lid.proto.daily * molds.lid.proto.qty * molds.lid.proto.days;
      const c2 = molds.lid.proto.life ? Math.min(o2, molds.lid.proto.life - lPU) : o2;
      lW += c2; lPU += c2;
    }
    if (wk >= lMD) lW += molds.lid.prod.daily * molds.lid.prod.qty * molds.lid.prod.days;
    bC += bW; lC += lW;
    wks.push({ wk, bW, lW, bC, lC, ship: Math.min(bC, lC), tot: bW + lW,
      sur: Math.abs(bC - lC), surT: bC > lC ? "base" : bC < lC ? "lid" : null });
  }
  return wks;
}

export function calcCap(molds, pm, eq) {
  const bCost = (molds.base.proto.qty * molds.base.proto.cost) + (molds.base.prod.qty * molds.base.prod.cost);
  const lCost = (molds.lid.proto.qty * molds.lid.proto.cost) + (molds.lid.prod.qty * molds.lid.prod.cost);
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

// Try to pack one container. Prioritizes lids (bottleneck), fills remaining with bases.
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

  // committedBy(date): total units in shipments departing ON OR BEFORE date.
  // This scopes availability accurately — future commitments don't reduce current surplus.
  function committedBy(date) {
    let bC = 0, lC = 0;
    for (const s of res) { if (s.bSd <= date) { bC += s.bQ; lC += s.lQ; } }
    return { bC, lC };
  }

  function availAt(date) {
    const p = prodAt(prod, date), c = committedBy(date);
    return { bS: Math.max(0, p.bC - c.bC), lS: Math.max(0, p.lC - c.lC) };
  }

  // Add containers at shipDate up to bMax/lMax. Returns {bShipped, lShipped}.
  // stopWhenLidsDone: after lids satisfied, don't add base-only containers (Phase 2).
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
        // Refresh availability after each container (committedBy now includes this ship)
        const a2 = availAt(shipDate);
        remB = Math.min(a2.bS, Math.max(0, bMax - (bMax - remB)));
        remL = Math.min(a2.lS, Math.max(0, lMax - (lMax - remL)));
      }
    }
  }

  const minContPal = Math.min(...Object.values(cont).map(c => c.minPal || (c.pallets <= 10 ? 8 : 16)));
  const padBases = minContPal * pal.basePP; // base padding to unlock lid containers

  // ════════════════════════════════════════════════════════════════════════════
  // PHASE 1 — Ocean: backward week scan, lid deadline cutoff.
  //
  // Use LID deadline for Ocean cutoff (more conservative) so containers arriving
  // on time for lids also arrive on time for bases.
  //
  // Scan production weeks BACKWARD (latest first): each month picks production
  // closest to its deadline, leaving early production for earlier months.
  //
  // committedBy scoping ensures each ship sees accurate surplus without
  // future-month commitments polluting the available count.
  // ════════════════════════════════════════════════════════════════════════════
  if (oc) {
    for (const d of demands) {
      const ocD = addDays(d.lDeadline, -oc.transitDays);
      const validWeeks = prod.filter(pw => pw.wk <= ocD);
      for (let i = validWeeks.length - 1; i >= 0 && (d.bNeed > 0 || d.lNeed > 0); i--) {
        fillAt("Standard Ocean", d, validWeeks[i].wk, oc.transitDays, d.bNeed, d.lNeed, false, false, null);
      }
    }
  }

  // ════════════════════════════════════════════════════════════════════════════
  // PHASE 2 — Fast Boat lid shipments.
  //
  // For months where lid production was unavailable at Ocean deadline,
  // ship lids via FB at the lid deadline. Allow base padding (up to padBases)
  // so lid containers can meet minimum pallet requirements.
  //
  // Only ship if lids are included (don't ship base-only here).
  // Refresh availAt after each container to accurately track surplus.
  // ════════════════════════════════════════════════════════════════════════════
  if (fb) {
    for (const d of demands) {
      if (d.lNeed <= 0) continue;
      const lSD = addDays(d.lDeadline, -fb.transitDays);

      if (d.lNeed >= pal.lidPP) {
        // Has ≥1 lid pallet. Allow base padding to unlock containers.
        const bMaxFB = Math.max(d.bNeed, padBases);
        const a = availAt(lSD);
        let remB = Math.min(a.bS, bMaxFB);
        let remL = Math.min(a.lS, d.lNeed);
        for (const ckKey of ["40HC", "20HC"]) {
          const ck = cont[ckKey];
          const maxPal = ck.pallets;
          const minPal = ck.minPal || (maxPal <= 10 ? 8 : 16);
          while (d.lNeed > 0 && remL > 0) {
            const r = packOne(remB, remL, maxPal, minPal, pal.basePP, pal.lidPP);
            if (!r || r.lQ === 0) break; // only ship if lids are included
            const arrDate = addDays(lSD, fb.transitDays);
            res.push({ mo: d.mo, meth: "Fast Boat", cn: ck.label,
              bQ: r.bQ, lQ: r.lQ, tQ: r.bQ + r.lQ, cost: ck.cost,
              bSd: new Date(lSD), lSd: new Date(lSD), bAr: arrDate, lAr: arrDate,
              preShip: false, bPal: r.bPallets, lPal: r.lPallets });
            d.bNeed -= r.bQ; d.lNeed -= r.lQ;
            remB -= r.bQ; remL -= r.lQ;
            // Refresh after each ship
            const a2 = availAt(lSD);
            remB = Math.min(a2.bS, Math.max(0, Math.max(d.bNeed, padBases)));
            remL = Math.min(a2.lS, Math.max(0, d.lNeed));
          }
        }
      }
    }
  }

  // ════════════════════════════════════════════════════════════════════════════
  // PHASE 3 — Fast Boat base-only shipments (partial containers allowed).
  //
  // Only use FB when it's cheaper than Air for the given quantity.
  // Min bases to justify: 20HC=$9500→23,750 bases; 40HC=$14,300→35,750 bases.
  // Uses minPalOverride=1 so partial containers are allowed for residual base needs.
  // ════════════════════════════════════════════════════════════════════════════
  if (fb) {
    for (const d of demands) {
      if (d.bNeed <= 0) continue;
      const bSD = addDays(d.bDeadline, -fb.transitDays);
      const lSD = addDays(d.lDeadline, -fb.transitDays);
      const shipDate = bSD <= lSD ? bSD : lSD;
      // Only use FB if cheaper than equivalent Air cost for the base quantity
      const airEquiv = d.bNeed * airCost.base;
      const cheapestContainer = Math.min(...Object.values(cont).map(c => c.cost));
      if (airEquiv > cheapestContainer) {
        fillAt("Fast Boat", d, shipDate, fb.transitDays, d.bNeed, 0, false, false, 1);
      }
    }
  }

  // ════════════════════════════════════════════════════════════════════════════
  // PHASE 4 — Air: last resort for genuine sub-pallet production gaps.
  // ════════════════════════════════════════════════════════════════════════════
  if (ar) {
    const abPP = pal.airBasePP || 7500, alPP = pal.airLidPP || 25000;
    for (const d of demands) {
      if (d.bNeed <= 0 && d.lNeed <= 0) continue;
      const bSD = addDays(d.bDeadline, -ar.transitDays);
      const bQ = d.bNeed > 0 ? Math.ceil(d.bNeed / abPP) * abPP : 0;
      const lQ = d.lNeed > 0 ? Math.ceil(d.lNeed / alPP) * alPP : 0;
      if (bQ + lQ > 0) {
        res.push({ mo: d.mo, meth: "Air", cn: "Air", bQ, lQ, tQ: bQ + lQ,
          cost: bQ * airCost.base + lQ * airCost.lid,
          bSd: new Date(bSD), lSd: new Date(bSD), bAr: addDays(bSD, ar.transitDays), lAr: addDays(bSD, ar.transitDays),
          bPal: bQ > 0 ? Math.ceil(bQ / abPP) : 0, lPal: lQ > 0 ? Math.ceil(lQ / alPP) : 0, preShip: false });
        d.bNeed = 0; d.lNeed = 0;
      }
    }
  }

  const moOrder = { "Standard Ocean": 0, "Fast Boat": 1, "Air": 2 };
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
      for (const sku of det.skus) {
        for (let wi = 0; wi < sku.weekly.length && wi < det.weeks.length; wi++) {
          if (sku.weekly[wi] <= 0) continue;
          const skuDate = new Date(det.weeks[wi]);
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
