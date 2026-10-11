# Puzzle content sourced from the Lichess puzzle database

Toàn bộ Puzzle của app lấy từ [database puzzle chính thức của Lichess](https://database.lichess.org/#puzzles) thay vì tự soạn hay dùng engine sinh. Database này ~5 triệu puzzle có sẵn tag chủ đề + rating, chất lượng được cộng đồng kiểm định — tự tạo nội dung tương đương là công việc không khả thi cho một người.

## Consequences

- **Giấy phép CC0** (đã verify trên database.lichess.org, 10/2026): không bắt buộc pháp lý về attribution hay share-alike; app vẫn ghi nguồn Lichess nơi hiển thị puzzle + trang về app như một lựa chọn sản phẩm (US-9), không phải nghĩa vụ giấy phép.
- Dữ liệu là dump tĩnh: cập nhật puzzle mới = tải dump mới (`.zst`, ~293 MiB) và import lại; app không phụ thuộc runtime API của Lichess. Dump hiện 11 cột: `PuzzleId,FEN,Moves,Rating,RatingDeviation,Popularity,NbPlays,Themes,GameUrl,OpeningTags,DailyDate` — parser phải chấp nhận cả bản 10 cột cũ.
- Schema import phải giữ được `Themes`, `Rating`, và `GameUrl` (để ghi nguồn từng puzzle).
