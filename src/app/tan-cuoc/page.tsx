import { EndgameTrainer } from "@/components/endgame-trainer";
import { getTrainerService } from "@/lib/trainer-service-server";

export const dynamic = "force-dynamic";

export default function TanCuocPage() {
  const service = getTrainerService();
  // Idempotent — lần chạy sau chỉ chèn thế còn thiếu.
  service.seedEndgameCatalog();
  const positions = service.listEndgamePositions();

  return (
    <section>
      <h1 className="text-2xl font-bold">
        Luyện tàn cuộc <span className="text-stone-400">(Endgame)</span>
      </h1>
      <p className="mt-2 max-w-prose text-stone-600">
        Drill Thế tàn cuộc (Endgame Position) kinh điển: bạn chơi phía mạnh,
        engine phòng ngự. Đạt mục tiêu của thế (chiếu hết hoặc cầm hòa) tính là
        pass và thăng Leitner Box (1 → 3 → 7 ngày → Mastered); trượt thì tụt về
        hộp 1. Nhập FEN bất kỳ để luyện thế app chưa có.
      </p>
      <EndgameTrainer initialPositions={positions} />
    </section>
  );
}
