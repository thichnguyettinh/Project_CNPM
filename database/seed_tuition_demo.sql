-- Demo dataset for UC-09 (Teacher Tuition Management) & UC-12 (Parent Tuition Portal & Reminders)
-- Prerequisite: Run database/schema.sql and database/seed_test_accounts.sql first.
-- Apply with:
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f database/seed_tuition_demo.sql
--
-- Derived October 2026 figures from v_tuition_invoice_balances:
--   * Teacher (6 classes, 96 students):
--       Total Due       = 76,400,000 VND (76.4M)
--       Total Paid      = 68,400,000 VND (68.4M) — 81 students paid in full
--       Total Remaining =  8,000,000 VND ( 8.0M) — 15 students with remaining balance
--   * Parent linked to HS001 (Toan 8A, invoice HP-102026-MA):
--       Amount Due      =  1,800,000 VND
--       Amount Paid     =  1,200,000 VND (2 confirmed off-system payments: 600k + 600k => 66.7%)
--       Amount Remain   =    600,000 VND (Due date: 28/10/2026)

BEGIN;

-- 1. Đảm bảo thông tin liên hệ hiển thị thân thiện cho 3 tài khoản thử nghiệm (giữ nguyên mật khẩu & role)
UPDATE users
SET full_name = 'Nguyễn Hà Linh',
    phone = '0903 128 456',
    avatar_text = 'HL'
WHERE username = 'teacher';

UPDATE users
SET full_name = 'Nguyễn Minh Anh',
    phone = '0908 221 109',
    avatar_text = 'MA'
WHERE username = 'student';

UPDATE users
SET full_name = 'Nguyễn Thị Mai',
    phone = '0912 456 789',
    avatar_text = 'TM'
WHERE username = 'parent';

UPDATE parents
SET full_name = 'Nguyễn Thị Mai',
    phone = '0912 456 789',
    email = 'phuhuynh@lopminh.edu.vn'
WHERE user_id = (SELECT user_id FROM users WHERE username = 'parent');

-- 2. Khởi tạo 6 lớp học đang giảng dạy của giáo viên (TO10A, TO10B, TO11A, TO11B, TO12A, TO8A)
INSERT INTO classes (
  class_id, class_code, name, subject, teacher_user_id, monthly_fee, default_room, description, status
)
SELECT
  v.class_id,
  v.class_code,
  v.name,
  v.subject,
  t.user_id,
  v.monthly_fee,
  v.default_room,
  v.description,
  'active'
FROM users t
CROSS JOIN (
  VALUES
    ('CLS-TO10A', 'TO10A', 'Toán 10 - Nền tảng', 'Toán 10', 800000.00, 'Phòng 201', 'Lớp Toán 10 nền tảng học kỳ I'),
    ('CLS-TO10B', 'TO10B', 'Toán 10 - Củng cố',  'Toán 10', 800000.00, 'Phòng 202', 'Lớp Toán 10 củng cố chuyên đề'),
    ('CLS-TO11A', 'TO11A', 'Toán 11 - Nâng cao', 'Toán 11', 800000.00, 'Phòng 203', 'Lớp Toán 11 nâng cao'),
    ('CLS-TO11B', 'TO11B', 'Toán 11 - Cơ bản',   'Toán 11', 800000.00, 'Phòng 204', 'Lớp Toán 11 cơ bản'),
    ('CLS-TO12A', 'TO12A', 'Toán 12 - Luyện thi','Toán 12', 800000.00, 'Phòng 205', 'Lớp Toán 12 luyện thi THPT'),
    ('CLS-TO8A',  'TO8A',  'Toán 8A',            'Toán 8',  1800000.00,'Phòng 102', 'Lớp Toán 8A bồi dưỡng chuyên sâu')
) AS v(class_id, class_code, name, subject, monthly_fee, default_room, description)
WHERE t.username = 'teacher'
ON CONFLICT (class_code) DO UPDATE SET
  name = EXCLUDED.name,
  subject = EXCLUDED.subject,
  teacher_user_id = EXCLUDED.teacher_user_id,
  monthly_fee = EXCLUDED.monthly_fee,
  default_room = EXCLUDED.default_room,
  status = 'active';

