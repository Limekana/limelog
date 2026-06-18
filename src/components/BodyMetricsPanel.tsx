// ── v1.2 BodyMetricsPanel ─────────────────────────────────────────────────
//
// All-in-one panel rendered inside ProgressPage's "Body" tab. Three regions:
//   1. Log card — weight (always shown) + opt-in measurements + notes.
//      "Today" button pre-fills today's date; date input lets the user
//      back-fill or correct an older entry.
//   2. Trend chart — last-90-days weight series with a 7-day MA overlay,
//      plus a delta pill ("−1.2 kg over 30d").
//   3. Photos — date-keyed local-only progress photos with capture button.
//
// Settings inline — the "Track…" chip row lets the user toggle which
// measurement fields appear in the form, so a weight-only user isn't
// confronted with six empty inputs.

import { useMemo, useRef, useState } from 'react';
import { Capacitor } from '@capacitor/core';
import {
  Camera as CapacitorCamera,
  CameraResultType,
  CameraSource,
} from '@capacitor/camera';
import { Button, Card } from '@/components/ui';
import { Camera, Trash2 } from 'lucide-react';
import { useBodyMetricsStore } from '@/store/bodyMetricsStore';
import {
  formatLength,
  formatWeight,
  kgToLb,
  lbToKg,
  cmToIn,
  inToCm,
} from '@/types/bodyMetrics';
import {
  weightSeries,
  weightTrendOverDays,
} from '@/lib/bodyMetricsAnalysis';
import {
  savePhoto,
  savePhotoFromDataUrl,
  getPhoto,
  deletePhoto,
  listPhotos,
  type ProgressPhoto,
} from '@/lib/progressPhotos';
import './BodyMetricsPanel.css';

