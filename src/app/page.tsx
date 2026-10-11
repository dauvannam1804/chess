import { Playground } from "@/components/playground";

export default function HomePage() {
  return (
    <section>
      <h1 className="text-2xl font-bold">
        Sân chơi <span className="text-stone-400">(Playground)</span>
      </h1>
      <p className="mt-2 max-w-prose text-stone-600">
        Di chuyển quân để thử nước hợp lệ, dán FEN để nạp bất kỳ thế cờ nào, và
        lưu thế cờ (Position) vào cơ sở dữ liệu để dùng lại sau.
      </p>
      <Playground />
    </section>
  );
}
