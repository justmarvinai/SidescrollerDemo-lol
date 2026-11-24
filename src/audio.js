// A tiny chiptune synth: every sound effect and all three music loops are
// generated with WebAudio oscillators. No audio files.
const NOTE = (n) => 440 * Math.pow(2, (n - 69) / 12);

export class Audio {
  constructor() { this.ctx = null; this.muted = false; this.track = null; this.want = null; this.step = 0; this.nextT = 0; }
  unlock() {
    if (this.ctx) { if (this.ctx.state === 'suspended') this.ctx.resume(); return; }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    this.ctx = new AC();
    this.master = this.ctx.createGain(); this.master.gain.value = this.muted ? 0 : 0.5; this.master.connect(this.ctx.destination);
    this.musicGain = this.ctx.createGain(); this.musicGain.gain.value = 0.5; this.musicGain.connect(this.master);
    this.sfxGain = this.ctx.createGain(); this.sfxGain.gain.value = 0.9; this.sfxGain.connect(this.master);
    // noise buffer for hits, steps and splashes
    const len = this.ctx.sampleRate * 0.5, buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate), d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    this.noiseBuf = buf;
    if (this.want) this.music(this.want);
  }
  toggleMute() {
    this.muted = !this.muted;
    if (this.master) this.master.gain.value = this.muted ? 0 : 0.5;
    return this.muted;
  }
  tone(freq, dur, { type = 'square', vol = 0.2, slide = 0, attack = 0.004, when = 0, out = null, vib = 0 } = {}) {
    const c = this.ctx; if (!c) return;
    const t = c.currentTime + when;
    const o = c.createOscillator(), g = c.createGain();
    o.type = type; o.frequency.setValueAtTime(freq, t);
    if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(20, freq * slide), t + dur);
    if (vib) { const l = c.createOscillator(), lg = c.createGain(); l.frequency.value = 6; lg.gain.value = vib; l.connect(lg); lg.connect(o.frequency); l.start(t); l.stop(t + dur); }
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(vol, t + attack);
    g.gain.exponentialRampToValueAtTime(0.0008, t + dur);
    o.connect(g); g.connect(out || this.sfxGain);
    o.start(t); o.stop(t + dur + 0.02);
  }
  noise(dur, { vol = 0.2, freq = 1200, q = 0.8, slide = 1, type = 'bandpass', when = 0, out = null, attack = 0 } = {}) {
    const c = this.ctx; if (!c) return;
    const t = c.currentTime + when;
    const s = c.createBufferSource(); s.buffer = this.noiseBuf; s.loop = true;
    const f = c.createBiquadFilter(); f.type = type; f.frequency.setValueAtTime(freq, t); f.Q.value = q;
    if (slide !== 1) f.frequency.exponentialRampToValueAtTime(Math.max(40, freq * slide), t + dur);
    const g = c.createGain();
    if (attack) { g.gain.setValueAtTime(0.0008, t); g.gain.linearRampToValueAtTime(vol, t + attack); } else g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.0008, t + dur);
    s.connect(f); f.connect(g); g.connect(out || this.sfxGain);
    s.start(t, Math.random() * 0.3); s.stop(t + dur + 0.02);
  }
  sfx(name) {
    if (!this.ctx || this.muted) return;
    const T = (f, d, o) => this.tone(f, d, o), N = (d, o) => this.noise(d, o);
    switch (name) {
      case 'jump': T(300, 0.14, { slide: 2, vol: 0.12 }); break;
      case 'land': N(0.07, { freq: 500, vol: 0.12, slide: 0.5 }); break;
      case 'step': N(0.03, { freq: 900 + Math.random() * 500, vol: 0.035 }); break;
      case 'swing': N(0.1, { freq: 2600, slide: 0.35, vol: 0.14, q: 1.4 }); break;
      case 'swing2': N(0.16, { freq: 3200, slide: 0.25, vol: 0.18, q: 1.2 }); T(180, 0.1, { type: 'sawtooth', vol: 0.05, slide: 0.5 }); break;
      case 'hit': N(0.08, { freq: 1500, vol: 0.2, slide: 0.4 }); T(210, 0.08, { vol: 0.12, slide: 0.5 }); break;
      case 'pop': T(520, 0.12, { slide: 0.3, vol: 0.14 }); N(0.12, { freq: 900, vol: 0.12, slide: 0.3 }); break;
      case 'hurt': T(240, 0.22, { type: 'sawtooth', slide: 0.4, vol: 0.16 }); N(0.12, { freq: 700, vol: 0.14 }); break;
      case 'die': [392, 330, 262, 196].forEach((f, i) => T(f, 0.3, { when: i * 0.16, type: 'triangle', vol: 0.2 })); break;
      case 'coin': T(988, 0.06, { vol: 0.1 }); T(1319, 0.16, { vol: 0.1, when: 0.06 }); break;
      case 'heart': T(660, 0.1, { type: 'triangle', vol: 0.16 }); T(880, 0.18, { type: 'triangle', vol: 0.16, when: 0.09 }); break;
      case 'potion': [523, 659, 784, 1047].forEach((f, i) => T(f, 0.12, { when: i * 0.06, type: 'triangle', vol: 0.15 })); break;
      case 'dash': N(0.18, { freq: 500, slide: 6, vol: 0.14, q: 0.7 }); break;
      case 'cast': T(520, 0.25, { slide: 0.4, type: 'sawtooth', vol: 0.1 }); N(0.2, { freq: 1800, slide: 0.4, vol: 0.12 }); break;
      case 'boom': N(0.3, { freq: 500, slide: 0.2, vol: 0.25, type: 'lowpass' }); T(90, 0.25, { slide: 0.4, type: 'triangle', vol: 0.25 }); break;
      case 'talk': T(520 + Math.random() * 180, 0.035, { vol: 0.05 }); break;
      case 'select': T(660, 0.07, { vol: 0.1 }); T(990, 0.1, { vol: 0.1, when: 0.06 }); break;
      case 'chest': [392, 494, 587, 784, 988].forEach((f, i) => T(f, 0.16, { when: i * 0.07, vol: 0.12 })); break;
      case 'rest': [262, 330, 392, 523, 392, 523].forEach((f, i) => T(f, 0.3, { when: i * 0.11, type: 'triangle', vol: 0.16 })); break;
      case 'levelup': [523, 659, 784, 1047, 1319].forEach((f, i) => { T(f, 0.2, { when: i * 0.08, vol: 0.12 }); T(f / 2, 0.2, { when: i * 0.08, type: 'triangle', vol: 0.12 }); }); break;
      case 'splash': N(0.35, { freq: 1800, slide: 0.3, vol: 0.18, q: 0.5 }); break;
      case 'screech': T(1400, 0.16, { slide: 1.5, vol: 0.05, vib: 80 }); break;
      case 'grunt': T(110, 0.2, { type: 'sawtooth', slide: 0.7, vol: 0.12 }); break;
      case 'roar': T(70, 1.3, { type: 'sawtooth', slide: 0.5, vol: 0.3, vib: 12 }); N(1.2, { freq: 300, slide: 0.4, vol: 0.25, type: 'lowpass' }); break;
      case 'whoosh': N(0.2, { freq: 300, slide: 5, vol: 0.2, q: 0.6 }); break;
      case 'slam': N(0.45, { freq: 260, slide: 0.25, vol: 0.4, type: 'lowpass' }); T(55, 0.4, { type: 'triangle', slide: 0.5, vol: 0.4 }); break;
      case 'rumble': N(0.7, { freq: 140, vol: 0.25, type: 'lowpass' }); break;
      case 'spike': N(0.14, { freq: 2000, slide: 0.3, vol: 0.16 }); T(150, 0.12, { type: 'sawtooth', slide: 2, vol: 0.1 }); break;
      case 'ember': [392, 523, 659, 784, 1047, 1319, 1568].forEach((f, i) => { T(f, 0.6, { when: i * 0.12, type: 'triangle', vol: 0.18 }); T(f * 1.5, 0.5, { when: i * 0.12 + 0.06, vol: 0.06 }); }); N(1.5, { freq: 600, slide: 4, vol: 0.14, q: 0.4 }); break;
      default: break;
    }
  }

  // ---- music: 16-step patterns, three voices
  music(name) {
    this.want = name;
    if (!this.ctx) return;
    if (this.track === name) return;
    this.track = name; this.step = 0; this.nextT = this.ctx.currentTime + 0.08;
  }
  // call every frame; schedules notes slightly ahead of time
  tick() {
    const c = this.ctx;
    if (!c || !this.track || this.muted) { if (c) this.nextT = c.currentTime + 0.05; return; }
    const S = SONGS[this.track];
    const spb = 60 / S.bpm / 4;
    while (this.nextT < c.currentTime + 0.12) {
      const when = Math.max(0, this.nextT - c.currentTime);
      const i = this.step % S.len;
      const bar = Math.floor(i / 16) % S.chords.length, ch = S.chords[bar];
      const lead = S.lead[i];
      if (lead !== null && lead !== undefined) this.tone(NOTE(lead), spb * (S.leadLen || 2.6), { type: S.leadType || 'square', vol: S.leadVol || 0.07, when, out: this.musicGain, vib: S.vib || 0 });
      if (S.bass[i % S.bass.length]) this.tone(NOTE(ch[0] - 12 + (S.bass[i % S.bass.length] === 2 ? 7 : 0)), spb * 2.2, { type: 'triangle', vol: 0.16, when, out: this.musicGain });
      if (S.arp) { const a = S.arp[i % S.arp.length]; if (a !== null) this.tone(NOTE(ch[a % ch.length] + (a >= ch.length ? 12 : 0)), spb * 1.6, { type: 'triangle', vol: S.arpVol || 0.05, when, out: this.musicGain }); }
      if (S.drum) { const d = S.drum[i % S.drum.length]; if (d === 1) this.noise(0.07, { freq: 150, type: 'lowpass', vol: 0.3, when, out: this.musicGain }); else if (d === 2) this.noise(0.05, { freq: 5000, vol: 0.05, when, out: this.musicGain }); else if (d === 3) this.noise(0.1, { freq: 1500, vol: 0.12, when, out: this.musicGain }); }
      this.nextT += spb; this.step++;
    }
  }
}

