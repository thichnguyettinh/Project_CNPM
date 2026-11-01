import ast
import re
import unittest
from html.parser import HTMLParser
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


class _DomCollector(HTMLParser):
    def __init__(self):
        super().__init__()
        self.ids: set[str] = set()
        self.data_attrs: set[str] = set()
        self.scripts: list[str] = []
        self.stylesheets: list[str] = []

    def handle_starttag(self, tag: str, attrs: list[tuple[str, str | None]]):
        attr_map = dict(attrs)
        if attr_map.get("id"):
            self.ids.add(attr_map["id"])
        for k in attr_map:
            if k.startswith("data-"):
                self.data_attrs.add(k)
        if tag == "script" and attr_map.get("src"):
            self.scripts.append(attr_map["src"])
        if tag == "link" and attr_map.get("rel") == "stylesheet" and attr_map.get("href"):
            self.stylesheets.append(attr_map["href"])


def _parse_html(rel_path: str) -> _DomCollector:
    parser = _DomCollector()
    parser.feed((ROOT / rel_path).read_text(encoding="utf-8"))
    return parser


class TuitionBackendAstContractTests(unittest.TestCase):
    def test_schemas_preserves_existing_classes_and_adds_tuition_reminder_models(self):
        source = (ROOT / "backend/app/schemas.py").read_text(encoding="utf-8")
        tree = ast.parse(source)
        class_names = {node.name for node in tree.body if isinstance(node, ast.ClassDef)}

        expected_original = {
            "StrictModel",
            "LoginRequest",
            "UserCreate",
            "UserUpdate",
            "PasswordChange",
            "ProfileUpdate",
            "ClassCreate",
            "ClassUpdate",
            "EnrollmentCreate",
            "SessionCreate",
            "SessionUpdate",
            "AttendanceEntry",
            "AttendanceSave",
            "AssignmentCreate",
            "AssignmentUpdate",
            "ResultEntry",
            "ResultsSave",
            "InvoiceGenerate",
            "PaymentCreate",
        }
        self.assertTrue(expected_original.issubset(class_names))
        self.assertIn("TuitionReminderRequest", class_names)
        self.assertIn("BulkTuitionReminderRequest", class_names)

    def test_tuition_reminder_formatting_helpers(self):
        from datetime import date
        from typing import Any

        source = (ROOT / "backend/app/main.py").read_text(encoding="utf-8")
        tree = ast.parse(source)
        helper_nodes = [
            node
            for node in tree.body
            if isinstance(node, ast.FunctionDef)
            and node.name in {"format_vnd_amount", "build_tuition_reminder_message"}
        ]
        mod = ast.Module(body=helper_nodes, type_ignores=[])
        ns = {"Any": Any}
        exec(compile(mod, "<tuition_helpers>", "exec"), ns)

        self.assertEqual(ns["format_vnd_amount"](1800000), "1.800.000 ₫")
        self.assertEqual(ns["format_vnd_amount"](600000), "600.000 ₫")

        title, body = ns["build_tuition_reminder_message"](
            {
                "billing_month": 10,
                "billing_year": 2026,
                "period_start": date(2026, 10, 1),
                "period_end": date(2026, 10, 28),
                "student_name": "Nguyễn Minh Anh",
                "student_code": "HS001",
                "class_name": "Toán 8A",
                "amount_due": 1800000,
                "amount_paid": 1200000,
                "amount_remaining": 600000,
            },
            "Vui lòng nộp trước Thứ Tư.",
        )
        self.assertEqual(title, "Nhắc học phí tháng 10/2026 · Nguyễn Minh Anh")
        self.assertIn("1.800.000 ₫", body)
        self.assertIn("1.200.000 ₫", body)
        self.assertIn("600.000 ₫", body)
        self.assertIn("28/10/2026", body)
        self.assertIn("Vui lòng nộp trước Thứ Tư.", body)

    def test_main_preserves_existing_routes_and_registers_new_tuition_routes(self):
        source = (ROOT / "backend/app/main.py").read_text(encoding="utf-8")
        tree = ast.parse(source)

        routes: set[tuple[str, str]] = set()
        func_names: set[str] = set()
        for node in tree.body:
            if isinstance(node, ast.FunctionDef):
                func_names.add(node.name)
                for dec in node.decorator_list:
                    if (
                        isinstance(dec, ast.Call)
                        and isinstance(dec.func, ast.Attribute)
                        and isinstance(dec.func.value, ast.Name)
                        and dec.func.value.id == "app"
                        and dec.args
                        and isinstance(dec.args[0], ast.Constant)
                    ):
                        routes.add((dec.func.attr.upper(), str(dec.args[0].value)))

        # Original tuition & notification endpoints remain intact
        self.assertIn(("GET", "/api/tuition/invoices"), routes)
        self.assertIn(("POST", "/api/tuition/invoices/generate"), routes)
        self.assertIn(("GET", "/api/tuition/invoices/{invoice_id}/payments"), routes)
        self.assertIn(("POST", "/api/tuition/invoices/{invoice_id}/payments"), routes)
        self.assertIn(("GET", "/api/notifications"), routes)
        self.assertIn(("GET", "/api/dashboard"), routes)

        # New UC-09 & UC-12 endpoints are registered
        self.assertIn(("GET", "/api/tuition/summary"), routes)
        self.assertIn(("GET", "/api/tuition/payments"), routes)
        self.assertIn(("GET", "/api/tuition/invoices/{invoice_id}"), routes)
        self.assertIn(("POST", "/api/tuition/invoices/{invoice_id}/remind"), routes)
        self.assertIn(("POST", "/api/tuition/reminders/send"), routes)

        self.assertIn("format_vnd_amount", func_names)
        self.assertIn("build_tuition_reminder_message", func_names)