-- 3. Tạo thêm 95 học sinh demo (HS002 -> HS096) cùng HS001 có sẵn = đủ 96 học sinh
INSERT INTO users (
  user_id, username, email, password_hash, role, full_name, avatar_text, status
)
SELECT
  format('demo-stu-user-%s', lpad(gs::text, 3, '0')),
  format('hs%s', lpad(gs::text, 3, '0')),
  format('hs%s@lopminh.edu.vn', lpad(gs::text, 3, '0')),
  (SELECT password_hash FROM users WHERE username = 'student'),
  'student',
  CASE gs
    WHEN 2 THEN 'Nguyễn Đức Bảo'
    WHEN 3 THEN 'Lê Ngọc Chi'
    WHEN 4 THEN 'Phạm Hải Đăng'
    WHEN 5 THEN 'Hoàng Thu Hà'
    WHEN 6 THEN 'Vũ Gia Hưng'
    WHEN 7 THEN 'Đặng Khánh Linh'
    WHEN 8 THEN 'Bùi Nhật Minh'
    WHEN 9 THEN 'Đỗ Phương Nam'
    WHEN 10 THEN 'Ngô Thảo Nguyên'
    WHEN 11 THEN 'Lý Quốc Phong'
    WHEN 12 THEN 'Trịnh Minh Quân'
    WHEN 13 THEN 'Phan Thanh Sơn'
    WHEN 14 THEN 'Đinh Bảo Trâm'
    WHEN 15 THEN 'Vương Ánh Tuyết'
    WHEN 16 THEN 'Hồ Gia Huy'
    ELSE format('Học sinh %s', lpad(gs::text, 3, '0'))
  END,
  'HS',
  'active'
FROM generate_series(2, 96) AS gs
ON CONFLICT (username) DO UPDATE SET
  full_name = EXCLUDED.full_name,
  status = 'active';

UPDATE users SET full_name = 'Trương Ánh Tuyết' WHERE username = 'hs015';

INSERT INTO students (student_code, user_id, status)
SELECT
  format('HS%s', lpad(gs::text, 3, '0')),
  u.user_id,
  'active'
FROM generate_series(2, 96) AS gs
JOIN users u ON u.username = format('hs%s', lpad(gs::text, 3, '0'))
ON CONFLICT (student_code) DO UPDATE SET
  user_id = EXCLUDED.user_id,
  status = 'active';

-- 4. Ghi danh 96 học sinh vào 6 lớp học:
--    HS001 & HS084..HS096 (14 HS) -> TO8A
--    HS002..HS021         (20 HS) -> TO10A
--    HS022..HS037         (16 HS) -> TO10B
--    HS038..HS055         (18 HS) -> TO11A
--    HS056..HS067         (12 HS) -> TO11B
--    HS068..HS083         (16 HS) -> TO12A
INSERT INTO class_enrollments (class_id, student_id, enrolled_on, status)
SELECT
  c.class_id,
  s.student_id,
  DATE '2026-09-01',
  'active'
FROM students s
JOIN classes c ON c.class_code = CASE
  WHEN s.student_code = 'HS001' OR (substring(s.student_code FROM 3)::int BETWEEN 84 AND 96) THEN 'TO8A'
  WHEN substring(s.student_code FROM 3)::int BETWEEN 2 AND 21 THEN 'TO10A'
  WHEN substring(s.student_code FROM 3)::int BETWEEN 22 AND 37 THEN 'TO10B'
  WHEN substring(s.student_code FROM 3)::int BETWEEN 38 AND 55 THEN 'TO11A'
  WHEN substring(s.student_code FROM 3)::int BETWEEN 56 AND 67 THEN 'TO11B'
  ELSE 'TO12A'
END
WHERE s.student_code ~ '^HS0(0[1-9]|[1-8][0-9]|9[0-6])$'
ON CONFLICT (class_id, student_id, enrolled_on) DO UPDATE SET
  status = 'active',
  ended_on = NULL;

-- 5. Tạo một số buổi học & điểm danh thực tế tháng 10/2026 cho lớp TO8A để đối chiếu trên Modal Chi tiết
INSERT INTO class_sessions (class_id, starts_at, ends_at, room, topic, status, created_by)
SELECT
  c.class_id,
  v.starts_at::timestamptz,
  v.ends_at::timestamptz,
  'Phòng 102',
  v.topic,
  'completed',
  t.user_id
