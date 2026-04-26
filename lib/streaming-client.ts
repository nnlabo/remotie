import type { StreamStatus } from "./stream-types";

export type PublishOptions = {
  stream: MediaStream;
};

export type ViewOptions = {
  container?: HTMLElement;
};

export interface StreamingClient {
  startPublishing(options: PublishOptions): Promise<void>;
  stopPublishing(): Promise<void>;
  startViewing(options: ViewOptions): Promise<void>;
  stopViewing(): Promise<void>;
  onStatusChange(callback: (status: StreamStatus) => void): () => void;
}

export class MockStreamingClient implements StreamingClient {
  private status: StreamStatus = "idle";
  private callbacks = new Set<(status: StreamStatus) => void>();

  async startPublishing() {
    this.setStatus("live");
  }

  async stopPublishing() {
    this.setStatus("ended");
  }

  async startViewing() {
    this.setStatus("live");
  }

  async stopViewing() {
    this.setStatus("idle");
  }

  onStatusChange(callback: (status: StreamStatus) => void) {
    this.callbacks.add(callback);
    callback(this.status);

    return () => this.callbacks.delete(callback);
  }

  private setStatus(status: StreamStatus) {
    this.status = status;
    for (const callback of this.callbacks) {
      callback(status);
    }
  }
}
