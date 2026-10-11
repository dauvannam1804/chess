import { PlayEngine, PLAY_ARCHIVE_LIMIT } from "@/components/play-engine";
import { getTrainerService } from "@/lib/trainer-service-server";

export const dynamic = "force-dynamic";

export default function ChoiVoiEnginePage() {
  const service = getTrainerService();

  return (
    <section>
      <h1 className="text-2xl font-bold">
        Chơi với Engine <span className="text-stone-400">(Play vs Engine)</span>
      </h1>
      <p className="mt-2 max-w-prose text-stone-600">
        Chơi một ván cờ (Game) với Stockfish chạy WASM ngay trong trình duyệt —
        không cần mạng. Chọn màu và độ mạnh, đi quân trên bàn; ván kết thúc
        (chiếu hết, hòa hoặc đầu hàng) sẽ tự lưu vào archive.
      </p>
      <PlayEngine initialArchive={service.listGames({ limit: PLAY_ARCHIVE_LIMIT })} />
    </section>
  );
}
