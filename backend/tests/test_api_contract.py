import unittest
from datetime import datetime, timezone
from unittest.mock import patch

from fastapi import HTTPException
from pydantic import ValidationError

from backend.app.main import app, login
from backend.app.schemas import (
    InvoiceGenerate,
    LoginRequest,
    PasswordChange,
    ResultEntry,
    UserCreate,
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
    def test_openapi_contains_core_role_apis(self):
        paths = app.openapi()["paths"]
        expected = {
            "/api/auth/login",
            "/api/users",
            "/api/classes",
            "/api/sessions",
            "/api/assignments",
            "/api/tuition/invoices",
            "/api/notifications",
            "/api/dashboard",
        }
        self.assertTrue(expected.issubset(paths))


if __name__ == "__main__":
    unittest.main()
