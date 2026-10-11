/**
 * Định dạng timestamp "2026-10-12T08:30:00.000Z" (ISO của các cột created_at/
 * played_at) thành "2026-10-12 08:30" cho danh sách archive — một nguồn duy
 * nhất cho mọi nơi hiển thị thời điểm.
 */
export function formatPlayedAt(playedAt: string): string {
  return playedAt.slice(0, 16).replace("T", " ");
}
