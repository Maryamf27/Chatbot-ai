<div align="center">

# 💬 AI Chatbot

### A Multi-Modal Chat Experience — Text, Voice & Vision in One App

**React · Express · TypeScript · Powered by MiniMax M3 & Pollinations AI**

[![Made with React](https://img.shields.io/badge/Frontend-React-61DAFB?logo=react&logoColor=white)](https://react.dev/)
[![Made with Express](https://img.shields.io/badge/Backend-Express-000000?logo=express&logoColor=white)](https://expressjs.com/)
[![TypeScript](https://img.shields.io/badge/Built%20with-TypeScript-3178C6?logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![Model](https://img.shields.io/badge/LLM-MiniMax%20M3%20(free)-6E56CF)](https://openrouter.ai/)
[![Deploy](https://img.shields.io/badge/Deployed-Vercel%20%2B%20Railway-000000?logo=vercel&logoColor=white)]()

[Live Demo](https://ai-chatbot-self-three-97.vercel.app) • [Features](#-features) • [Setup](#-setup) • [Deployment](#-deploying-to-vercel--railway) • [Project Structure](#-project-structure)

</div>

---

## 📖 About

**AI Chatbot** is a full-stack conversational app that combines three modalities in a single interface:

- **🧠 Text chat** — powered by **MiniMax M3 (free)**, served through [OpenRouter](https://openrouter.ai/)
- **🎙️ Voice** — hands-free conversations using the browser's built-in speech recognition, with spoken replies read back to you
- **🖼️ Images** — upload a photo for the model to analyze, or generate a brand-new image from a text prompt via **Pollinations AI**

The frontend is a React + TypeScript client; the backend is an Express + TypeScript API that talks to OpenRouter and Pollinations on your behalf, so your API keys never touch the browser.

**🔗 Live demo:** [ai-chatbot-self-three-97.vercel.app](https://ai-chatbot-self-three-97.vercel.app)

---

## ✨ Features

| Modality | How it works |
|---|---|
| **Text chat** | Conversational responses from MiniMax M3 via OpenRouter |
| **Voice** | Native browser speech recognition for input, spoken audio for replies — no external TTS service required |
| **Image analysis** | Upload a photo and ask the model questions about it |
| **Image generation** | Describe an image in a prompt; Pollinations AI auto-selects a compatible model, aspect ratio, and prompt treatment |
| **Configurable fallbacks** | Set a preferred image model and/or a fallback catalog via environment variables |

---

## 🗂️ Project Structure

```
ai-chatbot/
├── client/              # React + TypeScript frontend (Vite)
├── server/              # Express + TypeScript backend API
├── .gitignore
├── package.json         # Root scripts (dev, install:all)
└── package-lock.json
```

---

## ⚙️ Setup

### 1. Get an OpenRouter API key

Create a free key at [openrouter.ai/keys](https://openrouter.ai/keys).

### 2. Configure environment variables

Copy `.env.example` to `.env` and set:

```env
OPENROUTER_API_KEY=sk-or-v1-...
CHAT_MODEL=minimax/minimax-m3:free
```

**Image generation** runs on Pollinations AI and picks a compatible model, aspect ratio, and prompt treatment automatically for each request. You can optionally tune it:

```env
# Preferred fallback image model (legacy fallback is `flux`)
IMAGE_MODEL=flux

# Comma-separated fallback catalog override
IMAGE_MODELS=flux,turbo,another-model
```

### 3. Install and run

```bash
npm install
npm run install:all
npm run dev
```

- **Frontend:** http://localhost:5173
- **API:** http://localhost:3001

---

## 🚀 Deploying to Vercel & Railway

This project deploys as two pieces: the `server/` API on **Railway** and the `client/` frontend on **Vercel**.

### Deploy the backend (Railway)

Deploy the `server` folder to Railway and set these environment variables:

```env
OPENROUTER_API_KEY=sk-or-v1-...
CLIENT_URL=https://your-vercel-app.vercel.app
```

For the current live deployment, this is set to:

```env
CLIENT_URL=https://ai-chatbot-self-three-97.vercel.app
```

> 💡 If you need to support multiple frontend domains, use a comma-separated `CORS_ORIGINS` variable instead of `CLIENT_URL`.

### Deploy the frontend (Vercel)

Copy the Railway public domain, then deploy the `client` folder to Vercel with:

```env
VITE_API_URL=https://your-railway-service.up.railway.app
```

**Important:**
- Do **not** append `/api` to `VITE_API_URL` — the client adds it automatically.
- Vite embeds `VITE_*` variables at build time, so **redeploy Vercel** any time you add or change this value.
- Before opening the Vercel app, verify the Railway deployment is healthy at:
  ```
  https://your-railway-service.up.railway.app/api/health
  ```

---

## 🌐 Live Deployment

| Layer | URL |
|---|---|
| Frontend (Vercel) | [ai-chatbot-self-three-97.vercel.app](https://ai-chatbot-self-three-97.vercel.app) |

---

## 📄 License

Check the repository for license details, or add one if you're maintaining a fork.

---

<div align="center">

**Text, voice, and vision — one chatbot.**

</div>