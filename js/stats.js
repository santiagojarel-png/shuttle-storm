export function deriveStats(state) {
  const stats = Object.fromEntries(state.players.map(p => [p.id, { gamesPlayed: 0, wins: 0, losses: 0, lastPlayedAt: null }]));
  for (const match of state.completedMatches) {
    match.teams.forEach((team, side) => team.forEach(id => {
      const p = stats[id];
      p.gamesPlayed++;
      p[match.winner === side ? 'wins' : 'losses']++;
      if (!p.lastPlayedAt || match.completedAt > p.lastPlayedAt) p.lastPlayedAt = match.completedAt;
    }));
  }
  return stats;
}
export function recalculate(state) {
  const stats = deriveStats(state);
  for (const p of state.players) {
    Object.assign(p, stats[p.id]);
    p.currentMatchId = state.activeMatches.find(m => m.teams.flat().includes(p.id))?.id ?? null;
  }
  return state;
}
export const winPercentage = p => p.gamesPlayed ? Math.round(p.wins / p.gamesPlayed * 100) : 0;
export function csv(rows) {
  // Spreadsheet formulas can execute when a CSV is opened. Treat every cell as data.
  return '\uFEFF' + rows.map(row => row.map(value => {
    let text = String(value ?? '');
    if (/^[\s]*[=+@-]/.test(text)) text = "'" + text;
    return '"' + text.replaceAll('"', '""') + '"';
  }).join(',')).join('\r\n');
}
