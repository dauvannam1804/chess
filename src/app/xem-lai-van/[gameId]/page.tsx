import Link from "next/link";
import { notFound } from "next/navigation";
import { GameReview } from "@/components/game-review";
import { replayGame } from "@/lib/review/replay-game";
import { getTrainerService } from "@/lib/trainer-service-server";

export const dynamic = "force-dynamic";

export default async function GameReviewPage({
  params,
}: {
  params: Promise<{ gameId: string }>;
}) {
  const { gameId } = await params;
  const id = Number(gameId);
  if (!Number.isInteger(id)) notFound();

  const service = getTrainerService();
  const game = service.getGame(id);
  if (!game) notFound();

  // Cache hit (US-28): analysis có sẵn → GameReview load ngay, không chạy engine.
  const analysis = service.getGameAnalysis(game.id);
  const steps = replayGame(game.pgn);

  return (
    <section>
      <p className="text-sm text-stone-500">
        <Link href="/xem-lai-van" className="underline hover:text-stone-700">
          ← Danh sách ván
        </Link>
      </p>
      <h1 className="mt-1 text-2xl font-bold">
        Xem lại ván #{game.id}{" "}
        <span className="text-stone-400">
          (Game Review · kết quả {game.result})
        </span>
      </h1>
      <GameReview game={game} steps={steps} initialAnalysis={analysis} />
    </section>
  );
}
