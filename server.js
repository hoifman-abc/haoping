import express from 'express';
import dotenv from 'dotenv';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;
const AI_ENDPOINT = process.env.AI_ENDPOINT || 'https://api.siliconflow.cn/v1/chat/completions';
const AI_MODEL = process.env.AI_MODEL || 'Qwen/QwQ-32B';
const API_KEY = process.env.AI_API_KEY;
const XHS_API_KEY = process.env.XHS_API_KEY;

if (!API_KEY) {
  console.warn('Missing AI_API_KEY environment variable; set it in .env');
}
if (!XHS_API_KEY) {
  console.warn('Missing XHS_API_KEY environment variable; set it in .env');
}

app.use(express.json({ limit: '2mb' }));
app.use(express.static('.'));

function buildPrompt(scene, tags) {
  return `你是小红书的种草博主，请生成1篇小红书风格的探店/体验笔记。
- 场景：${scene}，文案必须围绕该场景展开，语气轻松种草+好店推荐，口语化但不夸张营销。
- 结构：先给一个吸睛标题（≤20字），换行后正文。整体不超过500字。
- 正文包含体验细节、环境/服务/功效等描写，加入2-5个自然融入的emoji。
- 不要编号、不要“以下”“口播”“广告”语气。
- 末尾单独一行追加原样标签串：${tags}
- 输出严格为 JSON 对象，字段：{"title":"...","body":"..."}，不要输出其它多余字符或 Markdown 符号。`;
}

function buildReviewPrompt(category, tone, lengthOption) {
  const lengthHint =
    {
      '50-80': '字数要求50-80字',
      '80-100': '字数要求80-100字',
      '100+': '字数在100字以上，建议控制120字以内',
    }[lengthOption] || '字数要求80-100字';

  return `请用中文生成美团评价文案，按照用户选择的3条不同的文案输出，品类=${category}，语气=${tone}，格式不要编号，用|||分隔每条文案，${lengthHint}，避免营销腔。`;
}

async function callAI(prompt) {
  if (!API_KEY) {
    throw new Error('Server missing AI_API_KEY');
  }

  const resp = await fetch(AI_ENDPOINT, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${API_KEY}`,
    },
    body: JSON.stringify({
      model: AI_MODEL,
      messages: [
        { role: 'system', content: 'You are a Chinese copywriter for lifestyle content. Keep outputs concise and natural.' },
        { role: 'user', content: prompt },
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
  if (!content) throw new Error('AI returned empty content');
  return content;
}

function normalizeTags(tags) {
  const list = String(tags || '')
    .split(/\s+/)
    .map((t) => t.trim())
    .filter(Boolean)
    .map((t) => (t.startsWith('#') ? t : `#${t}`));
  const unique = Array.from(new Set(list));
  return unique.join(' ');
}

function stripLabel(text = '') {
  return text.replace(/^(标题|title)?\s*[:：#-]?\s*/i, '').trim();
}

function parseAiNote(content) {
  if (!content) return {};
  try {
    const obj = JSON.parse(content);
    if (obj && (obj.title || obj.body)) return obj;
  } catch (err) {
    // fall through to heuristic parsing
  }
  const lines = content.split(/\n+/).map((l) => l.trim()).filter(Boolean);
  if (!lines.length) return {};
  const title = stripLabel(lines[0]);
  const body = lines.slice(1).join('\n').trim();
  return { title, body: body || content };
}

function limitBody(body, limit) {
  const safeBody = (body || '').trim();
  if (!safeBody) return '';
  return safeBody.length > limit ? safeBody.slice(0, limit) : safeBody;
}

function assembleNote({ title, body, tagsLine, maxLength = 500 }) {
  const normalizedTags = normalizeTags(tagsLine);
  const titleLine = title ? stripLabel(title).slice(0, 32) : '';
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
    content: parts.join('\n\n').trim(),
  };
}

app.post('/api/generate', async (req, res) => {
  const { scene = '通用', tags = '#示例 #标签' } = req.body || {};
  const tagsLine = normalizeTags(tags);
  const prompt = buildPrompt(scene, tagsLine);

  if (!API_KEY) {
    return res.status(500).json({ error: 'Server missing AI_API_KEY' });
  }

  try {
    const resp = await fetch(AI_ENDPOINT, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${API_KEY}`,
      },
      body: JSON.stringify({
        model: AI_MODEL,
        messages: [
          {
            role: 'system',
            content: 'You are a Xiaohongshu copywriter. Always reply in concise Chinese with emojis and keep the original tags at the end.',
          },
          { role: 'user', content: prompt },
        ],
        temperature: 0.9,
        max_tokens: 520,
        presence_penalty: 0.2,
      }),
    });

    if (!resp.ok) {
      const text = await resp.text();
      return res.status(resp.status).send(text || 'AI service error');
    }

    const data = await resp.json();
    const aiContent = data?.choices?.[0]?.message?.content?.trim();
    if (!aiContent) return res.status(502).send('AI returned empty content');

    const parsed = parseAiNote(aiContent);
    const assembled = assembleNote({
      title: parsed.title,
      body: parsed.body || aiContent,
      tagsLine,
    });

    res.json(assembled);
  } catch (err) {
    console.error('AI request failed', err);
    res.status(500).send('AI service failed');
  }
});

app.post('/api/reviews/generate', async (req, res) => {
  const { category = '头疗', tone = '真实', lengthOption = '80-100' } = req.body || {};
  const prompt = buildReviewPrompt(category, tone, lengthOption);

  try {
    const content = await callAI(prompt);
    let reviews = content.split('|||').map((s) => s.trim()).filter(Boolean);
    if (reviews.length <= 1) {
      reviews = content.split(/\n+/).map((s) => s.trim()).filter(Boolean);
    }
    reviews = reviews.slice(0, 3);
    if (!reviews.length) return res.status(502).send('AI returned empty reviews');
    res.json({ reviews });
  } catch (err) {
    console.error('Review generation failed', err);
    const status = err.status || 500;
    res.status(status).send(err.message || 'AI service failed');
  }
});

app.post('/api/xhs/publish', async (req, res) => {
  const { title, content, coverImage, images = [], tags = [], noteId } = req.body || {};

  if (!XHS_API_KEY) {
    return res.status(500).json({ error: 'Server missing XHS_API_KEY' });
  }

  if ((!title || !title.trim()) && (!content || !content.trim())) {
    return res.status(400).json({ error: 'title or content is required' });
  }
  if (!coverImage || !coverImage.trim()) {
    return res.status(400).json({ error: 'coverImage is required' });
  }

  const payload = {
    title: title?.trim() || undefined,
    content: content?.trim() || undefined,
    coverImage: coverImage.trim(),
    images: Array.isArray(images) ? images.map((i) => i?.trim()).filter(Boolean) : [],
    tags: Array.isArray(tags) ? tags.map((t) => t?.trim()).filter(Boolean) : [],
    noteId: noteId?.trim() || undefined,
  };

  try {
    const resp = await fetch('https://note.limyai.com/api/openapi/publish_note', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-API-Key': XHS_API_KEY,
      },
      body: JSON.stringify(payload),
    });

    const text = await resp.text();
    if (!resp.ok) {
      return res.status(resp.status).send(text || 'xhs publish api error');
    }

    const data = text ? JSON.parse(text) : {};
    res.status(201).json(data);
  } catch (err) {
    console.error('XHS publish failed', err);
    res.status(500).send('xhs publish failed');
  }
});

app.listen(PORT, () => {
  console.log(`Server listening on http://localhost:${PORT}`);
});
