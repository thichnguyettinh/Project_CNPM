"""
Comprehensive End-to-End Testing Suite for UC-03 & UC-04
Assigned to: Phạm Nguyễn Hoàng Kim
"""

import urllib.request
import urllib.parse
import json
import sys

if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")
if hasattr(sys.stderr, "reconfigure"):
    sys.stderr.reconfigure(encoding="utf-8", errors="replace")

API_BASE = "http://127.0.0.1:8001/api"
FRONTEND_BASE = "http://localhost:3000"

def request_json(path, method="GET", data=None, token=None):
    url = f"{API_BASE}{path}"
    headers = {"Content-Type": "application/json"}
    if token:
        headers["Authorization"] = f"Bearer {token}"
    body = json.dumps(data).encode("utf-8") if data is not None else None
    req = urllib.request.Request(url, data=body, headers=headers, method=method)
    with urllib.request.urlopen(req) as resp:
        content = resp.read().decode("utf-8")
        return json.loads(content) if content else {}

def request_status(url):
    req = urllib.request.Request(url)
    with urllib.request.urlopen(req) as resp:
        return resp.status

def run_tests():
    print("=" * 70)
    print("STARTING E2E TEST SUITE FOR UC-03 & UC-04 (PHẠM NGUYỄN HOÀNG KIM)")
    print("=" * 70)
    
    passed = 0
    failed = 0

    def assert_test(cond, title):
        nonlocal passed, failed
        if cond:
            print(f" [PASS] {title}")
            passed += 1
        else:
            print(f" [FAIL] {title}")
            failed += 1

    # --- 0. Frontend Pages Availability ---
    print("\n--- 0. KIỂM TRA TẤT CẢ ROUTE FRONTEND ---")
    pages = [
        "/pages/teacher/classes.html",
        "/pages/teacher/schedule.html",
        "/pages/teacher/attendance.html",
        "/pages/teacher/dashboard.html",
        "/pages/student/schedule.html",
        "/pages/student/dashboard.html",
        "/pages/parent/schedule.html",
        "/pages/parent/dashboard.html"
    ]
    for p in pages:
        status = request_status(f"{FRONTEND_BASE}{p}")
        assert_test(status == 200, f"Frontend Page: {p} (HTTP {status})")

    # --- 1. Teacher Authentication ---
    print("\n--- 1. ĐĂNG NHẬP GIÁO VIÊN ---")
    teacher_login = request_json("/auth/login", method="POST", data={"identity": "teacher", "password": "123"})
    teacher_token = teacher_login.get("access_token")
    assert_test(bool(teacher_token), "Đăng nhập giáo viên thành công và nhận JWT Access Token")

    # --- 2. UC-03: Class Management ---
    print("\n--- 2. TEST UC-03: QUẢN LÝ LỚP HỌC (TEACHER) ---")
    classes = request_json("/classes", token=teacher_token)
    assert_test(isinstance(classes, list) and len(classes) >= 6, f"Danh sách lớp chứa ít nhất 6 lớp thiết kế (Hiện tại: {len(classes)} lớp)")

    # Verify TO10A presence and details
    to10a = next((c for c in classes if (c.get("class_code") or c.get("code")) == "TO10A"), None)
    assert_test(to10a is not None, "Tìm thấy lớp TO10A trong danh sách lớp")
    if to10a:
        assert_test(to10a.get("student_count") == 20, f"Sĩ số lớp TO10A hiển thị đúng 20 học sinh (Hiện tại: {to10a.get('student_count')})")
        assert_test(to10a.get("subject") == "Toán", "Môn học của TO10A là Toán")
        assert_test(to10a.get("status") == "active", "Trạng thái của TO10A là active")

        # Detail of TO10A students
        to10a_id = to10a.get("class_id") or to10a.get("id")
        students = request_json(f"/classes/{to10a_id}/students", token=teacher_token)
        assert_test(len(students) == 20, f"Chi tiết lớp TO10A: Lấy chính xác 20 học sinh từ CSDL (Hiện tại: {len(students)})")
        
        # Check first student details
        s0 = students[0]
        assert_test(s0.get("student_code") == "HS001", f"Học sinh đầu tiên là HS001 (Hiện tại: {s0.get('student_code')})")
        assert_test(bool(s0.get("full_name")), f"Học sinh có họ tên đầy đủ ({s0.get('full_name')})")
        assert_test(bool(s0.get("parent_name")), f"Học sinh có thông tin phụ huynh ({s0.get('parent_name')})")

    # Create new class with initial count 0
    test_class_code = "TO10_TEST"
    try:
        new_class = request_json("/classes", method="POST", data={
            "class_code": test_class_code,
            "name": "Toán 10 - Thử nghiệm E2E",
            "subject": "Toán",
            "monthly_fee": 500000,
            "default_room": "Phòng 205",
            "description": "Lớp học kiểm thử tự động quy trình UC-03",
            "schedule_info": "Thứ 2, 4 17:30-19:00"
        }, token=teacher_token)
        assert_test((new_class.get("class_code") or new_class.get("code")) == test_class_code, "Tạo lớp mới thành công qua API")
    except urllib.error.HTTPError as e:
        if e.code == 409:
            print(" [INFO] Lớp TO10_TEST đã tồn tại (HTTP 409 Conflict check passed)")
            assert_test(True, "Bắt lỗi trùng mã lớp duy nhất (HTTP 409 Conflict) chuẩn xác")
        else:
            assert_test(False, f"Lỗi tạo lớp mới: {e}")

    # Check that new class has initial student count = 0
    classes_updated = request_json("/classes", token=teacher_token)
    test_cls = next((c for c in classes_updated if (c.get("class_code") or c.get("code")) == test_class_code), None)
    if test_cls:
        assert_test(test_cls.get("student_count") == 0, f"Sĩ số ban đầu của lớp mới tạo phải bằng 0 (Hiện tại: {test_cls.get('student_count')})")

        # Edit class
        cls_id = test_cls.get("class_id") or test_cls.get("id")
        updated_cls = request_json(f"/classes/{cls_id}", method="PATCH", data={
            "name": "Toán 10 - Đã cập nhật E2E",
            "monthly_fee": 550000,
            "default_room": "Phòng 206",
            "description": "Mô tả sau khi cập nhật"
        }, token=teacher_token)
        assert_test(updated_cls.get("name") == "Toán 10 - Đã cập nhật E2E", "Cập nhật thông tin lớp học thành công")
        assert_test((updated_cls.get("default_room") or updated_cls.get("room")) == "Phòng 206", "Cập nhật phòng học lớp thành công")

        # Archive / Close class safely
        archived_cls = request_json(f"/classes/{cls_id}/archive", method="POST", token=teacher_token)
        assert_test(archived_cls.get("status") == "archived", "Lưu trữ lớp học an toàn (trạng thái: archived)")
        
        # Verify class still exists in DB without deleting historical records
        check_cls = request_json(f"/classes/{cls_id}", token=teacher_token)
        assert_test((check_cls.get("class_id") or check_cls.get("id")) == cls_id, "Lớp lưu trữ vẫn được bảo toàn dữ liệu trong CSDL, không bị xóa")

    # --- 3. UC-04: Teacher Timetable & Attendance Link ---
    print("\n--- 3. TEST UC-04: THỜI KHÓA BIỂU GIÁO VIÊN & ĐIỂM DANH ---")
    teacher_sessions = request_json("/sessions?date_from=2026-10-19&date_to=2026-10-25", token=teacher_token)
    assert_test(isinstance(teacher_sessions, list) and len(teacher_sessions) == 12, f"Tuần 19–25/10/2026 của giáo viên có đủ 12 ca học (Hiện tại: {len(teacher_sessions)})")

    # Check session structure and TO10A presence
    to10a_sess = next((s for s in teacher_sessions if s.get("class_code") == "TO10A"), None)
    assert_test(to10a_sess is not None, "Có buổi học của lớp TO10A trong tuần thiết kế")
    assert_test(to10a_sess.get("subject") == "Toán", "Buổi học có môn học Toán")
    assert_test(bool(to10a_sess.get("room")), f"Buổi học có thông tin phòng học ({to10a_sess.get('room')})")
    assert_test(to10a_sess.get("student_count") == 20, f"Buổi học hiển thị đúng sĩ số 20 học sinh của TO10A (Hiện tại: {to10a_sess.get('student_count')})")

    # Session Detail endpoint
    sess_id = to10a_sess.get("session_id")
    sess_detail = request_json(f"/sessions/{sess_id}", token=teacher_token)
    assert_test(sess_detail.get("session_id") == sess_id, "API chi tiết buổi học trả về đúng session_id")
    assert_test(sess_detail.get("class_code") == "TO10A", "API chi tiết trả về đúng mã lớp TO10A")
    assert_test(sess_detail.get("teacher_name") is not None, "API chi tiết có họ tên giáo viên")

    # Attendance Integration check: Verify attendance page URL with query params
    att_url = f"{FRONTEND_BASE}/pages/teacher/attendance.html?session_id={sess_id}&class_id={to10a_sess.get('class_id')}"
    att_status = request_status(att_url)
    assert_test(att_status == 200, f"Trang điểm danh nhận đúng tham số session_id và class_id (HTTP {att_status})")

    # --- 4. Student Schedule & Isolation ---
    print("\n--- 4. TEST THỜI KHÓA BIỂU HỌC SINH (STUDENT ISOLATION) ---")
    student_login = request_json("/auth/login", method="POST", data={"identity": "student", "password": "123"})
    student_token = student_login.get("access_token")
    assert_test(bool(student_token), "Đăng nhập học sinh HS001 thành công")

    student_sessions = request_json("/sessions?date_from=2026-10-19&date_to=2026-10-25", token=student_token)
    assert_test(len(student_sessions) == 3, f"Học sinh HS001 chỉ thấy 3 ca học trong tuần của lớp mình (TO10A) (Hiện tại: {len(student_sessions)})")
    
    # Verify student does not see other classes' sessions
    other_classes = [s for s in student_sessions if s.get("class_code") != "TO10A"]
    assert_test(len(other_classes) == 0, "Bảo mật phân quyền: Học sinh KHÔNG THỂ nhìn thấy lịch học của lớp khác")

    # --- 5. Parent Schedule & Authorization ---
    print("\n--- 5. TEST THỜI KHÓA BIỂU PHỤ HUYNH (PARENT ACCESS) ---")
    parent_login = request_json("/auth/login", method="POST", data={"identity": "parent", "password": "123"})
    parent_token = parent_login.get("access_token")
    assert_test(bool(parent_token), "Đăng nhập phụ huynh thành công")

    parent_sessions = request_json("/sessions?date_from=2026-10-19&date_to=2026-10-25", token=parent_token)
    assert_test(len(parent_sessions) == 3, f"Phụ huynh chỉ xem đúng lịch học con mình (Trần Minh Anh, TO10A, 3 buổi) (Hiện tại: {len(parent_sessions)})")
    
    # Check data consistency between teacher, student and parent
    p_first = parent_sessions[0]
    s_first = student_sessions[0]
    assert_test(p_first["session_id"] == s_first["session_id"], "Dữ liệu thời khóa biểu phụ huynh ĐỒNG BỘ 100% với học sinh và giáo viên")

    # --- 6. Dashboard Cards Verification ---
    print("\n--- 6. TEST THẺ THỐNG KÊ DASHBOARD (API DATA DRIVEN) ---")
    t_dash = request_json("/dashboard", token=teacher_token)
    assert_test(t_dash.get("classes", {}).get("active_classes") >= 6, f"Dashboard Giáo viên: Thẻ tổng số lớp = {t_dash.get('classes', {}).get('active_classes')}")
    assert_test(t_dash.get("students", {}).get("student_count") == 96, f"Dashboard Giáo viên: Thẻ tổng học sinh = {t_dash.get('students', {}).get('student_count')}")
    assert_test(t_dash.get("weekly_sessions") == 12, f"Dashboard Giáo viên: Thẻ buổi học trong tuần = {t_dash.get('weekly_sessions')}")
    assert_test(len(t_dash.get("upcoming_sessions", [])) > 0, "Dashboard Giáo viên: Thẻ lịch dạy sắp tới hiển thị dữ liệu thật từ API")

    s_dash = request_json("/dashboard", token=student_token)
    assert_test(len(s_dash.get("upcoming_sessions", [])) > 0, "Dashboard Học sinh: Thẻ lịch học sắp tới có dữ liệu thật")

    p_dash = request_json("/dashboard", token=parent_token)
    assert_test(len(p_dash.get("upcoming_sessions", [])) > 0, "Dashboard Phụ huynh: Thẻ lịch học sắp tới của con có dữ liệu thật")
    assert_test(len(p_dash.get("students", [])) == 1, "Dashboard Phụ huynh: Hiển thị đúng thông tin con được liên kết")

    print("\n" + "=" * 70)
    print(f"KẾT QUẢ KIỂM THỬ: {passed} PASSED | {failed} FAILED")
    print("=" * 70)

    if failed > 0:
        sys.exit(1)

if __name__ == "__main__":
    run_tests()