FROM classes c
CROSS JOIN users t
CROSS JOIN (
  VALUES
    ('2026-10-03 18:00:00+07', '2026-10-03 19:30:00+07', 'Nhân đa thức & Hằng đẳng thức đáng nhớ'),
    ('2026-10-10 18:00:00+07', '2026-10-10 19:30:00+07', 'Phân tích đa thức thành nhân tử'),
    ('2026-10-17 18:00:00+07', '2026-10-17 19:30:00+07', 'Hình bình hành & Hình chữ nhật'),
    ('2026-10-20 18:00:00+07', '2026-10-20 19:30:00+07', 'Kiểm tra định kỳ tháng 10')
) AS v(starts_at, ends_at, topic)
WHERE c.class_code = 'TO8A'
  AND t.username = 'teacher'
  AND NOT EXISTS (
    SELECT 1 FROM class_sessions cs
    WHERE cs.class_id = c.class_id AND cs.starts_at = v.starts_at::timestamptz
  );

INSERT INTO attendance_records (session_id, student_id, status, note, marked_by, marked_at)
SELECT
  cs.session_id,
  s.student_id,
  'present',
  'Tham gia đầy đủ',
  t.user_id,
  cs.ends_at
FROM class_sessions cs
JOIN classes c ON c.class_id = cs.class_id
JOIN students s ON s.student_code = 'HS001'
JOIN users t ON t.username = 'teacher'
WHERE c.class_code = 'TO8A'
  AND cs.starts_at::date BETWEEN DATE '2026-10-01' AND DATE '2026-10-28'
ON CONFLICT (session_id, student_id) DO NOTHING;

-- 6. Làm sạch dữ liệu thanh toán & hóa đơn demo cũ của kỳ 09/2026 và 10/2026 trước khi nạp lại chuẩn xác
DELETE FROM notifications
WHERE invoice_id LIKE 'HP-102026-%' OR invoice_id = 'HP-092026-MA';

DELETE FROM tuition_payments
WHERE invoice_id LIKE 'HP-102026-%' OR invoice_id = 'HP-092026-MA';

DELETE FROM tuition_invoices
WHERE invoice_id LIKE 'HP-102026-%' OR invoice_id = 'HP-092026-MA';

-- 7. Hóa đơn kỳ Tháng 09/2026 của HS001 (đã hoàn tất 100% để phụ huynh đối chiếu nhiều kỳ)
INSERT INTO tuition_invoices (
  invoice_id, student_id, class_id, billing_year, billing_month,
  period_start, period_end, sessions_count, amount_due, note, issued_by, issued_at, status
)
SELECT
  'HP-092026-MA',
  s.student_id,
  c.class_id,
  2026,
  9,
  DATE '2026-09-01',
  DATE '2026-09-28',
  12,
  1800000.00,
  'Học phí tháng 09/2026 lớp Toán 8A (đã hoàn tất)',
  t.user_id,
  TIMESTAMPTZ '2026-09-01 09:00:00+07',
  'open'
FROM students s
JOIN classes c ON c.class_code = 'TO8A'
JOIN users t ON t.username = 'teacher'
WHERE s.student_code = 'HS001'
ON CONFLICT (student_id, class_id, billing_year, billing_month) DO NOTHING;

INSERT INTO tuition_payments (
  invoice_id, amount, payment_method, paid_at, reference_code, note, recorded_by
)
SELECT
  'HP-092026-MA',
  1800000.00,
  'bank_transfer',
  TIMESTAMPTZ '2026-09-10 15:20:00+07',
  'PT-202609-019',
  'Phụ huynh chuyển khoản đủ học phí tháng 09/2026',
  t.user_id
FROM users t
WHERE t.username = 'teacher'
  AND EXISTS (SELECT 1 FROM tuition_invoices WHERE invoice_id = 'HP-092026-MA');

