from html.parser import HTMLParser
from pathlib import Path
import unittest


ROOT = Path(__file__).resolve().parents[1]
PARENT_PAGES = tuple(sorted((ROOT / "pages/parent").glob("*.html")))
CONTACT_SCRIPT = "../../assets/js/modules/parent/contact-center.js"


class ContactPageParser(HTMLParser):
    def __init__(self):
        super().__init__()
        self.phone_links = []
        self.phone_texts = 0
        self.scripts = []

    def handle_starttag(self, tag, attrs):
        attributes = dict(attrs)
        if "data-center-phone-link" in attributes:
            self.phone_links.append((tag, attributes.get("href")))
        if "data-center-phone" in attributes:
            self.phone_texts += 1
        if tag == "script" and attributes.get("src"):
            self.scripts.append(attributes["src"])


class ParentContactTests(unittest.TestCase):
    def test_parent_contact_pages_share_clickable_center_hotline(self):
        script = (ROOT / "assets/js/modules/parent/contact-center.js").read_text(encoding="utf-8")
        self.assertIn("const phoneNumber = '028 3822 8888'", script)
        self.assertIn("const phoneLink = 'tel:02838228888'", script)
        self.assertIn("Liên hệ trung tâm: ${phoneNumber}", script)
        self.assertIn("actions.prepend(contactLink)", script)
        self.assertEqual(len(PARENT_PAGES), 8)

        for page in PARENT_PAGES:
            with self.subTest(page=page.name):
                parser = ContactPageParser()
                parser.feed(page.read_text(encoding="utf-8"))
                self.assertEqual(parser.scripts.count(CONTACT_SCRIPT), 1)

    def test_parent_pages_do_not_use_alert_for_center_contact(self):
        for page in PARENT_PAGES:
            with self.subTest(page=page.name):
                markup = page.read_text(encoding="utf-8")
                self.assertNotIn("alert('Hotline trung tâm", markup)
                self.assertNotIn("Gọi trung tâm:", markup)

    def test_parent_contact_card_is_available_on_help_and_payment_pages(self):
        for filename in ("help.html", "tuition.html", "notifications.html"):
            with self.subTest(page=filename):
                parser = ContactPageParser()
                parser.feed((ROOT / "pages/parent" / filename).read_text(encoding="utf-8"))
                self.assertTrue(parser.phone_texts)
                self.assertTrue(parser.phone_links)
                self.assertTrue(all(tag == "a" for tag, _ in parser.phone_links))

    def test_tuition_and_notifications_headers_do_not_duplicate_contact_action(self):
        for filename in ("tuition.html", "notifications.html"):
            with self.subTest(page=filename):
                markup = (ROOT / "pages/parent" / filename).read_text(encoding="utf-8")
                header = markup.split("</header>", maxsplit=1)[0]
                self.assertNotIn("data-open-parent-contact", header)
                self.assertNotIn("Liên hệ trung tâm", header)


if __name__ == "__main__":
    unittest.main()
