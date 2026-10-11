# Local-only app with SQLite file storage

Chess Trainer chạy và được học trên đúng một máy cá nhân: không deploy, không backend, không auth. Toàn bộ dữ liệu (puzzle progress, repertoire, games, drill SRS) nằm trong một file SQLite duy nhất, đưa vào `.gitignore`. Chọn SQLite vì backup = chép file và truy vấn SQL thật mà không cần chạy server database; một app Next.js chủ động không có deploy target là điều cố ý, không phải thiếu sót.

## Considered Options

- **Vercel + Postgres + auth**: loại vì thêm vận hành (auth, migration, chi phí) cho đúng một người dùng, và serverless filesystem không giữ được file DB.
- **localStorage**: đã cân nhắc nhưng yếu cho dữ liệu quan hệ (repertoire nhánh, SRS schedule, game archive) và dễ mất khi clear browser data.

## Consequences

- Muốn dùng trên máy khác phải chép file DB (hoặc export/import JSON — tính năng backup vẫn giữ).
- Nếu sau này cần multi-device, phải thay cả lớp lưu trữ; UI được tách khỏi data layer để giảm chi phí việc này.
