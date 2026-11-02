"""
Seed 6 classes, 96 students, schedule rules, and sessions for Lop Minh.
Designed specifically for UC-03 and UC-04 requirements.
"""
import uuid
from datetime import date, datetime, time, timedelta, timezone
import psycopg

DATABASE_URL = "postgresql://lopminh:change-me@127.0.0.1:5432/lopminh"

def seed_data():
    conn = psycopg.connect(DATABASE_URL, autocommit=True)
    with conn.cursor() as cur:
        # 1. Update teacher full_name to 'Nguyễn Hà Linh'
        cur.execute(
            """
            UPDATE users 
            SET full_name = 'Nguyễn Hà Linh', avatar_text = 'HL'
            WHERE username = 'teacher'
            RETURNING user_id
            """
        )
        teacher_row = cur.fetchone()
        if not teacher_row:
            raise RuntimeError("Teacher user not found!")
        teacher_id = teacher_row[0]
        print(f"Teacher ID: {teacher_id}")

        # Update student HS001
        cur.execute(
            """
            UPDATE users
            SET full_name = 'Trần Minh Anh', avatar_text = 'MA'
            WHERE username = 'student'
            RETURNING user_id
            """
        )
        student_user_id = cur.fetchone()[0]

        # Update parent
        cur.execute(
            """
            UPDATE users
            SET full_name = 'Trần Thị Hương', avatar_text = 'TH'
            WHERE username = 'parent'
            RETURNING user_id
            """
        )
        parent_user_id = cur.fetchone()[0]

        cur.execute(
            """
            UPDATE parents
            SET full_name = 'Trần Thị Hương', phone = '0901234500'
            WHERE user_id = %s
            """,
            (parent_user_id,)
        )

        # 2. Define the 6 classes
        classes_data = [
            {
                "code": "TO10A",
                "name": "Toán 10 - Nền tảng",
                "subject": "Toán",
                "monthly_fee": 800000,
                "room": "Phòng 201",
                "description": "Củng cố nền tảng kiến thức Toán 10 và rèn luyện kỹ năng giải bài tập theo chương trình GDPT mới.",
                "status": "active",
                "schedule_days": [1, 3, 5], # Mon, Wed, Fri
                "starts": "17:30",
                "ends": "19:00",
                "target_students": 20
            },
            {
                "code": "TO11A",
                "name": "Toán 11 - Nâng cao",
                "subject": "Toán",
                "monthly_fee": 900000,
                "room": "Phòng 201",
                "description": "Chuyên đề nâng cao Đại số và Hình học không gian 11, phát triển tư duy giải toán.",
                "status": "active",
                "schedule_days": [2, 4], # Tue, Thu
                "starts": "17:30",
                "ends": "19:00",
                "target_students": 18
            },
            {
                "code": "TO12A",
                "name": "Toán 12 - Luyện thi",
                "subject": "Toán",
                "monthly_fee": 1000000,
                "room": "Phòng 202",
                "description": "Luyện thi tốt nghiệp THPT Quốc gia môn Toán, tổng ôn và giải đề thi chuẩn cấu trúc.",
                "status": "active",
                "schedule_days": [1, 3, 5], # Mon, Wed, Fri
                "starts": "19:15",
                "ends": "20:45",
                "target_students": 16
            },
            {
                "code": "TO10B",
                "name": "Toán 10 - Củng cố",
                "subject": "Toán",
                "monthly_fee": 700000,
                "room": "Phòng 202",
                "description": "Lớp học phụ đạo, ôn luyện kiến thức cho học sinh cần củng cố kiến thức Toán 10.",
                "status": "active",
                "schedule_days": [2, 4], # Tue, Thu
                "starts": "19:15",
                "ends": "20:45",
                "target_students": 16
            },
            {
                "code": "TO11B",
                "name": "Toán 11 - Nền tảng",
                "subject": "Toán",
                "monthly_fee": 700000,
                "room": "Phòng 201",
                "description": "Khóa học nền tảng Toán 11 dành cho học sinh chuẩn bị bước vào giai đoạn ôn tập giữa kỳ.",
                "status": "active",
                "schedule_days": [6], # Sat
                "starts": "08:00",
                "ends": "10:00",
                "target_students": 14
            },
            {
                "code": "TO9A",
                "name": "Toán 9 - Vào lớp 10",
                "subject": "Toán",
                "monthly_fee": 600000,
                "room": "Phòng 201",
                "description": "Ôn luyện kiến thức trọng tâm Toán 9 và giải đề thi tuyển sinh vào lớp 10 công lập.",
                "status": "active",
                "schedule_days": [7], # Sun
                "starts": "08:00",
                "ends": "10:00",
                "target_students": 12
            }
        ]

        class_ids = {}
        for c in classes_data:
            cur.execute(
                """
                INSERT INTO classes (class_id, class_code, name, subject, teacher_user_id, monthly_fee, default_room, description, status)
                VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s)
                ON CONFLICT (class_code) DO UPDATE SET
                  name = EXCLUDED.name,
                  subject = EXCLUDED.subject,
                  teacher_user_id = EXCLUDED.teacher_user_id,
                  monthly_fee = EXCLUDED.monthly_fee,
                  default_room = EXCLUDED.default_room,
                  description = EXCLUDED.description,
                  status = EXCLUDED.status
                RETURNING class_id
                """,
                (
                    str(uuid.uuid4()),
                    c["code"],
                    c["name"],
                    c["subject"],
                    teacher_id,
                    c["monthly_fee"],
                    c["room"],
                    c["description"],
                    c["status"]
                )
            )
            cid = cur.fetchone()[0]
            class_ids[c["code"]] = cid
            print(f"Class {c['code']}: {cid}")

        # 3. Seed Students (HS001 to HS096)
        # First 20 students for TO10A with realistic Vietnamese names
        sample_first_names = ["Nguyễn", "Trần", "Lê", "Phạm", "Hoàng", "Huỳnh", "Phan", "Vũ", "Võ", "Đặng", "Bùi", "Đỗ", "Hồ", "Ngô", "Dương", "Lý"]
        sample_middle_names = ["Văn", "Thị", "Đức", "Minh", "Hải", "Ngọc", "Gia", "Châu", "Hoàng", "Quốc", "Xuân", "Thanh", "Mỹ", "Trọng"]
        sample_last_names = ["Anh", "Bảo", "Chi", "Dũng", "Dương", "Đạt", "Hà", "Hải", "Hiếu", "Huy", "Khoa", "Linh", "Long", "Mai", "Nam", "Nhi", "Phúc", "Quân", "Sơn", "Thảo", "Thịnh", "Trang", "Tuấn", "Vy", "Yến"]

        # Ensure HS001 profile
        cur.execute(
            """
            INSERT INTO user_profiles (user_id, date_of_birth, address, biography)
            VALUES (%s, '2010-01-12', '123 Nguyễn Văn Cừ, Quận 5, TP.HCM', 'Học sinh lớp 10, yêu thích môn Toán')
            ON CONFLICT (user_id) DO UPDATE SET
              date_of_birth = EXCLUDED.date_of_birth,
              address = EXCLUDED.address
            """,
            (student_user_id,)
        )

        all_students = []
        # Get or create students up to HS096
        for i in range(1, 97):
            code = f"HS{i:03d}"
            cur.execute("SELECT student_id, user_id FROM students WHERE student_code = %s", (code,))
            existing = cur.fetchone()
            if existing:
                all_students.append((existing[0], code, existing[1]))
            else:
                # Generate realistic name
                fn = sample_first_names[(i * 3) % len(sample_first_names)]
                mn = sample_middle_names[(i * 5) % len(sample_middle_names)]
                ln = sample_last_names[(i * 7) % len(sample_last_names)]
                full_name = f"{fn} {mn} {ln}"
                username = f"student_{i:03d}"
                email = f"hs{i:03d}@lopminh.edu.vn"
                uid = str(uuid.uuid4())
                birth_year = 2011 if i > 84 else (2010 if i > 12 else 2009)
                birth_date = f"{birth_year}-{(i%12)+1:02d}-{(i%28)+1:02d}"

                # Insert user
                cur.execute(
                    """
                    INSERT INTO users (user_id, username, email, password_hash, role, full_name, avatar_text, status)
                    VALUES (%s, %s, %s, 'scrypt$dummy$dummy', 'student', %s, %s, 'active')
                    RETURNING user_id
                    """,
                    (uid, username, email, full_name, full_name.split()[-1][:2].upper())
                )
                cur.execute(
                    """
                    INSERT INTO user_profiles (user_id, date_of_birth, address)
                    VALUES (%s, %s, %s)
                    """,
                    (uid, birth_date, f"{i*12} Lê Lợi, TP.HCM")
                )
                cur.execute(
                    """
                    INSERT INTO students (student_code, user_id, status)
                    VALUES (%s, %s, 'active')
                    RETURNING student_id
                    """,
                    (code, uid)
                )
                sid = cur.fetchone()[0]

                # Create parent for student
                parent_name = f"{fn} Văn Phụ Huynh {i:03d}"
                parent_phone = f"090123{i:04d}"
                cur.execute(
                    """
                    INSERT INTO parents (full_name, phone, email)
                    VALUES (%s, %s, %s)
                    RETURNING parent_id
                    """,
                    (parent_name, parent_phone, f"ph{i:03d}@lopminh.edu.vn")
                )
                pid = cur.fetchone()[0]
                cur.execute(
                    """
                    INSERT INTO student_parents (student_id, parent_id, relationship, is_primary)
                    VALUES (%s, %s, 'Phụ huynh', TRUE)
                    """,
                    (sid, pid)
                )

                all_students.append((sid, code, uid))

        print(f"Total students verified: {len(all_students)}")

        # 4. Enroll students into classes
        # TO10A: 20 students (HS001 to HS020)
        # TO11A: 18 students (HS021 to HS038)
        # TO12A: 16 students (HS039 to HS054)
        # TO10B: 16 students (HS055 to HS070)
        # TO11B: 14 students (HS071 to HS084)
        # TO9A: 12 students (HS085 to HS096)
        allocation = [
            ("TO10A", 0, 20),
            ("TO11A", 20, 38),
            ("TO12A", 38, 54),
            ("TO10B", 54, 70),
            ("TO11B", 70, 84),
            ("TO9A", 84, 96)
        ]

        enrolled_on = date(2026, 9, 1)
        for code, start_idx, end_idx in allocation:
            cid = class_ids[code]
            for s_id, s_code, _ in all_students[start_idx:end_idx]:
                cur.execute(
                    """
                    INSERT INTO class_enrollments (class_id, student_id, enrolled_on, status)
                    VALUES (%s, %s, %s, 'active')
                    ON CONFLICT (class_id, student_id, enrolled_on) DO UPDATE SET status = 'active'
                    """,
                    (cid, s_id, enrolled_on)
                )
            print(f"Enrolled {end_idx - start_idx} students in {code}")

        # 5. Seed Recurring Schedule Rules
        # weekday: 1=Mon, 2=Tue, 3=Wed, 4=Thu, 5=Fri, 6=Sat, 7=Sun
        cur.execute("DELETE FROM class_schedule_rules WHERE class_id = ANY(%s)", (list(class_ids.values()),))
        for c in classes_data:
            cid = class_ids[c["code"]]
            for w in c["schedule_days"]:
                cur.execute(
                    """
                    INSERT INTO class_schedule_rules (class_id, weekday, starts_at, ends_at, room, effective_from)
                    VALUES (%s, %s, %s, %s, %s, '2026-09-01')
                    """,
                    (cid, w, c["starts"], c["ends"], c["room"])
                )

        # 6. Seed Sessions for week 19/10/2026 - 25/10/2026
        # Clean existing sessions for these classes in Oct 2026 to ensure exact match with design
        cur.execute("DELETE FROM class_sessions WHERE class_id = ANY(%s)", (list(class_ids.values()),))

        week_sessions = [
            # Mon 19/10/2026
            ("TO10A", "2026-10-19T17:30:00+07:00", "2026-10-19T19:00:00+07:00", "Phòng 201", "Hàm số bậc nhất và đồ thị hàm số y = ax + b", "completed"),
            ("TO12A", "2026-10-19T19:15:00+07:00", "2026-10-19T20:45:00+07:00", "Phòng 202", "Khảo sát và vẽ đồ thị hàm số đa thức bậc 3 và bậc 4", "completed"),
            # Tue 20/10/2026
            ("TO11A", "2026-10-20T17:30:00+07:00", "2026-10-20T19:00:00+07:00", "Phòng 201", "Đạo hàm và quy tắc tính đạo hàm căn bản", "completed"),
            ("TO10B", "2026-10-20T19:15:00+07:00", "2026-10-20T20:45:00+07:00", "Phòng 202", "Hệ phương trình bậc nhất hai ẩn và phương pháp cộng đại số", "completed"),
            # Wed 21/10/2026
            ("TO10A", "2026-10-21T17:30:00+07:00", "2026-10-21T19:00:00+07:00", "Phòng 201", "Hàm số bậc hai: tọa độ đỉnh và trục đối xứng parabol", "completed"),
            ("TO12A", "2026-10-21T19:15:00+07:00", "2026-10-21T20:45:00+07:00", "Phòng 202", "Cực trị của hàm số đa thức và bài toán tìm m", "completed"),
            # Thu 22/10/2026
            ("TO11A", "2026-10-22T17:30:00+07:00", "2026-10-22T19:00:00+07:00", "Phòng 201", "Ứng dụng đạo hàm: Phương trình tiếp tuyến đường cong", "completed"),
            ("TO10B", "2026-10-22T19:15:00+07:00", "2026-10-22T20:45:00+07:00", "Phòng 202", "Giải toán bằng cách lập hệ phương trình thực tế", "completed"),
            # Fri 23/10/2026 (Design Focus Day!)
            ("TO10A", "2026-10-23T17:30:00+07:00", "2026-10-23T19:00:00+07:00", "Phòng 201", "Hàm số bậc hai: đồ thị và ứng dụng. Ôn tập dạng bài tìm giá trị lớn nhất, nhỏ nhất.", "scheduled"),
            ("TO12A", "2026-10-23T19:15:00+07:00", "2026-10-23T20:45:00+07:00", "Phòng 202", "Giá trị lớn nhất và nhỏ nhất của hàm số trên đoạn", "scheduled"),
            # Sat 24/10/2026
            ("TO11B", "2026-10-24T08:00:00+07:00", "2026-10-24T10:00:00+07:00", "Phòng 201", "Lượng giác: Công thức cộng và công thức nhân đôi", "scheduled"),
            # Sun 25/10/2026
            ("TO9A", "2026-10-25T08:00:00+07:00", "2026-10-25T10:00:00+07:00", "Phòng 201", "Căn bậc hai và căn bậc ba. Rút gọn biểu thức chứa căn thức", "scheduled"),
        ]

        # Also add recurring sessions for previous week (12-18 Oct) and next weeks (26 Oct - 15 Nov 2026)
        all_sessions = list(week_sessions)
        for offset_weeks in [-1, 1, 2]:
            for item in week_sessions:
                s_start = datetime.fromisoformat(item[1]) + timedelta(weeks=offset_weeks)
                s_end = datetime.fromisoformat(item[2]) + timedelta(weeks=offset_weeks)
                status = "completed" if offset_weeks < 0 else "scheduled"
                all_sessions.append((item[0], s_start.isoformat(), s_end.isoformat(), item[3], f"{item[4]} (Tuần {offset_weeks:+d})", status))

        session_count = 0
        for code, starts, ends, room, topic, status in all_sessions:
            cid = class_ids[code]
            cur.execute(
                """
                INSERT INTO class_sessions (class_id, starts_at, ends_at, room, topic, status, created_by)
                VALUES (%s, %s, %s, %s, %s, %s, %s)
                RETURNING session_id
                """,
                (cid, starts, ends, room, topic, status, teacher_id)
            )
            session_count += 1

        print(f"Seeded {session_count} class sessions successfully!")

    conn.close()
    print("Database seeding completed successfully!")

if __name__ == "__main__":
    seed_data()
