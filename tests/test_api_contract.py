import unittest
from datetime import datetime, timezone
from unittest.mock import patch

from fastapi import HTTPException
from pydantic import ValidationError

from backend.app.main import (
    app,
    link_parent_to_student,
    login,
    reset_user_password,
    unread_notification_count,
)
from backend.app.schemas import (
    InvoiceGenerate,
    LoginRequest,
    PasswordChange,
    ParentLinkCreate,
    ResultEntry,
    UserCreate,
    UserPasswordReset,
)
from backend.app.security import (
    LOGIN_LOCKOUT_MINUTES,
    MAX_FAILED_LOGIN_ATTEMPTS,
    hash_password,
    password_policy_errors,
    verify_password,
)


class SecurityTests(unittest.TestCase):
    def test_password_hash_is_not_plaintext_and_verifies(self):
        stored = hash_password("Correct-Horse-42")
        algorithm, salt, digest = stored.split("$", 2)

        self.assertEqual(algorithm, "scrypt")
        self.assertEqual(len(bytes.fromhex(salt)), 16)
        self.assertTrue(digest)
        self.assertNotEqual(stored, "Correct-Horse-42")
        self.assertTrue(verify_password("Correct-Horse-42", stored))
        self.assertFalse(verify_password("incorrect", stored))

    def test_same_password_gets_a_different_random_salt(self):
        first_hash = hash_password("Correct-Horse-42")
        second_hash = hash_password("Correct-Horse-42")

        self.assertNotEqual(first_hash, second_hash)
        self.assertTrue(verify_password("Correct-Horse-42", first_hash))
        self.assertTrue(verify_password("Correct-Horse-42", second_hash))

    def test_third_failed_login_commits_and_temporarily_locks_account(self):
        user = {
            "user_id": "user-1",
            "status": "active",
            "locked_until": None,
            "password_hash": "stored-hash",
        }
        account_lock = datetime.now(timezone.utc)
        connection = unittest.mock.Mock()

        with (
            patch("backend.app.main.fetch_one", side_effect=[user, {"locked_until": account_lock}]) as fetch,
            patch("backend.app.main.verify_password", return_value=False),
        ):
            with self.assertRaises(HTTPException) as raised:
                login(LoginRequest(identity="teacher", password="wrong"), connection)

        self.assertEqual(raised.exception.status_code, 429)
        self.assertIn(f"{MAX_FAILED_LOGIN_ATTEMPTS} lần", raised.exception.detail)
        self.assertIn(f"{LOGIN_LOCKOUT_MINUTES} phút", raised.exception.detail)
        self.assertIn("failed_login_attempts + 1 >= %s", fetch.call_args_list[1].args[1])
        self.assertEqual(fetch.call_args_list[1].args[2][0], MAX_FAILED_LOGIN_ATTEMPTS)
        connection.commit.assert_called_once()


class RequestValidationTests(unittest.TestCase):
    def test_password_policy_requires_all_four_criteria(self):
        self.assertEqual(password_policy_errors("Abcdef1!"), [])
        self.assertEqual(
            password_policy_errors("abcdefg1!"),
            ["ít nhất 1 chữ hoa (A-Z)"],
        )
        self.assertEqual(
            password_policy_errors("Abcdefg1 "),
            ["ít nhất 1 ký tự đặc biệt"],
        )

        with self.assertRaises(ValidationError):
            PasswordChange(current_password="old", new_password="Abcdef1")
        with self.assertRaises(ValidationError):
            PasswordChange(current_password="old", new_password="Abcdef1 ")

    def test_student_account_requires_student_code(self):
        with self.assertRaises(ValidationError):
            UserCreate(
                username="student01",
                full_name="Student One",
                role="student",
                password="LongPassword42",
            )

    def test_teacher_password_reset_requires_password_policy(self):
        self.assertEqual(
            UserPasswordReset(new_password="StrongPass1!").new_password,
            "StrongPass1!",
        )
        with self.assertRaises(ValidationError):
            UserPasswordReset(new_password="weakpass1")

    def test_parent_link_payload_requires_student_code(self):
        self.assertEqual(
            ParentLinkCreate(student_code="HS001", relationship="Mẹ").student_code,
            "HS001",
        )
        with self.assertRaises(ValidationError):
            ParentLinkCreate(student_code="")

    def test_scores_are_limited_to_half_point_steps(self):
        self.assertEqual(ResultEntry(student_code="HS001", score="8.5").score, 8.5)
        with self.assertRaises(ValidationError):
            ResultEntry(student_code="HS001", score="8.3")

    def test_invoice_requires_exactly_one_pricing_mode(self):
        with self.assertRaises(ValidationError):
            InvoiceGenerate(
                class_id="class-1",
                billing_year=2026,
                billing_month=10,
                period_start="2026-10-01",
                period_end="2026-10-31",
            )


