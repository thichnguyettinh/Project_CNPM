"""Static packaging checks; does NOT replace end-to-end database testing."""
from collections import Counter
from html.parser import HTMLParser
from pathlib import Path
import unittest

ROOT = Path(__file__).resolve().parents[1]

class PageParser(HTMLParser):
    def __init__(self):
        super().__init__()
        self.ids=[]
        self.assets=[]
    def handle_starttag(self,tag,attrs):
        fields=dict(attrs)
        if fields.get('id'):
            self.ids.append(fields['id'])
        for attr in ('src','href'):
            val=fields.get(attr,'')
            if val.startswith('../../assets/'):
                self.assets.append(val)

class CombinedUCChecks(unittest.TestCase):
    def test_pages_have_no_duplicate_ids_and_assets_exist(self):
        for rel in ['pages/teacher/grades.html','pages/student/grades.html','pages/student/assignments.html']:
            page=ROOT/rel
            with self.subTest(page=rel):
                self.assertTrue(page.exists())
                parsed=PageParser();parsed.feed(page.read_text(encoding='utf-8'))
                dup=[i for i,n in Counter(parsed.ids).items() if n>1]
                self.assertEqual([],dup)
                for asset in parsed.assets:
                    self.assertTrue((page.parent/asset).resolve().is_file(),asset)
    def test_teacher_uc_apis_present(self):
        backend=(ROOT/'backend/app/main.py').read_text(encoding='utf-8')
        for expected in ['@app.get("/api/assignments")','@app.post("/api/assignments"','@app.put("/api/assignments/{assignment_id}/results")','@app.get("/api/grade-history/{student_code}")','@app.get("/api/students/{student_code}/progress")','@app.put("/api/assignments/{assignment_id}/question-scores/{student_code}")','@app.post("/api/assignments/{assignment_id}/submissions"','own.submission_id AS my_submission_id','sub.submission_id, sub.file_name']:
            with self.subTest(expected=expected): self.assertIn(expected,backend)
    def test_no_stub_create_alert(self):
        self.assertNotIn("alert('Mở form tạo bài tập mới')", (ROOT/'pages/teacher/grades.html').read_text(encoding='utf-8'))
    def test_sql_migration_and_no_env(self):
        self.assertTrue((ROOT/'database/migrations/uc11_question_scores.sql').exists())
        self.assertFalse((ROOT/'backend/.env').exists())

if __name__=='__main__': unittest.main(verbosity=2)
