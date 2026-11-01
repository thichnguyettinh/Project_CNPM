-- UC-05 / UC-06: DỮ LIỆU THỬ NGHIỆM LOCAL, chạy SAU schema.sql và seed_test_accounts.sql.
-- Chỉ sử dụng trên database phát triển. Không sửa các lớp/điểm danh hiện có.
BEGIN;

INSERT INTO classes (
  class_id, class_code, name, subject, teacher_user_id, monthly_fee, default_room, status
)
SELECT 'd392da73-7916-48de-a95f-34d86674b965', 'THAO-TEST01',
       'Lớp kiểm thử UC-05/UC-06', 'Toán', u.user_id, 0, 'P.201', 'active'
FROM users u WHERE u.username = 'teacher'
ON CONFLICT (class_code) DO NOTHING;

INSERT INTO class_enrollments (class_id, student_id, enrolled_on)
SELECT c.class_id, s.student_id, DATE '2026-10-01'
FROM classes c JOIN students s ON s.student_code = 'HS001'
WHERE c.class_code = 'THAO-TEST01'
  AND NOT EXISTS (
    SELECT 1 FROM class_enrollments e
    WHERE e.class_id = c.class_id AND e.student_id = s.student_id
  )
ON CONFLICT DO NOTHING;

-- Hai buổi để giáo viên chọn và nhập kết quả điểm danh.
INSERT INTO class_sessions (class_id, starts_at, ends_at, room, topic, created_by)
SELECT c.class_id, v.starts_at, v.ends_at, 'P.201', v.topic, u.user_id
FROM classes c
JOIN users u ON u.user_id = c.teacher_user_id
CROSS JOIN (VALUES
  (TIMESTAMPTZ '2026-10-26 17:30:00+07', TIMESTAMPTZ '2026-10-26 19:00:00+07', 'Ôn tập Toán'),
  (TIMESTAMPTZ '2026-10-28 17:30:00+07', TIMESTAMPTZ '2026-10-28 19:00:00+07', 'Luyện tập Toán')
) AS v(starts_at, ends_at, topic)
WHERE c.class_code = 'THAO-TEST01'
  AND NOT EXISTS (
    SELECT 1 FROM class_sessions sess
    WHERE sess.class_id = c.class_id AND sess.starts_at = v.starts_at
  );
COMMIT;
