// ============================================================================
// buildRecap.js — glue between config, the pure engine, and the UI.
// ============================================================================

import {
  LEAGUE_NAME,
  GAME_OF_THE_WEEK,
  SPECIAL_WEEKS,
  RIVALRIES,
} from "./config.js";

const samePair = (a, b) =>
  (a[0] === b[0] && a[1] === b[1]) || (a[0] === b[1] && a[1] === b[0]);

function findGame(games, [x, y]) {
  return games.find((g) =>
    samePair([g.winner.manager, g.loser.manager], [x, y])
  );
}

function rivalryAngleFor([a, b]) {
  if (RIVALRIES.some((r) => samePair(r, [a, b]))) return "a Rivalry Week grudge match";
  return null;
}

// Resolve the Game-of-the-Week block for the given week from the results.
export function resolveGotw(week, games) {
  const special = SPECIAL_WEEKS[week];
  if (special?.kind === "bowl") {
    return {
      type: "bowl",
      title: special.title,
      bowls: special.bowls.map((b) => {
        const g = findGame(games, b.teams);
        return {
          name: b.name,
          teams: b.teams,
          result: g ? `${g.winner.manager} def. ${g.loser.manager}` : null,
          winner: g?.winner || null,
          loser: g?.loser || null,
        };
      }),
    };
  }
  if (special?.kind === "rivalry") return { type: "rivalry", title: special.title };

  const pair = GAME_OF_THE_WEEK[week];
  if (pair === null) return { type: "tbd" };
  if (!pair) return null;
  const g = findGame(games, pair);
  return {
    type: "game",
    teams: pair,
    result: g ? { winner: g.winner, loser: g.loser, margin: g.margin } : null,
  };
}

// What's on tap next week (for the preview section).
export function buildNextWeek(week) {
  const nextPair = GAME_OF_THE_WEEK[week + 1];
  const special = SPECIAL_WEEKS[week + 1];
  if (special?.kind === "rivalry") return { gotw: { type: "rivalry" } };
  if (special?.kind === "bowl") return { gotw: { type: "bowl" } };
  if (nextPair === null) return { gotw: { type: "tbd" } };
  if (!nextPair) return null;
  return {
    gotw: { type: "game", teams: nextPair },
    rivalryAngle: rivalryAngleFor(nextPair),
  };
}

// Assemble the facts payload sent to /api/recap and used to render.
export function assembleFacts({ week, computed, standings, gotw, nextWeek }) {
  return {
    leagueName: LEAGUE_NAME,
    week,
    games: computed.games,
    superlatives: {
      highTeam: computed.highTeam,
      lowTeam: computed.lowTeam,
      performance: computed.performance,
      benchBlunder: computed.benchBlunder,
    },
    gotw,
    standings,
    nextWeek,
  };
}

// Deterministic plain-text version for the league chat. Real numbers come from
// computed data; the AI only supplies the flavor lines. Light emoji, no
// markdown that Sleeper/iMessage would mangle.
export function buildChatText(facts, flavor) {
  const L = [];
  L.push(`🏈 ${facts.leagueName} — WEEK ${facts.week} RECAP`);
  if (flavor?.headline) L.push(flavor.headline);
  L.push("");

  L.push("📋 SCOREBOARD");
  for (const g of facts.games) {
    const tag = g.tag === "blowout" ? " 💥" : g.tag === "nailbiter" ? " 😬" : "";
    L.push(`• ${g.winner.manager} ${g.winner.points} — ${g.loser.points} ${g.loser.manager}${tag}`);
  }
  L.push("");

  const s = facts.superlatives;
  L.push("⭐ SUPERLATIVES");
  L.push(`• Top score: ${s.highTeam.manager} (${s.highTeam.points})`);
  L.push(`• Low score: ${s.lowTeam.manager} (${s.lowTeam.points})`);
  L.push(`• Performance of the week: ${s.performance.player} — ${s.performance.points} (${s.performance.manager})`);
  if (s.benchBlunder) {
    const note = s.benchBlunder.costGame ? " — cost them the win" : "";
    L.push(`• Bench blunder: ${s.benchBlunder.manager} left ${s.benchBlunder.delta} on the bench in a loss${note}`);
  } else {
    L.push(`• Bench blunder: none — the losers all started their best lineup`);
  }
  L.push("");

  if (facts.gotw?.type === "game" && facts.gotw.result) {
    L.push("🎯 GAME OF THE WEEK");
    L.push(`${facts.gotw.result.winner.manager} ${facts.gotw.result.winner.points} def. ${facts.gotw.result.loser.manager} ${facts.gotw.result.loser.points}`);
    if (flavor?.gotw_blurb) L.push(flavor.gotw_blurb);
    L.push("");
  } else if (facts.gotw?.type === "bowl") {
    L.push(`🎯 ${facts.gotw.title.toUpperCase()}`);
    for (const b of facts.gotw.bowls) L.push(`• ${b.name}: ${b.result || b.teams.join(" vs ")}`);
    L.push("");
  } else if (facts.gotw?.type === "rivalry") {
    L.push("🎯 RIVALRY WEEK — grudge matches all around.");
    L.push("");
  }

  L.push("🏆 STANDINGS");
  for (const r of facts.standings) {
    const move = r.movement > 0 ? ` ▲${r.movement}` : r.movement < 0 ? ` ▼${Math.abs(r.movement)}` : "";
    L.push(`${r.rank}. ${r.manager} ${r.w}-${r.l}${r.t ? "-" + r.t : ""} (${r.pf})${move}`);
  }
  L.push("");

  if (flavor?.roast) {
    L.push("🔥 ROAST CORNER");
    L.push(flavor.roast);
    L.push("");
  }
  if (flavor?.preview) {
    L.push("👀 NEXT WEEK");
    L.push(flavor.preview);
  }
  return L.join("\n").trim();
}
