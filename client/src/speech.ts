type SpeechRecognitionLike = {
  lang: string;
  interimResults: boolean;
  continuous: boolean;
  start: () => void;
  stop: () => void;
  onresult: ((event: { results: ArrayLike<ArrayLike<{ transcript: string }>> }) => void) | null;
  onerror: ((event: { error?: string }) => void) | null;
  onend: (() => void) | null;
};

type SpeechRecognitionCtor = new () => SpeechRecognitionLike;

function recognitionCtor(): SpeechRecognitionCtor | null {
  const w = window as Window & {
    SpeechRecognition?: SpeechRecognitionCtor;
    webkitSpeechRecognition?: SpeechRecognitionCtor;
  };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

export function speakText(text: string): Promise<void> {
  if (!("speechSynthesis" in window)) {
    return Promise.resolve();
  }

  window.speechSynthesis.cancel();
  return new Promise((resolve) => {
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.onend = () => resolve();
    utterance.onerror = () => resolve();
    window.speechSynthesis.speak(utterance);
  });
}

/** Stop any browser text-to-speech currently in progress. */
export function stopSpeaking(): void {
  if ("speechSynthesis" in window) {
    window.speechSynthesis.cancel();
  }
}

export function listenOnce(): Promise<string> {
  const Ctor = recognitionCtor();
  if (!Ctor) {
    return Promise.reject(new Error("Voice input needs Chrome or Edge."));
  }

  return new Promise((resolve, reject) => {
    const recognition = new Ctor();
    recognition.lang = navigator.language || "en-US";
    recognition.interimResults = false;
    recognition.continuous = false;
    let settled = false;

    recognition.onresult = (event) => {
      settled = true;
      const transcript = event.results[0]?.[0]?.transcript ?? "";
      resolve(transcript.trim());
    };
    recognition.onerror = (event) => {
      settled = true;
      reject(new Error(event.error === "not-allowed" ? "Microphone permission is required." : "Voice input failed."));
    };
    recognition.onend = () => {
      if (!settled) {
        resolve("");
      }
    };

    recognition.start();
  });
}

export function canUseVoice(): boolean {
  return Boolean(recognitionCtor()) && "speechSynthesis" in window;
}
