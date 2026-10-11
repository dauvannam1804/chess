import type {
  EndgameGoal,
  EndgameUserColor,
} from "./outcome";

/**
 * Catalog Thế tàn cuộc kinh điển seed sẵn (TT-10). Mỗi FEN đã đối chiếu
 * bảng bảng endgame (Lichess tablebase) — ghi chú "DTM n" là số nước đến
 * chiếu hết với quân mạnh đi trước:
 *
 * 1. K+Q vs K  `7k/8/5K2/8/8/8/8/6Q1 w`        — win, DTM 1  (Qg7#)
 * 2. K+R vs K  (đối xứng, user cầm Đen)         — win, DTM 3
 * 3. K+B+B vs K `7k/8/5K2/8/8/8/8/5BB1 w`      — win, DTM 9
 * 4. K+B+N vs K `7k/8/5K2/8/8/8/8/6BN w`       — win, DTM 13
 * 5. K+Q vs K+R (engine cầm xe phòng ngự)       — win, DTM 5
 * 6. K+P vs K  `3k4/8/3K4/3P4/8/8/8/8 w`       — win, DTM 21 (vua đứng trước tốt)
 * 7. K+R vs K+P `8/1k6/2p5/8/8/4K3/8/2R5 w`    — win, DTM 19 (xe chặn c-file)
 * 8. Lucena    `1K1k4/1P6/8/8/8/8/r7/2R5 w`    — win, DTM 41 = mate trong 21
 * 9. Philidor  `8/8/8/8/4pk2/R7/7r/4K3 w`      — draw (user = bên phòng ngự)
 * 10. K+P vs K+P đua phong                      — win, DTM 21
 */
export type SeededEndgamePosition = {
  name: string;
  fen: string;
  goal: EndgameGoal;
  userColor: EndgameUserColor;
};

export const ENDGAME_CATALOG: SeededEndgamePosition[] = [
  {
    name: "Hậu + Vua vs Vua",
    fen: "7k/8/5K2/8/8/8/8/6Q1 w - - 0 1",
    goal: "win",
    userColor: "w",
  },
  {
    name: "Xe + Vua vs Vua",
    fen: "6r1/8/8/8/8/5k2/8/7K b - - 0 1",
    goal: "win",
    userColor: "b",
  },
  {
    name: "Hai Tượng + Vua vs Vua",
    fen: "7k/8/5K2/8/8/8/8/5BB1 w - - 0 1",
    goal: "win",
    userColor: "w",
  },
  {
    name: "Tượng + Mã + Vua vs Vua",
    fen: "7k/8/5K2/8/8/8/8/6BN w - - 0 1",
    goal: "win",
    userColor: "w",
  },
  {
    name: "Hậu vs Xe — thắng khó",
    fen: "3k4/8/3K4/8/8/8/8/2rQ4 w - - 0 1",
    goal: "win",
    userColor: "w",
  },
  {
    name: "Tốt + Vua vs Vua — đua phong",
    fen: "3k4/8/3K4/3P4/8/8/8/8 w - - 0 1",
    goal: "win",
    userColor: "w",
  },
  {
    name: "Xe + Vua vs Tốt — chặn phong",
    fen: "8/1k6/2p5/8/8/4K3/8/2R5 w - - 0 1",
    goal: "win",
    userColor: "w",
  },
  {
    name: "Lucena — kỹ thuật xây cầu",
    fen: "1K1k4/1P6/8/8/8/8/r7/2R5 w - - 0 1",
    goal: "win",
    userColor: "w",
  },
  {
    name: "Philidor — phòng ngự hòa",
    fen: "8/8/8/8/4pk2/R7/7r/4K3 w - - 0 1",
    goal: "draw",
    userColor: "w",
  },
  {
    name: "Đua Tốt hai bên",
    fen: "8/1P6/8/6k1/6p1/8/8/K7 w - - 0 1",
    goal: "win",
    userColor: "w",
  },
];
