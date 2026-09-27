/**
 * Synthesized storm ambience — rain bed, wave wash, thunder. No audio files.
 * Starts only on a user gesture (browser autoplay rules); volume and mute
 * persist in localStorage.
 */
export interface LightningCue {
  readonly intensity: number;
  readonly side: "left" | "right";
  readonly distance: number;
}

export interface AmbienceController {
  /** Create the AudioContext and start beds. Call from a user gesture. */
  start(): void;
  stop(): void;
  setVolume(v: number): void;
  setMuted(m: boolean): void;
  readonly muted: boolean;
  readonly volume: number;
  onLightning(e: LightningCue): void;
}

const VOL_KEY = "pb.audio.vol";
const MUTE_KEY = "pb.audio.muted";

function readStored(key: string): string | null {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}
function store(key: string, v: string): void {
  try {
    window.localStorage.setItem(key, v);
  } catch {
    /* private mode etc. — non-fatal */
  }
}

function noiseBuffer(ctx: AudioContext, seconds = 2): AudioBuffer {
  const buf = ctx.createBuffer(1, ctx.sampleRate * seconds, ctx.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
  return buf;
}

export function createStormAmbience(): AmbienceController {
  let ctx: AudioContext | null = null;
  let master: GainNode | null = null;
  let volume = Number(readStored(VOL_KEY) ?? 0.8);
  if (!(volume > 0 && volume <= 1)) volume = 0.8;
  let muted = readStored(MUTE_KEY) === "1";
  let noise: AudioBuffer | null = null;

  function loopNoise(
    dest: AudioNode,
    filterType: BiquadFilterType,
    freq: number,
    q: number,
    gain: number,
  ): { src: AudioBufferSourceNode; g: GainNode } {
    const c = ctx!;
    const src = c.createBufferSource();
    src.buffer = noise;
    src.loop = true;
    const f = c.createBiquadFilter();
    f.type = filterType;
    f.frequency.value = freq;
    f.Q.value = q;
    const g = c.createGain();
    g.gain.value = gain;
    src.connect(f).connect(g).connect(dest);
    src.start();
    return { src, g };
  }

  const controller: AmbienceController = {
    start() {
      if (ctx) {
        void ctx.resume();
        return;
      }
      const AC =
        window.AudioContext ??
        (window as unknown as { webkitAudioContext?: typeof AudioContext })
          .webkitAudioContext;
      if (!AC) return;
      ctx = new AC();
      noise = noiseBuffer(ctx);
      master = ctx.createGain();
      master.gain.value = muted ? 0 : volume;
      master.connect(ctx.destination);

      // rain bed: bright filtered noise
      loopNoise(master, "bandpass", 2200, 0.4, 0.055);
      // wave wash: dark noise swelled by a slow LFO
      const wash = loopNoise(master, "lowpass", 300, 0.8, 0.22);
      const lfo = ctx.createOscillator();
      lfo.frequency.value = 0.09;
      const lfoDepth = ctx.createGain();
      lfoDepth.gain.value = 0.16;
      lfo.connect(lfoDepth).connect(wash.g.gain);
      lfo.start();
      // low rumble bed (distant thunder murmur)
      loopNoise(master, "lowpass", 70, 0.6, 0.05);
    },
    stop() {
      void ctx?.close();
      ctx = null;
      master = null;
    },
    setVolume(v) {
      volume = Math.max(0, Math.min(1, v));
      store(VOL_KEY, String(volume));
      if (master && !muted) master.gain.value = volume;
    },
    setMuted(m) {
      muted = m;
      store(MUTE_KEY, m ? "1" : "0");
      if (master) master.gain.value = m ? 0 : volume;
    },
    get muted() {
      return muted;
    },
    get volume() {
      return volume;
    },
    onLightning(e) {
      if (!ctx || !master || !noise) return;
      const c = ctx;
      // thunder arrives after light: 0.3–2.5 s, sooner + louder when closer
      const near = Math.max(0, Math.min(1, 1 - e.distance / 320));
      const delay = 0.3 + 2.2 * (1 - near) + Math.random() * 0.2;
      const t0 = c.currentTime + delay;
      const src = c.createBufferSource();
      src.buffer = noise;
      const lp = c.createBiquadFilter();
      lp.type = "lowpass";
      lp.frequency.value = 60 + near * 90;
      const g = c.createGain();
      const peak = (0.25 + near * 0.6) * e.intensity;
      g.gain.setValueAtTime(0.0001, t0);
      g.gain.exponentialRampToValueAtTime(Math.max(0.01, peak), t0 + 0.06);
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + 1.6 + near);
      const pan = c.createStereoPanner();
      pan.pan.value = e.side === "left" ? -0.55 : 0.55;
      src.connect(lp).connect(g).connect(pan).connect(master);
      src.start(t0);
      src.stop(t0 + 3.2);
    },
  };
  return controller;
}
