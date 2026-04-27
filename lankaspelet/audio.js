// audio.js
import { Logger } from './logger.js';

class AudioEngine {
    constructor() {
        this.ctx = null; // Wait for user interaction to initialize
    }

    // Lazy initialization of audio context
    init() {
        if (!this.ctx) {
            this.ctx = new (window.AudioContext || window.webkitAudioContext)();
        }
        if (this.ctx.state === 'suspended') {
            this.ctx.resume();
        }
    }

    // A helper to create short, snappy volume envelopes (fade in/out)
    createEnvelope(duration, maxVolume = 0.5) {
        this.init();
        const gainNode = this.ctx.createGain();
        gainNode.gain.setValueAtTime(0, this.ctx.currentTime);
        gainNode.gain.linearRampToValueAtTime(maxVolume, this.ctx.currentTime + 0.02); // Fast attack
        gainNode.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + duration); // Smooth fade
        gainNode.connect(this.ctx.destination);
        return gainNode;
    }

    // ⚡ THE "INTEGRATED" SOUND: Electric Zip FM synthesis
    playLinked() {
        this.init();
        const t = this.ctx.currentTime;
        const decay = 0.08;

        const carrier = this.ctx.createOscillator();
        const modulator = this.ctx.createOscillator();
        const modGain = this.ctx.createGain();
        const gainNode = this.ctx.createGain();

        // Parameters
        carrier.type = 'sine';
        carrier.frequency.setValueAtTime(200, t);
        // slide: 1000
        carrier.frequency.exponentialRampToValueAtTime(1000, t + decay);

        modulator.type = 'sine';
        modulator.frequency.setValueAtTime(4000, t);

        modGain.gain.setValueAtTime(5000, t);
        modGain.gain.exponentialRampToValueAtTime(0.01, t + decay);

        gainNode.gain.setValueAtTime(0, t);
        gainNode.gain.linearRampToValueAtTime(0.4, t + 0.01);
        gainNode.gain.exponentialRampToValueAtTime(0.001, t + decay);

        // Connections
        modulator.connect(modGain);
        modGain.connect(carrier.frequency);
        carrier.connect(gainNode);
        gainNode.connect(this.ctx.destination);

        modulator.start(t);
        carrier.start(t);
        modulator.stop(t + decay);
        carrier.stop(t + decay);
    }

    // 🪵 THE "ISOLATED" SOUND: Soft Toggle FM synthesis
    playIsolated() {
        this.init();
        const t = this.ctx.currentTime;
        const decay = 0.05;

        const carrier = this.ctx.createOscillator();
        const modulator = this.ctx.createOscillator();
        const modGain = this.ctx.createGain();
        const filter = this.ctx.createBiquadFilter();
        const gainNode = this.ctx.createGain();

        // Parameters
        carrier.type = 'sine';
        carrier.frequency.setValueAtTime(400, t);
        
        modulator.type = 'sine';
        modulator.frequency.setValueAtTime(800, t);
        
        modGain.gain.setValueAtTime(50, t);
        modGain.gain.exponentialRampToValueAtTime(0.01, t + decay);

        filter.type = 'lowpass';
        filter.frequency.setValueAtTime(600, t);

        gainNode.gain.setValueAtTime(0, t);
        gainNode.gain.linearRampToValueAtTime(0.3, t + 0.01);
        gainNode.gain.exponentialRampToValueAtTime(0.001, t + decay);

        // Connections
        modulator.connect(modGain);
        modGain.connect(carrier.frequency);
        carrier.connect(filter);
        filter.connect(gainNode);
        gainNode.connect(this.ctx.destination);

        modulator.start(t);
        carrier.start(t);
        modulator.stop(t + decay);
        carrier.stop(t + decay);
    }

    // Ported from old sound.js for full compatibility:
    
    playSpawn() {
        this.init();
        const osc = this.ctx.createOscillator();
        const gainNode = this.createEnvelope(0.1, 0.3);
        osc.type = 'sine';
        osc.frequency.setValueAtTime(400, this.ctx.currentTime);
        osc.frequency.exponentialRampToValueAtTime(200, this.ctx.currentTime + 0.1);
        osc.connect(gainNode);
        osc.start();
        osc.stop(this.ctx.currentTime + 0.1);
    }

    playHint() {
        this.init();
        const osc = this.ctx.createOscillator();
        const gainNode = this.createEnvelope(0.6, 0.2);
        osc.frequency.setValueAtTime(440, this.ctx.currentTime);
        osc.connect(gainNode);
        osc.start();
        osc.stop(this.ctx.currentTime + 0.6);
    }

    playWin() {
        this.init();
        const osc = this.ctx.createOscillator();
        const gainNode = this.createEnvelope(0.8, 0.2);
        osc.type = 'triangle';
        const t = this.ctx.currentTime;
        osc.frequency.setValueAtTime(523.25, t);
        osc.frequency.setValueAtTime(659.25, t + 0.1);
        osc.frequency.setValueAtTime(783.99, t + 0.2);
        osc.frequency.setValueAtTime(1046.50, t + 0.3);
        osc.connect(gainNode);
        osc.start();
        osc.stop(t + 0.8);
    }

    playError() {
        this.playIsolated();
    }

    // --- CINEMATIC SOUNDS FOR CUTSCENES ---

    playTrace() {
        this.init();
        const t = this.ctx.currentTime;
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        osc.frequency.setValueAtTime(800, t);
        gain.gain.setValueAtTime(0, t);
        gain.gain.linearRampToValueAtTime(0.1, t + 0.01);
        gain.gain.exponentialRampToValueAtTime(0.001, t + 0.1);
        osc.connect(gain);
        gain.connect(this.ctx.destination);
        osc.start(t);
        osc.stop(t + 0.1);
    }

    playCinematicImpact() {
        this.init();
        const t = this.ctx.currentTime;
        const decay = 0.8;
        const carrier = this.ctx.createOscillator();
        const filter = this.ctx.createBiquadFilter();
        const gainNode = this.ctx.createGain();

        // Deep Filtered Boom
        carrier.type = 'triangle';
        carrier.frequency.setValueAtTime(80, t);
        carrier.frequency.exponentialRampToValueAtTime(30, t + decay);

        filter.type = 'lowpass';
        filter.frequency.setValueAtTime(600, t);
        filter.frequency.exponentialRampToValueAtTime(100, t + decay);
        filter.Q.setValueAtTime(10, t); // Resonant punch

        gainNode.gain.setValueAtTime(0, t);
        gainNode.gain.linearRampToValueAtTime(0.5, t + 0.02);
        gainNode.gain.exponentialRampToValueAtTime(0.001, t + decay);

        carrier.connect(filter);
        filter.connect(gainNode);
        gainNode.connect(this.ctx.destination);

        carrier.start(t);
        carrier.stop(t + decay);
    }

    playCinematicReveal() {
        this.init();
        const t = this.ctx.currentTime;
        const decay = 1.2;
        
        // Harmonic Glassy Chime
        const carrier = this.ctx.createOscillator();
        const modulator = this.ctx.createOscillator();
        const modGain = this.ctx.createGain();
        const gainNode = this.ctx.createGain();

        carrier.type = 'sine';
        carrier.frequency.setValueAtTime(523.25, t); // C5
        
        modulator.frequency.setValueAtTime(523.25 * 3, t); // 3rd harmonic
        modGain.gain.setValueAtTime(200, t);
        modGain.gain.exponentialRampToValueAtTime(0.01, t + decay);

        gainNode.gain.setValueAtTime(0, t);
        gainNode.gain.linearRampToValueAtTime(0.2, t + 0.01);
        gainNode.gain.exponentialRampToValueAtTime(0.001, t + decay);

        modulator.connect(modGain);
        modGain.connect(carrier.frequency);
        carrier.connect(gainNode);
        gainNode.connect(this.ctx.destination);

        modulator.start(t);
        carrier.start(t);
        modulator.stop(t + decay);
        carrier.stop(t + decay);
    }

    playCinematicFinal() {
        this.init();
        const t = this.ctx.currentTime;
        const duration = 3.0;
        
        // Multi-oscillator bright chord
        [261.63, 329.63, 392.00, 523.25].forEach((freq, i) => {
            const osc = this.ctx.createOscillator();
            const gain = this.ctx.createGain();
            const lfo = this.ctx.createOscillator();
            const lfoGain = this.ctx.createGain();

            osc.type = 'sawtooth';
            osc.frequency.setValueAtTime(freq, t);
            
            lfo.frequency.setValueAtTime(5, t);
            lfoGain.gain.setValueAtTime(5, t);
            lfo.connect(lfoGain);
            lfoGain.connect(osc.frequency);

            gain.gain.setValueAtTime(0, t);
            gain.gain.linearRampToValueAtTime(0.1, t + 0.1);
            gain.gain.exponentialRampToValueAtTime(0.001, t + duration);

            const filter = this.ctx.createBiquadFilter();
            filter.type = 'lowpass';
            filter.frequency.setValueAtTime(2000, t);
            filter.frequency.exponentialRampToValueAtTime(200, t + duration);

            osc.connect(filter);
            filter.connect(gain);
            gain.connect(this.ctx.destination);

            lfo.start(t);
            osc.start(t);
            lfo.stop(t + duration);
            osc.stop(t + duration);
        });
    }
}

export const SFX = new AudioEngine();
