import {
  createTrainerService,
  getDefaultDbPath,
} from "../src/lib/trainer-service";

const DUMP_URL = "https://database.lichess.org/lichess_db_puzzle.csv.zst";

function printUsage(): void {
  console.log(`Import dump puzzle Lichess (CSV) vào SQLite của app.

Cách dùng:
  npm run import-puzzles -- <path-to-csv>

Dump chính thức là file nén .zst (~293 MiB):
  ${DUMP_URL}
Phải giải nén TRƯỚC khi import — lệnh này chỉ nhận CSV thô:
  zstd -d lichess_db_puzzle.csv.zst      # -> lichess_db_puzzle.csv
  npm run import-puzzles -- lichess_db_puzzle.csv

Import idempotent: chạy lại không tạo puzzle trùng (upsert theo PuzzleId).
Toàn bộ file import trong một transaction — file lỗi sẽ không nạp nửa vời.

DB đích: mặc định ./data/chess.db, đổi bằng biến môi trường CHESS_DB_PATH.`);
}

const csvPath = process.argv[2];

if (csvPath === undefined || csvPath === "--help" || csvPath === "-h") {
  printUsage();
  process.exit(csvPath === undefined ? 1 : 0);
}

if (csvPath.endsWith(".zst")) {
  console.error(
    `Lỗi: "${csvPath}" vẫn còn nén .zst. Giải nén trước: zstd -d "${csvPath}"`,
  );
  process.exit(1);
}

async function main(): Promise<void> {
  const startedAt = Date.now();
  const service = createTrainerService(getDefaultDbPath());

  try {
    const processed = await service.importPuzzlesFromCsv(csvPath, {
      onProgress: (done) => {
        if (done % 100_000 === 0) {
          console.log(`Đã xử lý ${done.toLocaleString("vi-VN")} puzzle...`);
        }
      },
    });
    const elapsed = ((Date.now() - startedAt) / 1000).toFixed(1);
    const themes = service.countByTheme();
    const themePuzzlePairs = themes.reduce((sum, t) => sum + t.count, 0);
    console.log(
      `Hoàn tất: ${processed.toLocaleString("vi-VN")} puzzle trong ${elapsed}s ` +
        `(${themes.length.toLocaleString("vi-VN")} theme, ` +
        `${themePuzzlePairs.toLocaleString("vi-VN")} cặp puzzle-theme).`,
    );
  } finally {
    service.close();
  }
}

main().catch((cause) => {
  console.error(`Import thất bại: ${cause instanceof Error ? cause.message : cause}`);
  process.exit(1);
});
