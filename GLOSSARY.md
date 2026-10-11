# Chess Trainer

Web app tự học cờ vua chạy local: luyện chiến thuật bằng Puzzle, khắc ghi khai cuộc bằng Drill, chơi và xem lại ván đấu với Engine chạy trong trình duyệt.

## Language

### Nội dung học

**Puzzle**:
Một thế cờ lấy từ database Lichess, có đúng một chuỗi nước giải đúng, kèm tag chủ đề và rating.
_Avoid_: bài tập, đề bài, exercise

**Theme** (Chủ đề):
Tag motip chiến thuật của một Puzzle (fork, pin, skewer...), dùng để lọc và thống kê.
_Avoid_: tag, category

**Repertoire Line** (Dòng khai cuộc):
Chuỗi nước khai cuộc người dùng muốn khắc ghi, lưu dạng PGN, có thể bắc nhánh phản ứng với nước lệ.
_Avoid_: opening, khai cuộc (khi nói tới dữ liệu)

**Endgame Position** (Thế tàn cuộc):
Một thế tàn cuộc kinh điển (từ catalog cứng hoặc FEN nhập tay) dùng để luyện đến Mastered.
_Avoid_: endgame (khi nói tới dữ liệu)

**Game**:
Một ván cờ hoàn chỉnh — chơi với Engine hoặc import bằng PGN — là đối tượng của Game Review.
_Avoid_: match, ván đấu (khi nói tới dữ liệu)

### Thực hành

**Drill**:
Phiên luyện chủ động: app đưa thế cờ, người dùng đi đúng nước của Repertoire Line hoặc đúng kỹ thuật của Endgame Position.
_Avoid_: quiz, test

**Leitner Box** (Hộp):
Ngăn SRS của một Drill item: đúng thì thăng hộp (1 → 3 → 7 ngày → Mastered), sai thì tụt về hộp 1.
_Avoid_: level, streak

**Daily Review Queue** (Hàng đợi ôn):
Danh sách Drill item đến hạn ôn trong ngày.
_Avoid_: homework, bài hôm nay

**Mastered** (Thuộc):
Trạng thái của một Drill item đã vượt hộp cuối cùng của Leitner.
_Avoid_: done, hoàn thành

### Giải thích và phân tích

**Engine**:
Stockfish chạy WASM trong trình duyệt; nguồn eval và biến án chính của app.
_Avoid_: bot, AI (khi nói tới Stockfish)

**Annotation** (Giải thích):
Lời giải thích gắn với một nước của Repertoire Line; LLM có thể soạn nháp, người dùng sở hữu và sửa.
_Avoid_: comment, note

**Explainer**:
Thành phần sinh bản nháp Annotation; hiện thực đầu tiên là GLM API, không có key thì trả ô trống.
_Avoid_: AI helper

**Game Review** (Xem lại ván):
Phân tích một Game: eval từng nước + đánh dấu nước lỗi, cache trong DB.
_Avoid_: analysis mode
