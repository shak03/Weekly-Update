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
    const facts = req.body?.facts ?? req.body; // { week, games, superlatives, gotw, standings, nextWeek, leagueName }
    const prompt = buildPrompt(facts);

    const anthRes = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: 1400,
        messages: [{ role: "user", content: prompt }],
      }),
    });

    if (!anthRes.ok) {
      const detail = await anthRes.text();
      return res.status(502).json({ error: "Anthropic API error", detail });
    }

    const data = await anthRes.json();
    const text = (data.content || [])
      .map((b) => (b.type === "text" ? b.text : ""))
      .join("")
      .trim();

    return res.status(200).json({ flavor: parseJSON(text) });
  } catch (err) {
    return res.status(500).json({ error: String(err) });
  }
}

function parseJSON(text) {
  const cleaned = text.replace(/```json/gi, "").replace(/```/g, "").trim();
  try {
    return JSON.parse(cleaned);
  } catch {
    // last-ditch: grab the outermost {...}
    const m = cleaned.match(/\{[\s\S]*\}/);
    if (m) return JSON.parse(m[0]);
    throw new Error("Model did not return valid JSON");
  }
}

function buildPrompt(f) {
  return `You are the resident hype-man and roast-master for a 10-team dynasty fantasy football league called ${f.leagueName || "CCFF"}. Write the Week ${f.week} recap.

VOICE — this is the whole point, get it right:
- These are close friends in a group chat who roast each other mercilessly. Match that energy.
- WINNERS get real hype-man praise — sell how dominant they were, make them sound like champions.
- LOSERS, low scorers, and bench-blunderers get COOKED. Be funny-mean: sharp, specific, exaggerated. Mock the decision, the score, the loss — chirp them like a buddy who won't let it go. Land a punchline, not a hug.
- "Funny-mean" = vivid comparisons, hyperbole, and calling out the exact dumb thing they did (benched the guy who went off, got outscored by someone's kicker, etc.). It does NOT mean lazy generic insults — every burn must be earned by a real number or detail in the data below.
- Keep every roast about their FANTASY decisions and results — the lineup, the trade, the score. Never about anyone's real life, family, looks, or anything personal.
- Punchy and quotable. No corporate filler, no hedging, no hashtags, no emoji (the app adds its own).

Here are the FACTS. Do not invent or change any numbers, names, or results — only add commentary.

RESULTS:
${f.games.map((g) => `- ${g.winner.manager} ${g.winner.points} def. ${g.loser.manager} ${g.loser.points} (margin ${g.margin}${g.tag ? ", " + g.tag : ""})`).join("\n")}

SUPERLATIVES:
- Top score: ${f.superlatives.highTeam.manager} (${f.superlatives.highTeam.points})
- Low score: ${f.superlatives.lowTeam.manager} (${f.superlatives.lowTeam.points})
- Performance of the week: ${f.superlatives.performance.player} (${f.superlatives.performance.position}, ${f.superlatives.performance.points}) — started by ${f.superlatives.performance.manager}
${benchLine(f.superlatives.benchBlunder)}

GAME OF THE WEEK:
${gotwText(f.gotw)}

STANDINGS AFTER WEEK ${f.week} (rank. manager, record, points-for, movement):
${f.standings.map((s) => `${s.rank}. ${s.manager} ${s.w}-${s.l}${s.t ? "-" + s.t : ""}, ${s.pf} pf, ${s.movement > 0 ? "up " + s.movement : s.movement < 0 ? "down " + Math.abs(s.movement) : "flat"}`).join("\n")}

NEXT WEEK:
${nextWeekText(f.nextWeek)}

ROAST RULES (important):
- Only roast a bench mistake if that manager LOST their matchup. NEVER roast anyone for bench points in a game they WON.
- If their optimal lineup would have won the game, go in hard — the points to win were sitting right there on their bench.
- If there's no bench blunder worth naming, roast the week's biggest choker instead (worst loss or lowest score).

Return ONLY a JSON object, no prose around it, with exactly these keys:
{
  "headline": "one punchy, quotable sentence capturing the week's big story — lead with the funniest angle",
  "quips": { ${f.games.map((g) => `"${g.id}": "one sharp one-liner on ${g.winner.manager} vs ${g.loser.manager} — hype it if it was a beatdown, cook the loser if it was ugly"`).join(", ")} },
  "superlatives": "2-3 sentences — gush over the top score and performance of the week, then take a shot at the low score",
  "gotw_blurb": "2-3 sentences on the Game of the Week, with some bite",
  "roast": "2-3 sentences. Follow the ROAST RULES above: if there's a bench blunder in a loss, absolutely COOK them — funny-mean, specific to the numbers, land a punchline (go hardest if it cost the win); otherwise cook the biggest choker",
  "preview": "2-3 sentences hyping next week's featured matchup — talk trash on both sides"
}`;
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
  if (!nw) return "Season's wrapping up.";
  const parts = [];
  if (nw.gotw?.teams) parts.push(`Game of the Week: ${nw.gotw.teams.join(" vs ")}.`);
  if (nw.gotw?.type === "rivalry") parts.push("It's Rivalry Week.");
  if (nw.gotw?.type === "bowl") parts.push("It's Bowl Week.");
  if (nw.rivalryAngle) parts.push(`Rivalry angle: ${nw.rivalryAngle}`);
  return parts.join(" ") || "Standard slate.";
}
