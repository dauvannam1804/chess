import Link from "next/link";
import { DeleteLineButton } from "@/components/delete-line-button";
import { PgnCreateForm } from "@/components/pgn-create-form";
import { getTrainerService } from "@/lib/trainer-service-server";

export const dynamic = "force-dynamic";

export default function KhaiCuocPage() {
  const lines = getTrainerService().listLines();

  return (
    <section>
      <h1 className="text-2xl font-bold">
        Khai cuộc <span className="text-stone-400">(Repertoire)</span>
      </h1>
      <p className="mt-2 max-w-prose text-stone-600">
        Khắc ghi Dòng khai cuộc (Repertoire Line) của bạn: dán PGN để lưu nguyên
        cây nước gồm biến án và chú thích, hoặc soạn tay từng nước trên bàn cờ.
      </p>

      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <div className="rounded-lg border border-stone-300 bg-white p-4">
          <h2 className="font-semibold">
            Danh sách line{" "}
            <span className="text-stone-400">(Repertoire Lines)</span>
          </h2>
          {lines.length === 0 ? (
            <p className="mt-2 text-sm text-stone-500">
              Chưa có Dòng khai cuộc nào — hãy tạo bằng biểu mẫu bên cạnh.
            </p>
          ) : (
            <ul className="mt-3 divide-y divide-stone-200">
              {lines.map((line) => (
                <li key={line.id} className="flex items-center gap-3 py-2">
                  <Link
                    href={`/khai-cuoc/${line.id}`}
                    className="min-w-0 flex-1 rounded-md px-2 py-1 hover:bg-stone-100"
                  >
                    <span className="block truncate text-sm font-medium">
                      {line.name}
                    </span>
                    <span className="text-xs text-stone-500">
                      {line.userColor === "w" ? "Khai cuộc bên Trắng" : "Khai cuộc bên Đen"}
                      {" · "}
                      {line.createdAt}
                    </span>
                  </Link>
                  <DeleteLineButton lineId={line.id} />
                </li>
              ))}
            </ul>
          )}
        </div>

        <PgnCreateForm />
      </div>
    </section>
  );
}
