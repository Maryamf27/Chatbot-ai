import { useEffect, useMemo, useRef, useState, useCallback } from "react";
import ReactMarkdown from "react-markdown";
import {
  fetchHealth,
  streamChat,
  buildPayloadMessages,
  type HealthStatus,
  type AudioResponse,
} from "./api";
import { listenOnce, speakText, stopSpeaking } from "./speech";
import type { ChatMessage, Conversation, ModelId, MessageType } from "./types";
import { getModelById, DEFAULT_MODEL_ID } from "./config/models";
import { ModelSelector } from "./components/ModelSelector";
import { ImageMessage } from "./components/ImageMessage";
import { AudioMessage } from "./components/AudioMessage";

const STORE_KEY = "ling-store:v2";
const PREFS_KEY = "ling-prefs:v1";
const MAX_TOTAL_BYTES = 800 * 1024;
const MAX_MSGS_PER_CONVO = 80;

function uid() {
  return crypto.randomUUID();
}

function validMessage(m: unknown): m is ChatMessage {
  if (!m || typeof m !== "object") return false;
  const msg = m as Record<string, unknown>;
  const roleOk = msg.role === "user" || msg.role === "assistant";
  const idOk = typeof msg.id === "string";
  const contentOk = typeof msg.content === "string";
  const imagesOk =
    msg.images === undefined ||
    (Array.isArray(msg.images) &&
      (msg.images as unknown[]).every((s) => typeof s === "string"));
  const typeOk =
    msg.type === undefined ||
    msg.type === "text" ||
    msg.type === "image" ||
    msg.type === "audio";
  const modelOk =
    msg.model === undefined ||
    msg.model === "text" ||
    msg.model === "flash" ||
    msg.model === "image";
  const imageUrlOk =
    msg.imageUrl === undefined || typeof msg.imageUrl === "string";
  const audioUrlOk =
    msg.audioUrl === undefined || typeof msg.audioUrl === "string";
  const promptOk = msg.prompt === undefined || typeof msg.prompt === "string";
  return Boolean(
    roleOk &&
      idOk &&
      contentOk &&
      imagesOk &&
      typeOk &&
      modelOk &&
      imageUrlOk &&
      audioUrlOk &&
      promptOk
  );
}

function validConversation(c: unknown): c is Conversation {
  if (!c || typeof c !== "object") return false;
  const conv = c as Record<string, unknown>;
  return Boolean(
    typeof conv.id === "string" &&
      typeof conv.title === "string" &&
      Array.isArray(conv.messages) &&
      (conv.messages as unknown[]).every(validMessage) &&
      typeof conv.createdAt === "number" &&
      typeof conv.updatedAt === "number"
  );
}

function makeConversation(overrideTitle?: string): Conversation {
  const now = Date.now();
  return {
    id: uid(),
    title: overrideTitle ?? "New chat",
    messages: [],
    createdAt: now,
    updatedAt: now,
  };
}

function titleFromFirstUser(convo: Conversation): string {
  const firstUser = convo.messages.find((m) => m.role === "user");
  if (!firstUser) return "New chat";
  const clean = firstUser.content.replace(/\s+/g, " ").trim();
  const sliced = clean.length > 40 ? clean.slice(0, 40) + "…" : clean;
  return sliced || "New chat";
}

type StoreShape = {
  conversations: Conversation[];
  activeId: string | null;
};

function defaultStore(): StoreShape {
  const starter = makeConversation();
  return { conversations: [starter], activeId: starter.id };
}

