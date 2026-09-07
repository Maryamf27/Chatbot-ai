<div align="center">

# 💬 AI Chatbot

### A Multi-Modal Chat Experience — Text, Voice & Vision in One App

[![React](https://img.shields.io/badge/React-20232A?style=for-the-badge&logo=react&logoColor=61DAFB)](https://react.dev/)
[![TypeScript](https://img.shields.io/badge/TypeScript-3178C6?style=for-the-badge&logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![Express](https://img.shields.io/badge/Express-000000?style=for-the-badge&logo=express&logoColor=white)](https://expressjs.com/)
[![Vite](https://img.shields.io/badge/Vite-646CFF?style=for-the-badge&logo=vite&logoColor=white)](https://vitejs.dev/)
[![Node.js](https://img.shields.io/badge/Node.js-339933?style=for-the-badge&logo=node.js&logoColor=white)](https://nodejs.org/)
[![Vercel](https://img.shields.io/badge/Vercel-000000?style=for-the-badge&logo=vercel&logoColor=white)](https://vercel.com/)
[![Railway](https://img.shields.io/badge/Railway-0B0D0E?style=for-the-badge&logo=railway&logoColor=white)](https://railway.app/)
[![OpenRouter](https://img.shields.io/badge/OpenRouter-6E56CF?style=for-the-badge&logoColor=white)](https://openrouter.ai/)

[🚀 Live Demo](https://chatbot-ai-ten-sooty.vercel.app) • [Features](#-features) • [Architecture](#-architecture) • [Setup](#-setup) • [Deployment](#-deployment)

</div>

---

## 📖 About

**AI Chatbot** is a full-stack conversational app that fuses three modalities into one interface:

| | |
|---|---|
| 🧠 **Text** | Conversational responses from **MiniMax M3 (free)**, served via [OpenRouter](https://openrouter.ai/) |
| 🎙️ **Voice** | Hands-free input via the browser's native Speech Recognition API, with spoken replies |
| 🖼️ **Vision** | Upload a photo for analysis, or generate new images from a prompt via **Pollinations AI** |

The frontend is a **React + TypeScript** (Vite) client. The backend is an **Express + TypeScript** API that proxies all model calls, so API keys never reach the browser.

**🔗 Live app:** [https://chatbot-ai-ten-sooty.vercel.app](https://chatbot-ai-ten-sooty.vercel.app)

---

## 🛠️ Tech Stack

<div align="center">

| Layer | Technology |
|---|---|
| **Frontend** | ![React](https://img.shields.io/badge/-React-61DAFB?logo=react&logoColor=white&style=flat-square) ![TypeScript](https://img.shields.io/badge/-TypeScript-3178C6?logo=typescript&logoColor=white&style=flat-square) ![Vite](https://img.shields.io/badge/-Vite-646CFF?logo=vite&logoColor=white&style=flat-square) |
| **Backend** | ![Node.js](https://img.shields.io/badge/-Node.js-339933?logo=node.js&logoColor=white&style=flat-square) ![Express](https://img.shields.io/badge/-Express-000000?logo=express&logoColor=white&style=flat-square) ![TypeScript](https://img.shields.io/badge/-TypeScript-3178C6?logo=typescript&logoColor=white&style=flat-square) |
| **Text Model** | ![OpenRouter](https://img.shields.io/badge/-OpenRouter%20%7C%20MiniMax%20M3-6E56CF?style=flat-square) |
| **Voice** | ![Web Speech API](https://img.shields.io/badge/-Web%20Speech%20API-4285F4?logo=googlechrome&logoColor=white&style=flat-square) |
| **Image Generation** | ![Pollinations AI](https://img.shields.io/badge/-Pollinations%20AI-FF6B6B?style=flat-square) |
| **Hosting** | ![Vercel](https://img.shields.io/badge/-Vercel-000000?logo=vercel&logoColor=white&style=flat-square) ![Railway](https://img.shields.io/badge/-Railway-0B0D0E?logo=railway&logoColor=white&style=flat-square) |

</div>

---

## 🏗️ Architecture

```mermaid
flowchart TD
    U["👤 User"] -->|"types / speaks"| C["React Client (Vite)\nhosted on Vercel"]

    C -->|"🎙️ Web Speech API\n(speech-to-text, local)"| C
    C -->|"🔊 Speech Synthesis\n(text-to-speech, local)"| C

    C -->|"REST calls via VITE_API_URL/api"| S["Express API Server\nhosted on Railway"]

    S -->|"chat completion request"| OR["OpenRouter\nMiniMax M3 (free)"]
    OR -->|"generated reply"| S

    S -->|"prompt / uploaded image"| PA["Pollinations AI\n(image generation & analysis)"]
    PA -->|"image URL / analysis"| S

    S -->|"JSON response\n(text + image url)"| C
    C -->|"renders reply\n+ speaks it aloud"| U

    style U fill:#1e293b,stroke:#64748b,color:#fff
    style C fill:#0d1b2a,stroke:#61DAFB,color:#fff
    style S fill:#0d1b2a,stroke:#000000,color:#fff
    style OR fill:#241b3a,stroke:#6E56CF,color:#fff
    style PA fill:#3a1f1f,stroke:#FF6B6B,color:#fff
```

**Flow summary:**
1. The **client** captures text or speech input (speech-to-text happens entirely in the browser).
2. Requests go to the **Express server**, which holds all API credentials.
3. Text prompts route to **OpenRouter → MiniMax M3**; image prompts/uploads route to **Pollinations AI**.
4. The server returns a unified JSON response; the client renders it and optionally speaks the reply back using the browser's speech synthesis.

---

## ✨ Features

- **🧠 Free LLM-powered chat** — MiniMax M3 via OpenRouter, no paid API required to start
- **🎙️ Hands-free voice mode** — native browser speech recognition, no external TTS service
- **🖼️ Image understanding** — upload a photo and ask questions about it
- **🎨 Image generation** — auto-selects a compatible model, aspect ratio, and prompt treatment per request
- **🔁 Configurable image fallbacks** — set a preferred model or a fallback catalog via env vars
- **🔐 Server-side key handling** — credentials never touch the client
- **☁️ Split deployment** — client on Vercel, API on Railway, connected via CORS-safe env vars

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

Copy `.env.example` to `.env` in `server/` and set:

```env
OPENROUTER_API_KEY=sk-or-v1-...
CHAT_MODEL=minimax/minimax-m3:free
```

Image generation runs on Pollinations AI and auto-selects a compatible model, aspect ratio, and prompt treatment. Optional tuning:

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

| Service | URL |
|---|---|
| Frontend | http://localhost:5173 |
| API | http://localhost:3001 |

---

## 🚀 Deployment

The app deploys as two independent services.

### Backend → Railway

Deploy the `server` folder and set:

```env
OPENROUTER_API_KEY=sk-or-v1-...
CLIENT_URL=https://your-vercel-app.vercel.app
```

Current live config:

```env
CLIENT_URL=https://chatbot-ai-ten-sooty.vercel.app
```

> 💡 For multiple frontend domains, use a comma-separated `CORS_ORIGINS` value instead of `CLIENT_URL`.

### Frontend → Vercel

Deploy the `client` folder with:

```env
VITE_API_URL=https://your-railway-service.up.railway.app
```

**Important:**
- Don't append `/api` — the client adds it automatically
- Vite bakes `VITE_*` vars in at build time — **redeploy Vercel** after any change
- Verify the API is healthy first: `https://your-railway-service.up.railway.app/api/health`

---

## 🌐 Live Deployment

| Layer | URL |
|---|---|
| Frontend (Vercel) | [https://chatbot-ai-ten-sooty.vercel.app](https://chatbot-ai-ten-sooty.vercel.app) |

---

## 📄 License

Check the repository for license details, or add one if you're maintaining a fork.

---

<div align="center">

**Text, voice, and vision — one chatbot.**

</div>