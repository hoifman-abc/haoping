
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

function buildReviewPrompt(category, tone, lengthOption) {
  const lengthHint =
    {
      "50-80": "????50-80?",
      "80-100": "????80-100?",
      "100+": "??100????????120???",
    }[lengthOption] || "????80-100?";

  return `???????????????3??????????${category}????${tone}?????????|||???????${lengthHint}???????`;
}

async function callAI(prompt) {
  if (!API_KEY) {
    throw new Error("Server missing AI_API_KEY");
  }

  const resp = await fetch(AI_ENDPOINT, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${API_KEY}`,
    },
    body: JSON.stringify({
      model: AI_MODEL,
      messages: [
        { role: "system", content: "You are a Chinese copywriter for lifestyle content. Keep outputs concise and natural." },
        { role: "user", content: prompt },
      ],
      temperature: 0.9,
      max_tokens: 420,
      presence_penalty: 0.2,
    }),
  });

  if (!resp.ok) {
    const text = await resp.text();
    const errorText = text || `AI service error (${resp.status})`;
    const err = new Error(errorText);
    err.status = resp.status;
    throw err;
  }

  const data = await resp.json();
  const content = data?.choices?.[0]?.message?.content?.trim();
  if (!content) throw new Error("AI returned empty content");
  return content;
}

export default async function handler(req, res) {
  if (setCors(req, res)) return;

  if (req.method !== "POST") {
    res.status(405).send("Method Not Allowed");
    return;
  }

  const { category = "??", tone = "??", lengthOption = "80-100" } = req.body || {};
  const prompt = buildReviewPrompt(category, tone, lengthOption);

  try {
    const content = await callAI(prompt);
    let reviews = content.split('|||').map((s) => s.trim()).filter(Boolean);
    if (reviews.length <= 1) {
      reviews = content.split(/
+/).map((s) => s.trim()).filter(Boolean);
    }
    reviews = reviews.slice(0, 3);
    if (!reviews.length) {
      res.status(502).send("AI returned empty reviews");
      return;
    }
    res.json({ reviews });
  } catch (err) {
    console.error("Review generation failed", err);
    const status = err.status || 500;
    res.status(status).send(err.message || "AI service failed");
  }
}
