import { ResponseWaiters } from "./response-waiters.js";

export const RESPONSE_CAPTURE_TYPES = ["main_frame"];

export class ResponseCapture {
  constructor({ command, warn }) {
    this._command = command;
    this._warn = warn;
    this._waiters = new ResponseWaiters();
    this._count = 0;
  }

  route(data) {
    this._waiters.settle(data);
  }

  wait(tabId, timeoutMs) {
    return this._waiters.wait(tabId, timeoutMs);
  }

  forget(tabId) {
    this._waiters.forget(tabId);
  }

  drain() {
    this._count = 0;
    this._waiters.drain();
  }

  async begin() {
    if (++this._count > 1) return;
    try {
      await this._command("web_response_whitelist", { list: RESPONSE_CAPTURE_TYPES });
    } catch (error) {
      this._warn(`failed to enable browser response capture: ${error?.message || error}`);
    }
  }

  async end() {
    if (this._count <= 0) return;
    if (--this._count > 0) return;
    try {
      await this._command("web_response_whitelist", { list: [] });
    } catch (error) {
      this._warn(`failed to disable browser response capture: ${error?.message || error}`);
    }
  }
}
