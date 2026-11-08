import unittest
from datetime import date, datetime, timedelta, timezone
from decimal import Decimal
from unittest.mock import MagicMock, patch
from fastapi import HTTPException
from pydantic import ValidationError

from backend.app.main import (
    update_class,
    replace_class_schedule_rules,
    close_class,
    get_class_debts,
    create_session,
    create_recurring_sessions,
    generate_invoices,
)
from backend.app.schemas import (
    ClassUpdate,
    FixedScheduleCreate,
    SessionCreate,
    RecurringSessionCreate,
    InvoiceGenerate,
)


class UC03ClassManagementTests(unittest.TestCase):
    def setUp(self):
        self.teacher = {"user_id": "teacher-uuid-1", "role": "teacher"}
        self.conn = MagicMock()
        self.active_class = {
            "class_id": "class-uuid-10a",
            "class_code": "TO10A",
            "name": "Toán 10A",
            "subject": "Toán",
            "monthly_fee": Decimal("600000.00"),
            "default_room": "Phòng 203",
            "description": "Lớp 10 nâng cao",
            "status": "active",
            "teacher_user_id": "teacher-uuid-1",
        }
        self.completed_class = {
            "class_id": "class-uuid-10b",
            "class_code": "TO10B",
            "name": "Toán 10B",
            "subject": "Toán",
            "monthly_fee": Decimal("500000.00"),
            "default_room": "Phòng 101",
            "description": "Lớp đã hoàn thành",
            "status": "completed",
            "teacher_user_id": "teacher-uuid-1",
        }

    # --- TC_UC03_003: Chỉnh sửa thông tin lớp học ---

    def test_tc_uc03_003_edit_class_valid_info(self):
        """TC_UC03_003: Chỉnh sửa lớp với đầy đủ thông tin hợp lệ."""
        with patch("backend.app.main.require_class_teacher", return_value=self.active_class):
            with patch("backend.app.main.fetch_one") as mock_fetch_one:
                mock_fetch_one.return_value = {
                    **self.active_class,
                    "name": "Toán 10A - Chuyên đề",
                    "subject": "Toán Nâng Cao",
                    "monthly_fee": Decimal("750000.00"),
                }
                payload = ClassUpdate(
                    name="Toán 10A - Chuyên đề",
                    subject="Toán Nâng Cao",
                    monthly_fee=Decimal("750000.00"),
                    default_room="Phòng 204",
                    description="Mô tả mới",
                )
                res = update_class("class-uuid-10a", payload, self.conn, self.teacher)
                self.assertEqual(res["name"], "Toán 10A - Chuyên đề")
                self.assertEqual(res["subject"], "Toán Nâng Cao")
                self.assertEqual(res["monthly_fee"], Decimal("750000.00"))

    def test_tc_uc03_003_empty_required_fields_rejected(self):
        """TC_UC03_003: Bỏ trống từng trường bắt buộc (tên, môn học, học phí âm)."""
        # Empty name via schema validation
        with self.assertRaises(ValidationError):
            ClassUpdate(name="")

        # Empty subject via schema validation
        with self.assertRaises(ValidationError):
            ClassUpdate(subject="")

        # Negative fee via schema validation
        with self.assertRaises(ValidationError):
            ClassUpdate(monthly_fee=Decimal("-100"))

        # Blank whitespace via endpoint
        with patch("backend.app.main.require_class_teacher", return_value=self.active_class):
            with self.assertRaises(HTTPException) as ctx:
                update_class("class-uuid-10a", ClassUpdate(name="   "), self.conn, self.teacher)
            self.assertEqual(ctx.exception.status_code, 400)
            self.assertIn("Tên lớp", ctx.exception.detail)

            with self.assertRaises(HTTPException) as ctx:
                update_class("class-uuid-10a", ClassUpdate(subject="   "), self.conn, self.teacher)
            self.assertEqual(ctx.exception.status_code, 400)
            self.assertIn("Môn học", ctx.exception.detail)

    def test_tc_uc03_003_schedule_rules_validation_weekdays_and_times(self):
        """TC_UC03_003: Kiểm tra các trường bắt buộc của lịch học cố định khi chỉnh sửa."""
        with patch("backend.app.main.require_class_teacher", return_value=self.active_class):
            # Thiếu ngày học trong tuần (weekdays rỗng)
            with self.assertRaises(HTTPException) as ctx:
                replace_class_schedule_rules(
                    "class-uuid-10a",
                    FixedScheduleCreate(weekdays=[]),
                    self.conn,
                    self.teacher,
                )
            self.assertEqual(ctx.exception.status_code, 400)
            self.assertIn("ít nhất một ngày học", ctx.exception.detail)

            # Giờ kết thúc <= giờ bắt đầu
            with self.assertRaises(ValueError) as ctx:
                FixedScheduleCreate(
                    weekdays=[1, 3],
                    starts_at="19:00",
                    ends_at="17:30",
                    start_date=date(2026, 11, 1),
                    end_date=date(2026, 12, 1),
                )
            self.assertIn("Giờ kết thúc phải sau giờ bắt đầu.", str(ctx.exception))

            # Giờ kết thúc == giờ bắt đầu
            with self.assertRaises(ValueError) as ctx:
                FixedScheduleCreate(
                    weekdays=[1],
                    starts_at="18:00",
                    ends_at="18:00",
                    start_date=date(2026, 11, 1),
                    end_date=date(2026, 12, 1),
                )
            self.assertIn("Giờ kết thúc phải sau giờ bắt đầu.", str(ctx.exception))

            # Ngày kết thúc < ngày bắt đầu
            with self.assertRaises(ValueError) as ctx:
                FixedScheduleCreate(
                    weekdays=[1],
                    starts_at="17:30",
                    ends_at="19:00",
                    start_date=date(2026, 12, 1),
                    end_date=date(2026, 11, 1),
                )
            self.assertIn("Ngày kết thúc phải sau hoặc bằng ngày bắt đầu.", str(ctx.exception))

    def test_tc_uc03_003_cannot_edit_completed_class(self):
        """TC_UC03_003: Không cho phép chỉnh sửa lớp học đã kết thúc."""
        with patch("backend.app.main.require_class_teacher", return_value=self.completed_class):
            with self.assertRaises(HTTPException) as ctx:
                update_class("class-uuid-10b", ClassUpdate(name="Toán mới"), self.conn, self.teacher)
            self.assertEqual(ctx.exception.status_code, 400)
            self.assertIn("lớp học đã kết thúc", ctx.exception.detail)

    # --- TC_UC03_006: Kết thúc lớp học và xử lý lịch tương lai ---

    def test_tc_uc03_006_close_class_cancels_future_sessions_and_preserves_history(self):
        """TC_UC03_006: Kết thúc lớp: cập nhật completed, hủy buổi học tương lai, giữ lịch sử."""
        queries_executed = []

        def mock_fetch_one(conn, query, params=None):
            queries_executed.append(("fetch_one", query, params))
            if "UPDATE classes SET status = 'completed'" in query:
                return {**self.active_class, "status": "completed"}
            return None

        def mock_fetch_all(conn, query, params=None):
            queries_executed.append(("fetch_all", query, params))
            if "UPDATE class_sessions" in query:
                return [{"session_id": 99}]
            if "UPDATE class_schedule_rules" in query:
                return [{"schedule_rule_id": 1}]
            return []

        with patch("backend.app.main.require_class_teacher", return_value=self.active_class):
            with patch("backend.app.main.fetch_one", side_effect=mock_fetch_one):
                with patch("backend.app.main.fetch_all", side_effect=mock_fetch_all):
                    res = close_class("class-uuid-10a", self.conn, self.teacher)
                    self.assertEqual(res["status"], "completed")

        # Kiểm tra câu lệnh UPDATE class_sessions chỉ hủy các buổi tương lai và chưa có điểm danh
        cancelled_call = next(
            (call for call in queries_executed if "UPDATE class_sessions" in call[1]), None
        )
        self.assertIsNotNone(cancelled_call)
        query_sql = cancelled_call[1]
        self.assertIn("status = 'cancelled'", query_sql)
        self.assertIn("starts_at >= NOW()", query_sql)
        self.assertIn("NOT EXISTS (SELECT 1 FROM attendance_records", query_sql)

    def test_tc_uc03_006_completed_class_cannot_add_session_or_tuition(self):
        """TC_UC03_006: Backend chặn thêm buổi học hoặc phát sinh học phí sau khi lớp kết thúc."""
        with patch("backend.app.main.require_class_teacher", return_value=self.completed_class):
            # Chặn tạo buổi học đơn
            with self.assertRaises(HTTPException) as ctx:
                create_session(
                    SessionCreate(
                        class_id="class-uuid-10b",
                        starts_at=datetime.now(timezone.utc) + timedelta(days=1),
                        ends_at=datetime.now(timezone.utc) + timedelta(days=1, hours=1.5),
                    ),
                    self.conn,
                    self.teacher,
                )
            self.assertEqual(ctx.exception.status_code, 400)
            self.assertIn("Lớp học đã kết thúc", ctx.exception.detail)

            # Chặn tạo lịch lặp
            with self.assertRaises(HTTPException) as ctx:
                create_recurring_sessions(
                    RecurringSessionCreate(
                        class_id="class-uuid-10b",
                        weekdays=[1, 3],
                        starts_at="17:30",
                        ends_at="19:00",
                        start_date=date.today(),
                        end_date=date.today() + timedelta(days=30),
                    ),
                    self.conn,
                    self.teacher,
                )
            self.assertEqual(ctx.exception.status_code, 400)
            self.assertIn("Lớp học đã kết thúc", ctx.exception.detail)

            # Chặn phát sinh hóa đơn học phí
            with self.assertRaises(HTTPException) as ctx:
                generate_invoices(
                    InvoiceGenerate(
                        class_id="class-uuid-10b",
                        billing_year=2026,
                        billing_month=11,
                        period_start=date(2026, 11, 1),
                        period_end=date(2026, 11, 30),
                        amount_due=Decimal("500000.00"),
                    ),
                    self.conn,
                    self.teacher,
                )
            self.assertEqual(ctx.exception.status_code, 400)
            self.assertIn("Lớp học đã kết thúc", ctx.exception.detail)

    # --- TC_UC03_009: Cảnh báo công nợ trước khi kết thúc lớp ---

    def test_tc_uc03_009_class_with_debts_detected_and_calculated(self):
        """TC_UC03_009: Kiểm tra lớp có học sinh còn nợ học phí: thông tin và số tiền nợ chính xác."""
        mock_debts = [
            {
                "invoice_id": "INV-001",
                "student_code": "HS001",
                "student_name": "Nguyễn Văn A",
                "billing_year": 2026,
                "billing_month": 10,
                "amount_due": Decimal("600000.00"),
                "amount_paid": Decimal("200000.00"),
                "amount_remaining": Decimal("400000.00"),
                "payment_status": "partial",
                "period_start": date(2026, 10, 1),
                "period_end": date(2026, 10, 31),
            },
            {
                "invoice_id": "INV-002",
                "student_code": "HS002",
                "student_name": "Trần Thị B",
                "billing_year": 2026,
                "billing_month": 10,
                "amount_due": Decimal("600000.00"),
                "amount_paid": Decimal("0.00"),
                "amount_remaining": Decimal("600000.00"),
                "payment_status": "unpaid",
                "period_start": date(2026, 10, 1),
                "period_end": date(2026, 10, 31),
            },
        ]
        with patch("backend.app.main.require_class_teacher", return_value=self.active_class):
            with patch("backend.app.main.fetch_all", return_value=mock_debts):
                res = get_class_debts("class-uuid-10a", self.conn, self.teacher)
                self.assertTrue(res["has_debt"])
                self.assertEqual(res["debt_count"], 2)
                self.assertEqual(res["total_debt"], 1000000.00)
                self.assertEqual(len(res["debts"]), 2)
                self.assertEqual(res["debts"][0]["student_code"], "HS001")
                self.assertEqual(res["debts"][0]["amount_remaining"], Decimal("400000.00"))

    def test_tc_uc03_009_class_without_debt(self):
        """TC_UC03_009: Lớp không còn nợ học phí."""
        with patch("backend.app.main.require_class_teacher", return_value=self.active_class):
            with patch("backend.app.main.fetch_all", return_value=[]):
                res = get_class_debts("class-uuid-10a", self.conn, self.teacher)
                self.assertFalse(res["has_debt"])
                self.assertEqual(res["debt_count"], 0)
                self.assertEqual(res["total_debt"], 0)
                self.assertEqual(res["debts"], [])


