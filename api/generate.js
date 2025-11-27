
const AI_ENDPOINT = process.env.AI_ENDPOINT || "https://api.siliconflow.cn/v1/chat/completions";
const AI_MODEL = process.env.AI_MODEL || "Qwen/QwQ-32B";
const API_KEY = process.env.AI_API_KEY;

function setCors(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type,Authorization");
  if (req.method === "OPTIONS") {
    res.status(200).end();
    return true;
  }
  return false;
}

function buildPrompt(scene, tags) {
  return `??????????????1??????????????\n- ???${scene}??????????????????????????????????\n- ?????????????20??????????????500??\n- ?????????????/????????2-5??????emoji?\n- ??????????????????????\n- ??????????????${tags}\n?????JSON???{"title":"...","body":"..."}??????????`;
}

function normalizeTags(tags) {
  const list = String(tags || "")
    .split(/\s+/)
    .map((t) => t.trim())
    .filter(Boolean)
    .map((t) => (t.startsWith("#") ? t : `#${t}`));
  const unique = Array.from(new Set(list));
  return unique.join(" ");
}

function stripLabel(text = "") {
  return text.replace(/^(??|title)?\s*[:?-]?\s*/i, "").trim();
}

function parseAiNote(content) {
  if (!content) return {};
  try {
    const obj = JSON.parse(content);
    if (obj && (obj.title || obj.body)) return obj;
  } catch (err) {
    // ignore
  }
  const lines = content.split(/\n+/).map((l) => l.trim()).filter(Boolean);
  if (!lines.length) return {};
  const title = stripLabel(lines[0]);
  const body = lines.slice(1).join("\n").trim();
  return { title, body: body || content };
}

function limitBody(body, limit) {
  const safeBody = (body || "").trim();
  if (!safeBody) return "";
  return safeBody.length > limit ? safeBody.slice(0, limit) : safeBody;
}

function assembleNote({ title, body, tagsLine, maxLength = 500 }) {
  const normalizedTags = normalizeTags(tagsLine);
  const titleLine = title ? stripLabel(title).slice(0, 32) : "";
  const tagsLength = normalizedTags ? normalizedTags.length + 2 : 0;
  const titleLength = titleLine ? titleLine.length + 2 : 0;
  const maxBodyLen = Math.max(120, maxLength - tagsLength - titleLength);
  const trimmedBody = limitBody(body, maxBodyLen);
  const parts = [];
  if (titleLine) parts.push(`## ${titleLine}`);
  if (trimmedBody) parts.push(trimmedBody);
  if (normalizedTags) parts.push(normalizedTags);
  return {
    title: titleLine,
    body: trimmedBody,
    tagsLine: normalizedTags,
    content: parts.join("\n\n").trim(),
  };
}

export default async function handler(req, res) {
  if (setCors(req, res)) return;

  if (req.method !== "POST") {
    res.status(405).send("Method Not Allowed");
    return;
  }

  if (!API_KEY) {
    res.status(500).json({ error: "Server missing AI_API_KEY" });
    return;
  }

  const { scene = "??", tags = "#?? #??" } = req.body || {};
  const tagsLine = normalizeTags(tags);
  const prompt = buildPrompt(scene, tagsLine);

  try {
    const resp = await fetch(AI_ENDPOINT, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${API_KEY}`,
      },
      body: JSON.stringify({
        model: AI_MODEL,
        messages: [
          {
            role: "system",
            content:
              "You are a Xiaohongshu copywriter. Always reply in concise Chinese with emojis and keep the original tags at the end.",
          },
          { role: "user", content: prompt },
        ],
        temperature: 0.9,
        max_tokens: 520,
        presence_penalty: 0.2,
      }),
    });

    if (!resp.ok) {
      const text = await resp.text();
      res.status(resp.status).send(text || "AI service error");
      return;
    }

    const data = await resp.json();
    const aiContent = data?.choices?.[0]?.message?.content?.trim();
    if (!aiContent) {
      res.status(502).send("AI returned empty content");
      return;
    }

    const parsed = parseAiNote(aiContent);
    const assembled = assembleNote({
      title: parsed.title,
      body: parsed.body || aiContent,
      tagsLine,
    });

    res.json(assembled);
  } catch (err) {
    console.error("AI request failed", err);
    res.status(500).send("AI service failed");
  }
}
