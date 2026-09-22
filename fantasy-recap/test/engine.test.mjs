import { optimalLineup, computeStandingsWithMovement, computeStandings, computeWeek } from "../src/recapEngine.js";

let fails = 0;
const eq = (label, got, want) => {
  const ok = Math.abs(got - want) < 1e-6;
  console.log(`${ok ? "PASS" : "FAIL"}  ${label}: got ${got}, want ${want}`);
  if (!ok) fails++;
};
const eqv = (label, got, want) => {
  const ok = got === want;
  console.log(`${ok ? "PASS" : "FAIL"}  ${label}: got ${got}, want ${want}`);
  if (!ok) fails++;
};

// ---- optimalLineup ----
const rosterPositions = ["QB","RB","RB","WR","WR","TE","FLEX","SUPER_FLEX","K","DEF","BN","BN"];
const playersMap = {
  QB1:{position:"QB"}, QB2:{position:"QB"},
  RB1:{position:"RB"}, RB2:{position:"RB"}, RB3:{position:"RB"}, RB4:{position:"RB"},
  WR1:{position:"WR"}, WR2:{position:"WR"}, WR3:{position:"WR"},
  TE1:{position:"TE"}, K1:{position:"K"}, DEF1:{position:"DEF"},
};
const entry = {
  roster_id: 1,
  points: 122, // manager's actual (suboptimal) lineup total
  starters: ["QB1","RB1","RB2","WR1","WR2","TE1","WR3","RB4","K1","DEF1"],
  players: ["QB1","QB2","RB1","RB2","RB3","RB4","WR1","WR2","WR3","TE1","K1","DEF1"],
  players_points: {
    QB1:30, QB2:25, RB1:20, RB2:5, RB3:18, RB4:6,
    WR1:15, WR2:12, WR3:10, TE1:8, K1:9, DEF1:7,
  },
};
const opt = optimalLineup(entry, rosterPositions, playersMap);
eq("optimal points", opt.optimalPoints, 154);
eq("actual points", opt.actualPoints, 122);
eq("bench blunder delta", opt.delta, 32);

// ---- standings + movement ----
const g = (mid, rid, pts) => ({ matchup_id: mid, roster_id: rid, points: pts });
const matchupsByWeek = {
  1: [g(1,1,100), g(1,2,90), g(2,3,120), g(2,4,80)],
  2: [g(1,1,70),  g(1,2,110), g(2,3,60), g(2,4,130)],
};
const rosterIdToManager = { 1:"R1", 2:"R2", 3:"R3", 4:"R4" };

const wk1 = computeStandings({ matchupsByWeek, throughWeek: 1, rosterIdToManager });
eqv("wk1 rank1 is R3", wk1[0].manager, "R3");
eqv("wk1 rank2 is R1", wk1[1].manager, "R1");

const wk2 = computeStandingsWithMovement({ matchupsByWeek, throughWeek: 2, rosterIdToManager });
const by = Object.fromEntries(wk2.map(r => [r.manager, r]));
eqv("wk2 rank1 is R4", wk2[0].manager, "R4");
eq("R4 pf", by.R4.pf, 210);
eq("R4 movement +3", by.R4.movement, 3);
eq("R2 movement +1", by.R2.movement, 1);
eq("R3 movement -2", by.R3.movement, -2);
eq("R1 movement -2", by.R1.movement, -2);
eqv("R1 record 1-1", `${by.R1.w}-${by.R1.l}`, "1-1");

// ---- bench blunder: losers only, costGame prioritized, winners excluded ----
// Slots: QB, RB, + 2 bench. Positions are trivial to reason about.
const rp = ["QB", "RB", "BN", "BN"];
const pm = {
  QB1:{position:"QB"}, RB1:{position:"RB"}, RB9:{position:"RB"},        // r1 winner
  QB2:{position:"QB"}, RB2:{position:"RB"}, RB3:{position:"RB"},        // r2 loser
  QB4:{position:"QB"}, RB4:{position:"RB"}, RB5:{position:"RB"},        // r3 loser
  QB5:{position:"QB"}, RB6:{position:"RB"},                            // r4 winner
};
const E = (rid, mid, points, starters, players, pp) => ({ roster_id: rid, matchup_id: mid, points, starters, players, players_points: pp });
const benchEntries = [
  // r1 WON 65-20 but has the LEAGUE'S BIGGEST bench delta (45). Must be excluded.
  E(1, 1, 65, ["QB1","RB1"], ["QB1","RB1","RB9"], { QB1:60, RB1:5, RB9:50 }),
  // r2 LOST 20-65, delta 40, but optimal 60 < 65 -> costGame false.
  E(2, 1, 20, ["QB2","RB2"], ["QB2","RB2","RB3"], { QB2:10, RB2:10, RB3:50 }),
  // r3 LOST 20-45, delta 30, optimal 50 > 45 -> costGame TRUE. Should be picked.
  E(3, 2, 20, ["QB4","RB4"], ["QB4","RB4","RB5"], { QB4:10, RB4:10, RB5:40 }),
  // r4 WON 45-20.
  E(4, 2, 45, ["QB5","RB6"], ["QB5","RB6"], { QB5:30, RB6:15 }),
];
const cw = computeWeek({
  entries: benchEntries,
  rosterPositions: rp,
  rosterIdToManager: { 1:"R1", 2:"R2", 3:"R3", 4:"R4" },
  playersMap: pm,
  thresholds: { blowout: 40, nailbiter: 8 },
});
eqv("bench blunder is a loser (not the winner w/ biggest gap)", cw.benchBlunder.manager, "R3");
eqv("costGame prioritized over bigger raw delta", cw.benchBlunder.costGame, true);
eq("bench blunder delta", cw.benchBlunder.delta, 30);

console.log(fails === 0 ? "\nALL GREEN" : `\n${fails} FAILURE(S)`);
process.exit(fails === 0 ? 0 : 1);
