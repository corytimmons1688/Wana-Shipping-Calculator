export function fm(v) {
  return v == null || isNaN(v) ? "\u2014" : Number(v).toLocaleString();
}
export function f$(v) {
  return v == null || isNaN(v) ? "\u2014" : "$" + Number(v).toLocaleString(undefined, {minimumFractionDigits:0,maximumFractionDigits:0});
}
export function fC(v) {
  return v == null || isNaN(v) ? "\u2014" : "$" + Number(v).toLocaleString(undefined, {minimumFractionDigits:2,maximumFractionDigits:2});
}
export function dF(d) {
  return d.toLocaleDateString("en-US", {month:"short",day:"numeric"});
}
