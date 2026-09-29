// ============================================================================
// /api/recap  — server-side AI writer for the weekly recap.
// Vercel serverless function. Same shape as your blurbs.js:
//   - reads ANTHROPIC_API_KEY from env (set it in the Vercel dashboard)
//   - takes the COMPUTED facts from the client and only writes flavor text
//   - the client renders all real numbers itself, so the model can't fudge a
//     score — it just supplies voice.
// ============================================================================

const MODEL = "claude-sonnet-5"; // swap to "claude-haiku-4-5-20251001" for cheaper/faster

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Use POST" });
  }
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: "ANTHROPIC_API_KEY is not set" });
  }

  try {
    const facts = req.body?.facts ?? req.body; // { week, games, superlatives, gotw, standings, nextWeek, leagueName, notes }
    const prompt = buildPrompt(facts);

    // Up to 2 attempts: if the first reply isn't valid JSON, ask once more.
    let lastErr = "";
    for (let attempt = 0; attempt < 2; attempt++) {
      const messages = [{ role: "user", content: prompt }];
      if (attempt > 0) {
        messages[0].content +=
          "\n\nIMPORTANT: your previous reply was not valid JSON. Reply with ONLY the JSON object. Never put double-quote characters inside a string value — use single quotes for any quoted words.";
      }

      const anthRes = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-api-key": apiKey,
          "anthropic-version": "2023-06-01",
        },
        body: JSON.stringify({ model: MODEL, max_tokens: 3000, messages }),
      });

      if (!anthRes.ok) {
        // Surface Anthropic's own message (bad key, no credits, bad model, overloaded...)
        const raw = await anthRes.text();
        let msg = raw;
        try { msg = JSON.parse(raw)?.error?.message || raw; } catch { /* keep raw */ }
        return res.status(502).json({ error: `Anthropic ${anthRes.status}: ${msg}`.slice(0, 400) });
      }

      const data = await anthRes.json();
      const text = (data.content || [])
        .map((b) => (b.type === "text" ? b.text : ""))
        .join("")
        .trim();

      if (data.stop_reason === "max_tokens") {
        lastErr = "AI reply got cut off (too long)";
        continue;
      }
      try {
        return res.status(200).json({ flavor: parseJSON(text) });
      } catch (e) {
        lastErr = String(e.message || e);
      }
    }
    return res.status(502).json({ error: `AI returned unusable output: ${lastErr}` });
  } catch (err) {
    return res.status(500).json({ error: String(err).slice(0, 400) });
  }
}

function parseJSON(text) {
  const cleaned = text
    .replace(/```json/gi, "")
    .replace(/```/g, "")
    .trim();
  const tryParse = (s) => { try { return JSON.parse(s); } catch { return null; } };
  const m = cleaned.match(/\{[\s\S]*\}/);
  const candidates = [cleaned, m && m[0]].filter(Boolean);
  for (const c of candidates) {
    const out = tryParse(c) ?? tryParse(c.replace(/[\u201C\u201D]/g, "'")); // curly quotes -> '
    if (out && typeof out === "object") return out;
  }
  throw new Error("Model did not return valid JSON");
}

