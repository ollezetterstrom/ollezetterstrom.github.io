// All selected recordings share one engine-cycle clock. Changing a grain
// changes its timbre without letting neighboring recordings beat at different
// fundamental frequencies. Source-cycle frequency is independent of road speed.
const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
const smoothstep = (a, b, x) => {
  const t = clamp((x - a) / (b - a), 0, 1);
  return t * t * (3 - 2 * t);
};

function readPeriodic(data, position) {
  const n = data.length;
  const index = Math.floor(position);
  const fraction = position - index;
  const a = data[(index + n - 1) % n];
  const b = data[index % n];
  const c = data[(index + 1) % n];
  const d = data[(index + 2) % n];
  // Cubic interpolation retains the upper harmonics during pitch changes.
  return b + .5 * fraction * (c - a + fraction * (
    2 * a - 5 * b + 4 * c - d + fraction * (3 * (b - c) + d - a)
  ));
}

function grainSample(grain, cycles) {
  const cycle = ((cycles + (grain.phaseOffsetCycles ?? 0)) % grain.cycles + grain.cycles) % grain.cycles;
  return readPeriodic(grain.samples, cycle / grain.cycles * grain.samples.length);
}

function sampleBank(bank, frequency, cycles) {
  let upper = 0;
  while (upper < bank.length - 1 && bank[upper].frequencyHz < frequency) upper++;
  const lower = Math.max(0, upper - 1);
  if (lower === upper) return grainSample(bank[lower], cycles);
  const weight = clamp((frequency - bank[lower].frequencyHz)
    / (bank[upper].frequencyHz - bank[lower].frequencyHz), 0, 1);
  // Correlated, phase-aligned recordings use a unity-sum crossfade. An
  // equal-power fade would add a level bump halfway between similar grains.
  return grainSample(bank[lower], cycles) * (1 - weight)
    + grainSample(bank[upper], cycles) * weight;
}

class CarEngineProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    this.loaded = [];
    this.coast = [];
    this.idle = null;
    this.cycles = 0;
    this.idlePosition = 0;
    this.rpm = 0;
    this.load = 0;
    this.targetRpm = 0;
    this.targetLoad = 0;
    this.enabled = false;
    this.disposed = false;
    this.smoothing = 1 - Math.exp(-1 / (.015 * sampleRate));
    this.port.onmessage = ({ data }) => {
      if (data.type === "bank") {
        this.loaded = data.loaded;
        this.coast = data.coast;
        this.idle = data.idle;
        this.nativeRate = data.sampleRate;
        this.minimumHz = this.coast[0].frequencyHz;
        this.maximumHz = this.loaded[this.loaded.length - 1].frequencyHz;
      } else if (data.type === "state") {
        this.targetRpm = Number.isFinite(data.rpm) ? clamp(data.rpm, 0, 1) : 0;
        this.targetLoad = Number.isFinite(data.load) ? clamp(data.load, 0, 1) : 0;
        this.enabled = data.enabled === true;
      } else if (data.type === "reset") {
        this.cycles = this.idlePosition = this.rpm = this.load = 0;
        this.targetRpm = this.targetLoad = 0;
        this.enabled = false;
      } else if (data.type === "dispose") {
        this.disposed = true;
      }
    };
  }

  process(_inputs, outputs) {
    const output = outputs[0]?.[0];
    if (this.disposed) return false;
    if (!output) return true;
    if (!this.enabled || !this.idle) {
      output.fill(0);
      return true;
    }
    for (let i = 0; i < output.length; i++) {
      this.rpm += (this.targetRpm - this.rpm) * this.smoothing;
      this.load += (this.targetLoad - this.load) * this.smoothing;
      // The reference exposes normalized RPM, but its synthesis mapping is
      // private. Interpolation across the measured cycle range is our model.
      const frequency = this.minimumHz + this.rpm * (this.maximumHz - this.minimumHz);
      const moving = smoothstep(.025, .15, this.rpm);
      const engine = sampleBank(this.loaded, frequency, this.cycles) * this.load
        + sampleBank(this.coast, frequency, this.cycles) * (1 - this.load);
      const idle = readPeriodic(this.idle, this.idlePosition);
      output[i] = idle * (1 - moving) + engine * moving;
      this.cycles += frequency / sampleRate;
      this.idlePosition = (this.idlePosition + this.nativeRate / sampleRate) % this.idle.length;
    }
    return true;
  }
}

registerProcessor("car-engine", CarEngineProcessor);
