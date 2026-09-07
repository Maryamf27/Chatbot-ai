import { useEffect, useMemo, useRef, useState, useCallback } from "react";
import ReactMarkdown from "react-markdown";
import {
  fetchHealth,
  streamChat,
  buildPayloadMessages,
  type HealthStatus,
  type AudioResponse,
  type ImageResponse,
  type ImageGenerationOptions,
} from "./api";
import { listenOnce, speakText, stopSpeaking } from "./speech";
import type { ChatMessage, Conversation, ModelId, MessageType } from "./types";
import { getModelById, DEFAULT_MODEL_ID } from "./config/models";
import { ModelSelector } from "./components/ModelSelector";
import { ImageMessage } from "./components/ImageMessage";
import { ImageOptionsBar } from "./components/ImageOptionsBar";
import { AudioMessage } from "./components/AudioMessage";

const STORE_KEY = "ling-store:v2";
const PREFS_KEY = "ling-prefs:v1";
const MAX_TOTAL_BYTES = 800 * 1024;
const MAX_MSGS_PER_CONVO = 80;

function uid() {
  return crypto.randomUUID();
}

function PaperclipIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className="h-5 w-5" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.8">
      <path d="m21.4 11.6-8.8 8.8a6 6 0 0 1-8.5-8.5l9.2-9.2a4 4 0 0 1 5.7 5.7l-9.2 9.2a2 2 0 0 1-2.8-2.8l8.5-8.5" />
    </svg>
  );
}

function MicIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className="h-5 w-5" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.8">
      <rect x="9" y="2.5" width="6" height="11" rx="3" />
      <path d="M5.5 11.5a6.5 6.5 0 0 0 13 0M12 18v3.5M8.5 21.5h7" />
    </svg>
  );
}

function SidebarIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className="h-5 w-5" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.8">
      <rect x="3" y="4" width="18" height="16" rx="2.5" />
      <path d="M9 4v16M6 8h1M6 12h1M6 16h1" />
    </svg>
  );
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
    msg.model === "audio" ||
    msg.model === "image";
  const imageUrlOk =
    msg.imageUrl === undefined || typeof msg.imageUrl === "string";
  const imageFallbackUrlsOk =
    msg.imageFallbackUrls === undefined ||
    (Array.isArray(msg.imageFallbackUrls) &&
      (msg.imageFallbackUrls as unknown[]).every((url) => typeof url === "string"));
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
      imageFallbackUrlsOk &&
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

function loadSharedConversation(): StoreShape | null {
  try {
    if (typeof window === "undefined" || !window.location.hash.startsWith("#share=")) {
      return null;
    }
    const encoded = window.location.hash.slice("#share=".length);
    const parsed = JSON.parse(decodeURIComponent(encoded)) as unknown;
    if (!validConversation(parsed)) return null;
    return { conversations: [parsed], activeId: parsed.id };
  } catch {
    return null;
  }
}

