import { useEffect, useMemo, useRef, useState } from "react";
import { toPng } from "html-to-image";
import RecapPoster from "./RecapPoster.jsx";
import {
  getState, getLeague, getUsers, getRosters, getMatchups, getPlayers, getTransactions,
  buildRosterMap, weekHasScores,
} from "./sleeperClient.js";
import { computeWeek, computeStandingsWithMovement } from "./recapEngine.js";
import { resolveGotw, buildNextWeek, assembleFacts, buildChatText, buildTrades, buildNextSlate } from "./buildRecap.js";
import { LEAGUE_NAME, BLOWOUT_MARGIN, NAILBITER_MARGIN, LAST_REGULAR_WEEK, RECENT_TRADE_WEEKS, MAX_TRADES_SHOWN } from "./config.js";
import "./recap.css";

const thresholds = { blowout: BLOWOUT_MARGIN, nailbiter: NAILBITER_MARGIN };

export default function App() {
  const [boot, setBoot] = useState({ status: "loading", error: null });
  const [ctx, setCtx] = useState(null); // { league, rosterIdToManager, playersMap, matchupsByWeek, weeks, unresolved }
  const [week, setWeek] = useState(null);
  const [facts, setFacts] = useState(null);
  const [flavor, setFlavor] = useState(null);
  const [aiState, setAiState] = useState("idle"); // idle | loading | error
  const [copied, setCopied] = useState(false);
  const [posting, setPosting] = useState("idle"); // idle | posting | done | error
  const [notes, setNotes] = useState(""); // commish notes for the selected week
  const posterRef = useRef(null);

  // ---- boot: pull everything once ----
  useEffect(() => {
    (async () => {
      try {
        const [state, league, users, rosters, playersMap] = await Promise.all([
          getState(), getLeague(), getUsers(), getRosters(), getPlayers(),
        ]);
        const { rosterIdToManager, unresolved } = buildRosterMap(users, rosters);
        const current = Math.min(Number(state.week) || 1, LAST_REGULAR_WEEK);

        const results = await Promise.all(
          Array.from({ length: current }, (_, i) => i + 1).map(async (w) => {
            try { return [w, await getMatchups(w)]; } catch { return [w, null]; }
          })
        );
        const matchupsByWeek = {};
        const weeks = [];
        for (const [w, entries] of results) {
          if (weekHasScores(entries)) { matchupsByWeek[w] = entries; weeks.push(w); }
        }

        if (weeks.length === 0) {
          setCtx({ league, rosterIdToManager, playersMap, matchupsByWeek, weeks, unresolved });
          setBoot({ status: "empty", error: null });
          return;
        }
        setCtx({ league, rosterIdToManager, playersMap, matchupsByWeek, weeks, unresolved });
        setWeek(Math.max(...weeks));
        setBoot({ status: "ready", error: null });
      } catch (err) {
        setBoot({ status: "error", error: String(err) });
      }
    })();
  }, []);

  // ---- compute the selected week + fetch AI flavor ----
  useEffect(() => {
    if (!ctx || week == null) return;
    let cancelled = false;
    (async () => {
      const computed = computeWeek({
        entries: ctx.matchupsByWeek[week],
        rosterPositions: ctx.league.roster_positions,
        rosterIdToManager: ctx.rosterIdToManager,
        playersMap: ctx.playersMap,
        thresholds,
      });
      const standings = computeStandingsWithMovement({
        matchupsByWeek: ctx.matchupsByWeek,
        throughWeek: week,
        rosterIdToManager: ctx.rosterIdToManager,
      });
      const gotw = resolveGotw(week, computed.games);
      const nextWeek = buildNextWeek(week);
      const trades = await loadRecentTrades(ctx, week);
      const nextSlate = await loadNextSlate(ctx, week, standings);
      if (cancelled) return;
      const f = assembleFacts({ week, computed, standings, gotw, nextWeek, trades, nextSlate });
      setFacts(f);
      setFlavor(null);
      setCopied(false);
      const savedNotes = readNotes(week);
      setNotes(savedNotes);
      fetchFlavor(f, savedNotes);
    })();
    return () => { cancelled = true; };
  }, [ctx, week]);

  async function loadRecentTrades(ctx, week) {
    const weeks = [];
    for (let w = week; w > week - RECENT_TRADE_WEEKS && w >= 1; w--) weeks.push(w);
    const all = [];
    for (const w of weeks) {
      try {
        const tx = await getTransactions(w);
        if (Array.isArray(tx)) all.push(...tx);
      } catch { /* no transactions for that week */ }
    }
    return buildTrades(all, ctx.rosterIdToManager, ctx.playersMap).slice(0, MAX_TRADES_SHOWN);
  }

  async function loadNextSlate(ctx, week, standings) {
    if (week + 1 > LAST_REGULAR_WEEK) return null;
    try {
      const entries = await getMatchups(week + 1);
      return buildNextSlate(entries, ctx.rosterIdToManager, standings);
    } catch {
      return null;
    }
  }

  const notesKey = (w) => `ccff_notes_w${w}`;
  function readNotes(w) {
    try { return localStorage.getItem(notesKey(w)) || ""; } catch { return ""; }
  }
  function regenerateWithNotes() {
    if (!facts) return;
    try { localStorage.setItem(notesKey(facts.week), notes); } catch { /* ignore */ }
    fetchFlavor(facts, notes);
  }

  async function fetchFlavor(f, n = "") {
    setAiState("loading");
    try {
      const res = await fetch("/api/recap", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ facts: { ...f, notes: n } }),
      });
      if (!res.ok) throw new Error(await res.text());
      const data = await res.json();
      setFlavor(data.flavor);
      setAiState("idle");
    } catch {
      setAiState("error"); // page still works; flavor lines just won't show
    }
  }

  const chatText = useMemo(
    () => (facts ? buildChatText(facts, flavor) : ""),
    [facts, flavor]
  );

  async function copyChat() {
    try { await navigator.clipboard.writeText(chatText); setCopied(true); setTimeout(() => setCopied(false), 2000); }
    catch { /* clipboard blocked */ }
  }

  async function postDiscord() {
    if (!facts) return;
    setPosting("posting");
    try {
      let body;
      try {
        if (document?.fonts?.ready) await document.fonts.ready;
        const dataUrl = await toPng(posterRef.current, {
          pixelRatio: 2,
          cacheBust: true,
          backgroundColor: "#0b0e13",
        });
        body = { imageBase64: dataUrl.split(",")[1], week: facts.week };
      } catch {
        // couldn't rasterize (font/canvas hiccup) — still post something useful
        body = { text: chatText, week: facts.week };
      }
      const res = await fetch("/api/discord", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) throw new Error(await res.text());
      setPosting("done"); setTimeout(() => setPosting("idle"), 2500);
    } catch {
      setPosting("error"); setTimeout(() => setPosting("idle"), 3500);
    }
  }

  if (boot.status === "loading") return <Shell><p className="muted">Loading league data…</p></Shell>;
  if (boot.status === "error")
    return <Shell><p className="error">Couldn't reach Sleeper. {boot.error}<br/><span className="muted">If you're viewing this inside a preview, deploy it — Sleeper blocks preview requests.</span></p></Shell>;
  if (boot.status === "empty")
    return <Shell><p className="muted">No games scored yet this season. Check back after Week 1 wraps.</p></Shell>;

  return (
    <Shell>
      <header className="topbar">
        <div>
          <h1>{LEAGUE_NAME} <span className="thin">Weekly Recap</span></h1>
          {ctx.unresolved.length > 0 && (
            <p className="warn">Unmapped Sleeper handle(s): {ctx.unresolved.join(", ")}. Add them to HANDLE_TO_MANAGER in config.js.</p>
          )}
        </div>
        <div className="controls">
          <label className="weekpick">
            Week
            <select value={week} onChange={(e) => setWeek(Number(e.target.value))}>
              {[...ctx.weeks].sort((a, b) => b - a).map((w) => <option key={w} value={w}>Week {w}</option>)}
            </select>
          </label>
          <button className="btn" onClick={copyChat}>{copied ? "Copied ✓" : "Copy for chat"}</button>
          <button className="btn ghost" onClick={postDiscord} disabled={posting === "posting"}>
            {posting === "posting" ? "Posting…" : posting === "done" ? "Posted ✓" : posting === "error" ? "Failed — retry" : "Post to Discord"}
          </button>
        </div>
      </header>

      {facts && (
        <main>
          <CommishNotes notes={notes} setNotes={setNotes} onRegenerate={regenerateWithNotes} busy={aiState === "loading"} />
          <Headline flavor={flavor} aiState={aiState} onRetry={() => fetchFlavor(facts, notes)} />
          <Scoreboard facts={facts} flavor={flavor} />
          <Superlatives facts={facts} flavor={flavor} />
          <GameOfWeek facts={facts} flavor={flavor} />
          <Preview facts={facts} flavor={flavor} />
          <Trades facts={facts} />
          <Standings facts={facts} />
          <Roast flavor={flavor} />
        </main>
      )}

      {facts && (
        <div className="poster-stage" aria-hidden="true">
          <RecapPoster ref={posterRef} facts={facts} flavor={flavor} />
        </div>
      )}
    </Shell>
  );
}

