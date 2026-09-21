// ============================================================================
// recapEngine.js — pure functions. Given already-fetched Sleeper data, compute
// every number the recap needs. No fetch, no React, no side effects, so this
// file can be unit-tested directly with node.
// ============================================================================

const round2 = (n) => Math.round((n + Number.EPSILON) * 100) / 100;

// Slot label -> set of positions eligible to fill it.
const SLOT_ELIGIBILITY = {
  QB: ["QB"],
  RB: ["RB"],
  WR: ["WR"],
  TE: ["TE"],
  K: ["K"],
  DEF: ["DEF"],
  DST: ["DEF"],
  FLEX: ["RB", "WR", "TE"],
  WRRB_FLEX: ["RB", "WR"],
  REC_FLEX: ["WR", "TE"],
  SUPER_FLEX: ["QB", "RB", "WR", "TE"],
  IDP_FLEX: ["DL", "LB", "DB"],
};
const BENCH_SLOTS = new Set(["BN", "IR", "TAXI"]);

function eligSet(slot) {
  return new Set(SLOT_ELIGIBILITY[slot] || [slot]);
}

function playerPosition(pid, playersMap) {
  const p = playersMap[pid];
  if (!p) return "UNK";
  return p.position || (p.fantasy_positions && p.fantasy_positions[0]) || "UNK";
}

export function playerName(pid, playersMap) {
  const p = playersMap[pid];
  if (!p) return String(pid);
  const full = [p.first_name, p.last_name].filter(Boolean).join(" ").trim();
  return full || p.last_name || p.first_name || String(pid);
}

// ---------------------------------------------------------------------------
// Optimal lineup / bench blunder for a single matchup entry.
//
// Greedy assignment, filling the most-restrictive starting slots first and
// taking the highest-scoring unused eligible player each time. This is
// provably optimal when flex eligibility is NESTED (dedicated slot ⊂ FLEX ⊂
// SUPER_FLEX), which is exactly standard fantasy — including this league's
// superflex setup. Exotic overlapping flexes (e.g. a WR/RB flex AND a WR/TE
// flex in the same lineup) would need max-weight matching; flagged here so
// nobody assumes this handles that case.
// ---------------------------------------------------------------------------
export function optimalLineup(entry, rosterPositions, playersMap) {
  const pts = entry.players_points || {};
  const candidates = (entry.players || []).map((pid) => ({
    pid,
    points: Number(pts[pid] ?? 0),
    position: playerPosition(pid, playersMap),
  }));

  const slots = rosterPositions
    .filter((s) => !BENCH_SLOTS.has(s))
    .map((slot) => ({ slot, elig: eligSet(slot) }))
    .sort((a, b) => a.elig.size - b.elig.size); // most restrictive first

  const used = new Set();
  let optimal = 0;
  const chosen = [];
  for (const { slot, elig } of slots) {
    let best = null;
    for (const c of candidates) {
      if (used.has(c.pid)) continue;
      if (!elig.has(c.position)) continue;
      if (best === null || c.points > best.points) best = c;
    }
    if (best) {
      used.add(best.pid);
      optimal += best.points;
      chosen.push({ slot, pid: best.pid, points: best.points });
    }
  }

  const actual =
    typeof entry.points === "number"
      ? entry.points
      : (entry.starters_points || []).reduce((a, b) => a + Number(b || 0), 0);

  return {
    optimalPoints: round2(optimal),
    actualPoints: round2(actual),
    delta: round2(optimal - actual), // >= 0 ; points left on the bench
    chosen,
  };
}

// ---------------------------------------------------------------------------
// Pair raw matchup entries into games by matchup_id.
// ---------------------------------------------------------------------------
function pairMatchups(entries) {
  const byId = new Map();
  for (const e of entries || []) {
    if (e.matchup_id == null) continue;
    if (!byId.has(e.matchup_id)) byId.set(e.matchup_id, []);
    byId.get(e.matchup_id).push(e);
  }
  const games = [];
  for (const pair of byId.values()) {
    if (pair.length === 2) games.push(pair);
  }
  return games;
}

