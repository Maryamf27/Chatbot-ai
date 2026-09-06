import { useRef, useState } from "react";

type Props = {
  audioUrl?: string;
  prompt?: string;
  onRegenerate?: (prompt: string) => void;
};

function formatTime(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return "0:00";
  const minutes = Math.floor(seconds / 60);
  const remaining = Math.floor(seconds % 60).toString().padStart(2, "0");
  return `${minutes}:${remaining}`;
}

export function AudioMessage({ audioUrl, prompt, onRegenerate }: Props) {
  const playerRef = useRef<HTMLAudioElement>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [durationKnown, setDurationKnown] = useState(false);

  if (!audioUrl) {
    return (
      <div className="grid grid-cols-[auto_1fr] gap-3 rounded-xl border border-[#294c7d] bg-[#121e2e] p-4 text-[#e8eef8]">
        <div className="flex h-9 w-9 items-center justify-center rounded-full bg-[#263b59]" aria-hidden="true">🔇</div>
        <div>
          <p className="m-0 font-semibold">Audio expired</p>
          {prompt && onRegenerate ? (
            <button
              type="button"
              className="mt-2 rounded-lg bg-[#2b6cff] px-3 py-2 text-sm text-white"
              onClick={() => onRegenerate(prompt)}
            >
              Regenerate audio
            </button>
          ) : null}
          <p className="m-0 mt-2 text-sm text-[#91a7c3]">
            {prompt ? `Resend "${prompt}" to regenerate the audio.` : "Resend to regenerate the audio."}
          </p>
        </div>
      </div>
    );
  }

  function applyDuration(value: number) {
    if (Number.isFinite(value) && value > 0) {
      setDuration(value);
      setDurationKnown(true);
    }
  }

  // Some browsers (notably Chrome) report `Infinity` for a freshly-loaded
  // audio source's duration instead of the real length, which is why the
  // player used to get stuck showing "0:00 / 0:00". The fix: seek to a very
  // large timestamp, which forces the browser to resolve and report the
  // real duration via `durationchange`, then seek back to the start.
  function handleLoadedMetadata(event: React.SyntheticEvent<HTMLAudioElement>) {
    const player = event.currentTarget;
    if (Number.isFinite(player.duration) && player.duration > 0) {
      applyDuration(player.duration);
      return;
    }
    const onDurationChange = () => {
      if (Number.isFinite(player.duration) && player.duration > 0) {
        applyDuration(player.duration);
        player.currentTime = 0;
        player.removeEventListener("durationchange", onDurationChange);
      }
    };
    player.addEventListener("durationchange", onDurationChange);
    player.currentTime = 1e101;
  }

  function togglePlayback() {
    const player = playerRef.current;
    if (!player) return;
    if (player.paused) {
      void player.play().catch(() => setIsPlaying(false));
    } else {
      player.pause();
    }
  }

  function seek(value: number) {
    const player = playerRef.current;
    if (!player) return;
    player.currentTime = value;
    setCurrentTime(value);
  }

  const progressPercent = durationKnown && duration ? (currentTime / duration) * 100 : 0;

  return (
    <div className="w-full max-w-90 rounded-2xl border border-[#294c7d] bg-linear-to-b from-[#152438] to-[#101a29] p-3.5 text-[#e8eef8] shadow-[0_8px_24px_rgba(0,0,0,.25)]">
      <audio
        ref={playerRef}
        src={audioUrl}
        preload="metadata"
        onLoadedMetadata={handleLoadedMetadata}
        onTimeUpdate={(event) => {
          const { currentTime: nextTime, duration: nextDuration } = event.currentTarget;
          setCurrentTime(
            Number.isFinite(nextDuration) && nextDuration > 0 && nextDuration - nextTime < 0.1
              ? nextDuration
              : nextTime
          );
        }}
        onPlay={() => setIsPlaying(true)}
        onPause={() => setIsPlaying(false)}
        onEnded={(event) => {
          setIsPlaying(false);
          if (Number.isFinite(event.currentTarget.duration)) {
            setCurrentTime(event.currentTarget.duration);
          }
        }}
      />
      <div className="flex items-center gap-2 border-b border-[#29405d] pb-2.5 text-sm font-bold uppercase tracking-wide">
        <span
          className="flex h-5 w-5 items-center justify-center rounded-md bg-linear-to-br from-[#43c7c6] to-[#4787ef] text-xs text-[#07111f]"
          aria-hidden="true"
        >
          F
        </span>
        <span>Fish Audio</span>
        <a
          href={audioUrl}
          download
          className="ml-auto flex h-6 w-6 items-center justify-center rounded-md text-sm normal-case text-[#91a7c3] hover:bg-[#1c2c42] hover:text-[#dbe9ff]"
          title="Download audio"
          aria-label="Download audio"
        >
          ⬇
        </a>
      </div>
      <div className="flex items-center gap-3 py-3">
        <button
          type="button"
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-linear-to-br from-[#4b92ff] to-[#2962d8] text-sm text-white shadow-[0_4px_12px_rgba(43,108,255,.35)] transition-transform hover:scale-105 active:scale-95"
          onClick={togglePlayback}
          aria-label={isPlaying ? "Pause audio" : "Play audio"}
          title={isPlaying ? "Pause audio" : "Play audio"}
        >
          {isPlaying ? "❚❚" : "▶"}
        </button>
        <div className="min-w-0 flex-1">
          <input
            className="audio-seek block w-full cursor-pointer"
            type="range"
            min="0"
            max={durationKnown ? duration : 0}
            step="any"
            value={durationKnown ? Math.min(currentTime, duration) : 0}
            disabled={!durationKnown}
            onChange={(event) => seek(Number(event.target.value))}
            aria-label="Audio progress"
            style={{ "--audio-progress": `${progressPercent}%` } as React.CSSProperties}
          />
          <span className="mt-1 block text-xs font-medium tabular-nums text-[#91a7c3]">
            {formatTime(currentTime)} / {durationKnown ? formatTime(duration) : "--:--"}
          </span>
        </div>
      </div>
      {prompt ? <p className="m-0 border-t border-[#29405d] pt-2.5 text-base leading-snug">{prompt}</p> : null}
    </div>
  );
}
