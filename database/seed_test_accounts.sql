-- Local development only. All three accounts use the password "123".
-- Never deploy these intentionally weak test credentials to production.
BEGIN;

INSERT INTO users (
  user_id, username, email, password_hash, role, full_name, avatar_text, status
) VALUES
  (
    'c79e4d58-73c5-4920-b09f-62f6408c7c40',
    'teacher',
    'giaovien@lopminh.edu.vn',
    'scrypt$ce0e775f857974d2150afba0184a8f4e$667493697465ef6daae9de5e2ec022da00f5c242d427da8471402cf820a48b0893ecb8c4763012be13a2461fb141070d6f9b022509a586ee07023392ad3a969e',
    'teacher',
    'Giáo viên thử nghiệm',
    'GV',
    'active'
  ),
  (
    '2e1d0400-59ac-41cb-88fa-89118f9e1705',
    'student',
    'hocsinh@lopminh.edu.vn',
    'scrypt$c87b7e7d070773ec3b30f6958af5720a$e38e2dec5daf52160c0f3dccade65c299f9a446a62da0423c2493239981641c5c22baaacd497547c7f8f2865a7a56af543b0859ef6f62a81c47df61e5c8eb934',
    'student',
    'Học sinh thử nghiệm',
    'HS',
    'active'
  ),
  (
    'cf0c16a7-a6b8-4f2e-8cec-cf3c1aab16f6',
    'parent',
    'phuhuynh@lopminh.edu.vn',
    'scrypt$8cfa91f9de5fcd89c1e5726c4f90bdeb$cea33acb6dfebcc230bca9d5ff69621b7aa5ee891d8ed8599fc092a94170b6d4db3706b774fb0974e5b4658871ca1d3c628a334d54b8c05498fbdbae83e990e3',
    'parent',
    'Phụ huynh thử nghiệm',
    'PH',
    'active'
  )
ON CONFLICT (username) DO UPDATE SET
  email = EXCLUDED.email,
  password_hash = EXCLUDED.password_hash,
  role = EXCLUDED.role,
  full_name = EXCLUDED.full_name,
  avatar_text = EXCLUDED.avatar_text,
  status = 'active',
  failed_login_attempts = 0,
  locked_until = NULL;

INSERT INTO students (student_code, user_id, status)
SELECT 'HS001', user_id, 'active'
FROM users
WHERE username = 'student'
ON CONFLICT (user_id) DO UPDATE SET
  student_code = EXCLUDED.student_code,
  status = 'active';

INSERT INTO parents (user_id, full_name, phone, email)
SELECT user_id, 'Phụ huynh thử nghiệm', NULL, 'phuhuynh@lopminh.edu.vn'
FROM users
WHERE username = 'parent'
ON CONFLICT (user_id) DO UPDATE SET
  full_name = EXCLUDED.full_name,
  email = EXCLUDED.email;

INSERT INTO student_parents (student_id, parent_id, relationship, is_primary)
SELECT s.student_id, p.parent_id, 'Phụ huynh', TRUE
FROM students s
JOIN users su ON su.user_id = s.user_id
JOIN users pu ON pu.username = 'parent'
JOIN parents p ON p.user_id = pu.user_id
WHERE su.username = 'student'
ON CONFLICT (student_id, parent_id) DO UPDATE SET
  relationship = EXCLUDED.relationship,
  is_primary = TRUE;

COMMIT;
