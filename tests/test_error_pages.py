from html.parser import HTMLParser
from pathlib import Path
import unittest


ROOT = Path(__file__).resolve().parents[1]


class ErrorPageParser(HTMLParser):
    def __init__(self):
        super().__init__()
        self.main_count = 0
        self.title_count = 0
        self.links = []
        self.assets = []

    def handle_starttag(self, tag, attrs):
        attributes = dict(attrs)
        if tag == "main":
            self.main_count += 1
        if tag == "title":
            self.title_count += 1
        if attributes.get("href"):
            self.links.append(attributes["href"])
        for attribute in ("src", "href"):
            value = attributes.get(attribute, "")
            if value.startswith("./assets/"):
                self.assets.append(value)


class ErrorPageTests(unittest.TestCase):
    def test_error_pages_are_standalone_and_assets_exist(self):
        for filename in ("404.html", "500.html", "maintenance.html"):
            with self.subTest(page=filename):
                page = ROOT / filename
                self.assertTrue(page.is_file())
                markup = page.read_text(encoding="utf-8")
                parser = ErrorPageParser()
                parser.feed(markup)
                self.assertIn('<html lang="vi">', markup)
                self.assertEqual(parser.main_count, 1)
                self.assertEqual(parser.title_count, 1)
                self.assertNotIn("./index.html", parser.links)
                for asset in parser.assets:
                    self.assertTrue((ROOT / asset.removeprefix("./")).is_file(), asset)

    def test_outage_pages_only_offer_retry_not_login(self):
        for filename, retry_label in (
            ("500.html", "Thử tải lại"),
            ("maintenance.html", "Kiểm tra lại"),
        ):
            with self.subTest(page=filename):
                markup = (ROOT / filename).read_text(encoding="utf-8")
                self.assertIn(retry_label, markup)
                self.assertNotIn("Về trang đăng nhập", markup)

    def test_error_pages_have_their_expected_message(self):
        expected = {
            "404.html": ("404", "Không tìm thấy trang"),
            "500.html": ("500", "Lỗi hệ thống"),
            "maintenance.html": ("Thông báo dịch vụ", "Hệ thống đang được bảo trì"),
        }
        for filename, messages in expected.items():
            with self.subTest(page=filename):
                markup = (ROOT / filename).read_text(encoding="utf-8")
                for message in messages:
                    self.assertIn(message, markup)


if __name__ == "__main__":
    unittest.main()
