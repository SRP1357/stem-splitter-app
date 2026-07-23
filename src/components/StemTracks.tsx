import { useCallback, useEffect, useRef, useState } from "react";
import type { MouseEvent } from "react";

import type { StemName } from "../config/constants";
import {
  STEM_THEMES,
  WAVEFORM_IDLE_COLOR,
  WAVEFORM_UNPLAYED_ALPHA,
} from "../config/theme";
import { encodeWavUrlToMp3 } from "../lib/audio/mp3";
import type { StemResult } from "../hooks/useStemSeparation";

interface StemTracksProps {
  stemNames: readonly StemName[];
  results: StemResult[];
  sourceFileName: string | null;
}

/**
 * The track deck below the split-flow diagram: one lane per stem, present
 * from the start. Empty lanes are placeholders; finished lanes render the
 * stem's waveform, which fills with the stem's color during playback.
 *
 * Playback is a shared transport: starting a second lane aligns it to the
 * timestamp of whatever is already playing, so stems can be layered in and
 * stay musically in time. Seeking one playing lane scrubs them all.
 */
export function StemTracks({
  stemNames,
  results,
  sourceFileName,
}: StemTracksProps) {
  const audios = useRef(new Map<StemName, HTMLAudioElement>());

  const registerAudio = useCallback(
    (stem: StemName, element: HTMLAudioElement | null) => {
      if (element) audios.current.set(stem, element);
      else audios.current.delete(stem);
    },
    [],
  );

  /** Current time of any other lane that is actively playing. */
  const getTransportTime = useCallback((except: StemName): number | null => {
    for (const [stem, element] of audios.current) {
      if (stem !== except && !element.paused && !element.ended) {
        return element.currentTime;
      }
    }
    return null;
  }, []);

  /** Moves every other playing lane to the given time (synced scrub). */
  const seekOtherPlaying = useCallback((except: StemName, seconds: number) => {
    seekPlayingElements(audios.current, except, seconds);
  }, []);

  return (
    <section className="flex flex-col gap-2">
      {stemNames.map((stem) => (
        <TrackLane
          key={stem}
          stem={stem}
          result={results.find((result) => result.name === stem) ?? null}
          sourceFileName={sourceFileName}
          registerAudio={registerAudio}
          getTransportTime={getTransportTime}
          seekOtherPlaying={seekOtherPlaying}
        />
      ))}
    </section>
  );
}

/** Scrubs every playing element in the registry (except one) to a time. */
function seekPlayingElements(
  registry: Map<StemName, HTMLAudioElement>,
  except: StemName,
  seconds: number,
): void {
  for (const [stem, element] of registry) {
    if (stem !== except && !element.paused && !element.ended) {
      element.currentTime = seconds;
    }
  }
}

function formatTime(seconds: number): string {
  const whole = Math.max(0, Math.floor(seconds));
  const minutes = Math.floor(whole / 60);
  const rest = whole % 60;
  return `${minutes}:${rest.toString().padStart(2, "0")}`;
}

/** How long after joining playback to run the latency-compensation pass. */
const SYNC_SETTLE_DELAY_MS = 250;
/** Offsets below this are inaudible; don't churn the element for them. */
const SYNC_MIN_CORRECTION_SECONDS = 0.02;

const LANE_HEIGHT_PX = 48;
/** Fraction of the lane height the tallest waveform bar may occupy. */
const WAVEFORM_VERTICAL_FILL = 0.9;
/** Fraction of each bar slot painted (the rest is the gap between bars). */
const BAR_FILL_RATIO = 0.6;

