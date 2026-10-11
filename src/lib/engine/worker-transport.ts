import type { UciTransport } from "./transport";

/**
 * Đường dẫn worker engine trong `public/` (bản lite-single, single-thread —
 * không cần header COOP/COEP). Copy từ node_modules/stockfish/bin.
 */
export const ENGINE_WORKER_URL = "/engine/stockfish-19-lite-single.js";

/**
 * Transport UCI cho trình duyệt: bọc Web Worker chạy file stockfish
 * lite-single; lệnh UCI gởi bằng postMessage, output engine về qua
 * `onmessage` (mỗi thông điệp là một dòng UCI).
 */
export class WorkerTransport implements UciTransport {
  private readonly worker: Worker;
  private lineHandlers = new Set<(line: string) => void>();
  private errorHandler: ((cause: Error) => void) | null = null;
  private disposed = false;

  private constructor(worker: Worker) {
    this.worker = worker;
    this.worker.onmessage = (event: MessageEvent) => {
      const data = event.data;
      const line =
        typeof data === "string"
          ? data
          : typeof data?.data === "string"
            ? data.data
            : String(data ?? "");
      for (const rawLine of line.split(/\r?\n/)) {
        const trimmed = rawLine.trim();
        if (trimmed.length === 0) continue;
        for (const handler of this.lineHandlers) handler(trimmed);
      }
    };
    this.worker.onerror = (event) => {
      this.errorHandler?.(
        new Error(
          `Không tải được engine (worker): ${event.message || "lỗi không rõ"}`,
        ),
      );
    };
  }

  static spawn(): WorkerTransport {
    return new WorkerTransport(new Worker(ENGINE_WORKER_URL));
  }

  send(command: string): void {
    if (this.disposed) return;
    this.worker.postMessage(command);
  }

  onLine(handler: (line: string) => void): () => void {
    this.lineHandlers.add(handler);
    return () => this.lineHandlers.delete(handler);
  }

  onError(handler: (cause: Error) => void): () => void {
    this.errorHandler = handler;
    return () => {
      if (this.errorHandler === handler) this.errorHandler = null;
    };
  }

  async dispose(): Promise<void> {
    if (this.disposed) return;
    this.disposed = true;
    this.send("quit");
    // `quit` đủ để thread engine tự kết thúc; terminate là chốt hạ.
    this.worker.terminate();
  }
}
