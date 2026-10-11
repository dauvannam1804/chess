import Link from "next/link";
import { formatPlayedAt } from "@/lib/format";
import { IMPORT_ENGINE_STRENGTH } from "@/lib/review/pgn-import";
import type { SavedGame } from "@/lib/trainer-service";

/**
 * Danh sách archive ván đã chơi/import — markup dùng chung giữa trang
 * /xem-lai-van và aside archive của /choi-voi-engine.
 * `isAnalysed` hiển thị badge cache phân tích (chỉ trang xem lại cần);
 * `pushLinkRight` đẩy nút Xem lại sang phải như layout danh sách chính.
 */
export function GameArchiveList({
  games,
  isAnalysed,
  pushLinkRight = false,
}: {
  games: SavedGame[];
  isAnalysed?: (game: SavedGame) => boolean;
  pushLinkRight?: boolean;
}) {
  return (
    <ul className="mt-3 divide-y divide-stone-100">
      {games.map((game) => (
        <li
          key={game.id}
          className="flex flex-wrap items-baseline gap-x-2 py-2 text-sm"
        >
          <span className="font-mono text-xs text-stone-400">
            {formatPlayedAt(game.playedAt)}
          </span>
          <span className="text-stone-700">
            Bạn cầm {game.userColor === "w" ? "Trắng" : "Đen"}
          </span>
          <span className="text-stone-500">
            ·{" "}
            {game.engineStrength === IMPORT_ENGINE_STRENGTH
              ? "import"
              : `cấp ${game.engineStrength}`}
          </span>
          <span
            className={
              game.result === (game.userColor === "w" ? "1-0" : "0-1")
                ? "font-medium text-emerald-700"
                : game.result === "*"
                  ? "font-medium text-stone-400"
                  : "font-medium text-red-700"
            }
          >
            {game.result}
          </span>
          {isAnalysed && (
            <span
              className={
                isAnalysed(game)
                  ? "rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-medium text-emerald-800"
                  : "rounded-full bg-stone-200 px-2 py-0.5 text-xs font-medium text-stone-500"
              }
            >
              {isAnalysed(game) ? "Đã phân tích" : "Chưa phân tích"}
            </span>
          )}
          <Link
            href={`/xem-lai-van/${game.id}`}
            className={
              pushLinkRight
                ? "ml-auto rounded-md border border-stone-300 px-3 py-1 font-medium text-stone-700 hover:bg-stone-100"
                : "rounded-md border border-stone-300 px-2 py-0.5 text-xs font-medium text-stone-700 hover:bg-stone-100"
            }
          >
            Xem lại
          </Link>
        </li>
      ))}
    </ul>
  );
}