class ApiContractTests(unittest.TestCase):
    def test_unread_notification_count_uses_authenticated_user(self):
        connection = unittest.mock.Mock()
        user = {"user_id": "user-1"}

        with patch("backend.app.main.fetch_one", return_value={"count": 4}) as fetch:
            result = unread_notification_count(connection, user)

        self.assertEqual(result, {"count": 4})
        self.assertIn("read_at IS NULL", fetch.call_args.args[1])
        self.assertEqual(fetch.call_args.args[2], ("user-1",))

    def test_openapi_contains_core_role_apis(self):
        paths = app.openapi()["paths"]
        expected = {
            "/api/auth/login",
            "/api/users",
            "/api/users/{user_id}/parent-link",
            "/api/users/{user_id}/reset-password",
            "/api/classes",
            "/api/sessions",
            "/api/assignments",
            "/api/tuition/invoices",
            "/api/notifications",
            "/api/notifications/unread-count",
            "/api/dashboard",
        }
        self.assertTrue(expected.issubset(paths))

    def test_parent_link_connects_an_existing_parent_and_rejects_duplicate(self):
        connection = unittest.mock.Mock()
        payload = ParentLinkCreate(student_code="HS001", relationship="Mẹ")
        inserted = {"student_id": 1, "parent_id": 2, "relationship": "Mẹ"}
        teacher = {"user_id": "teacher-1"}
        with patch(
            "backend.app.main.fetch_one",
            side_effect=[{"parent_id": 2}, {"student_id": 1}, inserted],
        ) as fetch:
            result = link_parent_to_student("parent-1", payload, connection, teacher)
        self.assertEqual(result, inserted)
        insert_sql = fetch.call_args_list[2].args[1]
        self.assertIn("ON CONFLICT (student_id, parent_id) DO NOTHING", insert_sql)

        with patch(
            "backend.app.main.fetch_one",
            side_effect=[{"parent_id": 2}, {"student_id": 1}, None],
        ):
            with self.assertRaises(HTTPException) as raised:
                link_parent_to_student("parent-1", payload, connection, teacher)
        self.assertEqual(raised.exception.status_code, 409)

    def test_teacher_reset_password_updates_hash_lockout_and_sessions(self):
        connection = unittest.mock.MagicMock()
        teacher = {"user_id": "teacher-1"}
        payload = UserPasswordReset(new_password="StrongPass1!")
        with (
            patch("backend.app.main.fetch_one", return_value={"role": "student"}),
            patch("backend.app.main.hash_password", return_value="new-hash"),
        ):
            result = reset_user_password("student-1", payload, connection, teacher)
        self.assertEqual(result["message"], "Đã đặt lại mật khẩu và thu hồi các phiên đăng nhập.")
        password_update = connection.execute.call_args_list[0].args
        self.assertIn("failed_login_attempts = 0", password_update[0])
        self.assertEqual(password_update[1], ("new-hash", "student-1"))
        session_update = connection.execute.call_args_list[1].args
        self.assertIn("revoked_at = NOW()", session_update[0])
        self.assertEqual(session_update[1], ("student-1",))

    def test_teacher_cannot_reset_teacher_or_unknown_account_password(self):
        connection = unittest.mock.Mock()
        teacher = {"user_id": "teacher-1"}
        with patch("backend.app.main.fetch_one", return_value={"role": "teacher"}):
            with self.assertRaises(HTTPException) as raised:
                reset_user_password(
                    "teacher-1",
                    UserPasswordReset(new_password="StrongPass1!"),
                    connection,
                    teacher,
                )
        self.assertEqual(raised.exception.status_code, 404)
        connection.execute.assert_not_called()


if __name__ == "__main__":
    unittest.main()
