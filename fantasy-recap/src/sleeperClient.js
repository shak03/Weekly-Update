// ============================================================================
// sleeperClient.js — thin wrapper over the read-only Sleeper API.
// NOTE: Sleeper blocks CORS from inside Claude artifact previews, so this only
// returns real data once deployed (Vercel) or run via `npm run dev` locally.
// ============================================================================

import { LEAGUE_ID, HANDLE_TO_MANAGER } from "./config.js";

const BASE = "https://api.sleeper.app/v1";

async function getJSON(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Sleeper ${res.status} on ${url}`);
  return res.json();
}

export const getState = () => getJSON(`${BASE}/state/nfl`);
export const getLeague = () => getJSON(`${BASE}/league/${LEAGUE_ID}`);
export const getUsers = () => getJSON(`${BASE}/league/${LEAGUE_ID}/users`);
export const getRosters = () => getJSON(`${BASE}/league/${LEAGUE_ID}/rosters`);
export const getMatchups = (week) =>
  getJSON(`${BASE}/league/${LEAGUE_ID}/matchups/${week}`);

// ---------------------------------------------------------------------------
// Players map (~5MB). Cache in localStorage for 24h so we don't re-pull it on
// every load / week change.
// ---------------------------------------------------------------------------
const PLAYERS_KEY = "ccff_players_nfl";
const PLAYERS_TS_KEY = "ccff_players_nfl_ts";
const DAY_MS = 24 * 60 * 60 * 1000;

export async function getPlayers() {
  try {
    const ts = Number(localStorage.getItem(PLAYERS_TS_KEY) || 0);
    const cached = localStorage.getItem(PLAYERS_KEY);
    if (cached && Date.now() - ts < DAY_MS) return JSON.parse(cached);
  } catch {
    /* localStorage unavailable or quota — fall through to network */
  }
  const players = await getJSON(`${BASE}/players/nfl`);
  try {
    localStorage.setItem(PLAYERS_KEY, JSON.stringify(players));
    localStorage.setItem(PLAYERS_TS_KEY, String(Date.now()));
  } catch {
    /* too big to cache on this browser — that's fine, just slower */
  }
  return players;
}

// ---------------------------------------------------------------------------
// roster_id -> manager name, using the manual pin in config. Matches a roster
// owner's display_name OR username, case-insensitively. Returns unresolved
// handles so the UI can warn instead of silently misrouting.
// ---------------------------------------------------------------------------
export function buildRosterMap(users, rosters) {
  const userById = Object.fromEntries(users.map((u) => [u.user_id, u]));
  const rosterIdToManager = {};
  const unresolved = [];
  for (const r of rosters) {
    const u = userById[r.owner_id];
    const handle = (u?.display_name || u?.username || "").toLowerCase();
    const manager = HANDLE_TO_MANAGER[handle];
    if (manager) {
      rosterIdToManager[r.roster_id] = manager;
    } else {
      rosterIdToManager[r.roster_id] = u?.display_name || `Roster ${r.roster_id}`;
      unresolved.push(u?.display_name || u?.username || `roster ${r.roster_id}`);
    }
  }
  return { rosterIdToManager, unresolved };
}

// A week is "playable" for us if its matchups exist and someone has scored.
export function weekHasScores(entries) {
  return Array.isArray(entries) && entries.some((e) => Number(e.points || 0) > 0);
}