function loadStore(): StoreShape {
  try {
    if (typeof localStorage === "undefined") return defaultStore();
    const raw = localStorage.getItem(STORE_KEY);
    if (!raw) {
      const v1 = localStorage.getItem("ling-chat:v1");
      if (v1) {
        try {
          const parsed = JSON.parse(v1) as unknown;
          if (Array.isArray(parsed) && parsed.every(validMessage)) {
            const firstUserMsg = parsed.find(
              (m) => (m as ChatMessage).role === "user"
            ) as ChatMessage | undefined;
            const baseTitle =
              firstUserMsg?.content
                .replace(/\s+/g, " ")
                .trim()
                .slice(0, 40) ?? "";
            const ellipsis =
              firstUserMsg && firstUserMsg.content.length > 40 ? "…" : "";
            const c: Conversation = {
              id: uid(),
              title: (baseTitle + ellipsis) || "Previous chat",
              messages: parsed as ChatMessage[],
              createdAt: Date.now(),
              updatedAt: Date.now(),
            };
            const store: StoreShape = {
              conversations: [c],
              activeId: c.id,
            };
            saveStore(store);
            localStorage.removeItem("ling-chat:v1");
            return store;
          }
        } catch {
          /* ignore */
        }
      }
      return defaultStore();
    }
    const parsed = JSON.parse(raw) as Partial<StoreShape> | undefined;
    if (
      parsed &&
      Array.isArray(parsed.conversations) &&
      parsed.conversations.every(validConversation)
    ) {
      const activeId =
        typeof parsed.activeId === "string" &&
        parsed.conversations.some((c) => c.id === parsed.activeId)
          ? parsed.activeId
          : parsed.conversations[0]?.id ?? null;
      if (parsed.conversations.length === 0) return defaultStore();
      // Remove the old, persistent welcome bubble from saved conversations.
      const conversations = parsed.conversations.map((conversation) => ({
        ...conversation,
        messages: conversation.messages.filter(
          (message) =>
            !(
              message.role === "assistant" &&
              message.content.includes("I am a multimodal AI assistant")
            )
        ),
      }));
      return { conversations, activeId };
    }
    return defaultStore();
  } catch {
    return defaultStore();
  }
}

function saveStore(store: StoreShape) {
  try {
    if (typeof localStorage === "undefined") return;
    // Strip audioUrl (base64 data URIs) before saving — they are transient.
    // AudioMessage shows "expired" state on reload, prompting the user to resend.
    const stripped: StoreShape = {
      ...store,
      conversations: store.conversations.map((c) => ({
        ...c,
        messages: c.messages.map((m) =>
          m.audioUrl ? { ...m, audioUrl: undefined } : m
        ),
      })),
    };
    let json = JSON.stringify(stripped);
    if (new Blob([json]).size > MAX_TOTAL_BYTES) {
      const trimmed: Conversation[] = [...stripped.conversations]
        .sort((a, b) => b.updatedAt - a.updatedAt)
        .slice(0, 20)
        .map((c) => ({
          ...c,
          messages: c.messages.slice(
            Math.max(0, c.messages.length - MAX_MSGS_PER_CONVO)
          ),
        }));
      const activeId = trimmed.some((c) => c.id === store.activeId)
        ? store.activeId
        : trimmed[0]?.id ?? null;
      json = JSON.stringify({ conversations: trimmed, activeId });
    }
    localStorage.setItem(STORE_KEY, json);
  } catch {
    /* ignore quota */
  }
}

function loadSpeakPref(): boolean {
  try {
    if (typeof localStorage === "undefined") return false;
    const raw = localStorage.getItem(PREFS_KEY);
    if (!raw) return false;
    const parsed = JSON.parse(raw) as { speakReplies?: unknown };
    return typeof parsed.speakReplies === "boolean" ? parsed.speakReplies : false;
  } catch {
    return false;
  }
}

function saveSpeakPref(value: boolean) {
  try {
    if (typeof localStorage === "undefined") return;
    localStorage.setItem(PREFS_KEY, JSON.stringify({ speakReplies: value }));
  } catch {
    /* ignore */
  }
}

function formatDay(ts: number): string {
  const today = new Date();
  const d = new Date(ts);
  const startOfToday = new Date(
    today.getFullYear(),
    today.getMonth(),
    today.getDate()
  ).getTime();
  const startOfYesterday = startOfToday - 86400000;
  if (ts >= startOfToday) return "Today";
  if (ts >= startOfYesterday) return "Yesterday";
  const diffDays = Math.floor((startOfToday - ts) / 86400000);
  if (diffDays < 7) return `${diffDays} day${diffDays === 1 ? "" : "s"} ago`;
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error("Failed to read file"));
    reader.readAsDataURL(file);
  });
}

