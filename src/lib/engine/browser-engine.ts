import { StockfishEngine } from "./stockfish-engine";
import { WorkerTransport } from "./worker-transport";

/**
 * Singleton engine phía client: khởi tạo lười khi lần đầu cần (chỉ trong
 * trình duyệt), tái dùng trên các component của cùng trang để không chạy
 * nhiều bản WASM.
 */
let engineSingleton: StockfishEngine | null = null;

export function getBrowserEngine(): StockfishEngine {
  if (!engineSingleton) {
    engineSingleton = new StockfishEngine(WorkerTransport.spawn(), {
      analyseTimeoutMs: 60_000,
    });
  }
  return engineSingleton;
}

/** Đóng engine singleton (ví dụ khi rời trang); lần dùng sau sẽ tạo lại. */
export function disposeBrowserEngine(): Promise<void> {
  const engine = engineSingleton;
  engineSingleton = null;
  return engine ? engine.dispose() : Promise.resolve();
}
