import { useState } from 'react';
import './DebriefSection.css';
import { useLogStore } from '@/store/logStore';
import { useNexusStore } from '@/store/nexusStore';
import { analyseDebrief, type DebriefResult } from '@/lib/aiDebrief';
import type { SessionMood } from '@/types/logging';

// v1.4 — optional post-workout AI debrief. Sits in the finish block beside the
// FatigueRating dots (which stay as the always-available fallback). The user
// types a free-text note; "Analyse" sends it to the cloud Gemini proxy, which
// returns structured RPE / pain flags / mood. Stored on the session and pushed
// to Nexus. Only shown when signed in to sync (the AI call is auth-gated).

const MOOD_EMOJI: Record<SessionMood, string> = {
  great: '😄',
  good: '🙂',
  neutral: '😐',
  bad: '😕',
  terrible: '😣',
};

export function DebriefSection({ logId }: { logId: string }) {
  const setSessionDebrief = useLogStore((s) => s.setSessionDebrief);
  const configured = useNexusStore((s) => s.configured);
  const syncEnabled = useNexusStore((s) => s.syncEnabled);

  const [text, setText] = useState('');
  const [analysing, setAnalysing] = useState(false);
  const [result, setResult] = useState<DebriefResult | null>(null);
  const [failed, setFailed] = useState(false);

  // The AI call needs an authenticated Nexus session. If sync isn't on, the
  // debrief simply doesn't appear — FatigueRating still covers the basics.
  if (!configured || !syncEnabled) return null;

  async function analyse() {
    const trimmed = text.trim();
    if (!trimmed || analysing) return;
    setAnalysing(true);
    setFailed(false);
    const res = await analyseDebrief(trimmed);
    if (res) {
      setResult(res);
      setSessionDebrief(logId, {
        raw: trimmed,
        rpe: res.rpe,
        painFlags: res.painFlags,
        mood: res.mood,
        noteSummary: res.noteSummary,
      });
    } else {
      // Save the raw note even when extraction fails — nothing is lost.
      setFailed(true);
      setSessionDebrief(logId, {
        raw: trimmed,
        rpe: null,
        painFlags: [],
        mood: null,
        noteSummary: '',
      });
    }
    setAnalysing(false);
  }

  return (
    <div className="debrief">
      <span className="debrief__label">
        Debrief <span className="debrief__ai">AI</span>
      </span>
      <textarea
        className="debrief__input"
        placeholder="How did it feel? Note energy, form, any discomfort…"
        value={text}
        onChange={(e) => {
          setText(e.target.value);
          if (result || failed) {
            // Editing after an analysis invalidates the previous result.
            setResult(null);
            setFailed(false);
          }
        }}
        rows={2}
        maxLength={1000}
      />

      {!result && (
        <button
          className="debrief__analyse"
          onClick={analyse}
          disabled={!text.trim() || analysing}
        >
          {analysing ? 'Analysing…' : '✦ Analyse'}
        </button>
      )}

      {result && (
        <div className="debrief__result">
          {result.rpe != null && <span className="debrief__chip debrief__chip--rpe">RPE {result.rpe}</span>}
          {result.mood && (
            <span className="debrief__chip debrief__chip--mood">
              {MOOD_EMOJI[result.mood]} {result.mood}
            </span>
          )}
          {result.painFlags.map((p) => (
            <span key={p} className="debrief__chip debrief__chip--pain">⚠ {p}</span>
          ))}
          {result.rpe == null && !result.mood && result.painFlags.length === 0 && (
            <span className="debrief__chip">Saved</span>
          )}
        </div>
      )}

      {result?.noteSummary && <div className="debrief__summary">{result.noteSummary}</div>}

      {failed && (
        <div className="debrief__failed">Couldn't analyse — your note was saved as-is.</div>
      )}
    </div>
  );
}
