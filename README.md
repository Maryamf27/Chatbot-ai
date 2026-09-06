# Chatbot

React + Express + TypeScript chatbot powered by **MiniMax M3 (free)** via OpenRouter.

- **Text chat** — MiniMax M3
- **Voice** — browser speech recognition and spoken replies
- **Images** — upload a photo for analysis or generate an image with Pollinations AI

## Setup

1. Create a free key at [OpenRouter](https://openrouter.ai/keys).
2. Copy `.env.example` to `.env` and set:

   ```
   OPENROUTER_API_KEY=sk-or-v1-...
   CHAT_MODEL=minimax/minimax-m3:free
   ```

Image generation uses Pollinations AI through the image model in the app and
automatically selects a compatible model, aspect ratio, and prompt treatment
for each request. Set `IMAGE_MODEL` to provide a preferred fallback model; the
legacy fallback is `flux`. The optional `IMAGE_MODELS` environment variable can
provide a comma-separated fallback catalog override.

3. Install and run:

   ```
   npm install
   npm run install:all
   npm run dev
   ```

- Frontend: http://localhost:5173
- API: http://localhost:3001

## Deploying to Vercel and Railway

Deploy the `server` folder to Railway and add this Railway environment variable:

```
OPENROUTER_API_KEY=sk-or-v1-...
CLIENT_URL=https://your-vercel-app.vercel.app
```

For the current deployment, use:

```
CLIENT_URL=https://ai-chatbot-self-three-97.vercel.app
```

For multiple frontend domains, use a comma-separated `CORS_ORIGINS` value
instead of `CLIENT_URL`.

Copy the Railway public domain, then deploy the `client` folder to Vercel with
this environment variable. Do not add `/api` to the value; the client adds it.

```
VITE_API_URL=https://your-railway-service.up.railway.app
```

Redeploy Vercel after adding or changing `VITE_API_URL`, since Vite embeds
`VITE_*` variables during the build. Verify the Railway deployment at
`https://your-railway-service.up.railway.app/api/health` before opening Vercel.
