import { DrillTrainer } from "@/components/drill-trainer";
import { getTrainerService } from "@/lib/trainer-service-server";

export const dynamic = "force-dynamic";

export default function DrillPage() {
  const summary = getTrainerService().getDrillSummary();

  return (
    <section>
      <h1 className="text-2xl font-bold">
        Ôn tập khai cuộc <span className="text-stone-400">(Opening Drill)</span>
      </h1>
      <p className="mt-2 max-w-prose text-stone-600">
        Drill chủ động: app đưa thế cờ trải đều qua các Dòng khai cuộc và nhánh
        của bạn, bạn đi nước repertoire. Đúng thì thăng Leitner Box (1 → 3 → 7
        ngày → Mastered), sai thì tụt về hộp 1. Mục Mastered rời vòng quay của
        Daily Review Queue.
      </p>
      <DrillTrainer initialSummary={summary} />
    </section>
  );
}