-- 8. Phát hành 96 hóa đơn Tháng 10/2026 (Tổng phải thu = 76.400.000 ₫):
--    * HS001: 1.800.000 ₫ (mã HP-102026-MA, hạn 28/10/2026)
--    * HS002..HS082 (81 HS): 800.000 ₫ / HS = 64.800.000 ₫
--    * HS083..HS096 (14 HS): 700.000 ₫ / HS =  9.800.000 ₫
--    => Cộng: 1.800.000 + 64.800.000 + 9.800.000 = 76.400.000 ₫
INSERT INTO tuition_invoices (
  invoice_id, student_id, class_id, billing_year, billing_month,
  period_start, period_end, sessions_count, amount_due, note, issued_by, issued_at, status
)
SELECT
  CASE
    WHEN s.student_code = 'HS001' THEN 'HP-102026-MA'
    ELSE format('HP-102026-%s', s.student_code)
  END,
  s.student_id,
  ce.class_id,
  2026,
  10,
  DATE '2026-10-01',
  CASE WHEN s.student_code = 'HS001' THEN DATE '2026-10-28' ELSE DATE '2026-10-25' END,
  CASE WHEN s.student_code = 'HS001' THEN 12 ELSE 8 END,
  CASE
    WHEN s.student_code = 'HS001' THEN 1800000.00
    WHEN substring(s.student_code FROM 3)::int BETWEEN 83 AND 96 THEN 700000.00
    ELSE 800000.00
  END,
  CASE
    WHEN s.student_code = 'HS001' THEN 'Học phí tháng 10/2026 lớp Toán 8A (12 buổi)'
    ELSE 'Học phí định kỳ tháng 10/2026'
  END,
  t.user_id,
  TIMESTAMPTZ '2026-10-01 08:30:00+07',
  'open'
FROM students s
JOIN class_enrollments ce ON ce.student_id = s.student_id AND ce.status = 'active'
JOIN users t ON t.username = 'teacher'
WHERE s.student_code ~ '^HS0(0[1-9]|[1-8][0-9]|9[0-6])$'
ON CONFLICT (student_id, class_id, billing_year, billing_month) DO NOTHING;

-- 9. Ghi nhận các khoản thu ngoài hệ thống Tháng 10/2026 (Tổng đã thu = 68.400.000 ₫, Còn lại = 8.000.000 ₫):
--    a) HS001 (HP-102026-MA): 2 lần đóng = 600.000 + 600.000 = 1.200.000 ₫ (66,7%), còn thiếu 600.000 ₫
INSERT INTO tuition_payments (
  invoice_id, amount, payment_method, paid_at, reference_code, note, recorded_by
)
SELECT
  'HP-102026-MA',
  v.amount,
  v.method,
  v.paid_at::timestamptz,
  v.ref_code,
  v.note,
  t.user_id
FROM users t
CROSS JOIN (
  VALUES
    (600000.00, 'cash',          '2026-10-05 18:10:00+07', 'PT-202610-031', 'Phụ huynh nộp tiền mặt đợt 1 tại trung tâm'),
    (600000.00, 'bank_transfer', '2026-10-15 14:25:00+07', 'PT-202610-084', 'Phụ huynh Nguyễn Thị Mai chuyển khoản đợt 2')
) AS v(amount, method, paid_at, ref_code, note)
WHERE t.username = 'teacher'
  AND EXISTS (SELECT 1 FROM tuition_invoices WHERE invoice_id = 'HP-102026-MA');

--    b) HS005: đã nộp 500.000 ₫, còn thiếu 300.000 ₫ (HS002 & HS004 chưa thu 0 ₫ -> còn thiếu 800k mỗi em)
INSERT INTO tuition_payments (
  invoice_id, amount, payment_method, paid_at, reference_code, note, recorded_by
)
SELECT
  'HP-102026-HS005',
  500000.00,
  'cash',
  TIMESTAMPTZ '2026-10-12 19:05:00+07',
  'PT-202610-052',
  'Nộp tiền mặt đợt 1 tại lớp Toán 10A',
  t.user_id
FROM users t
WHERE t.username = 'teacher'
  AND EXISTS (SELECT 1 FROM tuition_invoices WHERE invoice_id = 'HP-102026-HS005');

