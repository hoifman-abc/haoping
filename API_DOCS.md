# Backend API Guide

All sensitive API keys are kept on the server via environment variables. Front-end pages should only call the following backend routes.

## Environment Variables
- `AI_API_KEY`: AI provider key (never expose to clients)
- `AI_MODEL`: Model name, default `Qwen/QwQ-32B`
- `AI_ENDPOINT`: Chat completion endpoint URL
- `XHS_API_KEY`: Key for the XiaoHongShu publish API
- `PORT`: Server port (default 3000)

## Endpoints
- `POST /api/generate`  
  - Body: `{ "scene": "头疗", "tags": "#示例 #标签" }`  
  - Response: `{ "title": "...", "body": "...", "tagsLine": "#示例 #标签", "content": "标题+正文+标签串（<=500字）" }`

- `POST /api/reviews/generate`  
  - Body: `{ "category": "头疗", "tone": "真实", "lengthOption": "80-100" }`  
  - Response: `{ "reviews": ["文案1", "文案2", "文案3"] }`

- `POST /api/xhs/publish`  
  - Body: `{ "title": "...", "content": "...", "coverImage": "url", "images": [], "tags": [], "noteId": "可选" }`  
  - Response: `201` with upstream JSON payload

## Notes
- Keep `.env` only on the server; never ship it to the browser.
- Front-end should call the routes above instead of direct third-party APIs.
- If an AI call fails, the front-end may fall back to local templates without exposing keys.