const _ = null;
export const SONGS = {
  // warm and unhurried, D major
  village: {
    bpm: 92, len: 64, leadType: 'square', leadVol: 0.055, leadLen: 3,
    chords: [[62, 66, 69], [59, 62, 66], [67, 71, 74], [57, 61, 64]],
    lead: [
      78, _, _, 74, _, _, 76, _, 78, _, 81, _, 78, _, _, _,
      74, _, _, 71, _, _, 74, _, 76, _, 74, _, 71, _, _, _,
      79, _, _, 78, _, _, 76, _, 74, _, 76, _, 79, _, _, _,
      76, _, _, 73, _, _, 76, _, 73, _, 69, _, 73, _, _, _,
    ],
    bass: [1, 0, 0, 0, 0, 0, 2, 0, 1, 0, 0, 0, 2, 0, 0, 0],
    arp: [0, _, 1, _, 2, _, 1, _, 3, _, 2, _, 1, _, 2, _], arpVol: 0.045,
  },
  // hushed and uneasy, B minor
  forest: {
    bpm: 84, len: 64, leadType: 'triangle', leadVol: 0.11, leadLen: 4, vib: 3,
    chords: [[59, 62, 66], [55, 59, 62], [57, 61, 64], [54, 58, 61]],
    lead: [
      71, _, _, _, 74, _, _, 73, _, _, 71, _, 66, _, _, _,
      67, _, _, _, 71, _, _, 69, _, _, 67, _, 62, _, _, _,
      69, _, _, _, 73, _, _, 71, _, _, 69, _, 64, _, _, _,
      66, _, _, _, 70, _, _, 73, _, _, 70, _, 66, _, _, _,
    ],
    bass: [1, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 2, 0],
    arp: [0, 1, 2, 3, 2, 1, 0, 1, 2, 3, 4, 3, 2, 1, 2, 1], arpVol: 0.03,
    drum: [0, 0, 0, 0, 0, 0, 0, 0, 2, 0, 0, 0, 0, 0, 0, 0],
  },
  // driving, E minor
  boss: {
    bpm: 148, len: 64, leadType: 'sawtooth', leadVol: 0.05, leadLen: 1.8,
    chords: [[52, 55, 59], [52, 55, 59], [48, 52, 55], [50, 54, 57]],
    lead: [
      64, _, 64, 67, _, 64, _, 71, _, 69, _, 67, 64, _, 62, _,
      64, _, 64, 67, _, 64, _, 72, _, 71, _, 67, 69, _, 71, _,
      67, _, 67, 72, _, 67, _, 76, _, 74, _, 72, 67, _, 64, _,
      66, _, 66, 69, _, 66, _, 74, _, 73, _, 69, 66, _, 62, _,
    ],
    bass: [1, 0, 1, 0, 1, 0, 1, 2, 1, 0, 1, 0, 1, 0, 2, 1],
    arp: [0, 2, 1, 2, 0, 2, 1, 2, 0, 2, 1, 2, 3, 2, 1, 2], arpVol: 0.03,
    drum: [1, 0, 2, 0, 3, 0, 2, 0, 1, 1, 2, 0, 3, 0, 2, 2],
  },
  // the fire is lit, D major, bright
  dawn: {
    bpm: 100, len: 64, leadType: 'triangle', leadVol: 0.13, leadLen: 3.4,
    chords: [[62, 66, 69], [67, 71, 74], [59, 62, 66], [57, 61, 64]],
    lead: [
      74, _, 78, _, 81, _, _, 78, _, _, 81, _, 86, _, _, _,
      83, _, 79, _, 83, _, _, 79, _, _, 78, _, 79, _, _, _,
      78, _, 74, _, 78, _, _, 74, _, _, 71, _, 74, _, _, _,
      73, _, 76, _, 81, _, _, 76, _, _, 78, _, 81, _, _, _,
    ],
    bass: [1, 0, 0, 0, 2, 0, 0, 0, 1, 0, 0, 0, 2, 0, 1, 0],
    arp: [0, 1, 2, 3, 4, 3, 2, 1, 0, 1, 2, 3, 4, 3, 2, 1], arpVol: 0.05,
  },
};
