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

// Helper: get cumulative production at a given date
function prodAt(prod, date) {
  let best = null;
  for (const p of prod) {
    if (p.wk <= date) best = p;
  }
  return best ? { bC: best.bC, lC: best.lC } : { bC: 0, lC: 0 };
}

// Helper: find the latest possible ship date for a method to arrive by deadline
function shipDate(arriveBy, transitDays) {
  const d = new Date(arriveBy);
  d.setDate(d.getDate() - transitDays);
  return d;
}

export function optimize(mkts, molds, ship, par, cont) {
  const gld = calcGLD(mkts), prod = calcProd(molds), res = [];
  let bS = 0, lS = 0; // cumulative shipped

  let oc = null, fb = null, ar = null;
  for (const s of ship) {
    if (s.method === "Standard Ocean") oc = s;
    if (s.method === "Fast Boat") fb = s;
    if (s.method === "Air") ar = s;
  }

  // ── PHASE 1: Calculate all demand deadlines ──
  const demands = [];
  for (let m = 0; m < 12; m++) {
    if (gld[m] <= 0) continue;
    const ms = new Date(2026, m, 1);
    const bD = new Date(ms); bD.setDate(bD.getDate() - par.baseLeadDays);
    const lD = new Date(ms); lD.setDate(lD.getDate() - par.lidLeadDays);
    demands.push({ mo: m, dem: gld[m], bDeadline: bD, lDeadline: lD, bNeed: gld[m], lNeed: gld[m] });
  }

  // ── PHASE 2: Maximize free Ocean ──
  // Strategy: For each demand month, try to ship as much as possible via Ocean.
  // Also look AHEAD: if we have excess production, pre-ship future months' demand on Ocean too.
  // Ocean requires full containers only.

  // First pass: standard Ocean for each month
  for (const d of demands) {
    if (!oc) break;
    const oShipDate = shipDate(d.bDeadline, oc.transitDays);
    const avail = prodAt(prod, oShipDate);
    let aB = Math.max(0, avail.bC - bS);
    let aL = Math.max(0, avail.lC - lS);
    let cB = Math.min(aB, d.bNeed);
    let cL = Math.min(aL, d.lNeed);

    // Try 40' HC full containers
    let total = cB + cL;
    let n40 = Math.floor(total / cont["40HC"].max);
    for (let i = 0; i < n40; i++) {
      let bQ = Math.min(cB, cont["40HC"].max);
      let lQ = Math.min(cL, cont["40HC"].max - bQ);
      // Try to fill remainder
      if (bQ + lQ < cont["40HC"].max) { bQ += Math.min(cont["40HC"].max - bQ - lQ, cB - bQ); lQ += Math.min(cont["40HC"].max - bQ - lQ, cL - lQ); }
      if (bQ + lQ < cont["40HC"].max) continue;
      res.push({ mo: d.mo, meth: "Standard Ocean", cn: "40' HC", bQ, lQ, tQ: bQ + lQ, cost: 0,
        bSd: new Date(oShipDate), lSd: new Date(oShipDate), bAr: new Date(d.bDeadline), lAr: new Date(d.lDeadline) });
      bS += bQ; lS += lQ; d.bNeed -= bQ; d.lNeed -= lQ; cB -= bQ; cL -= lQ;
    }
    // Try 20' HC full containers
    total = cB + cL;
    let n20 = Math.floor(total / cont["20HC"].max);
    for (let i = 0; i < n20; i++) {
      let bQ = Math.min(cB, cont["20HC"].max);
      let lQ = Math.min(cL, cont["20HC"].max - bQ);
      if (bQ + lQ < cont["20HC"].max) { bQ += Math.min(cont["20HC"].max - bQ - lQ, cB - bQ); lQ += Math.min(cont["20HC"].max - bQ - lQ, cL - lQ); }
      if (bQ + lQ < cont["20HC"].max) continue;
      res.push({ mo: d.mo, meth: "Standard Ocean", cn: "20' HC", bQ, lQ, tQ: bQ + lQ, cost: 0,
        bSd: new Date(oShipDate), lSd: new Date(oShipDate), bAr: new Date(d.bDeadline), lAr: new Date(d.lDeadline) });
      bS += bQ; lS += lQ; d.bNeed -= bQ; d.lNeed -= lQ; cB -= bQ; cL -= lQ;
    }
  }

  // ── PHASE 2b: Pre-ship future demand on Ocean using excess production ──
  // Check each month: if production exceeds current month's need, ship ahead for future months
  if (oc) {
    for (let di = 0; di < demands.length; di++) {
      const d = demands[di];
      const oShipDate = shipDate(d.bDeadline, oc.transitDays);
      const avail = prodAt(prod, oShipDate);
      let excessB = Math.max(0, avail.bC - bS);
      let excessL = Math.max(0, avail.lC - lS);

      // Look ahead to future months and try to pre-fill Ocean containers
      for (let fj = di + 1; fj < demands.length && (excessB >= cont["20HC"].max * 0.3 || excessL >= cont["20HC"].max * 0.3); fj++) {
        const fd = demands[fj];
        if (fd.bNeed <= 0 && fd.lNeed <= 0) continue;

        let preB = Math.min(excessB, fd.bNeed);
        let preL = Math.min(excessL, fd.lNeed);
        let preTotal = preB + preL;

        // Only ship if we can fill a full container
        // Try 40' HC
        while (preTotal >= cont["40HC"].max) {
          let bQ = Math.min(preB, cont["40HC"].max);
          let lQ = Math.min(preL, cont["40HC"].max - bQ);
          if (bQ + lQ < cont["40HC"].max) { bQ += Math.min(cont["40HC"].max - bQ - lQ, preB - bQ); lQ += Math.min(cont["40HC"].max - bQ - lQ, preL - lQ); }
          if (bQ + lQ < cont["40HC"].max) break;
          res.push({ mo: fd.mo, meth: "Standard Ocean", cn: "40' HC", bQ, lQ, tQ: bQ + lQ, cost: 0,
            bSd: new Date(oShipDate), lSd: new Date(oShipDate), bAr: new Date(d.bDeadline), lAr: new Date(d.lDeadline), preShip: true });
          bS += bQ; lS += lQ; fd.bNeed -= bQ; fd.lNeed -= lQ;
          excessB -= bQ; excessL -= lQ; preB -= bQ; preL -= lQ; preTotal -= (bQ + lQ);
        }
        // Try 20' HC
        while (preTotal >= cont["20HC"].max) {
          let bQ = Math.min(preB, cont["20HC"].max);
          let lQ = Math.min(preL, cont["20HC"].max - bQ);
          if (bQ + lQ < cont["20HC"].max) { bQ += Math.min(cont["20HC"].max - bQ - lQ, preB - bQ); lQ += Math.min(cont["20HC"].max - bQ - lQ, preL - lQ); }
          if (bQ + lQ < cont["20HC"].max) break;
          res.push({ mo: fd.mo, meth: "Standard Ocean", cn: "20' HC", bQ, lQ, tQ: bQ + lQ, cost: 0,
            bSd: new Date(oShipDate), lSd: new Date(oShipDate), bAr: new Date(d.bDeadline), lAr: new Date(d.lDeadline), preShip: true });
          bS += bQ; lS += lQ; fd.bNeed -= bQ; fd.lNeed -= lQ;
          excessB -= bQ; excessL -= lQ; preB -= bQ; preL -= lQ; preTotal -= (bQ + lQ);
        }
      }
    }
  }

  // ── PHASE 3: Fast Boat with cross-month consolidation ──
  // Collect all remaining demand, group by similar ship dates, and consolidate into fewer containers
  if (fb) {
    // Build a list of all remaining needs with their ship dates
    const fbNeeds = [];
    for (const d of demands) {
      if (d.bNeed <= 0 && d.lNeed <= 0) continue;
      const fShipDate = shipDate(d.bDeadline, fb.transitDays);
      const avail = prodAt(prod, fShipDate);
      const canB = Math.min(Math.max(0, avail.bC - bS), d.bNeed);
      const canL = Math.min(Math.max(0, avail.lC - lS), d.lNeed);
      if (canB + canL > 0) {
        fbNeeds.push({ mo: d.mo, bNeed: canB, lNeed: canL, shipDate: fShipDate, bDeadline: d.bDeadline, lDeadline: d.lDeadline, demRef: d });
      }
    }

    // Consolidation: try to combine adjacent months into shared containers
    // Sort by ship date
    fbNeeds.sort((a, b) => a.shipDate - b.shipDate);

    // Greedy: accumulate needs and ship when we have enough for optimal container
    let accumB = 0, accumL = 0;
    const accumItems = [];

    for (let i = 0; i < fbNeeds.length; i++) {
      const need = fbNeeds[i];
      accumB += need.bNeed;
      accumL += need.lNeed;
      accumItems.push(need);

      const isLast = i === fbNeeds.length - 1;
      // Ship when: we have enough for a 40'HC, or it's the last batch, 
      // or next month's ship date is >14 days away (can't consolidate further)
      const nextFar = !isLast && (fbNeeds[i + 1].shipDate - need.shipDate > 14 * 864e5);

      if (accumB + accumL >= cont["40HC"].max || isLast || nextFar) {
        // Ship everything accumulated
        let remB = accumB, remL = accumL;
        // Use the LATEST ship date in the batch (most urgent)
        const latestItem = accumItems[accumItems.length - 1];

        while (remB + remL > 0) {
          let cn, cc, cx;
          if (remB + remL > cont["20HC"].max) {
            cn = "40' HC"; cc = cont["40HC"].cost; cx = cont["40HC"].max;
          } else {
            cn = "20' HC"; cc = cont["20HC"].cost; cx = cont["20HC"].max;
          }
          const sq = Math.min(remB + remL, cx);
          const bQ = Math.min(remB, sq);
          const lQ = Math.min(remL, sq - bQ);
          if (bQ + lQ <= 0) break;

          res.push({ mo: latestItem.mo, meth: "Fast Boat", cn, bQ, lQ, tQ: bQ + lQ, cost: cc,
            bSd: new Date(latestItem.shipDate), lSd: new Date(latestItem.shipDate),
            bAr: new Date(latestItem.bDeadline), lAr: new Date(latestItem.lDeadline),
            consolidated: accumItems.length > 1 });

          bS += bQ; lS += lQ; remB -= bQ; remL -= lQ;
          // Deduct from demand refs
          let bDed = bQ, lDed = lQ;
          for (const item of accumItems) {
            const bd = Math.min(bDed, item.demRef.bNeed);
            const ld = Math.min(lDed, item.demRef.lNeed);
            item.demRef.bNeed -= bd; item.demRef.lNeed -= ld;
            bDed -= bd; lDed -= ld;
          }
        }
        accumB = 0; accumL = 0; accumItems.length = 0;
      }
    }
  }

  // ── PHASE 4: Air for anything remaining ──
  if (ar) {
    for (const d of demands) {
      const bN = d.bNeed, lN = d.lNeed;
      if (bN <= 0 && lN <= 0) continue;
      const aShp = shipDate(d.bDeadline, ar.transitDays);
      const bQ = Math.ceil(Math.max(bN, 0) / par.rounding) * par.rounding;
      const lQ = Math.ceil(Math.max(lN, 0) / par.rounding) * par.rounding;
      if (bQ + lQ > 0) {
        res.push({ mo: d.mo, meth: "Air", cn: "Air", bQ, lQ, tQ: bQ + lQ, cost: (bQ + lQ) * ar.costPerUnit,
          bSd: new Date(aShp), lSd: new Date(aShp), bAr: new Date(d.bDeadline), lAr: new Date(d.lDeadline) });
        bS += bQ; lS += lQ; d.bNeed -= bQ; d.lNeed -= lQ;
      }
    }
  }

  // Sort results by month then method priority
  const methOrder = { "Standard Ocean": 0, "Fast Boat": 1, "Air": 2 };
  res.sort((a, b) => a.mo - b.mo || methOrder[a.meth] - methOrder[b.meth]);

  return res;
}