function drawWaveform(
  canvas: HTMLCanvasElement,
  peaks: Float32Array | null,
  playedFraction: number,
  playedColor: string,
  unplayedColor: string,
): void {
  const context = canvas.getContext("2d");
  if (!context) return;

  const dpr = window.devicePixelRatio || 1;
  const width = canvas.clientWidth;
  const height = canvas.clientHeight;
  if (canvas.width !== width * dpr || canvas.height !== height * dpr) {
    canvas.width = width * dpr;
    canvas.height = height * dpr;
  }
  context.setTransform(dpr, 0, 0, dpr, 0, 0);
  context.clearRect(0, 0, width, height);

  const center = height / 2;
  if (!peaks) {
    // Placeholder: a quiet center line.
    context.fillStyle = WAVEFORM_IDLE_COLOR;
    context.fillRect(0, center - 0.5, width, 1);
    return;
  }

  const slot = width / peaks.length;
  const barWidth = Math.max(1, slot * BAR_FILL_RATIO);
  const playedBars = playedFraction * peaks.length;
  for (let i = 0; i < peaks.length; i++) {
    const barHeight = Math.max(1, peaks[i] * height * WAVEFORM_VERTICAL_FILL);
    context.fillStyle = i < playedBars ? playedColor : unplayedColor;
    context.fillRect(i * slot, center - barHeight / 2, barWidth, barHeight);
  }
}

interface TrackLaneProps {
  stem: StemName;
  result: StemResult | null;
  sourceFileName: string | null;
  registerAudio: (stem: StemName, element: HTMLAudioElement | null) => void;
  getTransportTime: (except: StemName) => number | null;
  seekOtherPlaying: (except: StemName, seconds: number) => void;
}

