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
            {prompt ? `Resend “${prompt}” to regenerate the audio.` : "Resend to regenerate the audio."}
          </p>
        </div>
      </div>
    );
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

  return (
    <div className="w-full max-w-82.5 rounded-[14px] border border-[#294c7d] bg-[#121e2e] p-3 text-[#e8eef8]">
      <audio
        ref={playerRef}
        src={audioUrl}
        preload="metadata"
        onLoadedMetadata={(event) => setDuration(event.currentTarget.duration)}
        onTimeUpdate={(event) => {
          const { currentTime: nextTime, duration: nextDuration } = event.currentTarget;
          setCurrentTime(
            nextDuration > 0 && nextDuration - nextTime < 0.1
              ? nextDuration
              : nextTime
          );
        }}
        onPlay={() => setIsPlaying(true)}
        onPause={() => setIsPlaying(false)}
        onEnded={(event) => {
          setIsPlaying(false);
          setCurrentTime(event.currentTarget.duration);
        }}
      />
      <div className="flex items-center gap-2 border-b border-[#29405d] pb-2 text-sm font-bold uppercase tracking-wide">
        <span className="flex h-4.5 w-4.5 items-center justify-center rounded-md bg-linear-to-br from-[#43c7c6] to-[#4787ef] text-xs text-[#07111f]" aria-hidden="true">F</span>
        <span>Fish Audio</span>
      </div>
      <div className="flex items-center gap-2.5 py-2.5">
        <button
          type="button"
          className="flex h-9.5 w-9.5 shrink-0 items-center justify-center rounded-full bg-linear-to-br from-[#4b92ff] to-[#2962d8] text-sm text-white shadow-[0_4px_12px_rgba(43,108,255,.35)]"
          onClick={togglePlayback}
          aria-label={isPlaying ? "Pause audio" : "Play audio"}
          title={isPlaying ? "Pause audio" : "Play audio"}
        >
          {isPlaying ? "❚❚" : "▶"}
        </button>
        <div className="min-w-0 flex-1">
          <input
            className="block h-1.25 w-full cursor-pointer appearance-none rounded-full bg-[#34445b] accent-[#5f9cff]"
            type="range"
            min="0"
            max={duration || 0}
            step="any"
            value={Math.min(currentTime, duration || 0)}
            onChange={(event) => seek(Number(event.target.value))}
            aria-label="Audio progress"
            style={{ "--audio-progress": `${duration ? (currentTime / duration) * 100 : 0}%` } as React.CSSProperties}
          />
          <span className="block text-xs tabular-nums text-[#91a7c3]">{formatTime(currentTime)} / {formatTime(duration)}</span>
        </div>
      </div>
      {prompt ? <p className="m-0 border-t border-[#29405d] pt-2 text-base leading-snug">{prompt}</p> : null}
    </div>
  );
}
