import Link from "next/link";
import { GameArchiveList } from "@/components/game-archive-list";
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
            <GameArchiveList
              games={items}
              isAnalysed={(game) => service.isGameAnalysed(game.id)}
              pushLinkRight
            />
          )}
        </div>

        <ImportPgnForm />
      </div>
    </section>
  );
}
