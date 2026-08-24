// Minimal synthesized sound effects via the Web Audio API — no audio
// asset files needed yet (assets/audio/ is still empty; a real audio pass
// is a later, separate build step per GAME_SPEC.md section 8).
const AudioEngine = {
  ctx: null,

  _getContext() {
    if (!this.ctx) {
      this.ctx = new (window.AudioContext || window.webkitAudioContext)();
    }
    return this.ctx;
  },

  // A short, dry "empty fire" click — feedback that a fire input was
  // registered but rejected (e.g. barrel blocked by a wall).
  playEmptyFireClick() {
    const ctx = this._getContext();
    const now = ctx.currentTime;

    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'square';
    osc.frequency.setValueAtTime(180, now);
    osc.frequency.exponentialRampToValueAtTime(60, now + 0.04);

    gain.gain.setValueAtTime(0.25, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.05);

    osc.connect(gain);
    gain.connect(ctx.destination);

    osc.start(now);
    osc.stop(now + 0.05);
  },

  // Power-up pickup chime, per GAME_SPEC.md section 8 — a quick two-note
  // rise so a crate grab is audible even when it happens off to the side
  // of where you're looking.
  playPickupChime() {
    const ctx = this._getContext();
    const now = ctx.currentTime;

    [[660, 0], [990, 0.07]].forEach(([freq, offset]) => {
      const start = now + offset;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(freq, start);

      gain.gain.setValueAtTime(0.0001, start);
      gain.gain.exponentialRampToValueAtTime(0.2, start + 0.01);
      gain.gain.exponentialRampToValueAtTime(0.001, start + 0.12);

      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(start);
      osc.stop(start + 0.13);
    });
  }
};