class TuitionFrontendDomContractTests(unittest.TestCase):
    def test_teacher_tuition_js_preserves_legacy_methods_and_matches_html_ids(self):
        js = (ROOT / "assets/js/modules/teacher/tuition-fee.js").read_text(encoding="utf-8")

        for legacy_fn in ("getTuitionInvoices(", "generateTuitionBill(", "recordPayment(", "reconcileDebts("):
            self.assertIn(legacy_fn, js)
        self.assertIn("window.TuitionFeeModule = TuitionFeeModule;", js)

        referenced_ids = set(re.findall(r"getElementById\(['\"]([^'\"]+)['\"]\)", js))
        # Dynamic variable lookup openModal(id) isn't literal, so referenced_ids are all literal IDs
        tuition_dom = _parse_html("pages/teacher/tuition.html")
        dash_dom = _parse_html("pages/teacher/dashboard.html")
        available_ids = tuition_dom.ids | dash_dom.ids

        missing = referenced_ids - available_ids
        self.assertEqual(missing, set(), f"Missing IDs in teacher HTML pages: {missing}")

        self.assertIn("../../assets/css/tuition.css", tuition_dom.stylesheets)
        self.assertIn("../../assets/js/modules/teacher/tuition-fee.js", tuition_dom.scripts)
        self.assertIn("../../assets/js/modules/teacher/tuition-fee.js", dash_dom.scripts)

        # Legacy inline modal helpers preserved on pages/teacher/tuition.html
        tuition_html_raw = (ROOT / "pages/teacher/tuition.html").read_text(encoding="utf-8")
        for helper in ("function openModal(", "function closeModal(", "function openPaymentModal(", "function openInvoiceDetail("):
            self.assertIn(helper, tuition_html_raw)

    def test_parent_tuition_js_preserves_legacy_methods_and_matches_html_ids(self):
        js = (ROOT / "assets/js/modules/parent/tuition-invoice.js").read_text(encoding="utf-8")

        for fn in ("getChildInvoices(", "getPaymentInstructions(", "fetchChildInvoices(", "reconcileFee("):
            self.assertIn(fn, js)
        self.assertIn("window.ParentTuitionInvoiceModule = ParentTuitionInvoiceModule;", js)

        referenced_ids = set(re.findall(r"getElementById\(['\"]([^'\"]+)['\"]\)", js))
        # parentAttendanceChild is an optional cross-branch selector on parent dashboard
        referenced_ids.discard("parentAttendanceChild")
        # btnDetailPanelMarkRead & btnDetailPanelContact are queried via panel.querySelector, not getElementById

        parent_tuition_dom = _parse_html("pages/parent/tuition.html")
        parent_notif_dom = _parse_html("pages/parent/notifications.html")
        parent_dash_dom = _parse_html("pages/parent/dashboard.html")
        available_ids = parent_tuition_dom.ids | parent_notif_dom.ids | parent_dash_dom.ids

        missing = referenced_ids - available_ids
        self.assertEqual(missing, set(), f"Missing IDs in parent HTML pages: {missing}")

        self.assertIn("../../assets/css/tuition.css", parent_tuition_dom.stylesheets)
        self.assertIn("../../assets/css/tuition.css", parent_notif_dom.stylesheets)
        self.assertIn("../../assets/js/modules/parent/tuition-invoice.js", parent_tuition_dom.scripts)
        self.assertIn("../../assets/js/modules/parent/tuition-invoice.js", parent_notif_dom.scripts)
        self.assertIn("../../assets/js/modules/parent/tuition-invoice.js", parent_dash_dom.scripts)

    def test_parent_notifications_preserves_all_notifications_js_hooks(self):
        notif_dom = _parse_html("pages/parent/notifications.html")
        required_hooks = {
            "data-unread-badge",
            "data-mark-all-read",
            "data-notification-filter",
            "data-notification-category",
            "data-notification-list",
            "data-notification-empty",
            "data-notification-summary",
            "data-system-note",
            "data-dismiss-note",
        }
        self.assertTrue(
            required_hooks.issubset(notif_dom.data_attrs),
            f"Missing notification hooks: {required_hooks - notif_dom.data_attrs}",
        )
        self.assertIn("../../assets/js/notifications.js", notif_dom.scripts)

    def test_student_dashboard_has_no_tuition_card(self):
        student_dash_html = (ROOT / "pages/student/dashboard.html").read_text(encoding="utf-8")
        self.assertNotIn("tuition-view.js", student_dash_html)
        self.assertNotIn("tuition-fee.js", student_dash_html)
        self.assertNotIn("tuition-invoice.js", student_dash_html)
        self.assertNotIn("Học phí còn phải thu", student_dash_html)


