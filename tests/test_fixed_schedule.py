import unittest
from datetime import date, timedelta
from unittest.mock import MagicMock
from backend.app.main import get_rooms, check_schedule_conflict, create_class
from backend.app.schemas import ClassCreate, FixedScheduleCreate, ScheduleConflictCheckRequest

class FixedScheduleApiTests(unittest.TestCase):
    def setUp(self):
        self.teacher = {"user_id": "teacher-uuid-1", "role": "teacher"}
        self.conn = MagicMock()

    def test_get_rooms_returns_distinct_and_defaults(self):
        with unittest.mock.patch("backend.app.main.fetch_all") as mock_fetch:
            mock_fetch.return_value = [{"room": "Phòng 203"}, {"room": "Phòng VIP"}]
            res = get_rooms(self.conn, self.teacher)
            self.assertIn("rooms", res)
            self.assertIn("Phòng 203", res["rooms"])
            self.assertIn("Phòng VIP", res["rooms"])
            self.assertIn("Phòng 101", res["rooms"])

    def test_check_schedule_conflict_no_conflict(self):
        with unittest.mock.patch("backend.app.main.fetch_all") as mock_fetch:
            mock_fetch.return_value = [] # no clashes
            req = ScheduleConflictCheckRequest(
                weekdays=[1, 3, 5],
                starts_at="17:30",
                ends_at="19:00",
                room="Phòng 203"
            )
            res = check_schedule_conflict(req, self.conn, self.teacher)
            self.assertFalse(res["has_conflict"])
            self.assertIn("Không có lịch trùng", res["message"])
            self.assertIn("Thứ 2, Thứ 4, Thứ 6", res["summary"])
            self.assertIn("Phòng 203", res["summary"])

    def test_check_schedule_conflict_with_room_clash(self):
        with unittest.mock.patch("backend.app.main.fetch_all") as mock_fetch:
            mock_fetch.side_effect = [
                [{"class_code": "TO10A", "name": "Toán 10", "weekday": 1, "s_at": "17:30", "e_at": "19:00"}],
                []
            ]
            req = ScheduleConflictCheckRequest(
                weekdays=[1, 3, 5],
                starts_at="17:30",
                ends_at="19:00",
                room="Phòng 203"
            )
            res = check_schedule_conflict(req, self.conn, self.teacher)
            self.assertTrue(res["has_conflict"])
            self.assertIn("Phòng 203 đã có lớp Toán 10", res["message"])

    def test_create_class_with_fixed_schedule(self):
        final_row = {
            "class_id": "new-class-123",
            "class_code": "TO9B",
            "name": "Toán 9 · Bồi dưỡng",
            "subject": "Toán",
            "monthly_fee": 800000,
            "room": "Phòng 203",
            "status": "active",
            "schedule_summary": "Thứ 2, Thứ 4 · 17:30–19:00"
        }
        def fake_fetch_one(conn, query, params=None):
            q = query.strip()
            if "SELECT 1 FROM classes WHERE class_code" in q:
                return None
            if "INSERT INTO classes" in q:
                return {"class_id": "new-class-123"}
            if "INSERT INTO class_schedule_rules" in q:
                return {"schedule_rule_id": 1}
            if "INSERT INTO class_sessions" in q:
                return {"session_id": 100}
            if "SELECT c.class_id, c.class_code" in q:
                return final_row
            return None

        with unittest.mock.patch("backend.app.main.fetch_one", side_effect=fake_fetch_one):
            payload = ClassCreate(
                class_code="TO9B",
                name="Toán 9 · Bồi dưỡng",
                subject="Toán",
                monthly_fee=800000,
                default_room="Phòng 203",
                description="Ôn tập kiến thức",
                fixed_schedule=FixedScheduleCreate(
                    weekdays=[1, 3],
                    starts_at="17:30",
                    ends_at="19:00",
                    room="Phòng 203",
                    start_date=date(2026, 10, 26),
                    end_date=date(2026, 11, 2)
                )
            )
            row = create_class(payload, self.conn, self.teacher)
            self.assertEqual(row["class_code"], "TO9B")
            self.assertEqual(row["schedule_summary"], "Thứ 2, Thứ 4 · 17:30–19:00")

if __name__ == "__main__":
    unittest.main()