function TrackLane({
  stem,
  result,
  sourceFileName,
  registerAudio,
  getTransportTime,
  seekOtherPlaying,
}: TrackLaneProps) {
  const theme = STEM_THEMES[stem];
  const baseName = sourceFileName?.replace(/\.[^.]+$/, "") ?? "track";

  const audioRef = useRef<HTMLAudioElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [playedFraction, setPlayedFraction] = useState(0);
  const [currentSeconds, setCurrentSeconds] = useState(0);
  const [mp3Url, setMp3Url] = useState<string | null>(null);

  // New separation run for the same stem: reset playback state.
  const wavUrl = result?.wavUrl ?? null;
  useEffect(() => {
    setIsPlaying(false);
    setPlayedFraction(0);
    setCurrentSeconds(0);
  }, [wavUrl]);

  // Encode the MP3 as soon as the stem lands so the button downloads
  // instantly. The shared encoder worker serialises requests, so multiple
  // stems arriving together queue up rather than competing.
  useEffect(() => {
    if (!wavUrl) return;
    let cancelled = false;
    let url: string | null = null;
    encodeWavUrlToMp3(wavUrl)
      .then((blob) => {
        url = URL.createObjectURL(blob);
        if (!cancelled) setMp3Url(url);
      })
      .catch(() => {
        // WAV remains available; the MP3 button just stays in its
        // preparing state. Failures here are exceptional (OOM).
      });
    return () => {
      cancelled = true;
      if (url) URL.revokeObjectURL(url);
      setMp3Url(null);
    };
  }, [wavUrl]);

  const redraw = useCallback(() => {
    const canvas = canvasRef.current;
    if (canvas) {
      drawWaveform(
        canvas,
        result?.peaks ?? null,
        playedFraction,
        theme.color,
        `${theme.color}${WAVEFORM_UNPLAYED_ALPHA}`,
      );
    }
  }, [result, playedFraction, theme.color]);

  useEffect(redraw, [redraw]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const observer = new ResizeObserver(redraw);
    observer.observe(canvas);
    return () => observer.disconnect();
  }, [redraw]);

  // Smooth highlight while playing.
  useEffect(() => {
    if (!isPlaying) return;
    let frame = requestAnimationFrame(function tick() {
      const audio = audioRef.current;
      if (audio && audio.duration > 0) {
        setPlayedFraction(audio.currentTime / audio.duration);
        setCurrentSeconds(audio.currentTime);
      }
      frame = requestAnimationFrame(tick);
    });
    return () => cancelAnimationFrame(frame);
  }, [isPlaying]);

  const togglePlayback = () => {
    const audio = audioRef.current;
    if (!audio || !result) return;
    if (isPlaying) {
      audio.pause();
      return;
    }
    // Join the shared transport: if another stem is already playing, start
    // from its position so the layers line up musically.
    const transportTime = getTransportTime(stem);
    if (transportTime !== null && transportTime < result.durationSeconds) {
      audio.currentTime = transportTime;
    }
    void audio.play().then(() => {
      // play() takes tens of ms to actually start while the other lane keeps
      // advancing; snap to the transport once more now that we are rolling.
      const settledTime = getTransportTime(stem);
      if (settledTime !== null && settledTime < result.durationSeconds) {
        audio.currentTime = settledTime;
        // The snap itself lands late by the element's seek latency, leaving
        // a small constant lag. Measure it once and overshoot by the same
        // amount (the next seek has roughly the same latency), which brings
        // the lanes within a few milliseconds of each other.
        window.setTimeout(() => {
          if (audio.paused) return;
          const reference = getTransportTime(stem);
          if (reference === null) return;
          const offset = reference - audio.currentTime;
          if (Math.abs(offset) > SYNC_MIN_CORRECTION_SECONDS) {
            audio.currentTime += offset * 2;
          }
        }, SYNC_SETTLE_DELAY_MS);
      }
    });
  };

  const seek = (event: MouseEvent<HTMLCanvasElement>) => {
    const audio = audioRef.current;
    if (!audio || !result) return;
    const box = event.currentTarget.getBoundingClientRect();
    const fraction = Math.max(
      0,
      Math.min(1, (event.clientX - box.left) / box.width),
    );
    const seconds = fraction * result.durationSeconds;
    audio.currentTime = seconds;
    // Keep any other playing stems locked to the same position.
    seekOtherPlaying(stem, seconds);
    setPlayedFraction(fraction);
    setCurrentSeconds(seconds);
  };

  return (
    <div
      className="flex items-center gap-3 border p-3 transition-colors duration-300"
      style={{
        borderColor: result ? theme.color : "#cbd5e1", // slate-300
        backgroundColor: theme.tint,
      }}
    >
      {result && (
        <audio
          ref={(element) => {
            audioRef.current = element;
            registerAudio(stem, element);
          }}
          src={result.wavUrl}
          preload="metadata"
          onPlay={() => setIsPlaying(true)}
          onPause={() => setIsPlaying(false)}
          onEnded={() => {
            setIsPlaying(false);
            setPlayedFraction(1);
          }}
        />
      )}

      <button
        type="button"
        onClick={togglePlayback}
        disabled={!result}
        aria-label={`${isPlaying ? "Pause" : "Play"} ${stem}`}
        className="h-8 w-8 shrink-0 border text-[11px] leading-none transition-colors disabled:cursor-not-allowed"
        style={{
          borderColor: result ? theme.color : "#cbd5e1",
          color: result ? theme.color : "#94a3b8", // slate-400
        }}
      >
        {isPlaying ? "❚❚" : "▶"}
      </button>

      <span className="w-20 shrink-0 text-xs font-semibold uppercase tracking-wider text-slate-800">
        {stem}
      </span>

      <canvas
        ref={canvasRef}
        onClick={seek}
        className={`min-w-0 flex-1 ${result ? "cursor-pointer" : ""}`}
        style={{ height: LANE_HEIGHT_PX }}
      />

      <span className="w-28 shrink-0 whitespace-nowrap text-right text-xs tabular-nums text-slate-500">
        {result
          ? `${formatTime(currentSeconds)} / ${formatTime(result.durationSeconds)}`
          : "--:-- / --:--"}
      </span>

      {result && (
        <span
          className="flex shrink-0 gap-1.5"
          style={{ "--stem-color": theme.color } as React.CSSProperties}
        >
          <a
            href={result.wavUrl}
            download={`${baseName} - ${stem}.wav`}
            className="border border-[var(--stem-color)] px-2.5 py-1.5 text-xs font-semibold uppercase tracking-wider text-[var(--stem-color)] transition-colors hover:bg-[var(--stem-color)] hover:text-white"
          >
            WAV
          </a>
          {mp3Url ? (
            <a
              href={mp3Url}
              download={`${baseName} - ${stem}.mp3`}
              className="border border-[var(--stem-color)] px-2.5 py-1.5 text-xs font-semibold uppercase tracking-wider text-[var(--stem-color)] transition-colors hover:bg-[var(--stem-color)] hover:text-white"
            >
              MP3
            </a>
          ) : (
            <button
              type="button"
              disabled
              title="Preparing MP3…"
              className="cursor-wait border border-[var(--stem-color)] px-2.5 py-1.5 text-xs font-semibold uppercase tracking-wider text-[var(--stem-color)] opacity-50"
            >
              MP3
            </button>
          )}
        </span>
      )}
    </div>
  );
}