function buildPrompt(f) {
  const star = (s) => (s ? `${s.player} (${s.position}, ${s.points})` : "nobody notable");
  return `You are the play-by-play voice and resident roast-master for a 10-team dynasty fantasy football league called ${f.leagueName || "CCFF"}. Write the Week ${f.week} recap.

VOICE — this is the whole point, get it right:
- These are close friends in a group chat who roast each other mercilessly. Match that energy.
- Call the MATCHUPS like a live broadcaster. Nail-biters are the marquee: maximum drama, "down to the wire," "survived," "by a hair." Blowouts are demolitions: "took them out back," "never had a chance." Name the star players who decided each game.
- WINNERS get real hype-man praise. LOSERS get COOKED — funny-mean, specific, exaggerated, earned by a real number or player in the data. Land a punchline, not a hug.
- Keep every roast about FANTASY decisions and results. Never about anyone's real life, family, looks, or anything personal.
- Punchy and quotable. No corporate filler, no hashtags, no emoji (the app adds its own).

HARD RULES:
- Do not invent or change any numbers, names, or results.
- The data has NO play-by-play. Never invent how a game ended (last-second TD, final drive, garbage time) unless the COMMISSIONER NOTES say so.
- BENCH POINTS: mention bench / optimal lineup AT MOST ONCE in the entire recap, and only inside "roast" if you choose it. The headline, quips, superlatives, gotw_blurb, and preview must NOT mention bench points or optimal lineups.
- PREVIEW: only reference matchups that appear in the NEXT WEEK slate below. Never invent a pairing.
- JSON SAFETY: never put double-quote characters inside a string value. If you quote someone (e.g. from the commissioner notes), use single quotes.
${notesText(f.notes)}
RESULTS (winner first; each side's top starter):
${f.games.map((g) => `- [${g.id}] ${g.winner.manager} ${g.winner.points} def. ${g.loser.manager} ${g.loser.points} — margin ${g.margin}${g.tag ? " (" + g.tag + ")" : ""}. ${g.winner.manager}'s star: ${star(g.winner.star)}. ${g.loser.manager}'s star: ${star(g.loser.star)}.`).join("\n")}

SUPERLATIVES:
- Top score: ${f.superlatives.highTeam.manager} (${f.superlatives.highTeam.points})
- Low score: ${f.superlatives.lowTeam.manager} (${f.superlatives.lowTeam.points})
- Performance of the week: ${f.superlatives.performance.player} (${f.superlatives.performance.position}, ${f.superlatives.performance.points}) — started by ${f.superlatives.performance.manager}

GAME OF THE WEEK:
${gotwText(f.gotw)}

STANDINGS AFTER WEEK ${f.week} (rank. manager, record, points-for, movement):
${f.standings.map((s) => `${s.rank}. ${s.manager} ${s.w}-${s.l}${s.t ? "-" + s.t : ""}, ${s.pf} pf, ${s.movement > 0 ? "up " + s.movement : s.movement < 0 ? "down " + Math.abs(s.movement) : "flat"}`).join("\n")}

NEXT WEEK:
${nextWeekText(f.nextWeek)}
${tradesText(f.trades)}
ROAST CORNER OPTIONS (pick the funniest ONE target):
${benchLine(f.superlatives.benchBlunder)}
- Or the week's worst beatdown loser, the low scorer, a winless team, or the loser of a lopsided trade.
- Never roast anyone for bench points in a game they WON.

Return ONLY a JSON object, no prose around it, with exactly these keys:
{
  "headline": "one punchy, quotable sentence — lead with the most dramatic game or the biggest performance of the week",
  "quips": { ${f.games.map((g) => `"${g.id}": "one high-energy broadcast-style line on ${g.winner.manager} vs ${g.loser.manager}, naming the player who decided it"`).join(", ")} },
  "superlatives": "2-3 sentences — gush over the top score and performance of the week, then take a shot at the low score",
  "gotw_blurb": "2-3 sentences calling the Game of the Week like a broadcaster — the stars, the swing, the drama. No bench talk.",
  "roast": "2-3 funny-mean sentences on the single best roast target from ROAST CORNER OPTIONS",
  "preview": "2-3 sentences hyping next week using ONLY the NEXT WEEK slate — if it's Rivalry Week, call out the 2-3 juiciest grudge matches by name; otherwise hype the Game of the Week. Talk trash on both sides."
}`;
}

function notesText(notes) {
  const n = (notes || "").trim();
  if (!n) return "";
  return `\nCOMMISSIONER NOTES (ground truth from someone who watched the games — these are the real story; work them in prominently, especially in the headline and matchup quips):\n${n.slice(0, 1500)}\n`;
}

function tradesText(trades) {
  if (!trades || trades.length === 0) return "";
  const lines = trades.map(
    (t) => "- " + t.parties.map((p) => `${p.manager} gets ${p.receives.join(", ") || "nothing"}`).join(" | ")
  );
  return `\nRECENT TRADES:\n${lines.join("\n")}\n`;
}

function benchLine(b) {
  if (!b)
    return "- Bench blunder: none worth naming — the managers who lost basically started their best lineup.";
  const cost = b.costGame
    ? ` and their optimal lineup (${b.optimalPoints}) would have BEATEN their opponent's ${b.oppPoints} — this bench call cost them the win`
    : ` (they lost by ${b.lossMargin}, and even their optimal ${b.optimalPoints} wouldn't have topped ${b.oppPoints})`;
  return `- Bench blunder [LOSS]: ${b.manager} left ${b.delta} on the bench${cost}.`;
}

function gotwText(gotw) {
  if (!gotw) return "None this week.";
  if (gotw.type === "bowl")
    return `Bowl Week — themed slate: ${gotw.bowls.map((b) => `${b.name} (${b.result || b.teams.join(" vs ")})`).join("; ")}.`;
  if (gotw.type === "rivalry") return "Rivalry Week — the whole slate is grudge matches.";
  if (gotw.type === "tbd") return "Featured game TBD by the league.";
  if (gotw.result)
    return `${gotw.result.winner.manager} ${gotw.result.winner.points} def. ${gotw.result.loser.manager} ${gotw.result.loser.points}.`;
  return `Featured: ${gotw.teams?.join(" vs ") || "TBD"}.`;
}

function nextWeekText(nw) {
  if (!nw) return "Season's wrapping up — no next-week slate.";
  const parts = [];
  if (nw.gotw?.type === "rivalry") parts.push("It's RIVALRY WEEK — every matchup below is a declared grudge match.");
  if (nw.gotw?.type === "bowl") parts.push("It's Bowl Week.");
  if (nw.gotw?.teams) parts.push(`Game of the Week: ${nw.gotw.teams.join(" vs ")}.`);
  if (nw.slate?.length) {
    parts.push("Full slate:\n" + nw.slate.map((m) => `- ${m.a.manager}${m.a.record ? " (" + m.a.record + ")" : ""} vs ${m.b.manager}${m.b.record ? " (" + m.b.record + ")" : ""}${m.rivalry ? " [RIVALRY]" : ""}`).join("\n"));
  }
  return parts.join("\n") || "Standard slate.";
}