export default function App() {
  const [store, setStore] = useState<StoreShape>(() => loadStore());
  const [input, setInput] = useState("");
  const [selectedModel, setSelectedModel] = useState<ModelId>(DEFAULT_MODEL_ID);
  const [busy, setBusy] = useState(false);
  const [streamingId, setStreamingId] = useState<string | null>(null);
  const [recording, setRecording] = useState(false);
  const [speakReplies, setSpeakReplies] = useState<boolean>(() => loadSpeakPref());
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [health, setHealth] = useState<HealthStatus | null>(null);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [pendingImages, setPendingImages] = useState<string[]>([]);

  const listRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const composerRef = useRef<HTMLFormElement>(null);

  const chatAbortRef = useRef<AbortController | null>(null);
  const healthAbortRef = useRef<AbortController | null>(null);
  const submitNonceRef = useRef<number>(0);
  const submitRunningRef = useRef<boolean>(false);
  const speechNonceRef = useRef<number>(0);

  const conversations = store.conversations;
  const activeId = store.activeId;
  const active: Conversation | undefined = useMemo(
    () => conversations.find((c) => c.id === activeId),
    [conversations, activeId]
  );
  const messages = active?.messages ?? [];

  const grouped = useMemo(() => {
    const groups = new Map<string, Conversation[]>();
    for (const c of [...conversations].sort((a, b) => b.updatedAt - a.updatedAt)) {
      const key = formatDay(c.updatedAt);
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key)!.push(c);
    }
    return Array.from(groups.entries());
  }, [conversations]);

  function abortChat(silent = true) {
    if (chatAbortRef.current) {
      try {
        chatAbortRef.current.abort();
      } catch {
        /* ignore */
      }
      chatAbortRef.current = null;
    }
    if (silent) {
      /* caller handles UI cleanup */
    }
  }

  function stopReplySpeech() {
    speechNonceRef.current += 1;
    stopSpeaking();
    setIsSpeaking(false);
  }

  function playReplySpeech(text: string) {
    const nonce = ++speechNonceRef.current;
    setIsSpeaking(true);
    void speakText(text).finally(() => {
      if (nonce === speechNonceRef.current) setIsSpeaking(false);
    });
  }

  useEffect(() => {
    let cancelled = false;
    if (healthAbortRef.current) {
      try {
        healthAbortRef.current.abort();
      } catch {
        /* ignore */
      }
    }
    const initialController = new AbortController();
    healthAbortRef.current = initialController;
    void fetchHealth(initialController.signal).then((h) => {
      if (!cancelled) setHealth(h);
    });

    const intervalId = setInterval(() => {
      if (healthAbortRef.current) {
        try {
          healthAbortRef.current.abort();
        } catch {
          /* ignore */
        }
      }
      const controller = new AbortController();
      healthAbortRef.current = controller;
      void fetchHealth(controller.signal).then((h) => {
        if (!cancelled) setHealth(h);
      });
    }, 15000);

    return () => {
      cancelled = true;
      clearInterval(intervalId);
      if (healthAbortRef.current) {
        try {
          healthAbortRef.current.abort();
        } catch {
          /* ignore */
        }
        healthAbortRef.current = null;
      }
    };
  }, []);

  useEffect(() => {
    saveStore(store);
  }, [store]);

  useEffect(() => {
    saveSpeakPref(speakReplies);
  }, [speakReplies]);

  useEffect(() => {
    listRef.current?.scrollTo({
      top: listRef.current.scrollHeight,
      behavior: "smooth",
    });
  }, [messages.length, messages.at(-1)?.content, busy, activeId, streamingId]);

  function updateActive(
    mutator: (draft: Conversation) => Conversation,
    touch = true
  ) {
    setStore((prev) => {
      if (!prev.activeId) return prev;
      const now = Date.now();
      return {
        ...prev,
        conversations: prev.conversations.map((c) =>
          c.id === prev.activeId
            ? {
                ...mutator(c),
                updatedAt: touch ? now : c.updatedAt,
                title:
                  c.title === "New chat"
                    ? (() => {
                        const renamed = mutator(c);
                        const title = titleFromFirstUser(renamed);
                        return touch ? title : c.title;
                      })()
                    : c.title,
              }
            : c
        ),
      };
    });
  }

  function appendDeltaToMessage(msgId: string, delta: string) {
    setStore((prev) => {
      if (!prev.activeId) return prev;
      return {
        ...prev,
        conversations: prev.conversations.map((c) =>
          c.id === prev.activeId
            ? {
                ...c,
                messages: c.messages.map((m) =>
                  m.id === msgId ? { ...m, content: m.content + delta } : m
                ),
              }
            : c
        ),
      };
    });
  }

  function finalizeMessage(msgId: string, fullText: string) {
    setStore((prev) => {
      if (!prev.activeId) return prev;
      return {
        ...prev,
        conversations: prev.conversations.map((c) =>
          c.id === prev.activeId
            ? {
                ...c,
                messages: c.messages.map((m) =>
                  m.id === msgId ? { ...m, content: fullText } : m
                ),
              }
            : c
        ),
      };
    });
  }

  /**
   * Finalises a Flash audio message.
   * Stores the prompt text as content (for localStorage) and the data URI
   * as audioUrl (in-memory only — stripped from localStorage by saveStore).
   */
  function finalizeAudioMessage(msgId: string, audio: AudioResponse) {
    setStore((prev) => {
      if (!prev.activeId) return prev;
      return {
        ...prev,
        conversations: prev.conversations.map((c) =>
          c.id === prev.activeId
            ? {
                ...c,
                messages: c.messages.map((m) =>
                  m.id === msgId
                    ? { ...m, content: audio.prompt, audioUrl: audio.dataUri, prompt: audio.prompt }
                    : m
                ),
              }
            : c
        ),
      };
    });
  }

  function removePendingImage(idx: number) {
    setPendingImages((prev) => prev.filter((_, i) => i !== idx));
  }

  async function handleFiles(files: FileList | File[]) {
    const list = Array.from(files).filter((f) => f.type.startsWith("image/"));
    if (list.length === 0) return;
    try {
      const dataUrls = await Promise.all(list.map(fileToDataUrl));
      setPendingImages((prev) => [...prev, ...dataUrls]);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load image");
    }
  }

  const handlePaste = useCallback((e: ClipboardEvent) => {
    if (!e.clipboardData) return;
    const items = e.clipboardData.items;
    const files: File[] = [];
    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      if (item.kind === "file") {
        const f = item.getAsFile();
        if (f && f.type.startsWith("image/")) files.push(f);
      }
    }
    if (files.length > 0) {
      e.preventDefault();
      void handleFiles(files);
    }
  }, []);

  useEffect(() => {
    window.addEventListener("paste", handlePaste);
    return () => window.removeEventListener("paste", handlePaste);
  }, [handlePaste]);

  useEffect(() => {
    return () => {
      try {
        chatAbortRef.current?.abort();
        healthAbortRef.current?.abort();
      } catch {
        /* ignore */
      }
    };
  }, []);

  function createNewChat() {
    abortChat();
    stopReplySpeech();
    const convo = makeConversation();
    setStore((prev) => ({
      conversations: [convo, ...prev.conversations],
      activeId: convo.id,
    }));
    setError(null);
    setSidebarOpen(false);
    setPendingImages([]);
  }

  function switchConversation(id: string) {
    if (id !== activeId) {
      abortChat();
      stopReplySpeech();
    }
    setStore((prev) => ({ ...prev, activeId: id }));
    setError(null);
    setSidebarOpen(false);
    setPendingImages([]);
  }

  function deleteConversation(id: string, ev?: React.MouseEvent) {
    ev?.stopPropagation();
    if (!window.confirm("Delete this chat?")) return;
    if (id === activeId) {
      abortChat();
      stopReplySpeech();
    }
    setStore((prev) => {
      const remaining = prev.conversations.filter((c) => c.id !== id);
      if (remaining.length === 0) {
        const fresh = makeConversation();
        return { conversations: [fresh], activeId: fresh.id };
      }
      const newActiveId =
        prev.activeId === id
          ? [...remaining].sort((a, b) => b.updatedAt - a.updatedAt)[0].id
          : prev.activeId;
      return { conversations: remaining, activeId: newActiveId };
    });
  }

  function clearActiveMessages() {
    if (!window.confirm("Clear messages in this chat?")) return;
    abortChat();
    stopReplySpeech();
    updateActive((c) => ({ ...c, messages: [] }), true);
    setError(null);
    setPendingImages([]);
  }

  async function submit(
    text: string,
    imagesToSend: string[] = [],
    modelId: ModelId = selectedModel
  ) {
    const trimmed = text.trim();
    if ((!trimmed && imagesToSend.length === 0) || busy || !active) return;

    if (submitRunningRef.current) return;
    submitRunningRef.current = true;
    const nonce = ++submitNonceRef.current;

    abortChat();
    stopReplySpeech();

    setError(null);

    const userMsgType: MessageType =
      modelId === "image" ? "text" : modelId === "flash" ? "text" : "text";

    const userMessage: ChatMessage = {
      id: uid(),
      role: "user",
      type: userMsgType,
      model: modelId,
      content: trimmed || (imagesToSend.length > 0 ? "(see attached image)" : ""),
      images: imagesToSend.length > 0 ? imagesToSend : undefined,
    };

    const assistantStreamId = uid();
    const assistantSeed: ChatMessage = {
      id: assistantStreamId,
      role: "assistant",
      type: modelId === "image" ? "image" : modelId === "flash" ? "audio" : "text",
      model: modelId,
      content: "",
    };

    const withUser: Conversation = {
      ...active,
      messages: [...active.messages, userMessage, assistantSeed],
      updatedAt: Date.now(),
      title:
        active.title === "New chat"
          ? titleFromFirstUser({
              ...active,
              messages: [...active.messages, userMessage],
            })
          : active.title,
    };
    setStore((prev) => ({
      ...prev,
      conversations: prev.conversations.map((c) =>
        c.id === prev.activeId ? withUser : c
      ),
    }));
    setInput("");
    setPendingImages([]);
    setStreamingId(assistantStreamId);
    setBusy(true);

    const controller = new AbortController();
    chatAbortRef.current = controller;

    let deltaArrived = false;
    let audioArrived = false;

    try {
      const payloadMessages = buildPayloadMessages(
        [...withUser.messages.slice(0, -1)].map(
          ({ role, content, images }) => ({
            role,
            content,
            images,
          })
        )
      );

      const reply = await streamChat(
        { model: modelId, messages: payloadMessages },
        {
          onDelta: (chunk) => {
            if (nonce !== submitNonceRef.current) return;
            deltaArrived = true;
            appendDeltaToMessage(assistantStreamId, chunk);
          },
          onAudio: (audio) => {
            if (nonce !== submitNonceRef.current) return;
            audioArrived = true;
            finalizeAudioMessage(assistantStreamId, audio);
          },
        },
        controller.signal
      );

      if (nonce === submitNonceRef.current && !audioArrived) {
        // Text model reply — finalise normally
        finalizeMessage(assistantStreamId, reply);

        if (speakReplies && reply && modelId !== "image" && modelId !== "flash") {
          const plain = reply
            .replace(/```[\s\S]*?```/g, (block) =>
              block.replace(/\n/g, ". ")
            )
            .replace(/[#*`_~-]/g, "");
          playReplySpeech(plain);
        }
      }
    } catch (caught) {
      const wasAbort =
        caught instanceof Error && caught.message === "Request cancelled";
      const stale = nonce !== submitNonceRef.current;

      if (wasAbort && (stale || (!deltaArrived && !audioArrived))) {
        setStore((prev) => {
          if (!prev.activeId) return prev;
          return {
            ...prev,
            conversations: prev.conversations.map((c) =>
              c.id === prev.activeId
                ? {
                    ...c,
                    messages: c.messages.filter(
                      (m) =>
                        m.id !== assistantStreamId && m.id !== userMessage.id
                    ),
                  }
                : c
            ),
          };
        });
      } else if (wasAbort) {
        setStore((prev) => {
          if (!prev.activeId) return prev;
          return {
            ...prev,
            conversations: prev.conversations.map((c) =>
              c.id === prev.activeId
                ? {
                    ...c,
                    messages: c.messages.filter(
                      (m) => m.id !== assistantStreamId
                    ),
                  }
                : c
            ),
          };
        });
      } else {
        const message =
          caught instanceof Error ? caught.message : "Something went wrong";
        if (!stale) setError(message);
        setStore((prev) => {
          if (!prev.activeId) return prev;
          return {
            ...prev,
            conversations: prev.conversations.map((c) =>
              c.id === prev.activeId
                ? {
                    ...c,
                    messages: c.messages.filter(
                      (m) => m.id !== assistantStreamId
                    ),
                  }
                : c
            ),
          };
        });
      }
    } finally {
      if (nonce === submitNonceRef.current) {
        setBusy(false);
        setStreamingId(null);
        chatAbortRef.current = null;
      }
      if (submitNonceRef.current === nonce) {
        submitRunningRef.current = false;
      }
    }
  }

  async function toggleMic() {
    if (recording || busy) return;
    setError(null);
    setRecording(true);
    try {
      const text = await listenOnce();
      setRecording(false);
      if (text) await submit(text, pendingImages);
    } catch (caught) {
      setRecording(false);
      setError(caught instanceof Error ? caught.message : "Voice failed");
    }
  }

  const serverOk = health?.ok;
  const keyOk = health?.apiKeyConfigured;

  return (
    <div className="shell">
      {sidebarOpen ? (
        <div
          className="sidebar-backdrop"
          onClick={() => setSidebarOpen(false)}
        />
      ) : null}

      <aside className={`sidebar ${sidebarOpen ? "is-open" : ""}`}>
        <div className="sidebar-inner">
          <div className="sidebar-top">
            <button
              type="button"
              className="new-chat-btn"
              onClick={createNewChat}
            >
              <span className="plus">＋</span>
              New chat
            </button>
            <button
              type="button"
              className="sidebar-close"
              onClick={() => setSidebarOpen(false)}
              aria-label="Close sidebar"
            >
              ✕
            </button>
          </div>

          <nav className="chat-list">
            {grouped.length === 0 ? (
              <p className="chat-list-empty">No chats yet.</p>
            ) : (
              grouped.map(([label, list]) => (
                <section key={label} className="chat-group">
                  <h4>{label}</h4>
                  <ul>
                    {list.map((c) => (
                      <li key={c.id}>
                        <button
                          type="button"
                          className={`chat-row ${
                            c.id === activeId ? "is-active" : ""
                          }`}
                          onClick={() => switchConversation(c.id)}
                          title={c.title}
                        >
                          <span className="chat-row-title">{c.title}</span>
                          <span
                            className="chat-row-delete"
                            onClick={(e) => deleteConversation(c.id, e)}
                            title="Delete chat"
                            role="button"
                            tabIndex={0}
                            onKeyDown={(e) => {
                              if (e.key === "Enter" || e.key === " ")
                                deleteConversation(c.id);
                            }}
                          >
                            🗑
                          </span>
                        </button>
                      </li>
                    ))}
                  </ul>
                </section>
              ))
            )}
          </nav>

          <div className="sidebar-footer">
            <label className="speak speak-block">
              <input
                type="checkbox"
                checked={speakReplies}
                onChange={(e) => {
                  setSpeakReplies(e.target.checked);
                  if (!e.target.checked) stopReplySpeech();
                }}
              />
              Speak replies
            </label>
          </div>
        </div>
      </aside>

      <main className="main">
        <div className="main-inner">
          <header className="top">
            <button
              type="button"
              className="menu-btn"
              onClick={() => setSidebarOpen((o) => !o)}
              aria-label="Toggle sidebar"
            >
              ☰
            </button>
            <div className="brand">
              <div>
                <h1>Multimodal Chat</h1>
                <p className="model-meta">
                  <span>{getModelById(selectedModel).name}</span>
                  <span className="plan-label">Free plan</span>
                  {health ? (
                    <span className={`badge ${serverOk && keyOk ? "ok" : "warn"}`}>
                      {serverOk
                        ? keyOk
                          ? "Ready"
                          : "Key needed"
                        : "Server offline"}
                    </span>
                  ) : null}
                </p>
              </div>
            </div>
            <div className="top-actions">
              <button
                type="button"
                className="clear-btn"
                onClick={clearActiveMessages}
                disabled={busy || recording}
                title="Clear messages in this chat"
              >
                Clear chat
              </button>
            </div>
          </header>

          <div className="active-title">
            <span className="active-title-label">Current chat</span>
            <span className="active-title-name" title={active?.title}>
              {active?.title ?? "New chat"}
            </span>
          </div>

          {health && !keyOk ? (
            <div className="notice setup">
              <strong>🔧 Setup your API key to chat with the model.</strong>
              <ol>
                <li>
                  Go to{" "}
                  <a
                    href="https://openrouter.ai/keys"
                    target="_blank"
                    rel="noreferrer"
                  >
                    openrouter.ai/keys
                  </a>{" "}
                  (free sign up)
                </li>
                <li>
                  Create a key and copy it (starts with <code>sk-or-v1-...</code>)
                </li>
                <li>
                  Paste it into <code>.env</code> as{" "}
                  <code>OPENROUTER_API_KEY=...</code>
                </li>
                <li>Restart the terminal command and refresh this page</li>
              </ol>
              <p className="small">
                Once set up, ask anything, paste/upload images, or use the mic —
                I'll reply with clean formatting.
              </p>
            </div>
          ) : null}

          {health && !serverOk ? (
            <div className="notice offline">
              <strong>⚠️ Server is not reachable.</strong>
              <p>
                Make sure you ran <code>npm run dev</code> from the project root.
                The server should listen on port 3001.
              </p>
            </div>
          ) : null}

          <div className="list" ref={listRef}>
            {messages.length === 0 ? (
              <div className="empty-chat" aria-live="polite">
                <h2>Hi, how can I help?</h2>
              </div>
            ) : null}
            {messages.map((message) => {
              const msgType: MessageType = message.type ?? "text";
              return (
                <article
                  key={message.id}
                  className={`bubble ${message.role} ${
                    message.id === streamingId &&
                    !message.content &&
                    (msgType === "text" || msgType === "audio")
                      ? "is-thinking"
                      : ""
                  }`}
                >
                  {message.images && message.images.length > 0 ? (
                    <div className="bubble-images">
                      {message.images.map((url, i) => (
                        <img
                          key={i}
                          src={url}
                          alt="Uploaded"
                          className="bubble-img"
                        />
                      ))}
                    </div>
                  ) : null}

                  {msgType === "image" ? (
                    <ImageMessage
                      imageUrl={message.imageUrl ?? ""}
                      prompt={message.prompt}
                      model={message.model}
                    />
                  ) : msgType === "audio" ? (
                    message.id === streamingId && !message.content ? (
                      <span className="cursor-dots">
                        <span />
                        <span />
                        <span />
                      </span>
                    ) : (
                      <AudioMessage
                        audioUrl={message.audioUrl}
                        prompt={message.prompt ?? message.content}
                        onRegenerate={(text) => void submit(text, [], "flash")}
                      />
                    )
                  ) : message.role === "assistant" ? (
                    message.content ? (
                      <ReactMarkdown
                        components={{
                          pre: ({ children }) => (
                            <pre className="md-pre">{children}</pre>
                          ),
                          code: ({ className, children }) => {
                            const isBlock = className?.includes("language-");
                            return (
                              <code
                                className={
                                  isBlock
                                    ? "md-code md-code-block"
                                    : "md-code md-code-inline"
                                }
                              >
                                {children}
                              </code>
                            );
                          },
                          p: ({ children }) => <p className="md-p">{children}</p>,
                          h1: ({ children }) => <h2 className="md-h">{children}</h2>,
                          h2: ({ children }) => <h3 className="md-h">{children}</h3>,
                          h3: ({ children }) => <h4 className="md-h">{children}</h4>,
                          ul: ({ children }) => (
                            <ul className="md-list md-ul">{children}</ul>
                          ),
                          ol: ({ children }) => (
                            <ol className="md-list md-ol">{children}</ol>
                          ),
                          li: ({ children }) => <li className="md-li">{children}</li>,
                          strong: ({ children }) => (
                            <strong className="md-strong">{children}</strong>
                          ),
                          a: ({ href, children }) => (
                            <a
                              className="md-a"
                              href={href}
                              target="_blank"
                              rel="noreferrer"
                            >
                              {children}
                            </a>
                          ),
                          blockquote: ({ children }) => (
                            <blockquote className="md-quote">{children}</blockquote>
                          ),
                          hr: () => <hr className="md-hr" />,
                        }}
                      >
                        {message.content}
                      </ReactMarkdown>
                    ) : message.id === streamingId ? (
                      <span className="cursor-dots">
                        <span />
                        <span />
                        <span />
                      </span>
                    ) : null
                  ) : message.content ? (
                    <p>{message.content}</p>
                  ) : null}

                  {msgType === "text" &&
                  message.id === streamingId &&
                  message.content ? (
                    <span className="typing-cursor" aria-hidden="true" />
                  ) : null}
                </article>
              );
            })}
          </div>

          {error ? <p className="error">{error}</p> : null}

          {isSpeaking ? (
            <button
              type="button"
              className="stop-speaking-btn"
              onClick={stopReplySpeech}
            >
              Stop speaking
            </button>
          ) : null}

          <ModelSelector
            selectedId={selectedModel}
            onChange={setSelectedModel}
            disabled={busy || recording}
          />

          <form
            className="composer"
            ref={composerRef}
            onSubmit={(event) => {
              event.preventDefault();
              void submit(input, pendingImages);
            }}
          >
            <input
              type="file"
              ref={fileInputRef}
              accept="image/*"
              multiple
              style={{ display: "none" }}
              onChange={(e) => {
                if (e.target.files) void handleFiles(e.target.files);
                e.target.value = "";
              }}
            />
            <button
              type="button"
              className="attach-btn"
              onClick={() => fileInputRef.current?.click()}
              disabled={busy || recording || !getModelById(selectedModel).supportsAttachments}
              title="Attach image"
            >
              📎
            </button>
            <button
              type="button"
              className={recording ? "rec" : ""}
              onClick={() => void toggleMic()}
              disabled={busy || recording}
            >
              {recording ? "Listening" : "Mic"}
            </button>
            <div className="composer-input-wrap">
              {pendingImages.length > 0 ? (
                <div className="pending-images">
                  {pendingImages.map((url, i) => (
                    <div key={i} className="pending-img-box">
                      <img src={url} alt="" />
                      <button
                        type="button"
                        className="pending-img-x"
                        onClick={() => removePendingImage(i)}
                        aria-label="Remove image"
                      >
                        ✕
                      </button>
                    </div>
                  ))}
                </div>
              ) : null}
              <input
                type="text"
                value={input}
                onChange={(event) => setInput(event.target.value)}
                placeholder={
                  recording
                    ? "Listening…"
                    : pendingImages.length > 0
                    ? "Add a message (or send image only)…"
                    : getModelById(selectedModel).placeholder
                }
                disabled={busy || recording}
              />
            </div>
            <button type="submit" disabled={busy || recording}>
              Send
            </button>
          </form>
        </div>
      </main>
    </div>
  );
}
