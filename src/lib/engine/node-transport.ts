import { spawn } from "node:child_process";
import { createRequire } from "node:module";
import { existsSync } from "node:fs";
import { StockfishEngine } from "./stockfish-engine";
import type { UciTransport } from "./transport";

/** File glue JS của engine, ghi kèm .wasm cùng thư mục. */
const ENGINE_JS = "stockfish/bin/stockfish-19-lite-single.js";

const require = createRequire(import.meta.url);

export function resolveEngineScriptPath(): string {
  return require.resolve(ENGINE_JS);
}

/**
 * Phát hiện xem build lite-single của package `stockfish` có sẵn sàng để
 * chạy trong Node không (dùng cho skipIf của contract test).
 */
export function isNodeEngineAvailable(): boolean {
  try {
    return existsSync(resolveEngineScriptPath());
  } catch {
    return false;
  }
}

/**
 * Transport UCI cho Node: spawn engine (build lite-single chạy trực tiếp
 * bằng `node <glue>.js`) như tiến trình con, nói UCI qua stdin; engine in
 * UCI ra stderr/stdout — đọc cả hai luồng.
 */
export class NodeChildProcessTransport implements UciTransport {
  private readonly child: ReturnType<typeof spawn>;
  private lineHandlers = new Set<(line: string) => void>();
  private readonly pendingLines: string[] = [];
  private stdoutBuffer = "";
  private stderrBuffer = "";
  private disposed = false;

  private constructor(child: ReturnType<typeof spawn>) {
    this.child = child;

    // Đệm một phần dòng (chunk có thể cắt giữa line) cho từng luồng.
    this.child.stdout?.setEncoding("utf8");
    this.child.stderr?.setEncoding("utf8");
    this.child.stdout?.on("data", (chunk: string) => {
      this.stdoutBuffer += chunk;
      const lines = this.stdoutBuffer.split(/\r?\n/);
      this.stdoutBuffer = lines.pop() ?? "";
      lines.forEach((line) => this.emitLine(line));
    });
    this.child.stderr?.on("data", (chunk: string) => {
      this.stderrBuffer += chunk;
      const lines = this.stderrBuffer.split(/\r?\n/);
      this.stderrBuffer = lines.pop() ?? "";
      lines.forEach((line) => this.emitLine(line));
    });
    this.child.on("error", () => {
      // Spawn lỗi (không có node/build) — để analyse time out thay vì crash.
    });
  }

  static spawn(): NodeChildProcessTransport {
    const script = resolveEngineScriptPath();
    const child = spawn(process.execPath, [script], {
      stdio: ["pipe", "pipe", "pipe"],
    });
    return new NodeChildProcessTransport(child);
  }

  private emitLine(line: string) {
    const trimmed = line.trim();
    if (trimmed.length === 0) return;
    if (this.lineHandlers.size === 0) {
      this.pendingLines.push(trimmed);
      return;
    }
    for (const handler of this.lineHandlers) handler(trimmed);
  }

  send(command: string): void {
    const stdin = this.child.stdin;
    if (this.disposed || !stdin || !stdin.writable) return;
    stdin.write(`${command}\n`);
  }

  onLine(handler: (line: string) => void): () => void {
    this.lineHandlers.add(handler);
    while (this.pendingLines.length > 0) {
      handler(this.pendingLines.shift() as string);
    }
    return () => this.lineHandlers.delete(handler);
  }

  async dispose(): Promise<void> {
    if (this.disposed) return;
    this.disposed = true;
    this.send("quit");
    const exited = new Promise<void>((resolve) => {
      if (this.child.exitCode !== null) return resolve();
      this.child.once("exit", () => resolve());
    });
    const killTimer = setTimeout(() => this.child.kill("SIGKILL"), 2_000);
    await exited;
    clearTimeout(killTimer);
  }
}

/** Tạo `StockfishEngine` chạy bằng tiến trình con Node (dùng cho contract test). */
export function createNodeEngine(): Promise<StockfishEngine> {
  return Promise.resolve(new StockfishEngine(NodeChildProcessTransport.spawn()));
}
