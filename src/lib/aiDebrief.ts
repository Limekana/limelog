// Post-workout AI debrief — v1.4.
//
// Takes a free-text note the user types after a session and extracts structured
// quality data (RPE, pain flags, mood, a clean summary) via the shared
// `ai-generate` Supabase Edge Function (cloud Gemini — on-device Nano is
// unavailable on the S24; see the AI-1 registry blocker). Auth-gated: the
// function requires the user's Nexus JWT, so the debrief only works when signed
// in to sync. Always degrades to null on any failure — the FatigueRating dots
// remain the always-available fallback.

import { supabase, isNexusConfigured } from './supabase';
import type { SessionMood } from '@/types/logging';

export interface DebriefResult {
  rpe: number | null; // 1–10
  painFlags: string[]; // body parts with pain/discomfort
  mood: SessionMood | null;
  noteSummary: string; // clean 1-sentence rephrasing
}

const MOODS: SessionMood[] = ['great', 'good', 'neutral', 'bad', 'terrible'];

function buildPrompt(userText: string): string {
  return `Extract workout-quality data from this post-workout note. Return ONLY valid JSON matching this exact schema — no prose, no markdown fences:
{
  "rpe": <number 1-10, or null if not inferable>,
  "painFlags": <string[] of body parts mentioned with pain or discomfort; empty array if none>,
  "mood": <"great" | "good" | "neutral" | "bad" | "terrible" | null>,
  "noteSummary": <string: clean one-sentence rephrasing of the note, max 80 chars>
}

Note: "${userText.slice(0, 400).replace(/"/g, "'")}"`;
}

/** Analyse a free-text debrief note. Returns structured fields, or null on any
 *  failure (not signed in, offline, blocked, unparseable). */
export async function analyseDebrief(userText: string): Promise<DebriefResult | null> {
  if (!isNexusConfigured) return null;
  const text = userText.trim();
  if (!text) return null;
  try {
    const { data, error } = await supabase.functions.invoke<{ text?: string; error?: string }>(
      'ai-generate',
      { body: { prompt: buildPrompt(text), json: true, maxTokens: 256, temperature: 0.2 } },
    );
    if (error || !data?.text) return null;
    return parseDebrief(data.text);
  } catch {
    return null;
  }
}

function parseDebrief(raw: string): DebriefResult | null {
  let obj: unknown;
  try {
    obj = JSON.parse(raw);
  } catch {
    // Defensive: pull the first {...} block if the model wrapped it in fences.
    const m = raw.match(/\{[\s\S]*\}/);
    if (!m) return null;
    try {
      obj = JSON.parse(m[0]);
    } catch {
      return null;
    }
  }
  if (!obj || typeof obj !== 'object') return null;
  const o = obj as Record<string, unknown>;

  const rpe =
    typeof o.rpe === 'number' && o.rpe >= 1 && o.rpe <= 10 ? Math.round(o.rpe) : null;
  const painFlags = Array.isArray(o.painFlags)
    ? o.painFlags.filter((x): x is string => typeof x === 'string' && x.trim().length > 0).slice(0, 8)
    : [];
  const mood = MOODS.includes(o.mood as SessionMood) ? (o.mood as SessionMood) : null;
  const noteSummary = typeof o.noteSummary === 'string' ? o.noteSummary.slice(0, 200) : '';

  return { rpe, painFlags, mood, noteSummary };
}
