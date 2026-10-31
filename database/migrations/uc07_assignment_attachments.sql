-- Dùng cho database lopminh đã có, chạy một lần bằng pgAdmin Query Tool.
-- UC-07: mỗi bài tập/bài kiểm tra có thể đính kèm một tệp đề do giáo viên tải lên.
CREATE TABLE IF NOT EXISTS assignment_attachments (
  assignment_id VARCHAR(36) PRIMARY KEY REFERENCES assignments(assignment_id) ON DELETE CASCADE,
  file_name VARCHAR(255) NOT NULL,
  storage_key VARCHAR(100) NOT NULL UNIQUE,
  mime_type VARCHAR(100) NOT NULL,
  file_size BIGINT NOT NULL CHECK (file_size > 0),
  uploaded_by VARCHAR(36) NOT NULL REFERENCES users(user_id) ON DELETE RESTRICT,
  uploaded_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