function loadStore(): StoreShape {
  try {
    const shared = loadSharedConversation();
    if (shared) return shared;
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
  const [sidebarCollapsed, setSidebarCollapsed] = useState(true);
  const [pendingImages, setPendingImages] = useState<string[]>([]);
  const [imageOptions, setImageOptions] = useState<ImageGenerationOptions>({
    mode: "auto",
    aspectRatio: "auto",
    quality: "high",
  });
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null);
  const [pendingClearChat, setPendingClearChat] = useState(false);
  const [shareUrl, setShareUrl] = useState<string | null>(null);
  const [shareCopied, setShareCopied] = useState(false);

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
    if (messages.length === 0) return;
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

  function finalizeImageMessage(msgId: string, image: ImageResponse) {
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
                    ? {
                        ...m,
                        content: image.prompt,
                        imageUrl: image.imageUrl,
                        imageFallbackUrls: image.fallbackUrls,
                        imageWidth: image.width,
                        imageHeight: image.height,
                        prompt: image.prompt,
                      }
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
    setStore((prev) => {
      const emptyChat = prev.conversations.find(
        (conversation) =>
          conversation.title === "New chat" && conversation.messages.length === 0
      );
      if (emptyChat) return { ...prev, activeId: emptyChat.id };

      const convo = makeConversation();
      return {
        conversations: [convo, ...prev.conversations],
        activeId: convo.id,
      };
    });
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

  function toggleSidebar() {
    setSidebarOpen((open) => !open);
    setSidebarCollapsed((collapsed) => !collapsed);
  }

  function createShareUrl() {
    if (!active || typeof window === "undefined") return;
    const serialized = encodeURIComponent(JSON.stringify(active));
    setShareUrl(`${window.location.origin}${window.location.pathname}#share=${serialized}`);
    setShareCopied(false);
  }

  async function copyShareUrl() {
    if (!shareUrl) return;
    try {
      await navigator.clipboard.writeText(shareUrl);
    } catch {
      /* The URL remains visible for manual copying when clipboard access is blocked. */
    }
    setShareCopied(true);
    window.setTimeout(() => setShareCopied(false), 1800);
  }

  function requestDeleteConversation(id: string, ev?: React.MouseEvent) {
    ev?.stopPropagation();
    setPendingDeleteId(id);
  }

  function deleteConversation(id: string) {
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
    setPendingDeleteId(null);
  }

  useEffect(() => {
    if (!pendingDeleteId) return;
    function handleEscape(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setPendingDeleteId(null);
        setPendingClearChat(false);
      }
    }
    window.addEventListener("keydown", handleEscape);
    return () => window.removeEventListener("keydown", handleEscape);
  }, [pendingDeleteId]);

  function clearActiveMessages() {
    abortChat();
    stopReplySpeech();
    updateActive((c) => ({ ...c, messages: [] }), true);
    setError(null);
    setPendingImages([]);
    setPendingClearChat(false);
  }

  function requestClearActiveMessages() {
    setPendingClearChat(true);
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
      modelId === "image" ? "text" : modelId === "audio" ? "text" : "text";

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
      type: modelId === "image" ? "image" : modelId === "audio" ? "audio" : "text",
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
    let imageArrived = false;

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
        {
          model: modelId,
          messages: payloadMessages,
          imageOptions: modelId === "image" ? imageOptions : undefined,
        },
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
          onImage: (image) => {
            if (nonce !== submitNonceRef.current) return;
            imageArrived = true;
            finalizeImageMessage(assistantStreamId, image);
          },
        },
        controller.signal
      );

      if (nonce === submitNonceRef.current && !audioArrived && !imageArrived) {
        // Text model reply — finalise normally
        finalizeMessage(assistantStreamId, reply);

        if (speakReplies && reply && modelId !== "image" && modelId !== "audio") {
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
    <div className="app-shell relative flex min-h-screen w-full bg-[#0f141c] text-[#e8eef8]">
      {sidebarOpen ? (
        <div
          className="fixed inset-0 z-18 bg-black/45 xl:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      ) : null}

      <aside className={`app-sidebar fixed left-0 top-0 z-20 flex h-dvh w-[84%] max-w-[320px] flex-col overflow-hidden border-r border-[#1b2431] bg-[#0b0f15] transition-all xl:sticky xl:max-w-none xl:translate-x-0 ${sidebarOpen ? "translate-x-0" : "translate-x-[-102%]"} ${sidebarCollapsed ? "xl:w-18" : "xl:w-70"}`}>
        <div className={`hidden h-full flex-col items-center gap-3 border-r border-[#1b2431] p-3 ${sidebarCollapsed ? "xl:flex" : "xl:hidden"}`}>
          <button
            type="button"
            className="inline-flex h-12 w-12 items-center justify-center rounded-xl bg-[#252525] text-[#f2f4f7] hover:bg-[#30343c]"
            onClick={toggleSidebar}
            aria-label="Open chat history"
            title="Open chat history"
          >
            <SidebarIcon />
          </button>
          <button
            type="button"
            className="inline-flex h-12 w-12 items-center justify-center rounded-xl text-2xl text-[#f2f4f7] hover:bg-[#1b2027]"
            onClick={createNewChat}
            aria-label="New chat"
            title="New chat"
          >
            ＋
          </button>
        </div>
        <div className={`flex h-full flex-col gap-3 p-3 ${sidebarCollapsed ? "xl:hidden" : ""}`}>
          <div className="flex items-center gap-2">
            <button
              type="button"
              className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-[10px] border border-[#1b2431] bg-[#121822] text-[#dbe9ff] hover:border-[#2a3648] hover:bg-[#18202e]"
              onClick={toggleSidebar}
              aria-label="Close chat history"
              title="Close chat history"
            >
              <SidebarIcon />
            </button>
            <button
              type="button"
              className="inline-flex flex-1 items-center justify-center gap-2 rounded-[10px] border border-[#1b2431] bg-[#121822] px-3 py-2.5 text-sm font-medium transition hover:border-[#2a3648] hover:bg-[#18202e]"
              onClick={createNewChat}
            >
              <span className="text-lg leading-none text-[#7db4ff]">＋</span>
              New chat
            </button>
            {/* <button
              type="button"
              className="rounded-lg border border-[#1b2431] bg-transparent px-2.5 py-2 text-[#9aa8bd] xl:hidden"
              onClick={() => setSidebarOpen(false)}
              aria-label="Close sidebar"
            >
              ✕
            </button> */}
          </div>

          <nav className="flex flex-1 flex-col gap-3.5 overflow-y-auto pr-0.5">
            {grouped.length === 0 ? (
              <p className="m-0 p-3 text-sm text-[#6b7b92]">No chats yet.</p>
            ) : (
              grouped.map(([label, list]) => (
                <section key={label}>
                  <h4 className="mb-1.5 ml-2 text-xs font-semibold uppercase tracking-wide text-[#6b7b92]">{label}</h4>
                  <ul className="m-0 flex list-none flex-col gap-0 p-0">
                    {list.map((c) => (
                      <li key={c.id} className="group relative">
                        <button
                          type="button"
                          className={`flex w-full items-center gap-2 rounded-lg border px-2.5 py-2 pr-10 text-left text-sm text-[#e4e7ec] transition hover:bg-[#17202c] ${c.id === activeId ? "border-[#315fce]/45 bg-[#182942]" : "border-transparent"}`}
                          onClick={() => switchConversation(c.id)}
                          title={c.title}
                        >
                          <span className="min-w-0 flex-1 truncate">{c.title}</span>
                        </button>
                        <button
                          type="button"
                          className="absolute right-1.5 top-1/2 z-10 flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded-md text-base leading-none text-[#98a2b3] opacity-80 transition hover:bg-red-400/15 hover:text-[#ff8589] focus:opacity-100"
                          onClick={(e) => requestDeleteConversation(c.id, e)}
                          title="Delete chat"
                          aria-label={`Delete ${c.title}`}
                        >
                          🗑
                        </button>
                      </li>
                    ))}
                  </ul>
                </section>
              ))
            )}
          </nav>

          <div className="border-t border-[#1b2431] pt-2">
            <label className="flex items-center gap-2 p-2 text-sm text-[#98a2b3]">
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

      <main className="app-content min-w-0 flex-1 bg-[#0f141c]">
        <div className="mx-auto flex h-dvh min-h-screen w-full max-w-270 flex-col gap-2.5 px-5 py-4.5 max-[640px]:px-2.5 max-[820px]:px-3.5">
          <header className="app-header flex items-center justify-between gap-3 border-b border-[#252a32] px-0.5 pb-3.5 pt-1 max-[640px]:flex-wrap">
            <div className="flex items-center gap-2 xl:hidden">
            <button
              type="button"
              className="inline-flex h-10 w-10 items-center justify-center rounded-lg border border-[#252a32] bg-[#161a20] text-base text-[#c6d4e8] hover:bg-[#1b2027]"
              onClick={toggleSidebar}
              aria-label="Toggle sidebar"
              title="Toggle sidebar"
            >
              ☰
            </button>
            <button
              type="button"
              className="inline-flex h-10 w-10 items-center justify-center rounded-lg border border-[#252a32] bg-[#161a20] text-xl text-[#7db4ff] hover:bg-[#1b2027]"
              onClick={createNewChat}
              aria-label="New chat"
              title="New chat"
            >
              ＋
            </button>
            </div>
            <div className="flex shrink-0 items-center gap-2.5 max-[640px]:ml-auto">
              <button
                type="button"
                className="rounded-lg border border-[#2a313b] bg-transparent px-3 py-2 text-xs font-semibold text-[#98a2b3] hover:bg-[#1b2027]"
                onClick={createShareUrl}
                disabled={!active || messages.length === 0}
                title="Share this chat"
              >
                Share
              </button>
              <button
                type="button"
                className="rounded-lg border border-[#2a313b] bg-transparent px-3 py-2 text-xs font-semibold text-[#98a2b3] hover:bg-[#1b2027]"
                onClick={requestClearActiveMessages}
                disabled={busy || recording}
                title="Clear messages in this chat"
              >
                Clear chat
              </button>
            </div>
          </header>

          {health && serverOk && !keyOk ? (
            <div className="rounded-xl border border-[#344e7a] bg-[#161f2d] p-4 text-sm leading-relaxed text-[#e4e7ec]">
              <strong className="mb-2 block">🔧 Setup your API key to chat with the model.</strong>
              <ol className="my-2 list-decimal space-y-1 pl-5">
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
              <p className="mt-2 text-sm text-[#98a2b3]">
                Once set up, ask anything, paste/upload images, or use the mic —
                I'll reply with clean formatting.
              </p>
            </div>
          ) : null}

          {health && !serverOk ? (
            <div className="rounded-xl border border-red-400/30 bg-red-400/10 p-4 text-sm leading-relaxed text-[#e4e7ec]">
              <strong>⚠️ Server is not reachable.</strong>
              <p>
                Make sure you ran <code className="rounded bg-[#0b0f15] px-1.5 py-0.5 text-xs">npm run dev</code> from the project root.
                The server should listen on port 3001.
              </p>
            </div>
          ) : null}

          <div
            className={`flex flex-col gap-2.5 py-2.5 pr-3 scrollbar-gutter-stable ${messages.length === 0 ? "min-h-30 flex-none overflow-visible" : "min-h-0 flex-1 overflow-y-auto"}`}
            ref={listRef}
          >
            {messages.length === 0 ? (
              <div className="empty-state flex flex-1 flex-col items-center justify-center p-6 text-center text-[#98a2b3]" aria-live="polite">
                <h2 className="m-0 text-2xl font-semibold tracking-tight">Hi, how can I help?</h2>
              </div>
            ) : null}
            {messages.map((message) => {
              const msgType: MessageType = message.type ?? "text";
              return (
                <article
                  key={message.id}
                  className={`relative flex shrink-0 max-w-[86%] flex-col gap-2 overflow-hidden wrap-break-word rounded-[14px] px-3.5 py-3 leading-relaxed max-[640px]:max-w-[94%] ${message.role === "user" ? "self-end bg-[#315fce] text-white" : "self-start bg-[#161a20] text-[#e4e7ec]"} ${
                    message.id === streamingId &&
                    !message.content &&
                    (msgType === "text" || msgType === "audio")
                      ? "min-h-11 justify-center"
                      : ""
                  }`}
                >
                  {message.images && message.images.length > 0 ? (
                    <div className="flex flex-wrap gap-2">
                      {message.images.map((url, i) => (
                        <img
                          key={i}
                          src={url}
                          alt="Uploaded"
                          className="max-h-70 max-w-60 rounded-lg object-cover max-[640px]:max-h-40 max-[640px]:max-w-40"
                        />
                      ))}
                    </div>
                  ) : null}

                  {msgType === "image" ? (
                    <ImageMessage
                      imageUrl={message.imageUrl ?? ""}
                      fallbackUrls={message.imageFallbackUrls}
                      prompt={message.prompt}
                      model={message.model}
                      width={message.imageWidth}
                      height={message.imageHeight}
                    />
                  ) : msgType === "audio" ? (
                    message.id === streamingId && !message.content ? (
                      <span className="inline-flex items-center gap-1.5">
                        <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-[#7db4ff]" />
                        <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-[#7db4ff] [animation-delay:150ms]" />
                        <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-[#7db4ff] [animation-delay:300ms]" />
                      </span>
                    ) : (
                      <AudioMessage
                        audioUrl={message.audioUrl}
                        prompt={message.prompt ?? message.content}
                        onRegenerate={(text) => void submit(text, [], "audio")}
                      />
                    )
                  ) : message.role === "assistant" ? (
                    message.content ? (
                      <ReactMarkdown
                        components={{
                          pre: ({ children }) => (
                            <pre className="my-2 overflow-x-auto rounded-lg bg-[#0b0f15] p-3 text-sm">{children}</pre>
                          ),
                          code: ({ className, children }) => {
                            const isBlock = className?.includes("language-");
                            return (
                              <code
                                className={
                                  isBlock
                                    ? "block"
                                    : "rounded bg-[#0b0f15] px-1.5 py-0.5 text-[.88em]"
                                }
                              >
                                {children}
                              </code>
                            );
                          },
                          p: ({ children }) => <p className="m-0">{children}</p>,
                          h1: ({ children }) => <h2 className="mb-2 mt-3 text-xl font-bold first:mt-0">{children}</h2>,
                          h2: ({ children }) => <h3 className="mb-2 mt-3 text-lg font-bold first:mt-0">{children}</h3>,
                          h3: ({ children }) => <h4 className="mb-2 mt-3 font-bold first:mt-0">{children}</h4>,
                          ul: ({ children }) => (
                            <ul className="my-2 list-disc space-y-1 pl-5">{children}</ul>
                          ),
                          ol: ({ children }) => (
                            <ol className="my-2 list-decimal space-y-1 pl-5">{children}</ol>
                          ),
                          li: ({ children }) => <li>{children}</li>,
                          strong: ({ children }) => (
                            <strong className="font-bold text-white">{children}</strong>
                          ),
                          a: ({ href, children }) => (
                            <a
                              className="text-[#7db4ff] underline hover:text-[#a7c2ff]"
                              href={href}
                              target="_blank"
                              rel="noreferrer"
                            >
                              {children}
                            </a>
                          ),
                          blockquote: ({ children }) => (
                            <blockquote className="my-2 border-l-2 border-[#344e7a] bg-[#1a273d] px-3 py-1.5 italic text-[#98a2b3]">{children}</blockquote>
                          ),
                          hr: () => <hr className="my-3 border-0 border-t border-[#252a32]" />,
                        }}
                      >
                        {message.content}
                      </ReactMarkdown>
                    ) : message.id === streamingId ? (
                      <span className="inline-flex items-center gap-1.5">
                        <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-[#7db4ff]" />
                        <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-[#7db4ff] [animation-delay:150ms]" />
                        <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-[#7db4ff] [animation-delay:300ms]" />
                      </span>
                    ) : null
                  ) : message.content ? (
                    <p>{message.content}</p>
                  ) : null}

                  {msgType === "text" &&
                  message.id === streamingId &&
                  message.content ? (
                    <span className="ml-0.5 inline-block h-[1.1em] w-1 animate-pulse align-bottom bg-[#7db4ff]" aria-hidden="true" />
                  ) : null}
                </article>
              );
            })}
          </div>

          {error ? <p className="m-0 text-sm text-[#f97068]">{error}</p> : null}

          {isSpeaking ? (
            <button
              type="button"
              className="self-start border border-red-400/50 bg-red-400/10 px-2.5 py-1.5 text-sm text-[#fca5a0]"
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

          {selectedModel === "image" ? (
            <ImageOptionsBar
              value={imageOptions}
              onChange={setImageOptions}
              disabled={busy || recording}
            />
          ) : null}

          <form
            className="composer flex items-end gap-0 max-[640px]:flex-wrap"
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
              className="order-1 inline-flex h-10 w-10 shrink-0 items-center justify-center border-0 bg-transparent p-0 text-[#98a2b3] hover:bg-[#252d3a] hover:text-[#dbe9ff]"
              onClick={() => fileInputRef.current?.click()}
              disabled={busy || recording || !getModelById(selectedModel).supportsAttachments}
              title="Attach image"
              aria-label="Attach image"
            >
              <PaperclipIcon />
            </button>
            <button
              type="button"
              className={`order-3 inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full border-0 p-0 ${recording ? "bg-red-400/15 text-[#f97068]" : "bg-transparent text-[#98a2b3] hover:bg-[#252d3a] hover:text-[#dbe9ff]"}`}
              onClick={() => void toggleMic()}
              disabled={busy || recording}
              aria-label={recording ? "Listening" : "Use microphone"}
              title={recording ? "Listening" : "Use microphone"}
            >
              <MicIcon />
            </button>
            <div className="order-2 flex min-w-0 flex-1 flex-col gap-1.5">
              {pendingImages.length > 0 ? (
                <div className="flex flex-wrap gap-2 rounded-lg border border-[#2a313b] bg-[#15191e] p-1.5">
                  {pendingImages.map((url, i) => (
                    <div key={i} className="relative h-16 w-16 overflow-hidden rounded-lg border border-[#2a313b]">
                      <img src={url} alt="" className="h-full w-full object-cover" />
                      <button
                        type="button"
                        className="absolute right-0.5 top-0.5 min-w-0 rounded-md border-0 bg-black/65 px-1.5 py-px text-xs text-white hover:bg-[#f97068]"
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
                className="w-full border-0 bg-transparent px-2 py-2.5 text-[#f2f4f7] placeholder:text-[#667085] focus:outline-none focus:ring-0"
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
            <button type="submit" className="order-4 inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[#5b8def] p-0 text-lg font-semibold text-white hover:bg-[#6b9bff] max-[640px]:w-10" disabled={busy || recording} aria-label="Send message" title="Send message">
              ↑
            </button>
          </form>
        </div>
      </main>

      {pendingDeleteId || pendingClearChat ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-[#05070b]/75 px-4 backdrop-blur-[2px]"
          role="presentation"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) {
              setPendingDeleteId(null);
              setPendingClearChat(false);
            }
          }}
        >
          <div
            className="w-full max-w-140 rounded-xl border border-[#252f3d] bg-[#111821] p-6 text-[#e8eef8] shadow-[0_22px_70px_rgba(0,0,0,.45)] max-[640px]:p-5"
            role="alertdialog"
            aria-modal="true"
            aria-labelledby="chat-action-title"
            aria-describedby="chat-action-description"
          >
            <div className="flex items-start gap-5 max-[640px]:gap-3.5">
              <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-full border-2 border-[#667085]/45 text-3xl text-[#d0d5dd] max-[640px]:h-13 max-[640px]:w-13 max-[640px]:text-2xl" aria-hidden="true">
                △
              </div>
              <div className="min-w-0 flex-1 pt-0.5">
                <h2 id="chat-action-title" className="m-0 text-xl font-bold text-white">Warning!</h2>
                <p id="chat-action-description" className="mt-2 text-base leading-relaxed text-[#98a2b3]">
                  {pendingClearChat ? "You will lose all messages in this chat." : "You will lose all of your data by deleting this chat."}<br />
                  This action cannot be undone.
                </p>
              </div>
            </div>
            <div className="mt-6 flex justify-end gap-2.5">
              <button
                type="button"
                className="rounded-lg bg-[#2a323e] px-4 py-2.5 text-sm font-semibold text-[#e4e7ec] transition hover:bg-[#354050] focus:outline-none focus:ring-2 focus:ring-[#7db4ff]/50"
                onClick={() => {
                  setPendingDeleteId(null);
                  setPendingClearChat(false);
                }}
              >
                Cancel
              </button>
              <button
                type="button"
                className="rounded-lg bg-[#ffb8ba] px-4 py-2.5 text-sm font-bold text-[#a71920] transition hover:bg-[#ffcacc] focus:outline-none focus:ring-2 focus:ring-[#ff8589]/60"
                onClick={() => {
                  if (pendingClearChat) {
                    clearActiveMessages();
                  } else if (pendingDeleteId) {
                    deleteConversation(pendingDeleteId);
                  }
                }}
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {shareUrl ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-[#05070b]/75 px-4 backdrop-blur-[2px]"
          role="presentation"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) setShareUrl(null);
          }}
        >
          <div
            className="w-full max-w-140 rounded-xl border border-[#252f3d] bg-[#111821] p-6 text-[#e8eef8] shadow-[0_22px_70px_rgba(0,0,0,.45)] max-[640px]:p-5"
            role="dialog"
            aria-modal="true"
            aria-labelledby="share-chat-title"
          >
            <div className="flex items-start justify-between gap-4">
              <div>
                <h2 id="share-chat-title" className="m-0 text-xl font-bold text-white">Share chat</h2>
                <p className="mt-2 text-sm leading-relaxed text-[#98a2b3]">
                  Anyone with this public URL can open a snapshot copy of this conversation.
                </p>
              </div>
              <button
                type="button"
                className="h-8 w-8 rounded-lg text-lg text-[#98a2b3] hover:bg-[#1b2027] hover:text-white"
                onClick={() => setShareUrl(null)}
                aria-label="Close share dialog"
              >
                ×
              </button>
            </div>
            <div className="mt-5 flex gap-2 max-[640px]:flex-col">
              <input
                readOnly
                value={shareUrl}
                className="min-w-0 flex-1 rounded-lg border border-[#2a313b] bg-[#0d141f] px-3 py-2.5 text-sm text-[#c9d8ee] focus:outline-none"
                onFocus={(event) => event.currentTarget.select()}
                aria-label="Public share URL"
              />
              <button
                type="button"
                className="rounded-lg bg-[#5b8def] px-4 py-2.5 text-sm font-semibold text-white hover:bg-[#6b9bff]"
                onClick={() => void copyShareUrl()}
              >
                {shareCopied ? "Copied!" : "Copy link"}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
