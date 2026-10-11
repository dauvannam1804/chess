"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { deleteLineAction } from "@/app/actions";

export function DeleteLineButton({ lineId }: { lineId: number }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  return (
    <button
      type="button"
      className="rounded-md border border-red-300 px-2 py-1 text-xs font-medium text-red-700 hover:bg-red-50 disabled:opacity-50"
      disabled={isPending}
      onClick={() => {
        if (!window.confirm("Xóa Dòng khai cuộc này cùng toàn bộ cây nước?")) {
          return;
        }
        startTransition(async () => {
          await deleteLineAction(lineId);
          router.refresh();
        });
      }}
    >
      {isPending ? "Đang xóa…" : "Xóa"}
    </button>
  );
}
