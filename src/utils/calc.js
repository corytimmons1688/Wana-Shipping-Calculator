export function calcGLD(mkts) {
  var r = new Array(12).fill(0);
  for (var m = 0; m < 12; m++)
    for (var i = 0; i < mkts.length; i++)
      if (mkts[i].goLive != null && mkts[i].goLive <= m + 1)
        r[m] += mkts[i].demand[m];
  return r;
}

export function calcProd(molds) {
  var S = new Date("2026-03-09"), wks = [], bC = 0, lC = 0, bPU = 0, lPU = 0;
  var bPD = new Date(molds.base.proto.avail), bMD = new Date(molds.base.prod.avail);
  var lPD = new Date(molds.lid.proto.avail), lMD = new Date(molds.lid.prod.avail);
  for (var w = 0; w < 43; w++) {
    var wk = new Date(S); wk.setDate(wk.getDate() + w * 7);
    var bW = 0, lW = 0;
    if (wk >= bPD && (molds.base.proto.life == null || bPU < molds.base.proto.life)) {
      var o = molds.base.proto.daily * molds.base.proto.qty * molds.base.proto.days;
      var c = molds.base.proto.life ? Math.min(o, molds.base.proto.life - bPU) : o;
      bW += c; bPU += c;
    }
    if (wk >= bMD) bW += molds.base.prod.daily * molds.base.prod.qty * molds.base.prod.days;
    if (wk >= lPD && (molds.lid.proto.life == null || lPU < molds.lid.proto.life)) {
      var o2 = molds.lid.proto.daily * molds.lid.proto.qty * molds.lid.proto.days;
      var c2 = molds.lid.proto.life ? Math.min(o2, molds.lid.proto.life - lPU) : o2;
      lW += c2; lPU += c2;
    }
    if (wk >= lMD) lW += molds.lid.prod.daily * molds.lid.prod.qty * molds.lid.prod.days;
    bC += bW; lC += lW;
    wks.push({ wk, bW, lW, bC, lC, ship: Math.min(bC, lC), tot: bW + lW,
      sur: Math.abs(bC - lC), surT: bC > lC ? "base" : bC < lC ? "lid" : null });
  }
  return wks;
}

export function calcCapex(molds, pm, eq) {
  var bCost = (molds.base.proto.qty * molds.base.proto.cost) + (molds.base.prod.qty * molds.base.prod.cost);
  var lCost = (molds.lid.proto.qty * molds.lid.proto.cost) + (molds.lid.prod.qty * molds.lid.prod.cost);
  var mT = bCost + lCost, pT = 0, eT = 0;
  for (var i = 0; i < pm.length; i++) pT += pm[i].qty * pm[i].cost;
  for (var j = 0; j < eq.length; j++) eT += eq[j].qty * eq[j].cost;
  return { bCost, lCost, mT, pT, eT, grand: mT + pT + eT };
}

