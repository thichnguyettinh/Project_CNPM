"""Test xử lý tệp đề UC07, chạy được bằng thư viện chuẩn Python (không cần DB)."""
import ast
from io import BytesIO
from pathlib import Path
from tempfile import TemporaryDirectory
from types import SimpleNamespace
import unittest
from zipfile import ZipFile, BadZipFile

ROOT = Path(__file__).resolve().parents[1]

class HTTPException(Exception):
    def __init__(self, status_code, detail):
        self.status_code, self.detail = status_code, detail
        super().__init__(detail)

script = (ROOT / "backend/app/main.py").read_text(encoding="utf-8")
tree = ast.parse(script)
fn = next(n for n in tree.body if isinstance(n, ast.FunctionDef) and n.name == "_validated_attachment")
namespace = dict(HTTPException=HTTPException, Path=Path, BytesIO=BytesIO, ZipFile=ZipFile,
                 BadZipFile=BadZipFile, MAX_UPLOAD_BYTES=10*1024*1024,
                 ATTACHMENT_MIME={".pdf":"application/pdf", ".docx":"application/vnd.openxmlformats-officedocument.wordprocessingml.document", ".png":"image/png", ".jpg":"image/jpeg", ".jpeg":"image/jpeg"}, UploadFile=object)
exec(compile(ast.Module(body=[fn], type_ignores=[]),"<uc07_attachment>","exec"), namespace)
validate = namespace["_validated_attachment"]

def upload(name, content):
    return SimpleNamespace(filename=name, file=BytesIO(content))

class AttachmentValidationTest(unittest.TestCase):
    def test_valid_pdf(self):
        self.assertEqual(validate(upload("de.pdf", b"%PDF-1.7\ncontent"))[0], "de.pdf")
    def test_reject_pdf_spoof(self):
        with self.assertRaises(HTTPException) as e:
            validate(upload("de.pdf", b"not pdf"))
        self.assertEqual(e.exception.status_code, 415)
    def test_valid_png(self):
        self.assertEqual(validate(upload("h.png", b"\x89PNG\r\n\x1a\nabc"))[1],".png")
    def test_valid_jpeg(self):
        self.assertEqual(validate(upload("h.jpeg", b"\xff\xd8\xff\xe0"))[1],".jpeg")
    def test_valid_docx(self):
        buffer = BytesIO()
        with ZipFile(buffer,'w') as archive:
            archive.writestr('[Content_Types].xml','<Types/>')
            archive.writestr('word/document.xml','<document/>')
        self.assertEqual(validate(upload("de.docx",buffer.getvalue()))[1],".docx")
    def test_reject_fake_docx(self):
        with self.assertRaises(HTTPException):
            validate(upload("de.docx",b"PKnot-a-docx"))
    def test_reject_empty(self):
        with self.assertRaises(HTTPException) as e:
            validate(upload("de.pdf", b""))
        self.assertEqual(e.exception.status_code,400)
    def test_reject_too_large(self):
        with self.assertRaises(HTTPException) as e:
            validate(upload("de.pdf", b"%PDF-"+b"x"*(10*1024*1024)))
        self.assertEqual(e.exception.status_code,413)
    def test_reject_unsupported_extension(self):
        with self.assertRaises(HTTPException) as e:
            validate(upload("de.exe", b"abc"))
        self.assertEqual(e.exception.status_code,415)
    def test_strip_path(self):
        self.assertEqual(validate(upload("C:\\Users\\demo\\de.pdf",b"%PDF-1.7"))[0],"de.pdf")
    def test_sql_migration_available(self):
        sql=(ROOT/'database/migrations/uc07_assignment_attachments.sql').read_text(encoding='utf-8')
        self.assertIn('CREATE TABLE IF NOT EXISTS assignment_attachments',sql)
        self.assertIn('REFERENCES assignments(assignment_id)',sql)
    def test_frontend_download_and_upload_present(self):
        teacher=(ROOT/'assets/js/modules/teacher/uc07.js').read_text(encoding='utf-8')
        student=(ROOT/'assets/js/modules/student/assignment-view.js').read_text(encoding='utf-8')
        self.assertIn('createAssignmentWithAttachment',teacher)
        self.assertIn('replaceAttachment',teacher)
        self.assertIn('downloadAssignmentAttachment',student)
        self.assertIn("data-prompt",student)

if __name__ == "__main__": unittest.main()
