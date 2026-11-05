import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]

class ParentScheduleTests(unittest.TestCase):
    def test_parent_schedule_html_contains_class_filter(self):
        html_path = ROOT / "pages/parent/schedule.html"
        self.assertTrue(html_path.exists())
        content = html_path.read_text(encoding="utf-8")
        
        # Check toolbar has class filter container and select
        self.assertIn("schedule-week-class-filter", content)
        self.assertIn('id="scheduleParentClass"', content)
        self.assertIn('onchange="onClassChange(this.value)"', content)
        self.assertIn('aria-label="Chọn lớp học"', content)
        
        # Check schedule.css is linked
        self.assertIn('assets/css/schedule.css', content)
        
        # Check fixed schedule section
        self.assertIn('id="parentFixedSchedules"', content)
        self.assertIn('id="parentScheduleCount"', content)

    def test_parent_schedule_view_module_has_class_methods(self):
        js_path = ROOT / "assets/js/modules/parent/schedule-view.js"
        self.assertTrue(js_path.exists())
        content = js_path.read_text(encoding="utf-8")
        
        self.assertIn("getChildClasses", content)
        self.assertIn("filter.class_id", content)
        self.assertIn("getSessionDetail", content)

    def test_parent_schedule_page_has_filter_logic(self):
        js_path = ROOT / "assets/js/modules/parent/schedule-page.js"
        self.assertTrue(js_path.exists())
        content = js_path.read_text(encoding="utf-8")
        
        # State includes classes and classId
        self.assertIn("classes: []", content)
        self.assertIn("classId: ''", content)
        
        # Load and render functions
        self.assertIn("loadChildClasses", content)
        self.assertIn("renderClassFilter", content)
        self.assertIn("renderFixedSchedules", content)
        self.assertIn("renderScheduleCount", content)
        
        # onClassChange handler
        self.assertIn("window.onClassChange", content)
        self.assertIn("ParentSchedulePage", content)

    def test_schedule_css_contains_parent_rules(self):
        css_path = ROOT / "assets/css/schedule.css"
        self.assertTrue(css_path.exists())
        content = css_path.read_text(encoding="utf-8")
        
        self.assertIn(".parent-schedule-page .schedule-week-toolbar", content)
        self.assertIn(".parent-schedule-page .schedule-week-class-filter", content)
        self.assertIn(".parent-schedule-page .schedule-fixed-card", content)

if __name__ == "__main__":
    unittest.main()
