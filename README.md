# CCFF Weekly Recap

Auto-generated weekly recap for the CCFF dynasty league. Pulls results from the
Sleeper API, computes everything (scoreboard, superlatives, bench blunders,
standings + movement) in code, and uses the Anthropic API only for the flavor
text — hype at the top, roast at the bottom. Renders as a page **and** spits out
a plain-text version you paste straight into the league chat.

## Weekly workflow (the whole point)

1. Open the deployed page.
2. Pick the week in the dropdown (defaults to the latest completed week).
3. Read it, or hit **Copy for chat** and paste into the Sleeper group chat.

That's it. No code, no rebuild.

The only manual upkeep all season: when the league decides the **Week 13 Game of
the Week**, put it in `src/config.js` → `GAME_OF_THE_WEEK[13]`.

## One-time setup

**Local run**

```bash
npm install
npm run dev
```

> Note: the Sleeper API blocks requests from inside Claude/artifact previews, so
> you'll only see real data via `npm run dev` or a real deployment.

**Deploy (Vercel)**

1. Push this folder to GitHub.
2. Import the repo in Vercel. Framework preset: **Vite**. If this lives in a
   subfolder of a larger repo, set **Root Directory** to that folder (same fix
   you used for the power-rankings app).
3. Add environment variables:
   - `ANTHROPIC_API_KEY` = your Console key. Billed to your Anthropic **Console**
     balance, separate from Claude Max.
   - `DISCORD_WEBHOOK_URL` (for the **Post to Discord** button) = a channel
     webhook; the button posts the recap as a rendered PNG image to it. In Discord: the target channel → Edit Channel → Integrations →
     Webhooks → New Webhook → Copy Webhook URL. Point it at whatever channel you
     want recaps in (e.g. a #recaps or #power_rankings channel).
4. Deploy. The `api/recap.js` and `api/discord.js` functions are picked up
   automatically.

## Editing the league config

Everything you'd ever change lives in `src/config.js`:

- `HANDLE_TO_MANAGER` — Sleeper handle → real name. Fixes the ones that don't
  match on their own (`@Lilb15` → Cooper, `@Jpeeler0` → Jack, the two Hoffmans).
  If someone renames their team and shows up as "unmapped" in the header, add
  them here.
- `GAME_OF_THE_WEEK` — the featured matchup per week (Week 13 = TBD).
- `SPECIAL_WEEKS` — Week 1 Bowl slate + Week 4 Rivalry Week.
- `RIVALRIES` — the Week 4 Rivalry Week slate; context the AI uses for the
  next-week preview.
- `BLOWOUT_MARGIN` / `NAILBITER_MARGIN` — the score-tag thresholds.

## Tuning the AI

`api/recap.js`:
- `MODEL` — defaults to `claude-sonnet-5`. Swap to `claude-haiku-4-5-20251001`
  for cheaper/faster blurbs.
- The voice lives in `buildPrompt()`. All real numbers are passed in as facts
  and rendered by the client, so the model can't change a score — it only writes
  commentary.

## How the math works (the parts worth trusting)

- **Bench blunder** = your actual starting total vs. the best *legal* lineup you
  could have started, respecting FLEX/SUPER_FLEX. Greedy, most-restrictive-slot
  first — provably optimal for standard nested flex eligibility (this league).
- **Standings + movement** are reconstructed from scratch each week from matchup
  results (wins, then points-for), and compared to the prior week for ▲/▼.

Both are unit-tested:

```bash
npm test
```

## Files

```
api/recap.js        Anthropic call (serverless) — flavor text only
api/discord.js      posts the recap to Discord (PNG attachment, text fallback)
src/config.js       league config — the file you edit
src/sleeperClient.js Sleeper fetches + players cache + roster→name map
src/recapEngine.js  pure math (tested)
src/buildRecap.js   GOTW resolution, next-week context, chat-text builder
src/App.jsx         the page
src/RecapPoster.jsx off-screen poster that gets rasterized to the Discord PNG
src/recap.css       styling
test/engine.test.mjs unit tests
```
