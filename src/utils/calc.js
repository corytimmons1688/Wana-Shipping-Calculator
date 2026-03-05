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

function splitPallets(pallets, bPP, lPP, bAvail, lAvail, airCostB, airCostL) {
  var fullBP = Math.floor(bAvail / bPP);
  var bRem = bAvail - fullBP * bPP;
  var maxBP = fullBP + (bRem >= bPP * 0.5 ? 1 : 0);
  var fullLP = Math.floor(lAvail / lPP);
  var lRem = lAvail - fullLP * lPP;
  var maxLP = fullLP + (lRem >= lPP * 0.5 ? 1 : 0);
  var acB = airCostB || 0.40;
  var acL = airCostL || 0.12;
  var bestB = 0, bestL = 0, bestBP = 0, bestLP = 0, bestSaving = -1;
  for (var bp = 0; bp <= Math.min(pallets, maxBP); bp++) {
    var lp = Math.min(pallets - bp, maxLP);
    var bQ = Math.min(bp * bPP, bAvail);
    var lQ = Math.min(lp * lPP, lAvail);
    var saving = bQ * acB + lQ * acL;
    if (saving > bestSaving) {
      bestB = bQ; bestL = lQ; bestBP = bp; bestLP = lp; bestSaving = saving;
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

  function shipOcean(d, oSD, label) {
    for (const ck of ["40HC", "20HC"]) {
      const cc = { pallets: cont[ck].pallets, bPP: pal.basePP, lPP: pal.lidPP };
      const mnP = cont[ck].minPal || (cc.pallets <= 10 ? 8 : 16);
      for (var pwi = 0; pwi < prod.length; pwi++) {
        if (prod[pwi].wk > oSD) break;
        if (d.bNeed <= 0 && d.lNeed <= 0) break;
        var shipWk = prod[pwi].wk;
        var avail = prodAt(prod, shipWk);
        var aB = Math.max(0, avail.bC - bS);
        var aL = Math.max(0, avail.lC - lS);
        var cB = Math.min(aB, d.bNeed);
        var cL = Math.min(aL, d.lNeed);
        while (cB + cL > 0) {
          var sp = splitPallets(cc.pallets, cc.bPP, cc.lPP, cB, cL, airCost.base, airCost.lid);
          if (sp.bQ + sp.lQ <= 0) break;
          var usedPal = (sp.bQ > 0 ? sp.bPallets : 0) + (sp.lQ > 0 ? sp.lPallets : 0);
          if (usedPal < mnP) break;
          // FIXED: arrival = shipWk + transitDays (was incorrectly set then overwritten)
          var arrDate = new Date(shipWk);
          arrDate.setDate(arrDate.getDate() + oc.transitDays);
          res.push({ mo: d.mo, meth: "Standard Ocean", cn: cont[ck].label, bQ: sp.bQ, lQ: sp.lQ, tQ: sp.bQ + sp.lQ, cost: 0,
            bSd: new Date(shipWk), lSd: new Date(shipWk), bAr: new Date(arrDate), lAr: new Date(arrDate),
            preShip: !!label, bPal: sp.bPallets, lPal: sp.lPallets });
          bS += sp.bQ; lS += sp.lQ; d.bNeed -= sp.bQ; d.lNeed -= sp.lQ;
          cB -= sp.bQ; cL -= sp.lQ;
          aB = Math.max(0, avail.bC - bS);
          aL = Math.max(0, avail.lC - lS);
          cB = Math.min(aB, d.bNeed);
          cL = Math.min(aL, d.lNeed);
        }
      }
    }
  }

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
    const sepAirCost = Math.max(0, d.bNeed - canB) * airCost.base + Math.max(0, d.lNeed - canL) * airCost.lid;
    const combAirCost = Math.max(0, d.bNeed - canB) * airCost.base + Math.max(0, d.lNeed - combAvailL) * airCost.lid;
    const useSep = canL > combAvailL && sepAirCost < combAirCost;

    if (useSep) {
      let remB = canB;
      for (const ck of ["40HC", "20HC"]) {
        const cc = { pallets: cont[ck].pallets, bPP: pal.basePP };
        while (remB > 0) {
          const bPl = Math.min(cc.pallets, Math.floor(remB / cc.bPP) + (remB % cc.bPP >= cc.bPP * 0.5 ? 1 : 0));
          if (bPl < (cont[ck].minPal || (cc.pallets <= 10 ? 8 : 16))) break;
          const bQ = Math.min(bPl * cc.bPP, remB);
          if (bQ <= 0) break;
          // FIXED: arrival = bSD + transitDays
          const bArr = new Date(bSD); bArr.setDate(bArr.getDate() + fb.transitDays);
          res.push({ mo: d.mo, meth: "Fast Boat", cn: cont[ck].label, bQ, lQ: 0, tQ: bQ, cost: cont[ck].cost,
            bSd: new Date(bSD), lSd: new Date(bSD), bAr: bArr, lAr: bArr, bPal: bPl, lPal: 0 });
          bS += bQ; d.bNeed -= bQ; remB -= bQ;
        }
      }
      let remL = canL;
      for (const ck of ["40HC", "20HC"]) {
        const cc = { pallets: cont[ck].pallets, lPP: pal.lidPP };
        while (remL > 0) {
          const lPl = Math.min(cc.pallets, Math.floor(remL / cc.lPP) + (remL % cc.lPP >= cc.lPP * 0.5 ? 1 : 0));
          if (lPl < (cont[ck].minPal || (cc.pallets <= 10 ? 8 : 16))) break;
          const lQ = Math.min(lPl * cc.lPP, remL);
          if (lQ <= 0) break;
          // FIXED: arrival = lSD + transitDays
          const lArr = new Date(lSD); lArr.setDate(lArr.getDate() + fb.transitDays);
          res.push({ mo: d.mo, meth: "Fast Boat", cn: cont[ck].label, bQ: 0, lQ, tQ: lQ, cost: cont[ck].cost,
            bSd: new Date(lSD), lSd: new Date(lSD), bAr: lArr, lAr: lArr, bPal: 0, lPal: lPl });
          lS += lQ; d.lNeed -= lQ; remL -= lQ;
        }
      }
    } else {
      let remB = canB, remL = combAvailL;
      for (const ck of ["40HC", "20HC"]) {
        const cc = { pallets: cont[ck].pallets, bPP: pal.basePP, lPP: pal.lidPP };
        while (remB + remL > 0) {
          const sp = splitPallets(cc.pallets, cc.bPP, cc.lPP, remB, remL, airCost.base, airCost.lid);
          if (sp.bQ + sp.lQ <= 0) break;
          var usedP = (sp.bQ > 0 ? sp.bPallets : 0) + (sp.lQ > 0 ? sp.lPallets : 0);
          if (usedP < (cont[ck].minPal || (cc.pallets <= 10 ? 8 : 16))) break;
          // FIXED: combined ships on bSD, both components arrive bSD + transitDays
          const arrDate = new Date(bSD); arrDate.setDate(arrDate.getDate() + fb.transitDays);
          res.push({ mo: d.mo, meth: "Fast Boat", cn: cont[ck].label, bQ: sp.bQ, lQ: sp.lQ, tQ: sp.bQ + sp.lQ, cost: cont[ck].cost,
            bSd: new Date(bSD), lSd: new Date(bSD), bAr: new Date(arrDate), lAr: new Date(arrDate),
            bPal: sp.bPallets, lPal: sp.lPallets });
          bS += sp.bQ; lS += sp.lQ; d.bNeed -= sp.bQ; d.lNeed -= sp.lQ;
          remB -= sp.bQ; remL -= sp.lQ;
        }
      }
    }
  }

  // PHASE 1: Each month — Ocean first, then Fast Boat
  for (const d of demands) {
    if (oc) {
      const oSD = sd(d.bDeadline, oc.transitDays);
      shipOcean(d, oSD, null);
    }
    shipFB(d);
  }

  // PHASE 2: Pre-ship future demand on free Ocean using earlier ship windows
  // FIXED: Only pre-ship when goods will arrive on time for the future month's deadline
  if (oc) {
    for (let di = 0; di < demands.length; di++) {
      const d = demands[di];
      const oSD = sd(d.bDeadline, oc.transitDays);
      for (let fj = di + 1; fj < demands.length; fj++) {
        const fd = demands[fj];
        if (fd.bNeed <= 0 && fd.lNeed <= 0) continue;
        // FIXED: verify pre-shipped goods arrive before future month's deadline
        const preArrival = new Date(oSD);
        preArrival.setDate(preArrival.getDate() + oc.transitDays);
        if (preArrival <= fd.bDeadline) {
          shipOcean(fd, oSD, "pre");
        }
      }
    }
  }

  // PHASE 3: Second pass Fast Boat for anything freed up
  if (fb) {
    for (const d of demands) { shipFB(d); }
  }

  // PHASE 4: Air for anything remaining
  // FIXED: deduct actual need (not rounded pallet qty) to prevent overshooting bS/lS
  // FIXED: removed erroneous post-loop arrival date overwrite
  if (ar) {
    const abPP = pal.airBasePP || 7500;
    const alPP = pal.airLidPP || 25000;
    for (const d of demands) {
      if (d.bNeed <= 0 && d.lNeed <= 0) continue;
      const bSD = sd(d.bDeadline, ar.transitDays);
      const bQ = d.bNeed > 0 ? Math.ceil(d.bNeed / abPP) * abPP : 0;
      const lQ = d.lNeed > 0 ? Math.ceil(d.lNeed / alPP) * alPP : 0;
      if (bQ + lQ > 0) {
        const bPal = bQ > 0 ? Math.ceil(bQ / abPP) : 0;
        const lPal = lQ > 0 ? Math.ceil(lQ / alPP) : 0;
        const bArr = new Date(bSD); bArr.setDate(bArr.getDate() + ar.transitDays);
        res.push({ mo: d.mo, meth: "Air", cn: "Air", bQ, lQ, tQ: bQ + lQ,
          cost: bQ * airCost.base + lQ * airCost.lid,
          bSd: new Date(bSD), lSd: new Date(bSD), bAr: bArr, lAr: bArr,
          bPal, lPal });
        // FIXED: deduct actual need, not rounded up pallet quantity
        bS += Math.min(bQ, d.bNeed); lS += Math.min(lQ, d.lNeed);
        d.bNeed = 0; d.lNeed = 0;
      }
    }
  }

  // REMOVED: erroneous post-loop that overwrote all lAr with bAr values

  const mo = { "Standard Ocean": 0, "Fast Boat": 1, "Air": 2 };
  res.sort((a, b) => a.mo - b.mo || mo[a.meth] - mo[b.meth]);
  return res;
}

export function calcWeeklyDemand(mkts) {
  var S = new Date("2026-03-09");
  var weeks = [];
  for (var w = 0; w < 43; w++) {
    var wk = new Date(S); wk.setDate(wk.getDate() + w * 7);
    weeks.push({ wk: wk, demand: 0 });
  }
  for (var mi = 0; mi < mkts.length; mi++) {
    var mk = mkts[mi];
    if (mk.goLive == null) continue;
    if (mk.skuDetail && mk.skuDetail.weeks && mk.skuDetail.skus) {
      var det = mk.skuDetail;
      for (var si = 0; si < det.skus.length; si++) {
        var sku = det.skus[si];
        for (var wi = 0; wi < sku.weekly.length && wi < det.weeks.length; wi++) {
          if (sku.weekly[wi] <= 0) continue;
          var skuDate = new Date(det.weeks[wi]);
          for (var pwi = 0; pwi < weeks.length; pwi++) {
            var diff = Math.abs(weeks[pwi].wk.getTime() - skuDate.getTime());
            if (diff < 4 * 86400000) { weeks[pwi].demand += sku.weekly[wi]; break; }
          }
        }
      }
    } else {
      for (var mo = 0; mo < 12; mo++) {
        if (mo + 1 < mk.goLive) continue;
        var mDem = mk.demand[mo] || 0;
        if (mDem <= 0) continue;
        var mWeeks = [];
        for (var pwi2 = 0; pwi2 < weeks.length; pwi2++) {
          if (weeks[pwi2].wk.getMonth() === mo) mWeeks.push(pwi2);
        }
        if (mWeeks.length > 0) {
          var perWk = mDem / mWeeks.length;
          for (var mwi = 0; mwi < mWeeks.length; mwi++) { weeks[mWeeks[mwi]].demand += perWk; }
        }
      }
    }
  }
  return weeks;
}
