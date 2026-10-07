export const totalCost = f => Math.round((f.sessionCost + f.shuttleCost * f.shuttleCount + f.otherCost) * 100);
// Integer cents keep equal splits exact. Stable roster order assigns remainder cents.
export function playerFees(state) {
  const f = state.finance, count = state.players.length, total = totalCost(f);
  return state.players.map((p, i) => {
    let cents = 0;
    if (f.feeMode === 'equal') cents = count ? Math.floor(total / count) + (i < total % count ? 1 : 0) : 0;
    if (f.feeMode === 'flat') cents = Math.round(f.flatFee * 100);
    if (f.feeMode === 'per-game') cents = Math.round(f.perGame * 100) * p.gamesPlayed;
    if (f.feeMode === 'combined') cents = Math.round(f.flatFee * 100) + Math.round(f.perGame * 100) * p.gamesPlayed;
    return { player: p, cents };
  });
}
export function financeSummary(s) {
  const fees = playerFees(s);
  const expected = fees.reduce((n, f) => n + f.cents, 0), collected = fees.reduce((n, f) => n + (f.player.paid ? f.cents : 0), 0);
  return { cost: totalCost(s.finance), expected, collected, remaining: expected - collected, paid: s.players.filter(p => p.paid).length };
}
