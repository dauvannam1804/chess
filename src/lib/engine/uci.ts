/**
 * Bộ tách (parse) dòng UCI của Stockfish — hàm thuần, không đụng I/O.
 *
 * Quy ước điểm số của UCI: `score cp`/`score mate` luôn tính theo bên ĐI
 * (side to move). Lớp trên (Engine) phải đổi về góc nhìn Trắng qua
 * `toWhitePointOfView` — đó là hợp đồng của interface `Engine`.
 */

export type UciScore =
  | { kind: "cp"; value: number }
  | { kind: "mate"; value: number };

export type ParsedInfoLine = { score: UciScore | null; pv: string[] };

/** Nhận `info ...` (có/không có score/pv); trả null nếu không phải info line. */
export function parseInfoLine(line: string): ParsedInfoLine | null {
  if (!line.startsWith("info ")) return null;

  const scoreMatch = / score (cp|mate) (-?\d+)/.exec(line);
  const score: UciScore | null = scoreMatch
    ? scoreMatch[1] === "cp"
      ? { kind: "cp", value: Number.parseInt(scoreMatch[2], 10) }
      : { kind: "mate", value: Number.parseInt(scoreMatch[2], 10) }
    : null;

  const pvIndex = line.indexOf(" pv ");
  const pv =
    pvIndex >= 0
      ? line
          .slice(pvIndex + 4)
          .trim()
          .split(/\s+/)
          .filter((token) => token.length > 0)
      : [];

  return { score, pv };
}

/** Trả nước tốt nhất từ `bestmove ...` (bỏ qua ponder); null nếu `(none)`. */
export function parseBestMoveLine(line: string): string | null {
  const match = /^bestmove (\S+)/.exec(line);
  const move = match?.[1];
  return move && move !== "(none)" ? move : null;
}

/** Đổi điểm UCI (góc nhìn bên đi) sang góc nhìn Trắng: Trắng dương, Đen âm. */
export function toWhitePointOfView(score: UciScore, turn: "w" | "b"): UciScore {
  if (turn === "w") return score;
  return { kind: score.kind, value: -score.value };
}
