import { PuzzleTrainer } from "@/components/puzzle-trainer";
import { getTrainerService } from "@/lib/trainer-service-server";

export const dynamic = "force-dynamic";

export default function PuzzlePage() {
  const service = getTrainerService();

  return (
    <section>
      <h1 className="text-2xl font-bold">
        Puzzle <span className="text-stone-400">(Puzzle)</span>
      </h1>
      <p className="mt-2 max-w-prose text-stone-600">
        Luyện chiến thuật với Puzzle lấy từ database Lichess: lọc theo Chủ đề
        (Theme) + khoảng rating, chọn độ dài phiên, rồi đi đúng chuỗi nước thắng
        trên bàn cờ. Mỗi attempt được ghi lại để thống kê theo theme.
      </p>
      <PuzzleTrainer
        initialThemes={service.countByTheme()}
        initialStats={service.getThemeStats()}
      />
    </section>
  );
}
