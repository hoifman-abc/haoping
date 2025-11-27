
const XHS_API_KEY = process.env.XHS_API_KEY;

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

export default async function handler(req, res) {
  if (setCors(req, res)) return;

  if (req.method !== "POST") {
    res.status(405).send("Method Not Allowed");
    return;
  }

  if (!XHS_API_KEY) {
    res.status(500).json({ error: "Server missing XHS_API_KEY" });
    return;
  }

  const { title, content, coverImage, images = [], tags = [], noteId } = req.body || {};

  if ((!title || !title.trim()) && (!content || !content.trim())) {
    res.status(400).json({ error: "title or content is required" });
    return;
  }
  if (!coverImage || !coverImage.trim()) {
    res.status(400).json({ error: "coverImage is required" });
    return;
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
      res.status(resp.status).send(text || 'xhs publish api error');
      return;
    }

    const data = text ? JSON.parse(text) : {};
    res.status(201).json(data);
  } catch (err) {
    console.error('XHS publish failed', err);
    res.status(500).send('xhs publish failed');
  }
}
