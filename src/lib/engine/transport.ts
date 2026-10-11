/**
 * Transport UCI: kênh hai chiều gởi/nhận dòng lệnh UCI với engine.
 * Hai hiện thực: NodeChildProcessTransport (test/Node) và WorkerTransport
 * (trình duyệt, bọc Web Worker của /engine/stockfish-19-lite-single.js).
 */
export interface UciTransport {
  /** Gởi một dòng lệnh UCI tới engine. */
  send(command: string): void;

  /** Đăng ký nhận từng dòng output của engine; trả hàm hủy đăng ký. */
  onLine(handler: (line: string) => void): () => void;

  /** Dừng engine + giải phóng transport. */
  dispose(): Promise<void>;
}
