/**
 * Plays a two-tone "ding" using the Web Audio API and triggers a short vibration.
 * Safe to call on any platform — silently no-ops if unavailable.
 */
export function playRestComplete(): void {
  // Vibrate: short-pause-short
  try {
    if ('vibrate' in navigator) navigator.vibrate([180, 80, 180]);
  } catch { /* vibration is best-effort — ignore if unsupported/blocked */ }

  // Web Audio ding: 880 Hz → 660 Hz, ~1 s decay
  try {
    const ctx = new AudioContext();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.type = 'sine';
    osc.frequency.setValueAtTime(880, ctx.currentTime);
    osc.frequency.setValueAtTime(660, ctx.currentTime + 0.12);
    gain.gain.setValueAtTime(0.4, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 1.0);
    osc.start(ctx.currentTime);
    osc.stop(ctx.currentTime + 1.0);
    // Close context after sound finishes to free resources
    setTimeout(() => ctx.close(), 1200);
  } catch { /* Web Audio is best-effort — ignore if unavailable */ }
}
