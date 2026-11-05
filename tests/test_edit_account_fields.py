from datetime import date
import unittest
from unittest.mock import MagicMock, call

from backend.app.schemas import UserUpdate
from backend.app.main import update_user, list_users


class EditAccountFieldsTests(unittest.TestCase):
    def test_user_update_schema_accepts_extended_fields(self):
        payload = UserUpdate(
            full_name="Nguyễn Văn A",
            email="vana@example.com",
            phone="0912345678",
            status="active",
            date_of_birth=date(2010, 5, 20),
            address="123 Đường ABC, Hà Nội",
            class_id="class-123",
            student_code="HS099",
            relationship="Mẹ"
        )
        data = payload.model_dump(exclude_unset=True)
        self.assertEqual(data["full_name"], "Nguyễn Văn A")
        self.assertEqual(data["date_of_birth"], date(2010, 5, 20))
        self.assertEqual(data["address"], "123 Đường ABC, Hà Nội")
        self.assertEqual(data["class_id"], "class-123")
        self.assertEqual(data["student_code"], "HS099")
        self.assertEqual(data["relationship"], "Mẹ")

    def test_update_student_user_updates_profiles_and_student_tables(self):
        connection = MagicMock()
        teacher = {"user_id": "teacher-1"}
        user_id = "student-user-1"

        # Mock fetch_one calls:
        # 1. SELECT user_id, role, full_name FROM users
        # 2. SELECT student_id, student_code FROM students
        # 3. SELECT 1 FROM students WHERE student_code = ... AND user_id != ... (no existing code)
        # 4. SELECT 1 FROM classes WHERE class_id = ...
        # 5. Final SELECT for updated_row
        connection.cursor.return_value.__enter__.return_value = connection
        
        def mock_fetch_one(conn, query, params=None):
            if "SELECT user_id, role, full_name FROM users" in query:
                return {"user_id": user_id, "role": "student", "full_name": "Cũ"}
            if "SELECT student_id, student_code FROM students" in query:
                return {"student_id": 10, "student_code": "HS001"}
            if "SELECT 1 FROM students WHERE student_code" in query:
                return None
            if "SELECT 1 FROM classes" in query:
                return {"class_id": "class-new"}
            if "FROM users u" in query:
                return {
                    "user_id": user_id,
                    "username": "student01",
                    "role": "student",
                    "full_name": "Học sinh mới",
                    "email": "hs@test.com",
                    "phone": "0987654321",
                    "status": "active",
                    "student_code": "HS002",
                    "date_of_birth": date(2010, 8, 15),
                    "address": "456 Phố Mới"
                }
            return None

        import backend.app.main as main_mod
        orig_fetch_one = main_mod.fetch_one
        main_mod.fetch_one = mock_fetch_one

        try:
            payload = UserUpdate(
                full_name="Học sinh mới",
                email="hs@test.com",
                phone="0987654321",
                date_of_birth=date(2010, 8, 15),
                address="456 Phố Mới",
                student_code="HS002",
                class_id="class-new",
                status="active"
            )
            res = update_user(user_id, payload, connection, teacher)
            self.assertEqual(res["full_name"], "Học sinh mới")
            self.assertEqual(res["student_code"], "HS002")
            self.assertEqual(res["address"], "456 Phố Mới")

            # Verify connection.execute was called for users, user_profiles, students, class_enrollments
            executed_queries = [call_arg[0][0] for call_arg in connection.execute.call_args_list]
            self.assertTrue(any("UPDATE users SET" in q for q in executed_queries))
            self.assertTrue(any("INSERT INTO user_profiles" in q for q in executed_queries))
            self.assertTrue(any("UPDATE students SET student_code" in q for q in executed_queries))
            self.assertTrue(any("INSERT INTO class_enrollments" in q for q in executed_queries))
        finally:
            main_mod.fetch_one = orig_fetch_one

    def test_update_parent_user_updates_parents_and_relationship(self):
        connection = MagicMock()
        teacher = {"user_id": "teacher-1"}
        user_id = "parent-user-1"

        def mock_fetch_one(conn, query, params=None):
            if "SELECT user_id, role, full_name FROM users" in query:
                return {"user_id": user_id, "role": "parent", "full_name": "Phụ huynh cũ"}
            if "SELECT parent_id FROM parents WHERE user_id" in query:
                return {"parent_id": 20}
            if "FROM users u" in query:
                return {
                    "user_id": user_id,
                    "username": "parent01",
                    "role": "parent",
                    "full_name": "Phụ huynh mới",
                    "email": "ph@test.com",
                    "phone": "0911223344",
                    "status": "active",
                    "address": "789 Phố Cũ"
                }
            return None

        import backend.app.main as main_mod
        orig_fetch_one = main_mod.fetch_one
        main_mod.fetch_one = mock_fetch_one

        try:
            payload = UserUpdate(
                full_name="Phụ huynh mới",
                phone="0911223344",
                email="ph@test.com",
                address="789 Phố Cũ",
                relationship="Mẹ"
            )
            res = update_user(user_id, payload, connection, teacher)
            self.assertEqual(res["full_name"], "Phụ huynh mới")

            executed_queries = [call_arg[0][0] for call_arg in connection.execute.call_args_list]
            self.assertTrue(any("UPDATE users SET" in q for q in executed_queries))
            self.assertTrue(any("INSERT INTO user_profiles" in q for q in executed_queries))
            self.assertTrue(any("UPDATE parents SET full_name" in q for q in executed_queries))
            self.assertTrue(any("UPDATE student_parents SET relationship" in q for q in executed_queries))
        finally:
            main_mod.fetch_one = orig_fetch_one


if __name__ == "__main__":
    unittest.main()
