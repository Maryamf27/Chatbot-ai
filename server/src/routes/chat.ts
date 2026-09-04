import { Router } from "express";
import { chatModel, isApiKeyConfigured, llm } from "../llm.js";

export type ChatRole = "user" | "assistant" | "system";

type TextContentPart = { type: "text"; text: string };
type ImageContentPart = { type: "image_url"; image_url: { url: string } };
type ContentPart = TextContentPart | ImageContentPart;

export type ChatMessage = {
  role: ChatRole;
  content: string | ContentPart[];
};

type ChatBody = {
  messages: ChatMessage[];
};

export const chatRouter = Router();

const SETUP_REPLY =
  "## 🔧 Setup Required\n\n" +
  "I need your **OpenRouter API key** before I can answer.\n\n" +
  "### Steps (30 seconds, free):\n\n" +
  "1. Visit **https://openrouter.ai/keys** and sign in\n" +
  "2. Click **\"Create Key\"** and copy it — it starts with `sk-or-v1-...`\n" +
  "3. Open the `.env` file in the project folder and paste:\n" +
  "   ```\n" +
  "   OPENROUTER_API_KEY=sk-or-v1-your-key-here\n" +
  "   ```\n" +
  "4. **Restart** the server (`Ctrl+C` then `npm run dev`) and refresh the page\n\n" +
  "Once configured, ask me anything — I'll format my answers clearly with headings, code blocks, and lists. You can also paste images and I'll describe them!";

const SYSTEM_PROMPT =
  "You are **MiniMax M3** — a friendly, knowledgeable, multimodal AI assistant.\n\n" +
  "### Capabilities\n" +
  "- I can see and analyze **images** you upload or paste\n" +
  "- I understand long documents and **file contents** when shared as text\n" +
  "- I respond with rich, well-structured **text-based output**\n\n" +
  "### Formatting rules (IMPORTANT):\n" +
  "- Use **markdown** to structure answers.\n" +
  "- Use `### Heading` for sections, not `#` or `##`.\n" +
  "- Separate distinct ideas with horizontal rules: `---`\n" +
  "- Use `- bullet` or `1. numbered` lists instead of long paragraphs.\n" +
  "- Wrap inline code in single backticks: `` `const x = 1` ``\n" +
  "- Wrap code blocks in triple backticks with a language tag:\n" +
  "  ```js\n" +
  "  // code here\n" +
  "  ```\n" +
  "- Use `**bold**` for key terms.\n" +
  "- When describing images, be specific, detailed, and accurate.\n" +
  "- Keep answers clear, accurate, and well-structured.";

chatRouter.post("/", async (req, res) => {
  if (!isApiKeyConfigured()) {
    res.json({ reply: SETUP_REPLY });
    return;
  }

  const body = req.body as ChatBody;
  const messages = Array.isArray(body.messages) ? body.messages : [];

  if (messages.length === 0) {
    res.status(400).json({ error: "messages is required" });
    return;
  }

  const chatMessages = messages.map((m) => ({
    role: m.role as "system" | "user" | "assistant",
    content: m.content as string | Array<{ type: string; text?: string; image_url?: { url: string } }>,
  }));

  res.setHeader("Content-Type", "application/x-ndjson; charset=utf-8");
  res.setHeader("Cache-Control", "no-cache, no-transform");
  res.setHeader("Connection", "keep-alive");
  res.flushHeaders?.();

  function sendChunk(obj: unknown) {
    if (res.writableEnded) return;
    res.write(JSON.stringify(obj) + "\n");
  }

  try {
    const llmMessages: any[] = [
      { role: "system", content: SYSTEM_PROMPT },
      ...chatMessages,
    ];

    const stream = await llm.chat.completions.create({
      model: chatModel,
      temperature: 0.7,
      max_tokens: 1500,
      stream: true,
      messages: llmMessages,
    });

    let full = "";
    for await (const chunk of stream) {
      const piece = chunk.choices[0]?.delta?.content ?? "";
      if (!piece) continue;
      full += piece;
      sendChunk({ t: "d", c: piece });
    }

    if (!full) {
      sendChunk({ t: "err", m: "Model returned an empty response." });
    } else {
      sendChunk({ t: "done", c: full });
    }
    res.end();
  } catch (error) {
    const message =
      error instanceof Error
        ? `Model error — ${error.message}`
        : "Chat request failed unexpectedly.";
    if (res.headersSent) {
      sendChunk({ t: "err", m: message });
      res.end();
    } else {
      res.status(500).json({ error: message });
    }
  }
});