// ---------------------------------------------------------------------------
// Everything about one week's results.
//   entries          : /league/<id>/matchups/<week>
//   rosterPositions  : league.roster_positions
//   rosterIdToManager: { roster_id -> "Manager Name" }
//   playersMap       : /players/nfl
//   thresholds       : { blowout, nailbiter }
// ---------------------------------------------------------------------------
export function computeWeek({
  entries,
  rosterPositions,
  rosterIdToManager,
  playersMap,
  thresholds,
}) {
  const nameOf = (rid) => rosterIdToManager[rid] || `Roster ${rid}`;
  const games = pairMatchups(entries).map((pair, i) => {
    // Sort so higher score is "winner" side; keep both.
    const [a, b] = pair[0].points >= pair[1].points ? pair : [pair[1], pair[0]];
    const margin = round2(Math.abs(a.points - b.points));
    let tag = null;
    if (margin >= thresholds.blowout) tag = "blowout";
    else if (margin <= thresholds.nailbiter) tag = "nailbiter";
    return {
      id: `g${i + 1}`,
      winner: { manager: nameOf(a.roster_id), points: round2(a.points), rosterId: a.roster_id },
      loser: { manager: nameOf(b.roster_id), points: round2(b.points), rosterId: b.roster_id },
      margin,
      tie: a.points === b.points,
      tag,
    };
  });

  // High / low scoring team of the week.
  let highTeam = null;
  let lowTeam = null;
  for (const e of entries || []) {
    const t = { manager: nameOf(e.roster_id), points: round2(e.points) };
    if (!highTeam || t.points > highTeam.points) highTeam = t;
    if (!lowTeam || t.points < lowTeam.points) lowTeam = t;
  }

  // Performance of the week: best individual STARTER across the league.
  let performance = null;
  for (const e of entries || []) {
    const pp = e.players_points || {};
    for (const pid of e.starters || []) {
      const points = Number(pp[pid] ?? 0);
      if (!performance || points > performance.points) {
        performance = {
          manager: nameOf(e.roster_id),
          pid,
          player: playerName(pid, playersMap),
          position: playerPosition(pid, playersMap),
          points: round2(points),
        };
      }
    }
  }

  // Bench blunder: biggest gap between optimal and actual.
  let benchBlunder = null;
  for (const e of entries || []) {
    const opt = optimalLineup(e, rosterPositions, playersMap);
    if (!benchBlunder || opt.delta > benchBlunder.delta) {
      benchBlunder = { manager: nameOf(e.roster_id), ...opt };
    }
  }

  return { week: null, games, highTeam, lowTeam, performance, benchBlunder };
}

// ---------------------------------------------------------------------------
// Standings reconstructed from scratch through a given week.
//   matchupsByWeek: { week -> entries[] }  (only completed weeks)
// Sort: wins desc, then points-for desc. Ties tracked as T.
// ---------------------------------------------------------------------------
export function computeStandings({ matchupsByWeek, throughWeek, rosterIdToManager }) {
  const rec = {}; // rosterId -> {w,l,t,pf}
  const touch = (rid) => (rec[rid] ||= { rosterId: rid, w: 0, l: 0, t: 0, pf: 0 });

  for (let w = 1; w <= throughWeek; w++) {
    const entries = matchupsByWeek[w];
    if (!entries || entries.length === 0) continue;
    for (const e of entries) touch(e.roster_id).pf += Number(e.points || 0);
    for (const [a, b] of pairMatchups(entries)) {
      const ra = touch(a.roster_id);
      const rb = touch(b.roster_id);
      if (a.points > b.points) { ra.w++; rb.l++; }
      else if (a.points < b.points) { rb.w++; ra.l++; }
      else { ra.t++; rb.t++; }
    }
  }

  const rows = Object.values(rec).map((r) => ({
    ...r,
    pf: round2(r.pf),
    manager: rosterIdToManager[r.rosterId] || `Roster ${r.rosterId}`,
  }));
  rows.sort((x, y) => y.w - x.w || y.pf - x.pf);
  rows.forEach((r, i) => (r.rank = i + 1));
  return rows;
}

// Standings + movement vs. the prior completed week.
// movement > 0  => moved UP that many spots.
export function computeStandingsWithMovement({ matchupsByWeek, throughWeek, rosterIdToManager }) {
  const now = computeStandings({ matchupsByWeek, throughWeek, rosterIdToManager });
  if (throughWeek <= 1) return now.map((r) => ({ ...r, movement: 0, isNew: true }));
  const prev = computeStandings({ matchupsByWeek, throughWeek: throughWeek - 1, rosterIdToManager });
  const prevRank = Object.fromEntries(prev.map((r) => [r.rosterId, r.rank]));
  return now.map((r) => {
    const before = prevRank[r.rosterId];
    return { ...r, movement: before == null ? 0 : before - r.rank, isNew: before == null };
  });
}

export const _internal = { pairMatchups, eligSet, round2 };
