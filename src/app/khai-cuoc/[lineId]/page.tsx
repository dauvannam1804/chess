import Link from "next/link";
import { notFound } from "next/navigation";
import { LineWorkbench } from "@/components/line-workbench";
import { getTrainerService } from "@/lib/trainer-service-server";

export const dynamic = "force-dynamic";

export default async function LineDetailPage({
  params,
}: {
  params: Promise<{ lineId: string }>;
}) {
  const { lineId } = await params;
  const id = Number(lineId);
  if (!Number.isInteger(id)) notFound();

  const service = getTrainerService();
  const line = service.listLines().find((candidate) => candidate.id === id);
  const tree = service.getLineTree(id);
  if (!line || !tree) notFound();

  return (
    <section>
      <p className="text-sm text-stone-500">
        <Link href="/khai-cuoc" className="underline hover:text-stone-700">
          ← Danh sách Dòng khai cuộc
        </Link>
      </p>
      <h1 className="mt-1 text-2xl font-bold">{line.name}</h1>
      <p className="mt-1 text-sm text-stone-500">
        {line.userColor === "w" ? "Khai cuộc bên Trắng" : "Khai cuộc bên Đen"}
      </p>
      <LineWorkbench line={line} tree={tree} />
    </section>
  );
}
