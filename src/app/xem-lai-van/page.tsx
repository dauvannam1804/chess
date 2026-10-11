import Link from "next/link";
import { ImportPgnForm } from "@/components/import-pgn-form";
import { getTrainerService } from "@/lib/trainer-service-server";

export const dynamic = "force-dynamic";

const GAMES_LIMIT = 50;

export default function XemLaiVanPage() {
  const service = getTrainerService();
  const { total, items } = service.listGames({ limit: GAMES_LIMIT });

  return (
    <section>
      <h1 className="text-2xl font-bold">
        Xem lại ván <span className="text-stone-400">(Game Review)</span>
      </h1>
      <p className="mt-2 max-w-prose text-stone-600">
        Mở một Game trong archive để duyệt lại từng nước kèm eval của Engine;
        nước lỗi/blunder được đánh dấu theo ngưỡng. Kết quả phân tích được
        cache — mở lại ván đã review là xem ngay.
      </p>

      <div className="mt-6 grid gap-8 lg:grid-cols-[minmax(0,1fr)_minmax(0,320px)]">
        <div className="rounded-lg border border-stone-300 bg-white p-4">
          <h2 className="font-semibold">
            Ván trong archive <span className="text-sm font-normal text-stone-400">({total})</span>
          </h2>
          {items.length === 0 ? (
            <p className="mt-2 text-sm text-stone-500">
              Chưa có ván nào — chơi một ván ở mục{" "}
              <Link href="/choi-voi-engine" className="underline hover:text-stone-700">
                Chơi với Engine
              </Link>{" "}
              hoặc import PGN bên phải.
            </p>
          ) : (
            <ul className="mt-3 divide-y divide-stone-100">
              {items.map((game) => (
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
                    · {game.engineStrength === 0 ? "import" : `cấp ${game.engineStrength}`}
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
                  {service.isGameAnalysed(game.id) ? (
                    <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-medium text-emerald-800">
                      Đã phân tích
                    </span>
                  ) : (
                    <span className="rounded-full bg-stone-200 px-2 py-0.5 text-xs font-medium text-stone-500">
                      Chưa phân tích
                    </span>
                  )}
                  <Link
                    href={`/xem-lai-van/${game.id}`}
                    className="ml-auto rounded-md border border-stone-300 px-3 py-1 font-medium text-stone-700 hover:bg-stone-100"
                  >
                    Xem lại
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </div>

        <ImportPgnForm />
      </div>
    </section>
  );
}

function formatPlayedAt(playedAt: string): string {
  return playedAt.slice(0, 16).replace("T", " ");
}