class UC04ScheduleTests(unittest.TestCase):
    def setUp(self):
        self.teacher = {"user_id": "teacher-uuid-1", "role": "teacher"}
        self.conn = MagicMock()
        self.active_class = {
            "class_id": "class-uuid-10a",
            "class_code": "TO10A",
            "name": "Toán 10A",
            "subject": "Toán",
            "default_room": "Phòng 203",
            "status": "active",
            "teacher_user_id": "teacher-uuid-1",
        }

    # --- TC_UC04_001: Tạo một buổi học hợp lệ ---

    def test_tc_uc04_001_create_single_session_valid(self):
        """TC_UC04_001: Tạo 1 buổi học hợp lệ gắn đúng lớp."""
        now = datetime.now(timezone.utc)
        start_time = now + timedelta(days=2)
        end_time = start_time + timedelta(hours=1.5)

        with patch("backend.app.main.require_class_teacher", return_value=self.active_class):
            with patch("backend.app.main.fetch_one") as mock_fetch_one:
                # 1st call: check duplicate returns None, 2nd call: insert session returns row
                mock_fetch_one.side_effect = [
                    None,
                    {
                        "session_id": 501,
                        "class_id": "class-uuid-10a",
                        "starts_at": start_time,
                        "ends_at": end_time,
                        "room": "Phòng 203",
                        "topic": "Hàm số bậc hai",
                        "status": "scheduled",
                    },
                ]
                payload = SessionCreate(
                    class_id="class-uuid-10a",
                    starts_at=start_time,
                    ends_at=end_time,
                    room="Phòng 203",
                    topic="Hàm số bậc hai",
                )
                sess = create_session(payload, self.conn, self.teacher)
                self.assertEqual(sess["session_id"], 501)
                self.assertEqual(sess["class_id"], "class-uuid-10a")
                self.assertEqual(sess["status"], "scheduled")

    def test_tc_uc04_001_duplicate_session_rejected(self):
        """TC_UC04_001: Từ chối tạo trùng buổi học cho cùng lớp tại cùng thời điểm."""
        now = datetime.now(timezone.utc)
        start_time = now + timedelta(days=2)
        end_time = start_time + timedelta(hours=1.5)

        with patch("backend.app.main.require_class_teacher", return_value=self.active_class):
            with patch("backend.app.main.fetch_one", return_value={"session_id": 501}):
                payload = SessionCreate(
                    class_id="class-uuid-10a",
                    starts_at=start_time,
                    ends_at=end_time,
                )
                with self.assertRaises(HTTPException) as ctx:
                    create_session(payload, self.conn, self.teacher)
                self.assertEqual(ctx.exception.status_code, 409)
                self.assertIn("đã tồn tại", ctx.exception.detail)

    # --- TC_UC04_002: Tạo lịch học lặp lại hàng tuần ---

    def test_tc_uc04_002_create_recurring_sessions_correct_weekdays(self):
        """TC_UC04_002: Tạo lịch lặp hàng tuần: sinh đúng thứ, đúng ngày, không sinh ngày khác."""
        # Chuỗi lặp 2 tuần: từ thứ Hai 2026-11-09 đến Chủ nhật 2026-11-22
        # Chọn thứ Hai (1) và thứ Tư (3) -> phải sinh đúng 4 buổi học vào các ngày 9, 11, 16, 18
        inserted_sessions = []

        def mock_fetch_one(conn, query, params=None):
            if "SELECT 1 FROM class_sessions" in query:
                return None  # Không có lịch trùng
            if "INSERT INTO class_sessions" in query:
                sess_id = len(inserted_sessions) + 1
                sess_dict = {
                    "session_id": sess_id,
                    "class_id": params[0],
                    "starts_at": params[1],
                    "ends_at": params[2],
                    "room": params[3],
                    "topic": params[4],
                    "status": "scheduled",
                }
                inserted_sessions.append(sess_dict)
                return sess_dict
            if "SELECT 1 FROM class_schedule_rules" in query:
                return None
            if "INSERT INTO class_schedule_rules" in query:
                return {"schedule_rule_id": 1}
            return None

        payload = RecurringSessionCreate(
            class_id="class-uuid-10a",
            weekdays=[1, 3],  # Thứ 2, Thứ 4
            starts_at="17:30",
            ends_at="19:00",
            start_date=date(2026, 11, 9),
            end_date=date(2026, 11, 22),
            room="Phòng 203",
            topic="Luyện đề định kỳ",
        )

        with patch("backend.app.main.require_class_teacher", return_value=self.active_class):
            with patch("backend.app.main.fetch_one", side_effect=mock_fetch_one):
                res = create_recurring_sessions(payload, self.conn, self.teacher)
                self.assertEqual(res["sessions_created"], 4)
                self.assertEqual(len(inserted_sessions), 4)

                # Kiểm tra đúng các ngày thứ 2 và thứ 4
                session_dates = [s["starts_at"].date() for s in inserted_sessions]
                expected_dates = [
                    date(2026, 11, 9),   # Thứ 2
                    date(2026, 11, 11),  # Thứ 4
                    date(2026, 11, 16),  # Thứ 2
                    date(2026, 11, 18),  # Thứ 4
                ]
                self.assertEqual(session_dates, expected_dates)

                # Kiểm tra thứ trong tuần của các buổi đều là Thứ 2 (0) hoặc Thứ 4 (2) trong Python
                for d in session_dates:
                    self.assertIn(d.weekday(), [0, 2])

                # Kiem tra gio va mui gio Viet Nam (+07:00)
                for s in inserted_sessions:
                    self.assertEqual(s["starts_at"].hour, 17)
                    self.assertEqual(s["starts_at"].minute, 30)
                    self.assertEqual(s["ends_at"].hour, 19)
                    self.assertEqual(s["ends_at"].minute, 0)
                    self.assertEqual(s["starts_at"].utcoffset(), timedelta(hours=7))

    def test_tc_uc04_002_recurring_no_duplicate_on_repeated_clicks(self):
        """TC_UC04_002: Không tạo buổi trùng khi giáo viên lưu nhiều lần."""
        call_count = 0
        def mock_fetch_one(conn, query, params=None):
            nonlocal call_count
            if "SELECT 1 FROM class_sessions" in query:
                # Giả lập buổi đầu tiên đã tồn tại
                return {"exists": 1}
            if "SELECT 1 FROM class_schedule_rules" in query:
                return {"exists": 1}
            return None

        payload = RecurringSessionCreate(
            class_id="class-uuid-10a",
            weekdays=[1],
            starts_at="17:30",
            ends_at="19:00",
            start_date=date(2026, 11, 9),
            end_date=date(2026, 11, 15),
        )

        with patch("backend.app.main.require_class_teacher", return_value=self.active_class):
            with patch("backend.app.main.fetch_one", side_effect=mock_fetch_one):
                res = create_recurring_sessions(payload, self.conn, self.teacher)
                self.assertEqual(res["sessions_created"], 0)

    # --- TC_UC04_005: Validation giờ bắt đầu và giờ kết thúc ---

    def test_tc_uc04_005_end_time_before_start_time_rejected(self):
        """TC_UC04_005: Giờ kết thúc nhỏ hơn giờ bắt đầu -> từ chối lưu, thông báo lỗi chính xác."""
        now = datetime.now(timezone.utc)
        start_time = now + timedelta(days=1, hours=2)
        end_time = now + timedelta(days=1, hours=1)  # kết thúc trước bắt đầu

        with self.assertRaises(ValidationError) as ctx:
            SessionCreate(
                class_id="class-uuid-10a",
                starts_at=start_time,
                ends_at=end_time,
            )
        self.assertIn("Giờ kết thúc phải sau giờ bắt đầu.", str(ctx.exception))

        # Test RecurringSessionCreate
        with self.assertRaises(ValidationError) as ctx:
            RecurringSessionCreate(
                class_id="class-uuid-10a",
                weekdays=[1],
                starts_at="19:00",
                ends_at="17:30",
                start_date=date.today(),
                end_date=date.today() + timedelta(days=7),
            )
        self.assertIn("Giờ kết thúc phải sau giờ bắt đầu.", str(ctx.exception))

    def test_tc_uc04_005_end_time_equal_start_time_rejected(self):
        """TC_UC04_005: Giờ kết thúc bằng giờ bắt đầu -> từ chối lưu, thông báo lỗi chính xác."""
        now = datetime.now(timezone.utc)
        same_time = now + timedelta(days=1)

        with self.assertRaises(ValidationError) as ctx:
            SessionCreate(
                class_id="class-uuid-10a",
                starts_at=same_time,
                ends_at=same_time,
            )
        self.assertIn("Giờ kết thúc phải sau giờ bắt đầu.", str(ctx.exception))

        with self.assertRaises(ValidationError) as ctx:
            RecurringSessionCreate(
                class_id="class-uuid-10a",
                weekdays=[1],
                starts_at="18:00",
                ends_at="18:00",
                start_date=date.today(),
                end_date=date.today() + timedelta(days=7),
            )
        self.assertIn("Giờ kết thúc phải sau giờ bắt đầu.", str(ctx.exception))


if __name__ == "__main__":
    unittest.main()