function CommishNotes({ notes, setNotes, onRegenerate, busy }) {
  return (
    <section className="notes">
      <label className="notes-label" htmlFor="commish-notes">Commish notes <span className="muted">(what the box score can't show — the AI builds around these)</span></label>
      <textarea
        id="commish-notes"
        rows={3}
        value={notes}
        onChange={(e) => setNotes(e.target.value)}
        placeholder="e.g. Brett beat Jace on the last run of the Sunday night game. Joey talked trash all week."
      />
      <button className="btn" onClick={onRegenerate} disabled={busy}>{busy ? "Writing…" : "Regenerate recap"}</button>
    </section>
  );
}

function Shell({ children }) {
  return <div className="wrap">{children}</div>;
}

function Headline({ flavor, aiState, onRetry }) {
  return (
    <section className="hero">
      {flavor?.headline
        ? <h2 className="headline">{flavor.headline}</h2>
        : aiState === "loading"
          ? <h2 className="headline dim">Writing the recap…</h2>
          : aiState === "error"
            ? <h2 className="headline dim">Flavor text unavailable. <button className="link" onClick={onRetry}>Retry</button> <span className="muted">(numbers below are still live)</span></h2>
            : <h2 className="headline dim">&nbsp;</h2>}
    </section>
  );
}

function Scoreboard({ facts, flavor }) {
  return (
    <section className="block">
      <h3 className="sectlabel">Scoreboard</h3>
      <div className="games">
        {facts.games.map((g) => (
          <article key={g.id} className={`game ${g.tag || ""}`}>
            <div className="row">
              <span className="mgr win">{g.winner.manager}</span>
              <span className="pts">{g.winner.points}</span>
            </div>
            <div className="row loser">
              <span className="mgr">{g.loser.manager}</span>
              <span className="pts">{g.loser.points}</span>
            </div>
            <div className="gmeta">
              {g.tag === "blowout" && <span className="chip blowout">💥 Blowout</span>}
              {g.tag === "nailbiter" && <span className="chip nailbiter">😬 Nail-biter</span>}
              <span className="margin">by {g.margin}</span>
            </div>
            {flavor?.quips?.[g.id] && <p className="quip">{flavor.quips[g.id]}</p>}
          </article>
        ))}
      </div>
    </section>
  );
}

function Superlatives({ facts, flavor }) {
  const s = facts.superlatives;
  return (
    <section className="block">
      <h3 className="sectlabel">Superlatives</h3>
      <div className="supers">
        <Stat k="Top score" v={s.highTeam.manager} n={s.highTeam.points} tone="hype" />
        <Stat k="Low score" v={s.lowTeam.manager} n={s.lowTeam.points} tone="cold" />
        <Stat k="Performance of the week" v={`${s.performance.player} · ${s.performance.manager}`} n={s.performance.points} tone="hype" />
        {s.benchBlunder
          ? <Stat k={s.benchBlunder.costGame ? "Bench blunder · cost the win" : "Bench blunder"} v={s.benchBlunder.manager} n={`-${s.benchBlunder.delta}`} tone="cold" sub={`started ${s.benchBlunder.actualPoints} · optimal ${s.benchBlunder.optimalPoints}`} />
          : <Stat k="Bench blunder" v="None — losers started their best" n="—" tone="cold" />}
      </div>
      {flavor?.superlatives && <p className="prose">{flavor.superlatives}</p>}
    </section>
  );
}

function Stat({ k, v, n, tone, sub }) {
  return (
    <div className={`stat ${tone}`}>
      <div className="stat-k">{k}</div>
      <div className="stat-v">{v}</div>
      <div className="stat-n">{n}</div>
      {sub && <div className="stat-sub">{sub}</div>}
    </div>
  );
}

function GameOfWeek({ facts, flavor }) {
  const g = facts.gotw;
  if (!g) return null;
  return (
    <section className="block gotw">
      <h3 className="sectlabel gold">
        {g.type === "bowl" || g.type === "rivalry" ? facts.gotw.title || (g.type === "rivalry" ? "Rivalry Week" : "Bowl Week") : "Game of the Week"}
      </h3>
      {g.type === "game" && g.result && (
        <div className="gotw-line">
          <strong>{g.result.winner.manager}</strong> {g.result.winner.points}
          <span className="def">def.</span>
          <strong>{g.result.loser.manager}</strong> {g.result.loser.points}
        </div>
      )}
      {g.type === "game" && !g.result && <p className="muted">Featured: {g.teams.join(" vs ")} (not scored yet)</p>}
      {g.type === "bowl" && (
        <ul className="bowls">
          {g.bowls.map((b) => <li key={b.name}><span className="bowlname">{b.name}</span> — {b.result || b.teams.join(" vs ")}</li>)}
        </ul>
      )}
      {g.type === "rivalry" && <p className="muted">Grudge matches across the whole slate.</p>}
      {g.type === "tbd" && <p className="muted">Featured game TBD by the league.</p>}
      {flavor?.gotw_blurb && <p className="prose">{flavor.gotw_blurb}</p>}
    </section>
  );
}

function Standings({ facts }) {
  return (
    <section className="block">
      <h3 className="sectlabel">Standings</h3>
      <table className="standings">
        <thead><tr><th>#</th><th>Manager</th><th>Rec</th><th>PF</th><th></th></tr></thead>
        <tbody>
          {facts.standings.map((r) => (
            <tr key={r.rosterId}>
              <td className="rank">{r.rank}</td>
              <td>{r.manager}</td>
              <td>{r.w}-{r.l}{r.t ? `-${r.t}` : ""}</td>
              <td>{r.pf}</td>
              <td className="move">
                {r.movement > 0 && <span className="up">▲{r.movement}</span>}
                {r.movement < 0 && <span className="down">▼{Math.abs(r.movement)}</span>}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}

function Roast({ flavor }) {
  if (!flavor?.roast) return null;
  return (
    <section className="block roast">
      <h3 className="sectlabel red">Roast corner</h3>
      <p className="prose">{flavor.roast}</p>
    </section>
  );
}

function Preview({ facts, flavor }) {
  const nw = facts.nextWeek;
  if (!nw && !flavor?.preview) return null;
  return (
    <section className="block">
      <h3 className="sectlabel">Next week</h3>
      {nw?.gotw?.teams && <div className="preview-line">Game of the Week: <strong>{nw.gotw.teams.join(" vs ")}</strong>{nw.rivalryAngle ? ` · ${nw.rivalryAngle}` : ""}</div>}
      {nw?.gotw?.type === "rivalry" && <div className="preview-line">Rivalry Week.</div>}
      {nw?.gotw?.type === "bowl" && <div className="preview-line">Bowl Week.</div>}
      {flavor?.preview && <p className="prose">{flavor.preview}</p>}
    </section>
  );
}

function Trades({ facts }) {
  if (!facts.trades?.length) return null;
  return (
    <section className="block">
      <h3 className="sectlabel gold">Recent trades</h3>
      <div className="trades">
        {facts.trades.map((t) => (
          <div key={t.id} className="trade">
            {t.parties.map((p, i) => (
              <div key={i} className="trade-side">
                <span className="trade-mgr">{p.manager} gets</span>{" "}
                <span className="trade-assets">{p.receives.length ? p.receives.join(", ") : "—"}</span>
              </div>
            ))}
          </div>
        ))}
      </div>
    </section>
  );
}
