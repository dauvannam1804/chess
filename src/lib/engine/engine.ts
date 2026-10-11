import type { EngineStrength } from "./strength";

/**
 * Kết quả phân tích một thế cờ.
 *
 * **Hợp đồng dấu (White point of view)** — áp cho cả `evalCp` lẫn `mate`:
 * - Dương = bên Trắng đang hơn / Trắng sẽ chiếu hết.
 * - Âm = bên Đen đang hơn / Đen sẽ chiếu hết.
 * - `evalCp`: điểm centipawn khi không thấy chiếu hết (null nếu có mate).
 * - `mate`: số nước đến chiếu hết của bên thắng (null nếu không có mate).
 *   VD `mate: 1` = Trắng mate trong 1 nước; `mate: -2` = Đen mate trong 2.
 * - `bestLineUci`/`bestLineSan`: biến án chính (PV), nước đầu là nước tốt nhất.
 */
export type EngineAnalysis = {
  evalCp: number | null;
  mate: number | null;
  bestLineSan: string[];
  bestLineUci: string[];
};

/**
 * Seam Engine — adapter phân tích thế cờ (hiện thực đầu tiên: Stockfish WASM).
 * Như Explainer: đứng NGHIÊNG ngoài TrainerService, UI dùng trực tiếp trên
 * client; test khác dùng fake theo kịch bản, chỉ có một contract test cho
 * adapter thật.
 */
export interface Engine {
  /** Phân tích FEN tới độ sâu `depth`; không đổi trạng thái thế cờ. */
  analyse(fen: string, depth: number): Promise<EngineAnalysis>;

  /**
   * Đặt độ mạnh engine theo thang app 1..8 (yếu → mạnh nhất);
   * ánh xạ sang UCI "Skill Level" xem `strength.ts`.
   */
  setStrength(level: EngineStrength): Promise<void>;

  /** Dừng engine và giải phóng tài nguyên (worker/tiến trình con). */
  dispose(): Promise<void>;
}
