// ============================================================================
// /api/discord — one-click post of the recap to a Discord channel.
// Uses a channel WEBHOOK (no bot hosting needed). Set DISCORD_WEBHOOK_URL in
// Vercel to the webhook of whatever channel you want recaps in.
// Posts the same plain-text recap as the "Copy for chat" button, wrapped in a
// gold embed. Long recaps are split across multiple embeds automatically.
// ============================================================================

const GOLD = 0xffc24b;
const EMBED_LIMIT = 4000; // Discord embed description cap is 4096; leave margin

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Use POST" });

  const webhook = process.env.DISCORD_WEBHOOK_URL;
  if (!webhook) return res.status(500).json({ error: "DISCORD_WEBHOOK_URL is not set" });

  try {
    const { text, week, title } = req.body || {};
    if (!text) return res.status(400).json({ error: "Missing text" });

    const heading = title || (week ? `CCFF — Week ${week} Recap` : "CCFF Recap");
    const chunks = chunkText(String(text), EMBED_LIMIT);

    for (let i = 0; i < chunks.length; i++) {
      const embed = { description: chunks[i], color: GOLD };
      if (i === 0) embed.title = heading;
      await postChunk(webhook, { embeds: [embed] });
    }
    return res.status(200).json({ ok: true, messages: chunks.length });
  } catch (err) {
    return res.status(502).json({ error: String(err) });
  }
}

// Discord returns 204 on success; 429 with retry_after when rate limited.
async function postChunk(webhook, payload, attempt = 0) {
  const r = await fetch(webhook, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (r.status === 429 && attempt < 3) {
    const j = await r.json().catch(() => ({}));
    await new Promise((s) => setTimeout(s, ((j.retry_after ?? 1) + 0.25) * 1000));
    return postChunk(webhook, payload, attempt + 1);
  }
  if (!r.ok && r.status !== 204) {
    throw new Error(`Discord ${r.status}: ${await r.text().catch(() => "")}`);
  }
}

// Split on line boundaries so no section is cut mid-line.
function chunkText(text, max) {
  if (text.length <= max) return [text];
  const chunks = [];
  let cur = "";
  for (const line of text.split("\n")) {
    if ((cur ? cur + "\n" + line : line).length > max) {
      if (cur) chunks.push(cur);
      cur = line;
    } else {
      cur = cur ? cur + "\n" + line : line;
    }
  }
  if (cur) chunks.push(cur);
  return chunks;
}
