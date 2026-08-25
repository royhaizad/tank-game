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

  // A tank drives over a crate and equips its weapon — a quick two-note
  // rise so the swap is audible even off to the side of where you're
  // looking. Louder/brighter than playPowerupSpawn below on purpose: this
  // is the one that actually changes what you're holding.
  playPowerupEquip() {
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
  },

  // A crate appears somewhere on the map, per GAME_SPEC.md section 4. A
  // softer sine two-note rise (vs. the brighter triangle of playPowerupEquip)
  // so a spawn reads as ambient/background rather than a call to action.
  playPowerupSpawn() {
    const ctx = this._getContext();
    const now = ctx.currentTime;

    [[440, 0], [523, 0.09]].forEach(([freq, offset]) => {
      const start = now + offset;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, start);

      gain.gain.setValueAtTime(0.0001, start);
      gain.gain.exponentialRampToValueAtTime(0.1, start + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.001, start + 0.22);

      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(start);
      osc.stop(start + 0.23);
    });
  },

  // The six "a tank uses a powerup" SFX below, one per weapon that
  // actually fires (Shield never reaches these — equipping it is its only
  // action, covered by playPowerupEquip). Cannon intentionally has none:
  // it isn't a powerup.

  // Gatling: short and percussive since it repeats every ~0.09s while held
  // — anything longer or louder would turn into noise at full auto.
  playGatlingShot() {
    const ctx = this._getContext();
    const now = ctx.currentTime;

    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'square';
    osc.frequency.setValueAtTime(950, now);
    osc.frequency.exponentialRampToValueAtTime(500, now + 0.03);

    gain.gain.setValueAtTime(0.14, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.04);

    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(now);
    osc.stop(now + 0.045);
  },

  // Shotgun: filtered white-noise burst for the blast texture, plus a low
  // sine thump underneath for weight.
  playShotgunBlast() {
    const ctx = this._getContext();
    const now = ctx.currentTime;
    const duration = 0.16;

    const bufferSize = Math.ceil(ctx.sampleRate * duration);
    const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) {
      data[i] = (Math.random() * 2 - 1) * (1 - i / bufferSize); // linear fade-out
    }
    const noise = ctx.createBufferSource();
    noise.buffer = buffer;
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(2200, now);
    const noiseGain = ctx.createGain();
    noiseGain.gain.setValueAtTime(0.3, now);
    noise.connect(filter);
    filter.connect(noiseGain);
    noiseGain.connect(ctx.destination);
    noise.start(now);
    noise.stop(now + duration);

    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(160, now);
    osc.frequency.exponentialRampToValueAtTime(60, now + 0.12);
    gain.gain.setValueAtTime(0.3, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.14);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(now);
    osc.stop(now + 0.15);
  },

  // Missile: rising sawtooth "whoosh" for the launch.
  playMissileLaunch() {
    const ctx = this._getContext();
    const now = ctx.currentTime;

    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(90, now);
    osc.frequency.exponentialRampToValueAtTime(520, now + 0.3);

    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(0.18, now + 0.05);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.32);

    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(now);
    osc.stop(now + 0.33);
  },

  // Mine: a low mechanical "thunk" for the drop.
  playMineDrop() {
    const ctx = this._getContext();
    const now = ctx.currentTime;

    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'square';
    osc.frequency.setValueAtTime(110, now);
    osc.frequency.exponentialRampToValueAtTime(45, now + 0.09);

    gain.gain.setValueAtTime(0.22, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.1);

    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(now);
    osc.stop(now + 0.11);
  },

  // Laser: an instant, bright zap — no more charge-up now that the shot
  // resolves the moment fire is pressed.
  playLaserFire() {
    const ctx = this._getContext();
    const now = ctx.currentTime;

    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(1800, now);
    osc.frequency.exponentialRampToValueAtTime(300, now + 0.15);

    gain.gain.setValueAtTime(0.2, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.16);

    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(now);
    osc.stop(now + 0.17);
  },

  // A tank steps onto a still-hidden mine and reveals it — a sharp
  // two-note "uncovered" cue, distinct from playMineDrop's low thunk.
  playMineReveal() {
    const ctx = this._getContext();
    const now = ctx.currentTime;

    [[700, 0], [500, 0.06]].forEach(([freq, offset]) => {
      const start = now + offset;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(freq, start);

      gain.gain.setValueAtTime(0.0001, start);
      gain.gain.exponentialRampToValueAtTime(0.22, start + 0.01);
      gain.gain.exponentialRampToValueAtTime(0.001, start + 0.09);

      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(start);
      osc.stop(start + 0.1);
    });
  },

  // A revealed mine detonates into shrapnel — a bigger noise burst than
  // the shotgun's, plus a heavier low thump, for a real blast.
  playMineExplode() {
    const ctx = this._getContext();
    const now = ctx.currentTime;
    const duration = 0.35;

    const bufferSize = Math.ceil(ctx.sampleRate * duration);
    const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) {
      data[i] = (Math.random() * 2 - 1) * (1 - i / bufferSize); // linear fade-out
    }
    const noise = ctx.createBufferSource();
    noise.buffer = buffer;
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(1400, now);
    const noiseGain = ctx.createGain();
    noiseGain.gain.setValueAtTime(0.35, now);
    noise.connect(filter);
    filter.connect(noiseGain);
    noiseGain.connect(ctx.destination);
    noise.start(now);
    noise.stop(now + duration);

    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(120, now);
    osc.frequency.exponentialRampToValueAtTime(35, now + 0.3);
    gain.gain.setValueAtTime(0.4, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.32);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(now);
    osc.stop(now + 0.33);
  }
};
