// Sound from oscillators and short noise bursts. No audio files.
// Nothing here may throw or leave an unhandled rejection: every entry point is guarded.

export interface Sfx {
  unlock(): void;
  tick(rate: number): void;
  thud(): void;
  till(): void;
  rise(progress: number): void;
  counter(level: number): void;
  payout(up: boolean): void;
  setMuted(m: boolean): void;
}

type Ctor = new () => AudioContext;

function findContext(): Ctor | null {
  try {
    const g = globalThis as unknown as { AudioContext?: Ctor; webkitAudioContext?: Ctor };
    return g.AudioContext ?? g.webkitAudioContext ?? null;
  } catch {
    return null;
  }
}

const clamp = (n: number, lo: number, hi: number) => (Number.isFinite(n) ? Math.min(hi, Math.max(lo, n)) : lo);

export function createSfx(): Sfx {
  let ctx: AudioContext | null = null;
  let muted = false;
  let noiseBuf: AudioBuffer | null = null;

  const safe = (fn: (c: AudioContext) => void) => {
    if (muted || !ctx || ctx.state !== 'running') return;
    try {
      fn(ctx);
    } catch {
      /* sound is optional */
    }
  };

  /** One enveloped oscillator note. Gains are kept low: these are quiet ticks, not alarms. */
  function tone(c: AudioContext, freq: number, dur: number, gain: number, type: OscillatorType = 'sine', delay = 0, slideTo?: number) {
    const t0 = c.currentTime + delay;
    const o = c.createOscillator();
    const g = c.createGain();
    o.type = type;
    o.frequency.setValueAtTime(freq, t0);
    if (slideTo !== undefined) o.frequency.exponentialRampToValueAtTime(Math.max(20, slideTo), t0 + dur);
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(Math.max(0.0002, gain), t0 + Math.min(0.01, dur / 3));
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    o.connect(g);
    g.connect(c.destination);
    o.start(t0);
    o.stop(t0 + dur + 0.02);
  }

  function noise(c: AudioContext, dur: number, gain: number, freq: number, delay = 0) {
    if (!noiseBuf) {
      const len = Math.max(1, Math.floor(c.sampleRate * 0.25));
      const b = c.createBuffer(1, len, c.sampleRate);
      const d = b.getChannelData(0);
      for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
      noiseBuf = b;
    }
    const t0 = c.currentTime + delay;
    const s = c.createBufferSource();
    const f = c.createBiquadFilter();
    const g = c.createGain();
    s.buffer = noiseBuf;
    f.type = 'bandpass';
    f.frequency.value = freq;
    g.gain.setValueAtTime(Math.max(0.0002, gain), t0);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    s.connect(f);
    f.connect(g);
    g.connect(c.destination);
    s.start(t0);
    s.stop(t0 + dur + 0.02);
  }

  return {
    unlock() {
      try {
        if (!ctx) {
          const C = findContext();
          if (!C) return;
          ctx = new C();
        }
        if (ctx.state === 'suspended' || (ctx.state as string) === 'interrupted') {
          const p = ctx.resume();
          if (p && typeof p.catch === 'function') p.catch(() => undefined);
        }
      } catch {
        /* no audio here */
      }
    },
    tick(rate) {
      safe((c) => {
        const r = clamp(rate, 0, 12);
        tone(c, 900 + r * 40, 0.025, 0.035, 'triangle');
      });
    },
    thud() {
      safe((c) => {
        tone(c, 90, 0.35, 0.22, 'sine', 0, 45);
        noise(c, 0.12, 0.05, 200);
      });
    },
    till() {
      safe((c) => {
        noise(c, 0.04, 0.04, 4000);
        tone(c, 1568, 0.5, 0.07, 'sine', 0.02);
        tone(c, 2093, 0.7, 0.05, 'sine', 0.1);
      });
    },
    rise(progress) {
      safe((c) => {
        const p = clamp(progress, 0, 1);
        tone(c, 260 + p * 900, 0.06, 0.04, 'triangle');
      });
    },
    counter(level) {
      safe((c) => {
        const l = clamp(level, 0, 1);
        tone(c, 330 + l * 440, 0.08, 0.03, 'sine');
      });
    },
    payout(up) {
      safe((c) => {
        if (up) {
          tone(c, 523, 0.12, 0.06, 'triangle');
          tone(c, 659, 0.12, 0.06, 'triangle', 0.1);
          tone(c, 784, 0.25, 0.06, 'triangle', 0.2);
        } else {
          tone(c, 196, 0.3, 0.08, 'sine', 0, 110);
          tone(c, 147, 0.4, 0.08, 'sine', 0.18, 82);
        }
      });
    },
    setMuted(m) {
      muted = !!m;
    },
  };
}

/** WebKit browsers (all of iOS, and desktop Safari): audio must be started inside the user's tap. */
export function startsAudioInTap(ua: string): boolean {
  return /AppleWebKit/.test(ua) && (/iPhone|iPad|iPod/.test(ua) || !/Chrome|Chromium|Edg|Android/.test(ua));
}
