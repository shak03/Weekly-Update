import { forwardRef } from "react";

// Wide, landscape rendering of the recap for the Discord post. Two-column body
// (scoreboard + superlatives | game of the week + next week + standings) keeps
// it short and wide so Discord shows it large in-feed. Game of the Week sits at
// the top-right; the tall standings block anchors the bottom so the right
// column fills to match the left. System-font stack, no emoji.
const RecapPoster = forwardRef(function RecapPoster({ facts, flavor }, ref) {
  const s = facts.superlatives;
  const g = facts.gotw;
  const nw = facts.nextWeek;
  const gotwLabel =
    g && (g.type === "bowl" || g.type === "rivalry")
      ? g.title || (g.type === "rivalry" ? "Rivalry Week" : "Bowl Week")
      : "Game of the Week";

  return (
    <div className="poster" ref={ref}>
      <div className="p-head">
        <div>
          <div className="p-kicker">CCFF FANTASY</div>
          <div className="p-title">Weekly Recap</div>
        </div>
        <div className="p-week">WK {facts.week}</div>
      </div>

      {flavor?.headline && <div className="p-headline">{flavor.headline}</div>}

      <div className="p-body">
        {/* LEFT: scoreboard + superlatives */}
        <div className="p-col">
          <div className="p-label">Scoreboard</div>
          <div className="p-games">
            {facts.games.map((game) => (
              <div key={game.id} className={`p-game ${game.tag || ""}`}>
                <div className="p-grow"><span className="p-mgr">{game.winner.manager}</span><span className="p-pts">{game.winner.points}</span></div>
                <div className="p-grow p-loser"><span className="p-mgr">{game.loser.manager}</span><span className="p-pts">{game.loser.points}</span></div>
                <div className="p-gtag">
                  {game.tag === "blowout" && <span className="p-chip gold">BLOWOUT</span>}
                  {game.tag === "nailbiter" && <span className="p-chip green">NAIL-BITER</span>}
                  <span className="p-margin">by {game.margin}</span>
                </div>
              </div>
            ))}
          </div>

          <div className="p-label">Superlatives</div>
          <div className="p-supers">
            <PStat k="Top score" v={s.highTeam.manager} n={s.highTeam.points} tone="gold" />
            <PStat k="Low score" v={s.lowTeam.manager} n={s.lowTeam.points} tone="red" />
            <PStat k="Performance of the week" v={`${s.performance.player} · ${s.performance.manager}`} n={s.performance.points} tone="gold" />
            {s.benchBlunder
              ? <PStat k={s.benchBlunder.costGame ? "Bench blunder · cost the win" : "Bench blunder"} v={s.benchBlunder.manager} n={`-${s.benchBlunder.delta}`} tone="red" />
              : <PStat k="Bench blunder" v="None — losers started their best" n="—" tone="red" />}
          </div>
        </div>

        {/* RIGHT: game of the week + next week (top), then standings */}
        <div className="p-col">
          <div className="p-label gold">{gotwLabel}</div>
          <div className="p-gotw">
            {g?.type === "game" && g.result && <span><b>{g.result.winner.manager}</b> {g.result.winner.points} &nbsp;def.&nbsp; <b>{g.result.loser.manager}</b> {g.result.loser.points}</span>}
            {g?.type === "game" && !g.result && <span>{g.teams.join("  vs  ")}</span>}
            {g?.type === "bowl" && <span>{g.bowls.map((b) => `${b.name}: ${b.result || b.teams.join(" vs ")}`).join("    •    ")}</span>}
            {g?.type === "rivalry" && <span>Grudge matches across the whole slate.</span>}
            {g?.type === "tbd" && <span>Featured game TBD by the league.</span>}
          </div>
          {flavor?.gotw_blurb && <div className="p-blurb">{flavor.gotw_blurb}</div>}

          {(nw || flavor?.preview) && (
            <>
              {nw && (
                <div className="p-next">
                  <span className="p-nextlabel">NEXT WEEK</span>
                  {nw.gotw?.teams ? <b>{nw.gotw.teams.join("  vs  ")}</b>
                    : nw.gotw?.type === "rivalry" ? <b>Rivalry Week</b>
                    : nw.gotw?.type === "bowl" ? <b>Bowl Week</b> : null}
                  {nw.rivalryAngle ? <span className="p-angle"> · {nw.rivalryAngle}</span> : null}
                </div>
              )}
              {flavor?.preview && <div className="p-blurb">{flavor.preview}</div>}
            </>
          )}

          <div className="p-label">Standings</div>
          <div className="p-standings">
            {facts.standings.map((r) => (
              <div key={r.rosterId} className="p-strow">
                <span className="p-rank">{r.rank}</span>
                <span className="p-name">{r.manager}</span>
                <span className="p-rec">{r.w}-{r.l}{r.t ? `-${r.t}` : ""}</span>
                <span className="p-pf">{r.pf}</span>
                <span className={`p-move ${r.movement > 0 ? "up" : r.movement < 0 ? "down" : ""}`}>
                  {r.movement > 0 ? `▲${r.movement}` : r.movement < 0 ? `▼${Math.abs(r.movement)}` : "—"}
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {flavor?.roast && (
        <>
          <div className="p-label red">Roast corner</div>
          <div className="p-roast">{flavor.roast}</div>
        </>
      )}

      <div className="p-foot">CCFF · Week {facts.week} recap</div>
    </div>
  );
});

function PStat({ k, v, n, tone }) {
  return (
    <div className={`p-stat ${tone}`}>
      <div className="p-stat-k">{k}</div>
      <div className="p-stat-v">{v}</div>
      <div className="p-stat-n">{n}</div>
    </div>
  );
}

export default RecapPoster;
