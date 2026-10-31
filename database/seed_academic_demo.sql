-- CHI DUNG TREN MAY CA NHAN: du lieu hoc tap demo UC-07/08/11.
-- Chay SAU schema.sql va seed_test_accounts.sql, khong chay tren production.
BEGIN;
INSERT INTO classes (class_id, class_code, name, subject, teacher_user_id, status)
SELECT '9a0a0a11-1111-4111-8111-111111111111', 'DEMO10A', 'Lớp demo kiểm thử điểm', 'Toán', user_id, 'active'
FROM users WHERE username='teacher'
ON CONFLICT (class_code) DO NOTHING;

INSERT INTO class_enrollments (class_id, student_id, enrolled_on, status)
SELECT c.class_id, s.student_id, CURRENT_DATE, 'active'
FROM classes c CROSS JOIN students s JOIN users u ON u.user_id = s.user_id
WHERE c.class_code='DEMO10A' AND u.username='student'
  AND NOT EXISTS (SELECT 1 FROM class_enrollments e WHERE e.class_id=c.class_id AND e.student_id=s.student_id AND e.status='active');

INSERT INTO assignments (assignment_id, class_id, title, assignment_type, description, assigned_at, due_at, status, created_by)
SELECT '9b0b0b22-2222-4222-8222-222222222222', c.class_id,
       'Bài kiểm tra demo UC-07', 'quiz', 'Bài kiểm tra tạo sẵn để thử nhập điểm.',
       CURRENT_DATE, NOW() + INTERVAL '7 days', 'published', c.teacher_user_id
FROM classes c WHERE c.class_code='DEMO10A'
ON CONFLICT (assignment_id) DO NOTHING;
COMMIT;
