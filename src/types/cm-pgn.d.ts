declare module "cm-pgn" {
  export interface PgnMove {
    san: string;
    from: string;
    to: string;
    promotion?: string;
    fen: string;
    uci: string;
    ply: number;
    previous: PgnMove | null;
    next: PgnMove | null;
    variation: PgnMove[];
    variations: PgnMove[][];
    comments?: string[];
    startingComments?: string[];
    nags?: number[];
  }

  export interface PgnHeader {
    tags: Record<string, string>;
    render(): string;
  }

  export interface PgnHistory {
    moves: PgnMove[];
    gameComment?: string[];
    render(renderComments?: boolean, renderNags?: boolean): string;
    addMove(notation: string, previous?: PgnMove | null | "start"): PgnMove;
    validateMove(notation: string, previous?: PgnMove | null): PgnMove | null;
  }

  export class Pgn {
    constructor(
      pgnString?: string,
      props?: { sloppy?: boolean; chess960?: boolean },
    );
    header: PgnHeader;
    history: PgnHistory;
    gameComment?: string[];
    render(
      renderHeader?: boolean,
      renderComments?: boolean,
      renderNags?: boolean,
    ): string;
  }
}
