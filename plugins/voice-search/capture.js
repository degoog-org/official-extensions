const TARGET_RATE = 16000;
const CHUNK = 800;

class VoiceSearchCapture extends AudioWorkletProcessor {
  constructor() {
    super();
    this.ratio = Math.max(1, sampleRate / TARGET_RATE);
    this.pos = 0;
    this.sum = 0;
    this.count = 0;
    this.out = new Float32Array(CHUNK);
    this.n = 0;
  }

  process(inputs) {
    const channel = inputs[0]?.[0];
    if (!channel) return true;
    for (let i = 0; i < channel.length; i++) {
      this.sum += channel[i];
      this.count++;
      this.pos += 1;
      if (this.pos < this.ratio) continue;
      this.pos -= this.ratio;
      this.out[this.n++] = this.sum / this.count;
      this.sum = 0;
      this.count = 0;
      if (this.n < CHUNK) continue;
      let energy = 0;
      for (const v of this.out) energy += v * v;
      const samples = this.out;
      this.port.postMessage({ samples, rms: Math.sqrt(energy / CHUNK) }, [samples.buffer]);
      this.out = new Float32Array(CHUNK);
      this.n = 0;
    }
    return true;
  }
}

registerProcessor("voice-search-capture", VoiceSearchCapture);
