// Web Audio API Sound Effects for RibbonSpell Bee

class SoundEngine {
  private ctx: AudioContext | null = null;
  public muted: boolean = false;

  private getContext(): AudioContext | null {
    if (this.muted || typeof window === 'undefined') return null;
    if (!this.ctx) {
      const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (AudioCtx) {
        this.ctx = new AudioCtx();
      }
    }
    if (this.ctx && this.ctx.state === 'suspended') {
      this.ctx.resume().catch(() => {});
    }
    return this.ctx;
  }

  // Soft tactile click for manual on-screen letter tile taps only
  public playTileTap() {
    const ctx = this.getContext();
    if (!ctx) return;

    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(660, ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(820, ctx.currentTime + 0.035);

    gain.gain.setValueAtTime(0.035, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.035);

    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + 0.04);
  }

  // Silenced to prevent aggressive beeping during voice recognition
  public playStepAdvance() {
    // No-op: visual indicators show step progress without audio clutter
  }

  public playMicReadyBeep() {
    // No-op: prevents repeated beeping when microphone cycles
  }

  public playLetterModeStart() {
    // No-op: prevents extra beeping when entering Letter Mode
  }

  public playCommandModeStart() {
    // No-op: prevents extra beeping when exiting Letter Mode
  }

  // Sparkling Sylveon Fairy-type arpeggio for correct spelling
  public playCorrectChime() {
    const ctx = this.getContext();
    if (!ctx) return;

    // F major 9th sparkling ascending arpeggio: F5, A5, C6, E6, G6
    const notes = [698.46, 880.0, 1046.5, 1318.51, 1567.98];
    notes.forEach((freq, idx) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      const start = ctx.currentTime + idx * 0.075;

      osc.type = 'triangle';
      osc.frequency.setValueAtTime(freq, start);

      gain.gain.setValueAtTime(0.14, start);
      gain.gain.exponentialRampToValueAtTime(0.001, start + 0.38);

      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(start);
      osc.stop(start + 0.4);
    });
  }

  // Constructive, warm marimba-like prompt for missed words (encouraging, never a harsh buzzer)
  public playConstructiveReviewTone() {
    const ctx = this.getContext();
    if (!ctx) return;

    // Gentle warm interval (A4 -> F4 -> G4)
    const notes = [440.0, 349.23, 392.0];
    notes.forEach((freq, idx) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      const start = ctx.currentTime + idx * 0.12;

      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, start);

      gain.gain.setValueAtTime(0.12, start);
      gain.gain.exponentialRampToValueAtTime(0.001, start + 0.26);

      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(start);
      osc.stop(start + 0.28);
    });
  }
}

export const soundEngine = new SoundEngine();
