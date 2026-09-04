# Chatbot

React + Express + TypeScript chatbot powered by **MiniMax M3 (free)** via OpenRouter.

- **Text chat** — MiniMax M3
- **Voice** — browser speech recognition and spoken replies
- **Images** — upload a photo and ask MiniMax to identify it

## Setup

1. Create a free key at [OpenRouter](https://openrouter.ai/keys).
2. Copy `.env.example` to `.env` and set:

   ```
   OPENROUTER_API_KEY=sk-or-v1-...
   CHAT_MODEL=minimax/minimax-m3:free
   ```

3. Install and run:

   ```
   npm install
   npm run install:all
   npm run dev
   ```

- Frontend: http://localhost:5173
- API: http://localhost:3001
