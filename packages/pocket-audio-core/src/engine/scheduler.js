export class PocketScheduler {
  constructor({ lookaheadSeconds = 0.22, intervalMs = 25, now = () => 0 } = {}) {
    this.lookaheadSeconds = lookaheadSeconds;
    this.intervalMs = intervalMs;
    this.now = now;
    this.timer = null;
    this.callback = () => {};
  }

  start(callback) {
    this.stop();
    this.callback = callback || this.callback;
    this.timer = setInterval(() => this.callback(this.now() + this.lookaheadSeconds), this.intervalMs);
  }

  stop() {
    if (this.timer !== null) clearInterval(this.timer);
    this.timer = null;
  }

  isRunning() {
    return this.timer !== null;
  }
}
