export function filterCutoffFromAmount(amount = 1) {
  const safe = Math.max(0, Math.min(1, Number(amount) || 0));
  return 260 + Math.pow(safe, 2.25) * 17700;
}
