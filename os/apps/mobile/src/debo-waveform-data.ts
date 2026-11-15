// The bars of a recording's waveform. Pure maths, no React, so it is tested.
import type { TranscriptSegment } from "./debo-data";

/** How many bars a waveform has. */
export const WAVE_BARS = 72;

/** The loudest sample in each of `bars` equal slices, scaled so the loudest bar is 1. */
export function peaksFromSamples(samples: ArrayLike<number>, bars = WAVE_BARS): number[] {
  if (samples.length === 0) return [];
  const size = Math.max(1, Math.floor(samples.length / bars));
  const peaks: number[] = [];
  for (let b = 0; b < bars; b++) {
    let peak = 0;
    const end = Math.min(samples.length, (b + 1) * size);
    // Every few samples is enough to find the peak of a slice and keeps a long file quick.
    const step = Math.max(1, Math.floor(size / 400));
    for (let i = b * size; i < end; i += step) peak = Math.max(peak, Math.abs(samples[i] ?? 0));
    peaks.push(peak);
  }
  const top = Math.max(...peaks);
  return top > 0 ? peaks.map((p) => Math.max(0.06, p / top)) : peaks.map(() => 0.06);
}

/**
 * Without the sound itself (the phone, or a file too big to read here), the bars show where
 * words were said: taller where a timed piece of the transcript is, low in the pauses.
 */
export function peaksFromSegments(segments: TranscriptSegment[], durationSeconds: number, bars = WAVE_BARS): number[] {
  if (!(durationSeconds > 0)) return Array.from({ length: bars }, () => 0.18);
  return Array.from({ length: bars }, (_, b) => {
    const from = (b / bars) * durationSeconds;
    const to = ((b + 1) / bars) * durationSeconds;
    // Flat heights on purpose: these bars show where words are, not how loud they were.
    return segments.some((s) => s.start < to && s.end > from) ? 0.55 : 0.14;
  });
}

/** A rolling picture of the live level while recording: the newest reading at the end. */
export function pushLevel(history: number[], level: number, keep = 48): number[] {
  const next = [...history, Math.max(0.04, Math.min(1, level))];
  return next.length > keep ? next.slice(next.length - keep) : next;
}