--    c) HS006..HS016 (11 HS): mỗi HS đã nộp 300.000 ₫, còn thiếu 500.000 ₫ (Tổng nợ nhóm này = 5.500.000 ₫)
INSERT INTO tuition_payments (
  invoice_id, amount, payment_method, paid_at, reference_code, note, recorded_by
)
SELECT
  inv.invoice_id,
  300000.00,
  CASE WHEN gs % 2 = 0 THEN 'bank_transfer' ELSE 'cash' END,
  TIMESTAMPTZ '2026-10-14 17:30:00+07',
  format('PT-202610-%s', lpad((60 + gs)::text, 3, '0')),
  'Thu một phần học phí tháng 10/2026',
  t.user_id
FROM generate_series(6, 16) AS gs
JOIN tuition_invoices inv ON inv.invoice_id = format('HP-102026-HS%s', lpad(gs::text, 3, '0'))
CROSS JOIN users t
WHERE t.username = 'teacher';

--    d) 81 học sinh đóng đủ 100% (HS003 & HS017..HS096): Tổng thu đủ = 63.400.000 ₫
INSERT INTO tuition_payments (
  invoice_id, amount, payment_method, paid_at, reference_code, note, recorded_by
)
SELECT
  i.invoice_id,
  i.amount_due,
  CASE WHEN (substring(s.student_code FROM 3)::int % 3 = 0) THEN 'cash' ELSE 'bank_transfer' END,
  TIMESTAMPTZ '2026-10-10 16:00:00+07',
  format('PT-202610-%s', lpad((100 + substring(s.student_code FROM 3)::int)::text, 3, '0')),
  'Đã đóng đủ học phí tháng 10/2026',
  t.user_id
FROM tuition_invoices i
JOIN students s ON s.student_id = i.student_id
JOIN users t ON t.username = 'teacher'
WHERE i.billing_year = 2026
  AND i.billing_month = 10
  AND (
    s.student_code = 'HS003'
    OR (substring(s.student_code FROM 3)::int BETWEEN 17 AND 96)
  );

-- 10. Phát hành thông báo Báo phí & Nhắc hạn nộp học phí cho tài khoản Phụ huynh (Trang 28 PDF)
INSERT INTO notifications (
  recipient_user_id, title, body, category, invoice_id, created_at, read_at
)
SELECT
  p_user.user_id,
  v.title,
  v.body,
  v.category,
  v.invoice_id,
  v.created_at::timestamptz,
  v.read_at::timestamptz
FROM users p_user
CROSS JOIN (
  VALUES
    (
      'Nhắc học phí tháng 10/2026 · Nguyễn Minh Anh',
      'Kính gửi Quý Phụ huynh em Nguyễn Minh Anh (HS001 · Lớp Toán 8A), khoản thu học phí kỳ 01/10/2026–28/10/2026 có tổng phải đóng 1.800.000 ₫, đã xác nhận đóng 1.200.000 ₫ (66,7%), số tiền còn thiếu 600.000 ₫. Hạn thanh toán: 28/10/2026. Quý Phụ huynh vui lòng hoàn tất phần học phí còn lại trực tiếp tại trung tâm hoặc chuyển khoản ngoài hệ thống cho giáo viên phụ trách.',
      'tuition',
      'HP-102026-MA',
      '2026-10-22 08:30:00+07',
      NULL
    ),
    (
      'Đã xác nhận thanh toán đợt 2 · Mã biên nhận PT-202610-084',
      'Trung tâm Lớp Mình đã đối chiếu và xác nhận khoản chuyển khoản 600.000 ₫ ngày 15/10/2026 cho phiếu thu HP-102026-MA của em Nguyễn Minh Anh. Tổng đã đóng trong kỳ: 1.200.000 ₫ / 1.800.000 ₫.',
      'tuition',
      'HP-102026-MA',
      '2026-10-15 15:00:00+07',
      '2026-10-16 09:15:00+07'
    ),
    (
      'Báo phí đầu kỳ tháng 10/2026 · Lớp Toán 8A',
      'Phiếu báo học phí HP-102026-MA kỳ 01/10–28/10/2026 (12 buổi, tổng mức thu 1.800.000 ₫) của em Nguyễn Minh Anh đã được phát hành trên Cổng phụ huynh.',
      'tuition',
      'HP-102026-MA',
      '2026-10-01 09:00:00+07',
      '2026-10-02 20:00:00+07'
    )
) AS v(title, body, category, invoice_id, created_at, read_at)
WHERE p_user.username = 'parent';

COMMIT;
