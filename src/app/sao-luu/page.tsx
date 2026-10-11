import { BackupManager } from "@/components/backup-manager";

export const dynamic = "force-dynamic";

export default function SaoLuuPage() {
  return (
    <section>
      <h1 className="text-2xl font-bold">
        Sao lưu <span className="text-stone-400">(Backup)</span>
      </h1>
      <p className="mt-2 max-w-prose text-stone-600">
        Xuất toàn bộ dữ liệu người dùng ra một file JSON và nhập lại khi cần —
        phương án backup chủ động song song với việc chép thẳng file SQLite
        (ADR-0001). Hữu ích khi chuyển máy hoặc khôi phục sau sự cố.
      </p>
      <div className="mt-4">
        <BackupManager />
      </div>
    </section>
  );
}
