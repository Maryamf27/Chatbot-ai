import { useEffect, useMemo, useRef, useState, useCallback } from "react";
import { AlertTriangle, KeyRound, ServerCrash, Square } from "lucide-react";
import { toast } from "sonner";
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
import { ImageOptionsBar } from "./components/ImageOptionsBar";
import { ChatSidebar } from "./components/ChatSidebar";
import { ChatHeader } from "./components/ChatHeader";
import { Composer } from "./components/Composer";
import { EmptyState } from "./components/EmptyState";
import { MessageRow } from "./components/MessageRow";
import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";

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
    if (!getModelById(selectedModel).supportsAttachments) return;
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
  }, [selectedModel]);

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
    setSidebarCollapsed((collapsed) => !collapsed);
  }

  /** Cancels an in-flight reply; the stream's abort path cleans up the placeholder. */
  function stopGeneration() {
    abortChat();
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
      toast.success("Share link copied to your clipboard");
    } catch {
      toast.error("Couldn't copy automatically — select the link and copy it");
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

  const activeModel = getModelById(selectedModel);
  const hasMessages = messages.length > 0;
  const statusTone: "ok" | "warn" | "down" = !health
    ? "warn"
    : !serverOk
      ? "down"
      : !keyOk
        ? "warn"
        : "ok";
  const statusLabel = !health
    ? "Connecting…"
    : !serverOk
      ? "Server offline"
      : !keyOk
        ? "API key missing"
        : "Connected";

  return (
    <div className="relative flex min-h-dvh w-full">
      <div className="app-aurora" aria-hidden="true" />

      {sidebarOpen ? (
        <div
          className="fixed inset-0 z-20 bg-background/70 backdrop-blur-sm xl:hidden"
          onClick={() => setSidebarOpen(false)}
          aria-hidden="true"
        />
      ) : null}

      <ChatSidebar
        groups={grouped}
        activeId={activeId}
        open={sidebarOpen}
        collapsed={sidebarCollapsed}
        statusLabel={statusLabel}
        statusTone={statusTone}
        onSelect={switchConversation}
        onNewChat={createNewChat}
        onDelete={requestDeleteConversation}
        onToggleCollapsed={toggleSidebar}
        onCloseMobile={() => setSidebarOpen(false)}
      />

      <main className="relative z-10 flex min-w-0 flex-1 flex-col">
        <div className="flex h-dvh w-full flex-col px-4 pt-3 pb-4 sm:px-6 lg:px-8 xl:px-12">
          <ChatHeader
            title={active?.title ?? "New chat"}
            model={activeModel}
            hasMessages={hasMessages}
            busy={busy || recording}
            speakReplies={speakReplies}
            onSpeakRepliesChange={(value) => {
              setSpeakReplies(value);
              if (!value) stopReplySpeech();
            }}
            onOpenSidebar={() => setSidebarOpen(true)}
            onNewChat={createNewChat}
            onShare={createShareUrl}
            onClearChat={requestClearActiveMessages}
          />

          {health && serverOk && !keyOk ? (
            <div className="mt-3 flex gap-3 rounded-2xl border border-chart-3/30 bg-chart-3/5 p-4 text-sm leading-relaxed">
              <KeyRound className="mt-0.5 size-5 shrink-0 text-chart-3" />
              <div className="min-w-0">
                <strong className="block font-semibold">Add an API key to start chatting</strong>
                <ol className="mt-2 mb-0 list-decimal space-y-1 pl-5 text-muted-foreground">
                  <li>
                    Create a free key at{" "}
                    <a
                      className="font-medium text-primary underline underline-offset-2"
                      href="https://openrouter.ai/keys"
                      target="_blank"
                      rel="noreferrer"
                    >
                      openrouter.ai/keys
                    </a>
                  </li>
                  <li>
                    Copy it — it starts with{" "}
                    <code className="rounded bg-background/70 px-1.5 py-0.5 font-mono text-xs">sk-or-v1-…</code>
                  </li>
                  <li>
                    Paste it into <code className="rounded bg-background/70 px-1.5 py-0.5 font-mono text-xs">.env</code>{" "}
                    as <code className="rounded bg-background/70 px-1.5 py-0.5 font-mono text-xs">OPENROUTER_API_KEY</code>
                  </li>
                  <li>Restart the dev server and refresh this page</li>
                </ol>
              </div>
            </div>
          ) : null}

          {health && !serverOk ? (
            <div className="mt-3 flex gap-3 rounded-2xl border border-destructive/30 bg-destructive/5 p-4 text-sm leading-relaxed">
              <ServerCrash className="mt-0.5 size-5 shrink-0 text-destructive" />
              <div className="min-w-0">
                <strong className="block font-semibold">Server is not reachable</strong>
                <p className="mt-1 mb-0 text-muted-foreground">
                  Run <code className="rounded bg-background/70 px-1.5 py-0.5 font-mono text-xs">npm run dev</code> from
                  the project root — the API should listen on port 3001.
                </p>
              </div>
            </div>
          ) : null}

          <div
            ref={listRef}
            className="scroll-slim -mx-1 flex min-h-0 flex-1 flex-col gap-6 overflow-y-auto px-1 py-6"
          >
            {hasMessages ? (
              messages.map((message) => (
                <MessageRow
                  key={message.id}
                  message={message}
                  isStreaming={message.id === streamingId}
                  onRegenerateAudio={(text) => void submit(text, [], "audio")}
                />
              ))
            ) : (
              <EmptyState model={activeModel} onPick={(prompt) => setInput(prompt)} />
            )}
          </div>

          <div className="flex flex-col gap-2.5">
            {error ? (
              <div
                className="flex items-center gap-2 rounded-xl border border-destructive/30 bg-destructive/10 px-3.5 py-2.5 text-sm text-destructive"
                role="alert"
              >
                <AlertTriangle className="size-4 shrink-0" />
                <span className="min-w-0 flex-1">{error}</span>
                <Button variant="ghost" size="xs" className="text-destructive" onClick={() => setError(null)}>
                  Dismiss
                </Button>
              </div>
            ) : null}

            {isSpeaking ? (
              <Button variant="destructive" size="sm" className="gap-1.5 self-start" onClick={stopReplySpeech}>
                <Square className="fill-current" />
                Stop speaking
              </Button>
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

            <Composer
              value={input}
              onChange={setInput}
              onSubmit={() => void submit(input, pendingImages)}
              onFiles={(files) => void handleFiles(files)}
              pendingImages={pendingImages}
              onRemoveImage={removePendingImage}
              placeholder={
                pendingImages.length > 0
                  ? "Add a message, or send the image on its own…"
                  : activeModel.placeholder
              }
              supportsAttachments={activeModel.supportsAttachments}
              busy={busy}
              recording={recording}
              onToggleMic={() => void toggleMic()}
              onStop={stopGeneration}
            />

            <p className="m-0 text-center text-[11px] text-muted-foreground/80">
              Press <kbd className="rounded border border-border/70 px-1 font-sans">Enter</kbd> to send,{" "}
              <kbd className="rounded border border-border/70 px-1 font-sans">Shift</kbd> +{" "}
              <kbd className="rounded border border-border/70 px-1 font-sans">Enter</kbd> for a new line. AI can make
              mistakes — double-check important details.
            </p>
          </div>
        </div>
      </main>

      <AlertDialog
        open={Boolean(pendingDeleteId) || pendingClearChat}
        onOpenChange={(open) => {
          if (!open) {
            setPendingDeleteId(null);
            setPendingClearChat(false);
          }
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {pendingClearChat ? "Clear this conversation?" : "Delete this chat?"}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {pendingClearChat
                ? "Every message in this chat will be removed."
                : "This chat and all of its messages will be removed."}{" "}
              This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel
              onClick={() => {
                setPendingDeleteId(null);
                setPendingClearChat(false);
              }}
            >
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-white hover:bg-destructive/90"
              onClick={() => {
                if (pendingClearChat) {
                  clearActiveMessages();
                } else if (pendingDeleteId) {
                  deleteConversation(pendingDeleteId);
                }
              }}
            >
              {pendingClearChat ? "Clear messages" : "Delete chat"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <Dialog open={Boolean(shareUrl)} onOpenChange={(open) => (open ? undefined : setShareUrl(null))}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Share chat</DialogTitle>
            <DialogDescription>
              Anyone with this link can open a read-only snapshot of this conversation.
            </DialogDescription>
          </DialogHeader>
          <div className="flex gap-2 max-sm:flex-col">
            <Input
              readOnly
              value={shareUrl ?? ""}
              onFocus={(event) => event.currentTarget.select()}
              aria-label="Public share URL"
              className="min-w-0 flex-1 font-mono text-xs"
            />
            <Button className="shrink-0" onClick={() => void copyShareUrl()}>
              {shareCopied ? "Copied!" : "Copy link"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
