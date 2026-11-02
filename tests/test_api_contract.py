import unittest
import re
from datetime import datetime, timezone
from pathlib import Path
from unittest.mock import patch

from fastapi import HTTPException
from pydantic import ValidationError

from backend.app.main import (
    app,
    can_view_student,
    dashboard,
    get_linked_children,
    list_sessions,
    link_parent_to_student,
    login,
    reset_user_password,
    student_me,
    student_progress,
    unread_notification_count,
    update_profile,
)
from backend.app.schemas import (
    InvoiceGenerate,
    LoginRequest,
    PasswordChange,
    ParentLinkCreate,
    ResultEntry,
    ProfileUpdate,
    UserCreate,
    UserUpdate,
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
    def test_phone_number_must_contain_exactly_ten_digits(self):
        valid_phone = "0912345678"
        self.assertEqual(ProfileUpdate(phone=f" {valid_phone} ").phone, valid_phone)
        self.assertEqual(UserCreate(
            username="parent01",
            full_name="Parent One",
            role="parent",
            linked_student_code="HS001",
            password="StrongPass1!",
            phone=valid_phone,
        ).phone, valid_phone)
        self.assertEqual(UserUpdate(phone=valid_phone).phone, valid_phone)

        payloads = (
            lambda value: ProfileUpdate(phone=value),
            lambda value: UserCreate(
                username="parent01",
                full_name="Parent One",
                role="parent",
                linked_student_code="HS001",
                password="StrongPass1!",
                phone=value,
            ),
            lambda value: UserUpdate(phone=value),
        )
        for invalid_phone in ("123456789", "12345678901", "090 1234567", "+84912345678"):
            for build_payload in payloads:
                with self.subTest(phone=invalid_phone, payload=build_payload):
                    with self.assertRaises(ValidationError):
                        build_payload(invalid_phone)

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
    def test_terms_and_privacy_page_is_linked_from_login_and_role_help(self):
        root = Path(__file__).resolve().parents[1]
        login_page = (root / "index.html").read_text(encoding="utf-8")
        terms_page = (root / "pages/terms.html").read_text(encoding="utf-8")
        self.assertIn('href="pages/terms.html"', login_page)
        self.assertIn("Điều khoản sử dụng và Chính sách quyền riêng tư", terms_page)
        self.assertIn("Lưu trữ và bảo vệ thông tin", terms_page)
        self.assertIn("Quyền và yêu cầu liên quan đến thông tin", terms_page)
        self.assertNotIn("phiên bản đồ án", terms_page)

        for role in ("teacher", "student", "parent"):
            help_page = (root / f"pages/{role}/help.html").read_text(encoding="utf-8")
            self.assertIn('href="../terms.html"', help_page)

    def test_parent_schedule_can_filter_to_a_linked_student(self):
        connection = unittest.mock.Mock()
        parent = {"user_id": "parent-user", "role": "parent"}
        sessions = [{"session_id": 41, "class_code": "TO10A"}]

        with (
            patch(
                "backend.app.main.can_view_student",
                return_value={"student_id": 17, "student_code": "HS017"},
            ) as guard,
            patch("backend.app.main.fetch_all", return_value=sessions) as fetch,
        ):
            result = list_sessions(
                connection,
                parent,
                student_code="HS017",
            )

        self.assertEqual(result, sessions)
        guard.assert_called_once_with(connection, parent, "HS017")
        query = fetch.call_args.args[1]
        self.assertIn("selected_ce.student_id = %s", query)
        self.assertIn("p.user_id = %s", query)
        self.assertEqual(fetch.call_args.args[2], ("parent-user", 17))

    def test_non_parent_cannot_filter_schedule_by_student_code(self):
        connection = unittest.mock.Mock()
        student = {"user_id": "student-user", "role": "student"}

        with self.assertRaises(HTTPException) as raised:
            list_sessions(connection, student, student_code="HS001")

        self.assertEqual(raised.exception.status_code, 403)

    def test_parent_progress_uses_linked_student_guard_and_deduplicates_enrollments(self):
        connection = unittest.mock.Mock()
        parent = {"user_id": "parent-user", "role": "parent"}
        progress = [{
            "assignment_id": "assignment-1",
            "title": "Bài kiểm tra",
            "score": 8.5,
            "graded_by_name": "Giáo viên",
        }]

        with (
            patch("backend.app.main.can_view_student") as guard,
            patch("backend.app.main.fetch_all", return_value=progress) as fetch,
        ):
            result = student_progress("HS001", connection, parent)

        self.assertEqual(result, progress)
        guard.assert_called_once_with(connection, parent, "HS001")
        query = fetch.call_args.args[1]
        self.assertIn("SELECT DISTINCT student_id, class_id", query)
        self.assertIn("grader.full_name AS graded_by_name", query)
        self.assertIn("LEFT JOIN users grader ON grader.user_id = r.graded_by", query)

    def test_parent_cannot_view_unlinked_student_progress(self):
        connection = unittest.mock.Mock()
        parent = {"user_id": "parent-user", "role": "parent"}
        student = {"student_id": 17, "student_code": "HS017", "user_id": "student-user"}

        with patch("backend.app.main.fetch_one", side_effect=[student, None]):
            with self.assertRaises(HTTPException) as raised:
                can_view_student(connection, parent, "HS017")

        self.assertEqual(raised.exception.status_code, 403)

    def test_parent_profile_lists_only_children_linked_to_authenticated_parent(self):
        connection = unittest.mock.Mock()
        parent = {"user_id": "parent-user"}
        children = [{
            "student_code": "HS001",
            "full_name": "Học sinh thử nghiệm",
            "relationship": "Phụ huynh",
            "student_status": "active",
        }]

        with patch("backend.app.main.fetch_all", return_value=children) as fetch:
            result = get_linked_children(connection, parent)

        self.assertEqual(result, children)
        query = fetch.call_args.args[1]
        self.assertIn("JOIN student_parents sp ON sp.parent_id = p.parent_id", query)
        self.assertIn("WHERE p.user_id = %s", query)
        self.assertIn("sp.relationship", query)
        self.assertEqual(fetch.call_args.args[2], ("parent-user",))

    def test_parent_profile_update_keeps_parent_record_in_sync(self):
        connection = unittest.mock.Mock()
        user = {"user_id": "parent-user", "role": "parent"}
        payload = ProfileUpdate(full_name="Updated Parent", phone="0900000000")
        profile = {"full_name": "Updated Parent"}

        with patch("backend.app.main.fetch_one", return_value=profile):
            result = update_profile(payload, connection, user)

        self.assertEqual(result, profile)
        self.assertEqual(len(connection.execute.call_args_list), 2)
        parent_sync = connection.execute.call_args_list[1]
        self.assertIn("INSERT INTO parents", parent_sync.args[0])
        self.assertIn("ON CONFLICT (user_id) DO UPDATE SET", parent_sync.args[0])
        self.assertEqual(parent_sync.args[1], ("parent-user",))

    def test_student_me_returns_profile_and_primary_guardian_details(self):
        connection = unittest.mock.Mock()
        student = {
            "student_id": 17,
            "student_code": "HS017",
            "student_status": "active",
            "guardian_name": "Parent Name",
            "guardian_relationship": "Mẹ",
            "guardian_phone": "0900000000",
        }

        with (
            patch("backend.app.main.require_student_id", return_value={"student_id": 17}),
            patch("backend.app.main.fetch_one", return_value=student) as fetch,
        ):
            result = student_me(connection, {"user_id": "student-user"})

        self.assertEqual(result, student)
        query = fetch.call_args.args[1]
        self.assertIn("LEFT JOIN user_profiles", query)
        self.assertIn("LEFT JOIN LATERAL", query)
        self.assertIn("ORDER BY sp.is_primary DESC, sp.linked_at", query)
        self.assertEqual(fetch.call_args.args[2], (17,))

    def test_profile_update_persists_user_and_profile_fields_and_returns_updated_at(self):
        connection = unittest.mock.Mock()
        user = {"user_id": "user-1"}
        updated_profile = {
            "user_id": "user-1",
            "full_name": "Updated Name",
            "email": None,
            "phone": "0912345678",
            "date_of_birth": None,
            "address": None,
            "biography": "Updated bio",
            "updated_at": datetime(2026, 11, 2, tzinfo=timezone.utc),
        }
        payload = ProfileUpdate(
            full_name=" Updated Name ",
            email=" ",
            phone=" 0912345678 ",
            date_of_birth=None,
            address=" ",
            biography=" Updated bio ",
        )

        with patch("backend.app.main.fetch_one", return_value=updated_profile) as fetch:
            result = update_profile(payload, connection, user)

        self.assertEqual(result["updated_at"], updated_profile["updated_at"])
        self.assertEqual(len(connection.execute.call_args_list), 2)
        user_update = connection.execute.call_args_list[0].args
        self.assertIn("updated_at = NOW()", user_update[0])
        self.assertEqual(user_update[1], ("Updated Name", None, "0912345678", "user-1"))
        profile_update = connection.execute.call_args_list[1].args
        self.assertIn("ON CONFLICT (user_id) DO UPDATE SET", profile_update[0])
        self.assertNotIn("COALESCE", profile_update[0])
        self.assertEqual(
            profile_update[1],
            ("user-1", None, None, "Updated bio"),
        )
        self.assertIn("u.updated_at", fetch.call_args.args[1])
        self.assertIn("u.created_at", fetch.call_args.args[1])

    def test_profile_update_rejects_empty_name(self):
        connection = unittest.mock.Mock()
        with self.assertRaises(HTTPException) as raised:
            update_profile(
                ProfileUpdate(full_name="   "),
                connection,
                {"user_id": "user-1"},
            )
        self.assertEqual(raised.exception.status_code, 422)
        connection.execute.assert_not_called()

    def test_profile_update_rejects_empty_phone(self):
        connection = unittest.mock.Mock()
        with self.assertRaises(HTTPException) as raised:
            update_profile(
                ProfileUpdate(phone=""),
                connection,
                {"user_id": "user-1"},
            )
        self.assertEqual(raised.exception.status_code, 422)
        self.assertEqual(raised.exception.detail, "Số điện thoại không được để trống.")
        connection.execute.assert_not_called()

    def test_profile_pages_load_and_save_persisted_data(self):
        root = Path(__file__).resolve().parents[1]
        for role in ("teacher", "student", "parent"):
            page = (root / f"pages/{role}/profile.html").read_text(encoding="utf-8")
            self.assertIn('data-profile-role=', page)
            self.assertIn("../../assets/js/profile.js", page)
            self.assertIn("ProfileModule.save()", page)
            self.assertIn("ProfileModule.load()", page)
            self.assertIn('id="profileUpdatedAt"', page)
            self.assertIn('pattern="[0-9]{10}"', page)
            self.assertIn('maxlength="10"', page)
        profile_script = (root / "assets/js/profile.js").read_text(encoding="utf-8")
        self.assertIn("AuthService.api('/profile')", profile_script)
        self.assertIn("method: 'PATCH'", profile_script)
        self.assertIn("AuthService.api('/students/me')", profile_script)
        self.assertIn("AuthService.api('/classes')", profile_script)
        user_management_page = (root / "pages/teacher/users.html").read_text(encoding="utf-8")
        self.assertEqual(user_management_page.count('pattern="[0-9]{10}"'), 2)
        self.assertEqual(user_management_page.count('maxlength="10"'), 2)
        student_profile = (root / "pages/student/profile.html").read_text(encoding="utf-8")
        for sample_value in ("Trần Minh Anh", "Trần Thị Hương", "HS001", "10A1", "090 123 4500"):
            self.assertNotIn(sample_value, student_profile)
        self.assertNotIn("🔑 Đổi mật khẩu", student_profile)
        parent_profile = (root / "pages/parent/profile.html").read_text(encoding="utf-8")
        for sample_value in (
            "Nguyễn Thị Mai",
            "Nguyễn Minh Anh",
            "HS-2026-0812",
            "Toán 8A",
            "Trần Hoàng Nam",
            "01/09/2026",
        ):
            self.assertNotIn(sample_value, parent_profile)
        self.assertIn("AuthService.api('/children')", profile_script)
        self.assertIn("loadParentDetails(profile)", profile_script)
        self.assertIn("id=\"parentProfileChildren\"", parent_profile)
        self.assertIn("../../assets/css/profile.css", parent_profile)
        test_seed = (root / "database/seed_test_accounts.sql").read_text(encoding="utf-8")
        self.assertIn("JOIN users su ON su.user_id = s.user_id", test_seed)
        self.assertIn("JOIN users pu ON pu.username = 'parent'", test_seed)
        self.assertIn("WHERE su.username = 'student'", test_seed)
        self.assertIn("Không tải được dữ liệu", profile_script)
        self.assertNotIn(
            "Không tải được ảnh đại diện: ${error.message}",
            profile_script,
        )

    def test_password_fields_have_shared_accessible_visibility_toggle(self):
        root = Path(__file__).resolve().parents[1]
        pages_with_password_fields = []
        page_paths = [root / "index.html", *(root / "pages").rglob("*.html")]
        for page_path in page_paths:
            page = page_path.read_text(encoding="utf-8")
            if re.search(r'<input\b[^>]*\btype=["\']password["\']', page, re.IGNORECASE):
                pages_with_password_fields.append((page_path, page))

        self.assertTrue(pages_with_password_fields)
        for page_path, page in pages_with_password_fields:
            self.assertIn("assets/js/auth.js", page, page_path.as_posix())
            self.assertIn("assets/css/components.css", page, page_path.as_posix())

        auth_script = (root / "assets/js/auth.js").read_text(encoding="utf-8")
        self.assertIn("initializePasswordVisibility(root = document)", auth_script)
        self.assertIn("password-visibility-toggle", auth_script)
        self.assertIn("aria-pressed", auth_script)
        self.assertIn("Ẩn mật khẩu", auth_script)
        self.assertIn("Hiện mật khẩu", auth_script)
        self.assertIn("MutationObserver", auth_script)
        component_styles = (root / "assets/css/components.css").read_text(encoding="utf-8")
        self.assertIn("grid-template-columns: minmax(0, 1fr)", component_styles)
        self.assertIn("grid-column: 1", component_styles)
        self.assertIn("grid-row: 1", component_styles)

    def test_workspace_branding_uses_signed_in_user_and_current_academic_year(self):
        root = Path(__file__).resolve().parents[1]
        pages = list((root / "pages").rglob("*.html"))
        for page_path in pages:
            page = page_path.read_text(encoding="utf-8")
            sidebar_brand = re.search(
                r'<div class="sidebar-sub-brand"[^>]*>(.*?)</div>',
                page,
                re.DOTALL,
            )
            if sidebar_brand:
                self.assertNotIn(
                    "Lớp học cô Hà Linh", sidebar_brand.group(1), page_path.as_posix()
                )
                self.assertNotIn(
                    "Năm học 2026-2027", sidebar_brand.group(1), page_path.as_posix()
                )
        auth_script = (root / "assets/js/auth.js").read_text(encoding="utf-8")
        self.assertIn("getAcademicYear(date = new Date())", auth_script)
        self.assertIn("Lớp học ${user.fullName || 'Giáo viên'}", auth_script)
        self.assertIn("updateWorkspaceBranding(serverUser)", auth_script)
        self.assertIn(".app-header .header-actions", auth_script)
        self.assertIn(".sidebar-user-bottom .user-mini-profile", auth_script)
        self.assertIn("actions.querySelectorAll('.avatar-badge')", auth_script)
        self.assertIn("toLocaleDateString('vi-VN'", auth_script)
        self.assertIn("label.textContent = currentDate", auth_script)

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

    def test_teacher_dashboard_returns_live_class_student_and_today_session_counts(self):
        connection = unittest.mock.Mock()
        teacher = {"user_id": "teacher-1", "role": "teacher"}
        class_stats = {"class_count": 8, "active_classes": 5}
        student_stats = {"student_count": 12}
        today_stats = {"session_count": 2}
        with (
            patch(
                "backend.app.main.fetch_one",
                side_effect=[class_stats, student_stats, today_stats],
            ),
            patch("backend.app.main.fetch_all", return_value=[]),
        ):
            result = dashboard(connection, teacher)
        self.assertEqual(result["classes"], class_stats)
        self.assertEqual(result["students"], student_stats)
        self.assertEqual(result["today_sessions"], today_stats)

    def test_student_dashboard_query_contains_real_grade_and_pending_assignment_stats(self):
        connection = unittest.mock.Mock()
        student_user = {"user_id": "student-1", "role": "student"}
        student = {"student_id": 7, "student_code": "HS007", "full_name": "Học sinh"}
        summary = {
            "student_code": "HS007",
            "average_score": 8.25,
            "graded_count": 2,
            "latest_score": 9,
            "pending_assignment_count": 1,
        }
        with (
            patch("backend.app.main.require_student_id", return_value=student),
            patch("backend.app.main.fetch_all", side_effect=[[summary], []]) as fetch_all,
            patch("backend.app.main.fetch_one", return_value={"count": 0}),
        ):
            result = dashboard(connection, student_user)
        self.assertEqual(result["students"], [summary])
        student_query = fetch_all.call_args_list[0].args[1]
        self.assertIn("AS average_score", student_query)
        self.assertIn("AS latest_score", student_query)
        self.assertIn("AS pending_assignment_count", student_query)

    def test_dashboard_kpis_are_bound_to_live_data_not_mock_values(self):
        root = Path(__file__).resolve().parents[1]
        teacher = (root / "pages/teacher/dashboard.html").read_text(encoding="utf-8")
        student = (root / "pages/student/dashboard.html").read_text(encoding="utf-8")
        parent = (root / "pages/parent/dashboard.html").read_text(encoding="utf-8")
        dashboard_css = (root / "assets/css/dashboard.css").read_text(encoding="utf-8")
        teacher_tuition = (root / "assets/js/modules/teacher/tuition-fee.js").read_text(encoding="utf-8")
        for html in (teacher, student, parent):
            self.assertIn("../../assets/js/dashboard-stats.js", html)
        self.assertIn('id="teacherGreeting"', teacher)
        self.assertIn('id="teacherGreetingDate"', teacher)
        self.assertNotIn("Chào buổi sáng, cô Hà Linh!", teacher)
        self.assertNotIn("Thứ Sáu, 23/10/2026", teacher)
        self.assertIn("../../assets/js/modules/teacher/tuition-fee.js", teacher)
        self.assertIn("../../assets/js/modules/parent/tuition-invoice.js", parent)
        self.assertIn("watchlist.slice(0, 2)", teacher_tuition)
        self.assertIn("Các học sinh có số dư chưa thanh toán", teacher_tuition)
        grid_end = teacher.index("        </div>\n\n        <!-- Học phí theo dõi")
        tuition_card = teacher.index('<div class="card teacher-dashboard-card--tuition"')
        footer = teacher.index('<div class="page-mini-footer">')
        self.assertLess(grid_end, tuition_card)
        self.assertLess(tuition_card, footer)
        self.assertIn("grid-template-columns: minmax(0, 1.6fr) minmax(320px, 1fr)", dashboard_css)
        self.assertNotIn("grid-template-areas:", dashboard_css)
        self.assertNotIn(".teacher-dashboard .page-mini-footer", dashboard_css)
        self.assertNotIn("15 học sinh · Tháng 10/2026", teacher)
        self.assertNotIn("8.000.000 ₫", teacher)
        self.assertNotIn("7,4 / 10", student)
        self.assertNotIn("Hạn gần nhất: 26/10", student)
        self.assertNotIn("8,0", parent)
        self.assertNotIn("600.000 ₫", parent)

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