export function optimize(mkts, molds, ship, par, cont) {
  var gld = calcGLD(mkts), prod = calcProd(molds), res = [], bS = 0, lS = 0;
  function findWk(sd) {
    for (var i = 0; i < prod.length; i++)
      if (prod[i].wk <= sd && new Date(prod[i].wk.getTime() + 6 * 864e5) >= sd)
        return prod[i];
    return null;
  }
  for (var m = 0; m < 12; m++) {
    var dem = gld[m]; if (dem <= 0) continue;
    var bN = dem, lN = dem;
    var ms = new Date(2026, m, 1);
    var bD = new Date(ms); bD.setDate(bD.getDate() - par.baseLeadDays);
    var lD = new Date(ms); lD.setDate(lD.getDate() - par.lidLeadDays);
    var oc = null, fb = null, ar = null;
    for (var si = 0; si < ship.length; si++) {
      if (ship[si].method === "Standard Ocean") oc = ship[si];
      if (ship[si].method === "Fast Boat") fb = ship[si];
      if (ship[si].method === "Air") ar = ship[si];
    }
    // 1. OCEAN - free, full containers only
    if (oc) {
      var oS = new Date(bD); oS.setDate(oS.getDate() - oc.transitDays);
      var pw = findWk(oS);
      var aB = pw ? Math.max(0, pw.bC - bS) : 0;
      var aL = pw ? Math.max(0, pw.lC - lS) : 0;
      var cB = Math.min(aB, bN), cL = Math.min(aL, lN);
      // 40 HC full
      var t40 = cB + cL, n40 = Math.floor(t40 / cont["40HC"].max);
      for (var ci = 0; ci < n40; ci++) {
        var bQ = Math.min(cB, cont["40HC"].max);
        var lQ = Math.min(cL, cont["40HC"].max - bQ);
        if (bQ + lQ < cont["40HC"].max) {
          bQ += Math.min(cont["40HC"].max - bQ - lQ, cB - bQ);
          lQ += Math.min(cont["40HC"].max - bQ - lQ, cL - lQ);
        }
        if (bQ + lQ < cont["40HC"].max) continue;
        res.push({mo:m,meth:"Standard Ocean",cn:"40\' HC",bQ,lQ,tQ:bQ+lQ,cost:0,
          bSd:new Date(oS),lSd:new Date(oS),bAr:new Date(bD),lAr:new Date(lD)});
        bS += bQ; lS += lQ; bN -= bQ; lN -= lQ; cB -= bQ; cL -= lQ;
      }
      // 20 HC full
      var t20 = cB + cL, n20 = Math.floor(t20 / cont["20HC"].max);
      for (var ci2 = 0; ci2 < n20; ci2++) {
        var bQ2 = Math.min(cB, cont["20HC"].max);
        var lQ2 = Math.min(cL, cont["20HC"].max - bQ2);
        if (bQ2 + lQ2 < cont["20HC"].max) {
          bQ2 += Math.min(cont["20HC"].max - bQ2 - lQ2, cB - bQ2);
          lQ2 += Math.min(cont["20HC"].max - bQ2 - lQ2, cL - lQ2);
        }
        if (bQ2 + lQ2 < cont["20HC"].max) continue;
        res.push({mo:m,meth:"Standard Ocean",cn:"20\' HC",bQ:bQ2,lQ:lQ2,tQ:bQ2+lQ2,cost:0,
          bSd:new Date(oS),lSd:new Date(oS),bAr:new Date(bD),lAr:new Date(lD)});
        bS += bQ2; lS += lQ2; bN -= bQ2; lN -= lQ2; cB -= bQ2; cL -= lQ2;
      }
    }
    // 2. FAST BOAT - container pricing, partial OK
    if (fb && (bN > 0 || lN > 0)) {
      var fS = new Date(bD); fS.setDate(fS.getDate() - fb.transitDays);
      var pw2 = findWk(fS);
      var aB2 = pw2 ? Math.max(0, pw2.bC - bS) : 0;
      var aL2 = pw2 ? Math.max(0, pw2.lC - lS) : 0;
      var canB = Math.min(aB2, bN), canL = Math.min(aL2, lN), rem = canB + canL;
      while (rem > 0) {
        var cLbl, cCst, cMax;
        if (rem > cont["20HC"].max) {
          cLbl = "40\' HC"; cCst = cont["40HC"].cost; cMax = cont["40HC"].max;
        } else {
          cLbl = "20\' HC"; cCst = cont["20HC"].cost; cMax = cont["20HC"].max;
        }
        var sq = Math.min(rem, cMax);
        var bQ3 = Math.min(canB, sq);
        var lQ3 = Math.min(canL, sq - bQ3);
        var act = bQ3 + lQ3;
        if (act <= 0) break;
        res.push({mo:m,meth:"Fast Boat",cn:cLbl,bQ:bQ3,lQ:lQ3,tQ:act,cost:cCst,
          bSd:new Date(fS),lSd:new Date(fS),bAr:new Date(bD),lAr:new Date(lD)});
        bS += bQ3; lS += lQ3; bN -= bQ3; lN -= lQ3;
        canB -= bQ3; canL -= lQ3; rem -= act;
      }
    }
    // 3. AIR - last resort
    if (ar && (bN > 0 || lN > 0)) {
      var aShp = new Date(bD); aShp.setDate(aShp.getDate() - ar.transitDays);
      var bQ4 = Math.ceil(Math.max(bN, 0) / par.rounding) * par.rounding;
      var lQ4 = Math.ceil(Math.max(lN, 0) / par.rounding) * par.rounding;
      var tQ4 = bQ4 + lQ4;
      if (tQ4 > 0) {
        res.push({mo:m,meth:"Air",cn:"Air",bQ:bQ4,lQ:lQ4,tQ:tQ4,cost:tQ4*ar.costPerUnit,
          bSd:new Date(aShp),lSd:new Date(aShp),bAr:new Date(bD),lAr:new Date(lD)});
        bS += bQ4; lS += lQ4;
      }
    }
  }
  return res;
}
