export type ParsedPuzzle = {
  puzzleId: string;
  fen: string;
  moves: string;
  rating: number;
  ratingDeviation: number;
  popularity: number;
  nbPlays: number;
  themes: string[];
  gameUrl: string;
  openingTags: string[];
};

export class PuzzleCsvError extends Error {}

const UCI_MOVE_PATTERN = /^[a-h][1-8][a-h][1-8][qrbn]?$/;

export async function* parsePuzzleCsv(
  chunks: AsyncIterable<string> | Iterable<string>,
): AsyncGenerator<ParsedPuzzle> {
  let buffer = "";
  let field = "";
  let fields: string[] = [];
  let inQuotes = false;
  let justQuoted = false;
  let line = 1;
  let rowStartLine = 1;
  let headerChecked = false;
  let expectLf = false;
  let firstChunk = true;

  const fail = (reason: string): never => {
    throw new PuzzleCsvError(`Dòng ${rowStartLine}: ${reason}`);
  };

  const finishField = () => {
    fields.push(field);
    field = "";
  };

  const finishRow = (): ParsedPuzzle | null => {
    finishField();
    const row = fields;
    const rowLine = rowStartLine;
    fields = [];
    rowStartLine = line;
    if (row.length === 1 && row[0] === "") return null;
    if (!headerChecked) {
      headerChecked = true;
      if (row[0].replace(/^\uFEFF/, "") === "PuzzleId") return null;
    }
    return buildPuzzle(row, rowLine);
  };

  for await (const chunk of chunks) {
    buffer = firstChunk && chunk.charCodeAt(0) === 0xfeff ? chunk.slice(1) : buffer + chunk;
    firstChunk = false;
    let position = 0;
    while (position < buffer.length) {
      if (
        position === buffer.length - 1 &&
        buffer.charCodeAt(position) >= 0xd800 &&
        buffer.charCodeAt(position) <= 0xdbff
      ) {
        break;
      }
      const char = buffer[position];
      position += 1;

      if (expectLf) {
        expectLf = false;
        if (char === "\n") {
          line += 1;
          continue;
        }
      }

      if (inQuotes) {
        if (char === '"') {
          if (justQuoted) {
            field += '"';
            justQuoted = false;
          } else {
            justQuoted = true;
          }
        } else if (justQuoted) {
          inQuotes = false;
          if (char === ",") {
            finishField();
          } else if (char === "\n" || char === "\r") {
            expectLf = char === "\r";
            line += 1;
            const puzzle = finishRow();
            if (puzzle) yield puzzle;
          } else {
            fail("dấu ngoặc kép không hợp lệ trong trường");
          }
        } else {
          if (char === "\n") line += 1;
          field += char;
        }
        continue;
      }

      if (char === '"') {
        inQuotes = true;
      } else if (char === ",") {
        finishField();
      } else if (char === "\n" || char === "\r") {
        expectLf = char === "\r";
        line += 1;
        const puzzle = finishRow();
        if (puzzle) yield puzzle;
      } else {
        field += char;
      }
    }
    buffer = buffer.slice(position);
  }

  if (inQuotes) fail("file kết thúc khi trường vẫn đang mở ngoặc kép");
  if (field !== "" || fields.length > 0) {
    const puzzle = finishRow();
    if (puzzle) yield puzzle;
  }
}

function buildPuzzle(rawFields: string[], line: number): ParsedPuzzle {
  const fail = (reason: string): never => {
    throw new PuzzleCsvError(`Dòng ${line}: ${reason}`);
  };
  if (rawFields.length !== 10 && rawFields.length !== 11) {
    fail(`số cột không đúng (mong đợi 10 hoặc 11, nhận ${rawFields.length})`);
  }
  const puzzleId = rawFields[0].trim();
  if (puzzleId === "") fail("thiếu PuzzleId");

  const fen = rawFields[1].trim();
  if (fen === "") fail("thiếu FEN");
  if (!isPlausibleFen(fen)) fail(`FEN không đúng cấu trúc: "${fen}"`);

  const moves = rawFields[2].trim();
  if (moves === "") fail("thiếu Moves");
  for (const uci of moves.split(/\s+/)) {
    if (!UCI_MOVE_PATTERN.test(uci)) fail(`nước đi UCI không hợp lệ: "${uci}"`);
  }

  const rating = toInt(rawFields[3], "Rating", line);
  const ratingDeviation = toInt(rawFields[4], "RatingDeviation", line);
  const popularity = toInt(rawFields[5], "Popularity", line);
  const nbPlays = toInt(rawFields[6], "NbPlays", line);

  return {
    puzzleId,
    fen,
    moves,
    rating,
    ratingDeviation,
    popularity,
    nbPlays,
    themes: splitList(rawFields[7]),
    gameUrl: rawFields[8].trim(),
    openingTags: splitList(rawFields[9]),
  };
}

function isPlausibleFen(fen: string): boolean {
  const parts = fen.split(" ");
  if (parts.length !== 6) return false;
  return parts[0].split("/").length === 8;
}

function toInt(raw: string, columnName: string, line: number): number {
  const value = Number(raw.trim());
  if (!Number.isInteger(value)) {
    throw new PuzzleCsvError(
      `Dòng ${line}: ${columnName} không phải số nguyên: "${raw.trim()}"`,
    );
  }
  return value;
}

function splitList(raw: string): string[] {
  const trimmed = raw.trim();
  return trimmed === "" ? [] : trimmed.split(/\s+/);
}
