# Puzzle content sourced from the Lichess puzzle database

Toàn bộ Puzzle của app lấy từ [database puzzle chính thức của Lichess](https://database.lichess.org/#puzzles) thay vì tự soạn hay dùng engine sinh. Database này ~5 triệu puzzle có sẵn tag chủ đề + rating, chất lượng được cộng đồng kiểm định — tự tạo nội dung tương đương là công việc không khả thi cho một người.

## Consequences

- **Giấy phép CC-BY-SA-3.0**: app phải ghi rõ nguồn (Lichess puzzle database) ở nơi hiển thị puzzle và trong về app; nếu phân phối lại nội dung phái sinh thì phải cùng giấy phép share-alike.
- Dữ liệu là dump tĩnh: cập nhật puzzle mới = tải dump mới và import lại; app không phụ thuộc runtime API của Lichess.
- Schema import phải giữ được `Themes`, `Rating`, và `GameUrl` (để ghi nguồn từng puzzle).
