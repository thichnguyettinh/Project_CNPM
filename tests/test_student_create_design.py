import unittest
from datetime import date
from unittest.mock import MagicMock, patch
from pydantic import ValidationError
from backend.app.main import check_username, create_student_with_parent
from backend.app.schemas import StudentWithParentCreate

class StudentCreateDesignApiTests(unittest.TestCase):
    def setUp(self):
        self.teacher = {"user_id": "teacher-uuid-1", "role": "teacher"}
        self.conn = MagicMock()

    def test_check_username_available(self):
        with patch("backend.app.main.fetch_one") as mock_fetch:
            mock_fetch.return_value = None
            res = check_username("hoangson.hs", self.conn, self.teacher)
            self.assertTrue(res["available"])
            self.assertEqual(res["username"], "hoangson.hs")

    def test_check_username_taken(self):
        with patch("backend.app.main.fetch_one") as mock_fetch:
            mock_fetch.return_value = {"1": 1}
            res = check_username("student", self.conn, self.teacher)
            self.assertFalse(res["available"])

    def test_parent_relationship_cannot_be_empty(self):
        # Khi tạo phụ huynh mới mà không chọn quan hệ thì phải báo lỗi
        with self.assertRaises(ValidationError):
            StudentWithParentCreate(
                full_name="Nguyễn Hoàng Sơn",
                class_id="class-1",
                username="hoangson.hs",
                password="Password123!",
                parent_mode="new",
                parent_full_name="Nguyễn Văn Hoàng",
                parent_relationship=None, # Chưa chọn quan hệ
                parent_username="vanhoang.ph",
                parent_password="Password123!"
            )

    def test_create_student_with_new_parent(self):
        def fake_fetch_one(conn, query, params=None):
            q = query.strip()
            if "SELECT 1 FROM users WHERE LOWER(username)" in q:
                return None
            if "SELECT class_id, class_code, name FROM classes" in q:
                return {"class_id": "class-1", "class_code": "TO10A", "name": "Toán 10 · Nền tảng"}
            if "SELECT student_code FROM students" in q:
                return {"student_code": "HS020"}
            if "INSERT INTO students" in q:
                return {"student_id": 21}
            if "INSERT INTO parents" in q:
                return {"parent_id": 11}
            return None

        with patch("backend.app.main.fetch_one", side_effect=fake_fetch_one):
            payload = StudentWithParentCreate(
                full_name="Nguyễn Hoàng Sơn",
                date_of_birth=date(2010, 8, 15),
                phone="0914567890",
                class_id="class-1",
                address="24 Nguyễn Văn Cừ, Long Biên, Hà Nội",
                username="hoangson.hs",
                password="Password123!",
                require_password_change=True,
                is_active=True,
                parent_mode="new",
                parent_full_name="Nguyễn Văn Hoàng",
                parent_relationship="Bố",
                parent_phone="0903456789",
                parent_username="vanhoang.ph",
                parent_password="Password123!"
            )
            res = create_student_with_parent(payload, self.conn, self.teacher)
            self.assertEqual(res["student_code"], "HS021")
            self.assertEqual(res["full_name"], "Nguyễn Hoàng Sơn")
            self.assertTrue(res["parent_created"])
            self.assertIn("thành công", res["message"])

if __name__ == "__main__":
    unittest.main()
