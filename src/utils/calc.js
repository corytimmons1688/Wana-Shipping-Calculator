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

function sd(arriveBy, transitDays) {
  const d = new Date(arriveBy); d.setDate(d.getDate() - transitDays); return d;
}

function splitPallets(pallets, bPP, lPP, bWant, lWant) {
  let bestB = 0, bestL = 0, bestBP = 0, bestLP = 0, bestWaste = Infinity;
  for (let bp = 0; bp <= pallets; bp++) {
    const lp = pallets - bp;
    const bQ = Math.min(bp * bPP, bWant);
    const lQ = Math.min(lp * lPP, lWant);
    const waste = (bp * bPP - bQ) + (lp * lPP - lQ);
    if (bQ + lQ > bestB + bestL || (bQ + lQ === bestB + bestL && waste < bestWaste)) {
      bestB = bQ; bestL = lQ; bestBP = bp; bestLP = lp; bestWaste = waste;
    }
  }
  return { bQ: bestB, lQ: bestL, bPallets: bestBP, lPallets: bestLP };
}

export function optimize(mkts, molds, ship, par, cont, pal, airCost) {
  const gld = calcGLD(mkts), prod = calcProd(molds), res = [];
  let bS = 0, lS = 0;

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
    const bD = new Date(ms); bD.setDate(bD.getDate() - par.baseLeadDays);
    const lD = new Date(ms); lD.setDate(lD.getDate() - par.lidLeadDays);
    demands.push({ mo: m, dem: gld[m], bDeadline: bD, lDeadline: lD, bNeed: gld[m], lNeed: gld[m] });
  }

  // Helper: ship Ocean containers (full only)
  function shipOcean(d, oSD, label) {
    const avail = prodAt(prod, oSD);
    let aB = Math.max(0, avail.bC - bS);
    let aL = Math.max(0, avail.lC - lS);
    let cB = Math.min(aB, d.bNeed);
    let cL = Math.min(aL, d.lNeed);
    for (const ck of ["40HC", "20HC"]) {
      const cc = { pallets: cont[ck].pallets, bPP: pal.basePP, lPP: pal.lidPP };
      while (cB + cL > 0) {
        const sp = splitPallets(cc.pallets, cc.bPP, cc.lPP, cB, cL);
        if (sp.bQ + sp.lQ <= 0) break;
        // Full container = all pallets allocated have product on them
        // At least use all pallets in the container (no empty pallets)
        var totalPal = sp.bPallets + sp.lPallets;
        if (totalPal < cc.pallets) break;
        if (sp.bPallets > 0 && sp.bQ <= 0) break;
        if (sp.lPallets > 0 && sp.lQ <= 0) break;
        res.push({ mo: d.mo, meth: "Standard Ocean", cn: cont[ck].label, bQ: sp.bQ, lQ: sp.lQ, tQ: sp.bQ + sp.lQ, cost: 0,
          bSd: new Date(oSD), lSd: new Date(oSD), bAr: new Date(d.bDeadline), lAr: new Date(d.lDeadline),
          preShip: !!label, bPal: sp.bPallets, lPal: sp.lPallets });
        bS += sp.bQ; lS += sp.lQ; d.bNeed -= sp.bQ; d.lNeed -= sp.lQ;
        cB -= sp.bQ; cL -= sp.lQ;
      }
    }
  }

  // Helper: ship Fast Boat
  function shipFB(d) {
    if (!fb) return;
    if (d.bNeed <= 0 && d.lNeed <= 0) return;
    const bSD = sd(d.bDeadline, fb.transitDays);
    const lSD = sd(d.lDeadline, fb.transitDays);
    const bAv = prodAt(prod, bSD);
    const lAv = prodAt(prod, lSD);
    let canB = Math.min(Math.max(0, bAv.bC - bS), d.bNeed);
    let canL = Math.min(Math.max(0, lAv.lC - lS), d.lNeed);
    const combAvailL = Math.min(Math.max(0, bAv.lC - lS), d.lNeed);

    // Decide: separate or combined
    const sepAirCost = Math.max(0, d.bNeed - canB) * airCost.base + Math.max(0, d.lNeed - canL) * airCost.lid;
    const combAirCost = Math.max(0, d.bNeed - canB) * airCost.base + Math.max(0, d.lNeed - combAvailL) * airCost.lid;
    const useSep = canL > combAvailL && sepAirCost < combAirCost;

    if (useSep) {
      // Bases
      let remB = canB;
      for (const ck of ["40HC", "20HC"]) {
        const cc = { pallets: cont[ck].pallets, bPP: pal.basePP };
        while (remB > 0) {
          const bPl = Math.min(cc.pallets, Math.ceil(remB / cc.bPP));
          const bQ = Math.min(bPl * cc.bPP, remB);
          if (bQ <= 0) break;
          res.push({ mo: d.mo, meth: "Fast Boat", cn: cont[ck].label, bQ, lQ: 0, tQ: bQ, cost: cont[ck].cost,
            bSd: new Date(bSD), lSd: new Date(bSD), bAr: new Date(d.bDeadline), lAr: new Date(d.bDeadline), bPal: bPl, lPal: 0 });
          bS += bQ; d.bNeed -= bQ; remB -= bQ;
        }
      }
      // Lids
      let remL = canL;
      for (const ck of ["40HC", "20HC"]) {
        const cc = { pallets: cont[ck].pallets, lPP: pal.lidPP };
        while (remL > 0) {
          const lPl = Math.min(cc.pallets, Math.ceil(remL / cc.lPP));
          const lQ = Math.min(lPl * cc.lPP, remL);
          if (lQ <= 0) break;
          res.push({ mo: d.mo, meth: "Fast Boat", cn: cont[ck].label, bQ: 0, lQ, tQ: lQ, cost: cont[ck].cost,
            bSd: new Date(lSD), lSd: new Date(lSD), bAr: new Date(d.lDeadline), lAr: new Date(d.lDeadline), bPal: 0, lPal: lPl });
          lS += lQ; d.lNeed -= lQ; remL -= lQ;
        }
      }
    } else {
      // Combined on base ship date
      let remB = canB, remL = combAvailL;
      for (const ck of ["40HC", "20HC"]) {
        const cc = { pallets: cont[ck].pallets, bPP: pal.basePP, lPP: pal.lidPP };
        while (remB + remL > 0) {
          const sp = splitPallets(cc.pallets, cc.bPP, cc.lPP, remB, remL);
          if (sp.bQ + sp.lQ <= 0) break;
          res.push({ mo: d.mo, meth: "Fast Boat", cn: cont[ck].label, bQ: sp.bQ, lQ: sp.lQ, tQ: sp.bQ + sp.lQ, cost: cont[ck].cost,
            bSd: new Date(bSD), lSd: new Date(bSD), bAr: new Date(d.bDeadline), lAr: new Date(d.lDeadline), bPal: sp.bPallets, lPal: sp.lPallets });
          bS += sp.bQ; lS += sp.lQ; d.bNeed -= sp.bQ; d.lNeed -= sp.lQ;
          remB -= sp.bQ; remL -= sp.lQ;
        }
      }
    }
  }

  // ═══════════════════════════════════════════════════════
  // PHASE 1: For each month, Ocean first, then Fast Boat
  // This ensures FB gets production before pre-ship steals it
  // ═══════════════════════════════════════════════════════
  for (const d of demands) {
    // Ocean for this month's own demand
    if (oc) {
      const oSD = sd(d.bDeadline, oc.transitDays);
      shipOcean(d, oSD, null);
    }
    // Fast Boat for remainder
    shipFB(d);
  }

  // ═══════════════════════════════════════════════════════
  // PHASE 2: Pre-ship future demand on free Ocean
  // Now that FB has been allocated, use remaining excess
  // production to pre-fill Ocean containers for later months
  // ═══════════════════════════════════════════════════════
  if (oc) {
    for (let di = 0; di < demands.length; di++) {
      const d = demands[di];
      const oSD = sd(d.bDeadline, oc.transitDays);
      for (let fj = di + 1; fj < demands.length; fj++) {
        const fd = demands[fj];
        if (fd.bNeed <= 0 && fd.lNeed <= 0) continue;
        shipOcean(fd, oSD, "pre");
      }
    }
  }

  // ═══════════════════════════════════════════════════════
  // PHASE 3: Second pass Fast Boat for anything freed up
  // ═══════════════════════════════════════════════════════
  if (fb) {
    for (const d of demands) { shipFB(d); }
  }

  // ═══════════════════════════════════════════════════════
  // PHASE 4: Air for anything remaining (split pricing, air pallet rounding)
  // ═══════════════════════════════════════════════════════
  if (ar) {
    const abPP = pal.airBasePP || 7500;
    const alPP = pal.airLidPP || 25000;
    for (const d of demands) {
      if (d.bNeed <= 0 && d.lNeed <= 0) continue;
      const aSD = sd(d.bDeadline, ar.transitDays);
      const bQ = d.bNeed > 0 ? Math.ceil(d.bNeed / abPP) * abPP : 0;
      const lQ = d.lNeed > 0 ? Math.ceil(d.lNeed / alPP) * alPP : 0;
      if (bQ + lQ > 0) {
        const bPal = bQ > 0 ? Math.ceil(bQ / abPP) : 0;
        const lPal = lQ > 0 ? Math.ceil(lQ / alPP) : 0;
        res.push({ mo: d.mo, meth: "Air", cn: "Air", bQ, lQ, tQ: bQ + lQ, cost: bQ * airCost.base + lQ * airCost.lid,
          bSd: new Date(aSD), lSd: new Date(aSD), bAr: new Date(d.bDeadline), lAr: new Date(d.lDeadline),
          bPal, lPal });
        bS += bQ; lS += lQ; d.bNeed -= bQ; d.lNeed -= lQ;
      }
    }
  }

  // Fix arrival dates
  for (const sh of res) {
    const m = ship.find(s => s.method === sh.meth);
    if (m) { const arr = new Date(sh.bSd); arr.setDate(arr.getDate() + m.transitDays); sh.bAr = new Date(arr); sh.lAr = new Date(arr); }
  }

  const mo = { "Standard Ocean": 0, "Fast Boat": 1, "Air": 2 };
  res.sort((a, b) => a.mo - b.mo || mo[a.meth] - mo[b.meth]);
  return res;
}