function todayLocalIso(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

const TRACK_OPTIONS = [
  { key: 'trackChest' as const, label: 'Chest' },
  { key: 'trackWaist' as const, label: 'Waist' },
  { key: 'trackHips' as const, label: 'Hips' },
  { key: 'trackArms' as const, label: 'Arms' },
  { key: 'trackLegs' as const, label: 'Legs' },
];

interface FormState {
  date: string;
  weight: string;
  chest: string;
  waist: string;
  hips: string;
  arms: string;
  legs: string;
  notes: string;
}

const EMPTY_FORM: FormState = {
  date: todayLocalIso(),
  weight: '',
  chest: '',
  waist: '',
  hips: '',
  arms: '',
  legs: '',
  notes: '',
};

export function BodyMetricsPanel({ showTrend = true }: { showTrend?: boolean } = {}) {
  const metrics = useBodyMetricsStore((s) => s.metrics);
  const prefs = useBodyMetricsStore((s) => s.prefs);
  const addOrUpdate = useBodyMetricsStore((s) => s.addOrUpdate);
  const remove = useBodyMetricsStore((s) => s.remove);
  const updatePrefs = useBodyMetricsStore((s) => s.updatePrefs);

  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [photoNotice, setPhotoNotice] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [photosNonce, setPhotosNonce] = useState(0); // re-renders gallery

  const unit = prefs.unitSystem;
  const isImperial = unit === 'imperial';

  // ── Derived ────────────────────────────────────────────────────────────
  const sorted = useMemo(
    () => [...metrics].sort((a, b) => (a.date < b.date ? 1 : -1)),
    [metrics],
  );
  const series = useMemo(() => weightSeries(metrics), [metrics]);
  const trend30 = useMemo(() => weightTrendOverDays(series, 30), [series]);

  // Photo list driven by nonce so save/delete refreshes synchronously.
  const photos = useMemo(() => listPhotos(), [photosNonce]);
  const photoForFormDate = getPhoto(form.date);

  // ── Form parsing ───────────────────────────────────────────────────────
  function parseWeightInputToKg(input: string): number | undefined {
    if (!input) return undefined;
    const n = parseFloat(input);
    if (!isFinite(n) || n <= 0) return undefined;
    return isImperial ? lbToKg(n) : n;
  }
  function parseLengthInputToCm(input: string): number | undefined {
    if (!input) return undefined;
    const n = parseFloat(input);
    if (!isFinite(n) || n <= 0) return undefined;
    return isImperial ? inToCm(n) : n;
  }

  function handleSave() {
    const payload = {
      date: form.date,
      weightKg: parseWeightInputToKg(form.weight),
      chestCm: prefs.trackChest ? parseLengthInputToCm(form.chest) : undefined,
      waistCm: prefs.trackWaist ? parseLengthInputToCm(form.waist) : undefined,
      hipsCm: prefs.trackHips ? parseLengthInputToCm(form.hips) : undefined,
      armsCm: prefs.trackArms ? parseLengthInputToCm(form.arms) : undefined,
      legsCm: prefs.trackLegs ? parseLengthInputToCm(form.legs) : undefined,
      notes: form.notes.trim() || undefined,
    };
    // Suppress if nothing actually filled in.
    const filled =
      payload.weightKg != null ||
      payload.chestCm != null ||
      payload.waistCm != null ||
      payload.hipsCm != null ||
      payload.armsCm != null ||
      payload.legsCm != null ||
      payload.notes != null;
    if (!filled) return;
    addOrUpdate(payload);
    setForm(EMPTY_FORM);
  }

  function loadEntryIntoForm(date: string) {
    const row = metrics.find((m) => m.date === date);
    if (!row) return;
    setForm({
      date: row.date,
      weight: row.weightKg != null
        ? String(isImperial ? kgToLb(row.weightKg).toFixed(1) : row.weightKg)
        : '',
      chest: row.chestCm != null
        ? String(isImperial ? cmToIn(row.chestCm).toFixed(1) : row.chestCm)
        : '',
      waist: row.waistCm != null
        ? String(isImperial ? cmToIn(row.waistCm).toFixed(1) : row.waistCm)
        : '',
      hips: row.hipsCm != null
        ? String(isImperial ? cmToIn(row.hipsCm).toFixed(1) : row.hipsCm)
        : '',
      arms: row.armsCm != null
        ? String(isImperial ? cmToIn(row.armsCm).toFixed(1) : row.armsCm)
        : '',
      legs: row.legsCm != null
        ? String(isImperial ? cmToIn(row.legsCm).toFixed(1) : row.legsCm)
        : '',
      notes: row.notes ?? '',
    });
  }

  // v1.2.1 — native capture via @capacitor/camera.
  //
  // Why this and not <input type="file" capture="environment">:
  // the file-input path used `<input>` + WebChromeClient.onShowFileChooser
  // to launch the camera intent. On low-memory Android devices the OS often
  // kills LimeLog's process while the camera app is in the foreground —
  // when the user finishes capturing, MainActivity is recreated, the
  // WebView reloads index.html, the React tree mounts fresh, and the
  // ValueCallback registered for the file picker is gone with the prior
  // process. Net symptom: app appears to "reload to home" after capture
  // and the photo is silently dropped.
  //
  // @capacitor/camera persists the capture URI on the native side and
  // re-delivers the result on Activity recreation via a saved-instance
  // bundle, so the Promise resolves correctly after process death. The
  // plugin also applies width + quality at capture time, so we skip the
  // canvas resize on this path (savePhotoFromDataUrl bypasses it).
  //
  // Web path keeps using <input type="file"> + canvas pipeline — no
  // process-kill risk in a browser tab, and Capacitor.isNativePlatform()
  // gates the plugin call so non-Android builds don't fail at import.
  async function capturePhotoNative() {
    setPhotoNotice(null);
    try {
      const photo = await CapacitorCamera.getPhoto({
        quality: 72,
        width: 600,
        // Matches our existing canvas resize bounds. The plugin scales
        // the long edge to `width` while preserving aspect, identical to
        // the web canvas pipeline's `MAX_WIDTH=600`.
        allowEditing: false,
        resultType: CameraResultType.DataUrl,
        source: CameraSource.Camera,
        saveToGallery: false,
        // promptLabelHeader is only shown when source is Prompt — we go
        // straight to camera here, so it's unused but harmless to omit.
      });
      const dataUrl = photo.dataUrl;
      if (!dataUrl) {
        setPhotoNotice('Camera returned no image.');
        return;
      }
      const { evicted } = await savePhotoFromDataUrl(form.date, dataUrl);
      setPhotosNonce((n) => n + 1);
      if (evicted > 0) {
        setPhotoNotice(
          `Saved. Oldest ${evicted} photo${evicted === 1 ? '' : 's'} removed to free space.`,
        );
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      // User-cancelled is the plugin's standard "User cancelled photos
      // app" error — silently no-op instead of flashing a scary message.
      if (/cancel/i.test(msg)) return;
      setPhotoNotice(msg || 'Could not save photo.');
    }
  }

  async function handlePhotoCapture(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setPhotoNotice(null);
    try {
      const { evicted } = await savePhoto(form.date, file);
      setPhotosNonce((n) => n + 1);
      if (evicted > 0) {
        setPhotoNotice(`Saved. Oldest ${evicted} photo${evicted === 1 ? '' : 's'} removed to free space.`);
      }
    } catch (err) {
      setPhotoNotice(err instanceof Error ? err.message : 'Could not save photo.');
    }
    // Reset input so the same file path can be re-selected.
    if (fileInputRef.current) fileInputRef.current.value = '';
  }

  const useNativeCapture = Capacitor.isNativePlatform();

  function handlePhotoDelete(p: ProgressPhoto) {
    if (!confirm(`Delete photo from ${p.date}?`)) return;
    deletePhoto(p.date);
    setPhotosNonce((n) => n + 1);
  }

  // ── Render ─────────────────────────────────────────────────────────────
  return (
    <div className="body-metrics-panel">
      {/* Unit + tracked-fields prefs */}
      <Card padding="md" className="body-metrics-prefs">
        <div className="body-metrics-prefs__row">
          <span className="body-metrics-prefs__label">Units</span>
          <div className="body-metrics-prefs__unit-toggle" role="radiogroup" aria-label="Unit system">
            <button
              type="button"
              role="radio"
              aria-checked={unit === 'metric'}
              className={unit === 'metric' ? 'is-on' : ''}
              onClick={() => updatePrefs({ unitSystem: 'metric' })}
            >
              kg / cm
            </button>
            <button
              type="button"
              role="radio"
              aria-checked={unit === 'imperial'}
              className={unit === 'imperial' ? 'is-on' : ''}
              onClick={() => updatePrefs({ unitSystem: 'imperial' })}
            >
              lb / in
            </button>
          </div>
        </div>
        <div className="body-metrics-prefs__row">
          <span className="body-metrics-prefs__label">Track</span>
          <div className="body-metrics-prefs__chips">
            {TRACK_OPTIONS.map((opt) => {
              const on = prefs[opt.key];
              return (
                <button
                  type="button"
                  key={opt.key}
                  aria-pressed={on}
                  className={`body-chip ${on ? 'is-on' : ''}`}
                  onClick={() => updatePrefs({ [opt.key]: !on })}
                >
                  {opt.label}
                </button>
              );
            })}
          </div>
        </div>
      </Card>

      {/* Log form */}
      <Card padding="md">
        <h3 className="body-metrics-section__title">Log entry</h3>
        <div className="body-metrics-form">
          <label className="body-metrics-form__field">
            <span>Date</span>
            <input
              type="date"
              value={form.date}
              onChange={(e) => {
                const v = e.target.value;
                setForm((f) => ({ ...f, date: v }));
                loadEntryIntoForm(v);
              }}
            />
          </label>
          <label className="body-metrics-form__field">
            <span>Weight ({isImperial ? 'lb' : 'kg'})</span>
            <input
              type="number"
              inputMode="decimal"
              step="0.1"
              placeholder={isImperial ? '180.0' : '82.5'}
              value={form.weight}
              onChange={(e) => setForm((f) => ({ ...f, weight: e.target.value }))}
            />
          </label>
          {prefs.trackChest && (
            <label className="body-metrics-form__field">
              <span>Chest ({isImperial ? 'in' : 'cm'})</span>
              <input type="number" inputMode="decimal" step="0.1"
                value={form.chest}
                onChange={(e) => setForm((f) => ({ ...f, chest: e.target.value }))}
              />
            </label>
          )}
          {prefs.trackWaist && (
            <label className="body-metrics-form__field">
              <span>Waist ({isImperial ? 'in' : 'cm'})</span>
              <input type="number" inputMode="decimal" step="0.1"
                value={form.waist}
                onChange={(e) => setForm((f) => ({ ...f, waist: e.target.value }))}
              />
            </label>
          )}
          {prefs.trackHips && (
            <label className="body-metrics-form__field">
              <span>Hips ({isImperial ? 'in' : 'cm'})</span>
              <input type="number" inputMode="decimal" step="0.1"
                value={form.hips}
                onChange={(e) => setForm((f) => ({ ...f, hips: e.target.value }))}
              />
            </label>
          )}
          {prefs.trackArms && (
            <label className="body-metrics-form__field">
              <span>Arms ({isImperial ? 'in' : 'cm'})</span>
              <input type="number" inputMode="decimal" step="0.1"
                value={form.arms}
                onChange={(e) => setForm((f) => ({ ...f, arms: e.target.value }))}
              />
            </label>
          )}
          {prefs.trackLegs && (
            <label className="body-metrics-form__field">
              <span>Legs ({isImperial ? 'in' : 'cm'})</span>
              <input type="number" inputMode="decimal" step="0.1"
                value={form.legs}
                onChange={(e) => setForm((f) => ({ ...f, legs: e.target.value }))}
              />
            </label>
          )}
          <label className="body-metrics-form__field body-metrics-form__field--full">
            <span>Notes</span>
            <textarea
              rows={2}
              placeholder="Optional context"
              value={form.notes}
              onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
            />
          </label>
        </div>
        <Button variant="primary" fullWidth onClick={handleSave}>
          Save entry
        </Button>
      </Card>

      {/* Trend chart — suppressed when the page renders its own summary card
          (BodyMetricsSummaryCard) so we don't show two weight charts. */}
      {showTrend && (
      <Card padding="md">
        <div className="body-metrics-section__header">
          <h3 className="body-metrics-section__title">Weight trend</h3>
          {trend30 && (
            <span
              className={`body-metrics-trend-pill ${
                trend30.deltaKg < -0.2
                  ? 'is-down'
                  : trend30.deltaKg > 0.2
                    ? 'is-up'
                    : 'is-flat'
              }`}
            >
              {trend30.deltaKg > 0 ? '+' : ''}
              {isImperial
                ? `${kgToLb(trend30.deltaKg).toFixed(1)} lb`
                : `${trend30.deltaKg.toFixed(1)} kg`}{' '}
              over {trend30.days}d
            </span>
          )}
        </div>
        {series.length === 0 ? (
          <p className="body-metrics-empty">
            Log your weight to see your trend.
          </p>
        ) : (
          <WeightChart series={series} isImperial={isImperial} />
        )}
      </Card>
      )}

      {/* Recent entries */}
      {sorted.length > 0 && (
        <Card padding="md">
          <h3 className="body-metrics-section__title">Recent entries</h3>
          <div className="body-metrics-list">
            {sorted.slice(0, 10).map((row) => (
              <div key={row.id} className="body-metrics-list__row">
                <div className="body-metrics-list__date">{row.date}</div>
                <div className="body-metrics-list__values">
                  {row.weightKg != null && (
                    <span>{formatWeight(row.weightKg, unit)}</span>
                  )}
                  {row.waistCm != null && (
                    <span className="body-metrics-list__meta">
                      Waist {formatLength(row.waistCm, unit)}
                    </span>
                  )}
                </div>
                <button
                  type="button"
                  className="body-metrics-list__delete"
                  aria-label={`Delete entry for ${row.date}`}
                  onClick={() => {
                    if (confirm(`Delete entry for ${row.date}?`)) remove(row.id);
                  }}
                >
                  <Trash2 size={14} aria-hidden />
                </button>
              </div>
            ))}
          </div>
        </Card>
      )}

      {/* Photos */}
      <Card padding="md">
        <div className="body-metrics-section__header">
          <h3 className="body-metrics-section__title">Progress photos</h3>
          <span className="body-metrics-section__subtle">Local only · never synced</span>
        </div>
        <div className="body-metrics-photo-capture">
          {useNativeCapture ? (
            // v1.2.1 — native capture button. Uses @capacitor/camera so the
            // capture survives process kill while the camera app is in the
            // foreground (Android low-memory devices were silently losing
            // photos via the <input type="file"> path).
            <button
              type="button"
              className="body-metrics-photo-label"
              onClick={capturePhotoNative}
            >
              <Camera size={14} aria-hidden /> Capture for {form.date}
            </button>
          ) : (
            <>
              <input
                ref={fileInputRef}
                id="body-metrics-photo-input"
                type="file"
                accept="image/*"
                capture="environment"
                onChange={handlePhotoCapture}
                className="body-metrics-photo-input"
              />
              <label htmlFor="body-metrics-photo-input" className="body-metrics-photo-label">
                <Camera size={14} aria-hidden /> Capture for {form.date}
              </label>
            </>
          )}
          {photoForFormDate && (
            <span className="body-metrics-photo-existing">
              Photo already saved for this date — capturing will overwrite.
            </span>
          )}
        </div>
        {photoNotice && (
          <div className="body-metrics-photo-notice" role="status">
            {photoNotice}
          </div>
        )}
        {photos.length === 0 ? (
          <p className="body-metrics-empty">
            No photos saved yet. They live on this device only — never uploaded.
          </p>
        ) : (
          <div className="body-metrics-photo-grid">
            {photos.map((p) => (
              <figure key={p.date} className="body-metrics-photo">
                <img src={p.dataUrl} alt={`Progress photo from ${p.date}`} loading="lazy" />
                <figcaption className="body-metrics-photo__caption">
                  {p.date}
                  <button
                    type="button"
                    className="body-metrics-photo__delete"
                    aria-label={`Delete photo from ${p.date}`}
                    onClick={() => handlePhotoDelete(p)}
                  >
                    <Trash2 size={12} aria-hidden />
                  </button>
                </figcaption>
              </figure>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}

// ── WeightChart ────────────────────────────────────────────────────────────
//
// Inline SVG line chart for the weight series + 7d MA overlay. No
// third-party charting lib — keeps the bundle slim and matches the LoadChart
// / OneRMChart pattern already in the codebase.

interface WeightChartProps {
  series: ReturnType<typeof weightSeries>;
  isImperial: boolean;
}

function WeightChart({ series, isImperial }: WeightChartProps) {
  const w = 320;
  const h = 140;
  const padL = 24;
  const padR = 8;
  const padT = 12;
  const padB = 22;

  // Limit to last 90 entries so the chart stays readable.
  const data = series.slice(-90);
  const xs = data.map((_, i) => i);
  const ys = data.map((p) => p.weightKg);
  const minY = Math.min(...ys) - 0.5;
  const maxY = Math.max(...ys) + 0.5;
  const xRange = Math.max(1, xs.length - 1);
  const yRange = Math.max(0.5, maxY - minY);

  function scaleX(i: number): number {
    return padL + (i / xRange) * (w - padL - padR);
  }
  function scaleY(v: number): number {
    return padT + (1 - (v - minY) / yRange) * (h - padT - padB);
  }

  const linePath = data
    .map((p, i) => `${i === 0 ? 'M' : 'L'}${scaleX(i)},${scaleY(p.weightKg)}`)
    .join(' ');
  const maPath = data
    .filter((p) => p.ma7 != null)
    .map((p, i) => `${i === 0 ? 'M' : 'L'}${scaleX(data.indexOf(p))},${scaleY(p.ma7!)}`)
    .join(' ');

  const displayMin = isImperial ? kgToLb(minY).toFixed(0) : minY.toFixed(0);
  const displayMax = isImperial ? kgToLb(maxY).toFixed(0) : maxY.toFixed(0);

  return (
    <svg
      viewBox={`0 0 ${w} ${h}`}
      width="100%"
      className="body-metrics-chart"
      role="img"
      aria-label="Weight trend chart"
    >
      <text x={padL - 4} y={padT + 4} className="body-metrics-chart__axis" textAnchor="end">
        {displayMax}
      </text>
      <text x={padL - 4} y={h - padB} className="body-metrics-chart__axis" textAnchor="end">
        {displayMin}
      </text>
      <path d={linePath} fill="none" className="body-metrics-chart__line" />
      {maPath && <path d={maPath} fill="none" className="body-metrics-chart__ma" />}
    </svg>
  );
}