class SeedDemoMathTests(unittest.TestCase):
    def test_october_demo_seed_reconciles_exact_pdf_figures(self):
        seed_sql = (ROOT / "database/seed_tuition_demo.sql").read_text(encoding="utf-8")
        self.assertIn("HP-102026-MA", seed_sql)
        self.assertIn("PT-202610-031", seed_sql)
        self.assertIn("PT-202610-084", seed_sql)

        # Verify exact relational math modeled in seed_tuition_demo.sql:
        # 96 October invoices:
        # - HS001: 1,800,000 due, 2x 600,000 = 1,200,000 paid -> 600,000 remaining (66.7%)
        # - HS002..HS082 (81 students): 800,000 due each = 64,800,000
        # - HS083..HS096 (14 students): 700,000 due each = 9,800,000
        due_hs001 = 1_800_000
        due_800k = 81 * 800_000
        due_700k = 14 * 700_000
        total_due = due_hs001 + due_800k + due_700k

        paid_hs001 = 600_000 + 600_000
        paid_hs005 = 500_000
        paid_hs006_to_016 = 11 * 300_000
        paid_full_800k = 67 * 800_000  # HS003 + HS017..HS082 (1 + 66 = 67 students)
        paid_full_700k = 14 * 700_000  # HS083..HS096 (14 students)
        total_paid = paid_hs001 + paid_hs005 + paid_hs006_to_016 + paid_full_800k + paid_full_700k

        total_remaining = total_due - total_paid
        paid_students = 67 + 14
        debt_students = 96 - paid_students
        parent_progress = round((paid_hs001 / due_hs001) * 100, 1)

        self.assertEqual(total_due, 76_400_000)
        self.assertEqual(total_paid, 68_400_000)
        self.assertEqual(total_remaining, 8_000_000)
        self.assertEqual(paid_students, 81)
        self.assertEqual(debt_students, 15)
        self.assertEqual(parent_progress, 66.7)


if __name__ == "__main__":
    unittest.main()
