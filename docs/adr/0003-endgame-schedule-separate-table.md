# Endgame SRS uses a separate endgame_schedule table

Spec ban đầu của TT-10 cho rằng Thế tàn cuộc có thể tái dùng bảng `drill_schedule` của Drill khai cuộc (TT-07). Thực tế hai domain chỉ chia sẻ PHÉP TOÁN Leitner chứ không chia sẻ được bảng: `drill_schedule.node_id` là khóa ngoại trỏ thẳng vào `line_moves.id` (FK cascade khi xóa line) — một Thế tàn cuộc không có node nào để trỏ vào. Cài đặt chọn bảng riêng `endgame_schedule` với khóa lịch là `position_id` (unique), cột y hệt (`box`, `due_at`, `mastered_at`, `updated_at`), trong khi phép toán Leitner vẫn là MỘT hàm thuần dùng chung `nextLeitnerState` — hộp, interval 1/3/7 ngày và logic Mastered chỉ định nghĩa một lần.

## Considered Options

- **Polymorphic redesign của `drill_schedule`** (cột `node_id` nullable + cột discriminate `kind`/`position_id`, hoặc bảng nội dung chung "drillable item" để cả node và endgame position trỏ vào): loại — phải đụng schema + mọi truy vấn của TT-07 đang chạy đúng, sinh thêm ràng buộc nullable khó cầm, trong khi lợi ích chỉ là gộp một bảng với app local một người dùng; chi phí (migration, backup format, rủi ro hồi quy) vượt xa lợi ích.
- **Two tables, one pure function** (đã chọn): tách domain rõ ràng, backup xuất/import giữ nguyên tính đơn giản theo bảng, không đụng gì đến drill có sẵn.

## Consequences

- Hàng đợi, summary và lịch tàn cuộc đọc/ghi `endgame_schedule`; không có truy vấn UNION nào giữa hai lịch — thêm loại drill mới sau này (mỗi loại một bảng + tái dùng `nextLeitnerState`) là pattern lặp lại được.
- File backup (US-35) mang cả hai bảng; import giữ nguyên id — đúng hợp đồng round-trip hiện có.
- Nếu sau này cần thống kê SRS gộp ("mọi loại drill hôm nay phải ôn gì"), phải query hai bảng ở lớp service; chấp nhận vì chưa có use case đó.
- ADR này ghi nhận lệch so với spec TT-10 ("dùng chung drill_schedule") là chủ đích, không phải bỏ sót.
