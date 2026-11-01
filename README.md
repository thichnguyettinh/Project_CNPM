# HỆ THỐNG QUẢN LÝ LỚP HỌC THÊM — "LỚP MÌNH"
> **Học phần:** Nhập môn Công nghệ Phần mềm  
> **Khoa Công nghệ Thông tin — Trường Đại học Sư phạm TP. Hồ Chí Minh**  
> **Nhóm thực hiện:** Nhóm 01 | **Mã lớp học:** 2611COMP104405  
> **Giảng viên hướng dẫn:** ThS. Lê Thanh Thoại  

---

## 📌 1. TỔNG QUAN DỰ ÁN & BẢN THIẾT KẾ GIAO DIỆN

Hệ thống **"Lớp Mình"** có giao diện cho cả 3 tác nhân: **Giáo viên**, **Phụ huynh**, và **Học sinh**. Các trang và API chính đã được xây dựng; một số màn hình vẫn dùng dữ liệu minh họa và chưa tích hợp hoàn chỉnh với backend. Tình trạng chức năng được ghi cụ thể ở phần phân công bên dưới.

### Đặc điểm kiến trúc:
- **Design System:** Màu sắc (#1565C0, #0F766E, #15803D, #DC2626), khoảng cách hệ 4-8-12-16-24-32-40, phông chữ Inter.
- **Giao diện:** Các trang dashboard, nghiệp vụ, hướng dẫn và thông báo có bố cục theo vai trò. Mức độ nối API khác nhau theo từng chức năng; không xem dữ liệu minh họa là dữ liệu thật.

### Cấu trúc thư mục

Tên thư mục và tệp bên dưới giữ nguyên như trong mã nguồn:

```text
Dự án (project_cnpm/)
├── Trang đăng nhập (index.html)
├── Tài liệu dự án (README.md)
├── Ảnh minh họa giao diện (images/)
│   ├── Mẫu thông báo giáo viên (thong_bao_giao_vien.jpg)
│   ├── Mẫu thông báo học sinh (thong_bao_hoc_sinh.jpg)
│   └── Mẫu thông báo phụ huynh (thong_bao_phu_huynh.jpg)
├── Tài nguyên giao diện (assets/)
│   ├── Kiểu giao diện (css/)
│   │   ├── Biến thiết kế (variables.css)
│   │   ├── Kiểu nền tảng (base.css)
│   │   ├── Thành phần dùng chung (components.css)
│   │   ├── Bố cục ứng dụng (dashboard.css)
│   │   ├── Kiểu theo bản mẫu (pdf-mockup-styles.css)
│   │   ├── Trang đăng nhập (login.css)
│   │   ├── Trung tâm hướng dẫn (help-center.css)
│   │   └── Trang thông báo (notifications.css)
│   └── Mã giao diện (js/)
│       ├── Xác thực và gọi API (auth.js)
│       ├── Hiển thị thông báo và badge chưa đọc từ API (notifications.js, auth.js)
│       └── Tích hợp nghiệp vụ (modules/)
│           ├── Giáo viên (teacher/)
│           ├── Học sinh (student/)
│           └── Phụ huynh (parent/)
├── Kiểm thử tập trung (tests/)
│   ├── Chạy toàn bộ test Python và JavaScript (run_all_tests.py)
│   ├── Test backend và schema (test_api_contract.py, test_tuition_uc09_uc12.py, test_uc07_de_bai.py, test_uc11_schema.py)
│   ├── Test giao diện và nghiệp vụ (test_tong_hop_static.py)
│   └── Test JavaScript CommonJS (test_*.cjs)
├── Trang theo vai trò (pages/)
│   ├── Giáo viên (teacher/)
│   │   ├── Tổng quan (dashboard.html)
│   │   ├── Quản lý lớp (classes.html)
│   │   ├── Quản lý tài khoản (users.html)
│   │   ├── Lịch học (schedule.html)
│   │   ├── Điểm danh (attendance.html)
│   │   ├── Bài tập và điểm số (grades.html)
│   │   ├── Học phí (tuition.html)
│   │   ├── Hồ sơ và đổi mật khẩu (profile.html)
│   │   ├── Thông báo mẫu (notifications.html)
│   │   └── Hướng dẫn (help.html)
│   ├── Học sinh (student/)
│   │   ├── Tổng quan (dashboard.html)
│   │   ├── Lịch học (schedule.html)
│   │   ├── Điểm danh (attendance.html)
│   │   ├── Kết quả học tập (grades.html)
│   │   ├── Bài tập (assignments.html)
│   │   ├── Hồ sơ và đổi mật khẩu (profile.html)
│   │   ├── Thông báo mẫu (notifications.html)
│   │   └── Hướng dẫn (help.html)
│   └── Phụ huynh (parent/)
│       ├── Tổng quan (dashboard.html)
│       ├── Lịch học (schedule.html)
│       ├── Điểm danh (attendance.html)
│       ├── Học phí (tuition.html)
│       ├── Hồ sơ và đổi mật khẩu (profile.html)
│       ├── Thông báo mẫu (notifications.html)
│       └── Hướng dẫn (help.html)
├── Dịch vụ máy chủ (backend/)
│   ├── Ứng dụng API (app/)
│   │   ├── Điểm vào và các API (main.py)
│   │   ├── Khai báo gói Python (__init__.py)
│   │   ├── Kiểu dữ liệu API (schemas.py)
│   │   ├── Bảo mật (security.py)
│   │   ├── Kết nối cơ sở dữ liệu (db.py)
│   │   └── Cấu hình (config.py)
│   ├── Công cụ quản trị (scripts/)
│   │   └── Tạo tài khoản giáo viên (bootstrap_teacher.py)
│   ├── Danh sách thư viện Python (requirements.txt)
│   ├── Mẫu cấu hình local (.env.example)
│   └── Cấu hình local, không chia sẻ (.env)
└── Cơ sở dữ liệu (database/)
    ├── Cấu trúc bảng và view (schema.sql)
    └── Tài khoản thử nghiệm local (seed_test_accounts.sql)
```

### Cơ sở dữ liệu SQL
- **Lược đồ:** [`database/schema.sql`](./database/schema.sql) dành cho PostgreSQL 14 trở lên.
- **Backend:** FastAPI ở `backend/app/`, dùng psycopg để kết nối PostgreSQL. API hiện có cho đăng nhập/phiên, tài khoản và hồ sơ, lớp/ghi danh, buổi học/điểm danh, bài tập/bài nộp/điểm, học phí/thanh toán, thông báo và dashboard theo vai trò.
- **Tính toàn vẹn:** Khóa ngoại, chỉ mục và `CHECK` constraints; điểm trong khoảng 0–10 theo bước 0,5. View `v_tuition_invoice_balances` tính số đã thu, số còn lại và tình trạng hóa đơn từ các giao dịch.
- **Bảo mật:** Trước khi lưu PostgreSQL, mỗi mật khẩu được băm bằng scrypt với salt ngẫu nhiên, riêng biệt 16 byte; salt và giá trị băm được lưu cùng nhau để xác minh khi đăng nhập (không lưu mật khẩu gốc). API dùng bearer session token ngẫu nhiên, chỉ lưu hash token trong PostgreSQL. Không có đăng ký công khai; tài khoản học sinh/phụ huynh do giáo viên tạo. Dữ liệu mockup chứa mật khẩu thô đã được gỡ khỏi frontend.
- **Chống dò mật khẩu:** Mỗi tài khoản có tối đa 3 lần nhập sai mật khẩu liên tiếp. Ở lần sai thứ ba, API lưu bộ đếm và thời điểm mở khóa trong PostgreSQL, trả cảnh báo khóa tài khoản 15 phút; trong thời gian này, yêu cầu đăng nhập bằng tài khoản đó bị từ chối. Đăng nhập thành công trước khi chạm ngưỡng sẽ xóa bộ đếm. Để áp dụng cho cơ sở dữ liệu đã tạo trước đó, chạy lại `database/schema.sql`; lệnh bổ sung các cột còn thiếu mà không xóa dữ liệu hiện có.
- **Chính sách mật khẩu:** Mật khẩu mới phải có ít nhất 8 ký tự, chữ hoa A-Z, chữ số 0-9 và ký tự đặc biệt (không tính khoảng trắng). API kiểm tra các điều kiện này khi tạo tài khoản hoặc đổi mật khẩu.
- **Đổi mật khẩu:** Giáo viên, phụ huynh và học sinh có trang/tab đổi mật khẩu riêng trong hồ sơ (`profile.html#password`). Biểu mẫu hiển thị checklist cập nhật theo lúc gõ và thanh đo độ mạnh (Yếu/Trung bình/Mạnh); cần nhập mật khẩu hiện tại, mật khẩu mới đạt chính sách và xác nhận mật khẩu. Các phiên đăng nhập bị thu hồi sau khi đổi.
- **Trung tâm hướng dẫn:** Mỗi vai trò có trang trợ giúp riêng tại `pages/teacher/help.html`, `pages/student/help.html` và `pages/parent/help.html`; liên kết được đặt trong thanh điều hướng của các trang cùng vai trò.
- **Thông báo:** Các trang của giáo viên, học sinh và phụ huynh nạp danh sách từ `/api/notifications`; bộ lọc và trạng thái đã đọc đồng bộ với backend. Badge trên thanh điều hướng và chấm chuông hiển thị theo số chưa đọc từ `/api/notifications/unread-count`.
- **Đăng xuất:** Nút đăng xuất ở cuối thanh bên trên các trang giáo viên, học sinh và phụ huynh gọi API thu hồi phiên rồi quay về trang đăng nhập; biểu tượng đã được đồng bộ giữa các vai trò.
- **Số liệu tổng hợp:** Sĩ số, điểm trung bình, chuyên cần và công nợ được tính từ dữ liệu gốc, không lưu trùng.

#### Chạy backend trên Windows
1. Cài PostgreSQL 14+ và Python 3.11+.
2. Tạo database PostgreSQL (mặc định `lopminh`, hoặc dùng tên database trong cấu hình local), sau đó từ thư mục gốc dự án chạy:
   ```powershell
   py -m venv .venv
   .venv\Scripts\Activate.ps1
   python -m pip install -r backend\requirements.txt
   ```
3. Sao chép `backend\.env.example` thành `backend\.env`, rồi chỉnh `DATABASE_URL` theo tài khoản và database PostgreSQL của bạn. Tệp `.env` chỉ được FastAPI nạp khi khởi chạy; để dùng cùng kết nối trong PowerShell/`psql`, đặt biến môi trường cho terminal:
   ```powershell
   $env:DATABASE_URL = "postgresql://<user>:<password>@localhost:5432/<database>"
   ```
4. Tạo bảng và view:
   ```powershell
   psql "$env:DATABASE_URL" -v ON_ERROR_STOP=1 -f database\schema.sql
   ```
5. Để đăng nhập bằng các tài khoản demo bên dưới, nạp dữ liệu thử nghiệm:
   ```powershell
   psql "$env:DATABASE_URL" -v ON_ERROR_STOP=1 -f database\seed_test_accounts.sql
   ```
   Nếu muốn tạo tài khoản giáo viên riêng thay vì demo, dùng lệnh dưới đây; mật khẩu được nhập ẩn và phải có ít nhất 10 ký tự:
   ```powershell
   python -m backend.scripts.bootstrap_teacher --username halinhgv --email halinh@example.com --name "Nguyễn Hà Linh"
   ```
6. Khởi chạy API ở cổng 8001 (frontend mặc định gọi cổng này):
   ```powershell
   python -m uvicorn backend.app.main:app --env-file backend\.env --reload --port 8001
   ```
   Kiểm tra API tại `http://127.0.0.1:8001/api/health`; tài liệu API ở `http://127.0.0.1:8001/docs`. Chạy giao diện ở terminal khác bằng `python -m http.server 3000`, rồi mở `http://localhost:3000`.

- Schema chỉ tạo cấu trúc, chưa nhập dữ liệu mockup; seed demo tạo ba tài khoản thử nghiệm và liên kết học sinh-phụ huynh nhưng không tạo dữ liệu lớp học.
- Chạy toàn bộ kiểm thử Python và JavaScript từ thư mục gốc: `python tests\run_all_tests.py` (cần Node.js trên `PATH` để chạy test JavaScript). Chỉ chạy test Python: `python -m unittest discover -s tests -p "test_*.py" -v`.
- **Trạng thái giao diện:** Đăng nhập, xác thực phiên và thông báo đã dùng API. Một số màn hình nghiệp vụ khác vẫn hiển thị dữ liệu mẫu hoặc chưa nối toàn bộ form/bảng vào API. Có thể kiểm tra và thao tác trực tiếp các endpoint qua `/docs`; không xem dữ liệu mẫu trên những màn hình đó là dữ liệu PostgreSQL.

---

## 👥 2. DANH SÁCH THÀNH VIÊN, PHÂN CÔNG VÀ TIẾN ĐỘ

| STT | Họ và tên | MSSV | Lớp | Vai trò | Phân công chính | Tiến độ theo mã nguồn |
| :---: | :--- | :---: | :---: | :---: | :--- | :--- |
| **1** | **Nguyễn Ngọc Thanh** | **50.01.103.068** | 50.01.SPTIN.A | **Nhóm trưởng** | **Kiến trúc, UC-01 (Đăng nhập), UC-02 (Tài khoản/RBAC), bảo mật, backend dùng chung, hồ sơ/đổi mật khẩu, hướng dẫn, đăng xuất và giao diện thông báo ba vai trò** | **Hoàn thành các hạng mục được liệt kê chi tiết bên dưới. Trang thông báo hiện là giao diện mẫu, chưa đồng bộ với API.** |
| **2** | **Phạm Nguyễn Hoàng Kim** | **50.01.103.035** | 50.01.SPTIN.A | Thành viên | **Quản lý lớp (UC-03) & thời khóa biểu (UC-04)** | Phân công module; cần kiểm thử luồng giao diện–API end-to-end trước khi ghi nhận hoàn tất. |
| **3** | **Nguyễn Châu Thanh Thảo** | **50.01.103.069** | 50.01.SPTIN.B | Thành viên | **Danh sách học sinh (UC-05) & điểm danh (UC-06)** | Phân công module; cần kiểm thử luồng giao diện–API end-to-end trước khi ghi nhận hoàn tất. |
| **4** | **Nguyễn Duy Khánh Lân** | **50.01.103.036** | 50.01.SPTIN.B | Thành viên | **Đánh giá, bài tập (UC-07), sổ điểm và tiến bộ (UC-08, UC-11)** | Phân công module; cần kiểm thử luồng giao diện–API end-to-end trước khi ghi nhận hoàn tất. |
| **5** | **Võ Trần Gia Bảo** | **50.01.103.004** | 50.01.SPTIN.B | Thành viên | **Quản lý học phí (UC-09) & hóa đơn đối soát công nợ (UC-12)** | Phân công module; cần kiểm thử luồng giao diện–API end-to-end trước khi ghi nhận hoàn tất. |

> **Cách đọc tiến độ:** “Hoàn thành” bên dưới nghĩa là hạng mục đã có trong mã nguồn. Với phần giao diện mẫu, điều đó không đồng nghĩa đã nối dữ liệu thật hoặc đã được kiểm thử trên PostgreSQL. Các module của thành viên khác vẫn được giữ theo phân công; chưa đánh dấu hoàn tất nghiệp vụ end-to-end khi chưa có kiểm chứng.

---

### 📋 CHI TIẾT PHÂN CÔNG THEO TỪNG MÀN HÌNH GIAO DIỆN (THEO PDF)

#### 1. Nguyễn Ngọc Thanh (Nhóm trưởng)
* **Đã hoàn thành theo mã nguồn:**
  * **Đăng nhập và phân quyền:** đăng nhập bằng API, xác thực phiên, giới hạn vai trò theo trang và đăng xuất/thu hồi phiên.
  * **Bảo mật tài khoản:** scrypt với salt ngẫu nhiên; khóa đăng nhập 15 phút sau 3 lần sai; API đổi mật khẩu và chính sách mật khẩu mới.
  * **Quản lý tài khoản (UC-02):** danh sách học sinh/phụ huynh lấy từ API; tạo tài khoản, liên kết phụ huynh hiện có với học sinh, đặt lại mật khẩu theo chính sách và thu hồi các phiên đăng nhập cũ.
  * **Backend và dữ liệu nền tảng:** FastAPI kết nối PostgreSQL; schema tài khoản/hồ sơ và các nhóm API nghiệp vụ được triển khai trong `backend/app/`; script tạo tài khoản demo ở `database/seed_test_accounts.sql`.
  * **Hồ sơ và đổi mật khẩu:** các trang hồ sơ cho giáo viên, học sinh, phụ huynh; checklist và thanh đo độ mạnh mật khẩu.
  * **Trung tâm hướng dẫn và điều hướng:** trang hướng dẫn theo từng vai trò; liên kết trong sidebar; biểu tượng đăng xuất học sinh/phụ huynh đồng bộ.
  * **Thông báo:** trang của cả ba vai trò gọi API `/api/notifications`, lọc trạng thái/danh mục và lưu trạng thái đã đọc qua API. Mục thông báo trong sidebar điều hướng tới trang tương ứng.
  * **Tài liệu và kiểm thử bảo mật:** README hướng dẫn chạy hệ thống; có kiểm thử backend cho hashing/salt, khóa đăng nhập và kiểm tra một số hợp đồng API.
* **Chưa hoàn thành:**
  * Chưa xác minh toàn bộ các luồng đăng nhập/nghiệp vụ chạy end-to-end trên PostgreSQL với dữ liệu thật.
* **Trang phụ trách:**
  * [`index.html`](file:///d:/project_cnpm/index.html) (Trang 1 PDF): Màn hình Đăng nhập 2 cột, kiểm tra tài khoản, điều hướng 3 vai trò.
  * [`pages/teacher/users.html`](file:///d:/project_cnpm/pages/teacher/users.html) (Trang 4, 15, 22 PDF): Danh sách tài khoản học sinh/phụ huynh lấy từ API; tạo tài khoản học sinh hoặc phụ huynh; liên kết tài khoản phụ huynh hiện có và đặt lại mật khẩu.
  * `pages/teacher/profile.html` (Trang 19, 20 PDF): Hồ sơ giáo viên và form đổi mật khẩu.
  * `pages/student/profile.html`, `pages/parent/profile.html`: hồ sơ và đổi mật khẩu cho học sinh/phụ huynh.
  * `pages/teacher/help.html`, `pages/student/help.html`, `pages/parent/help.html`: trung tâm hướng dẫn theo vai trò.
  * `pages/teacher/notifications.html`, `pages/student/notifications.html`, `pages/parent/notifications.html`: giao diện thông báo mẫu theo vai trò.
* **Code/API phụ trách:** `assets/js/auth.js`, `assets/js/modules/teacher/user-management.js`, `assets/js/notifications.js`, `backend/app/`, `database/schema.sql`, `database/seed_test_accounts.sql`.

#### 2. Phạm Nguyễn Hoàng Kim
* **Trang phụ trách:**
  * [`pages/teacher/classes.html`](file:///d:/project_cnpm/pages/teacher/classes.html) (Trang 3, 12, 13, 14, 21 PDF): Danh sách 6 lớp học; Modal Tạo lớp mới (Sĩ số ban đầu 0); Modal Chỉnh sửa lớp; Modal Chi tiết lớp học (TO10A - 20 học sinh); Modal Xác nhận lưu trữ/đóng lớp học.
  * [`pages/teacher/schedule.html`](file:///d:/project_cnpm/pages/teacher/schedule.html) (Trang 5, 16 PDF): Lưới thời khóa biểu tuần 19-25/10; Modal popup xem chi tiết buổi học (phòng học, nội dung, nút chuyển sang điểm danh).
  * [`pages/parent/schedule.html`](file:///d:/project_cnpm/pages/parent/schedule.html) & [`pages/student/schedule.html`](file:///d:/project_cnpm/pages/student/schedule.html) (Trang 25, 32, 33 PDF): Tra cứu TKB cho học sinh và phụ huynh.
* **Thẻ phụ trách:** Giáo viên: tổng số lớp và lịch dạy sắp tới; học sinh: lịch học sắp tới; phụ huynh: lịch học sắp tới của con.
* **Code khoét lỗ:** `assets/js/modules/teacher/class-management.js`, `assets/js/modules/teacher/schedule.js`.

#### 3. Nguyễn Châu Thanh Thảo
* **Trang phụ trách:**
  * [`pages/teacher/attendance.html`](file:///d:/project_cnpm/pages/teacher/attendance.html) (Trang 6 PDF): Sổ điểm danh điện tử 1 chạm với 4 nút (`Có mặt`, `Vắng`, `Trễ`, `Có phép`), 4 thẻ đếm sĩ số chuyên cần, nút `Tất cả có mặt`, ô nhập ghi chú từng học sinh.
  * [`pages/parent/attendance.html`](file:///d:/project_cnpm/pages/parent/attendance.html) (Trang 26 PDF): Lịch sử điểm danh của con, thanh tiến trình tỷ lệ chuyên cần 4 màu, bảng chi tiết 12 buổi học.
  * [`pages/student/attendance.html`](file:///d:/project_cnpm/pages/student/attendance.html) (Trang 30, 34 PDF): Cổng điểm danh chuyên cần của học sinh (77.8% chuyên cần).
* **Thẻ phụ trách:** Giáo viên: số học sinh và điểm danh gần đây; học sinh: tình trạng tham gia/chuyên cần; phụ huynh: tóm tắt tình hình điểm danh của con.
* **Code khoét lỗ:** `assets/js/modules/teacher/attendance.js`, `assets/js/modules/teacher/student-list.js`.

#### 4. Nguyễn Duy Khánh Lân
* **Trang phụ trách:**
  * [`pages/teacher/grades.html`](file:///d:/project_cnpm/pages/teacher/grades.html) (Trang 7, 8, 9 PDF):
    - Quản lý bài kiểm tra & bài tập (Trang 7).
    - Nhập điểm & nhận xét chi tiết (Trang 8): Thang 0-10 bước 0.5, ghi nhận xét, hộp bắt buộc lưu vết lý do chỉnh sửa điểm cũ.
    - Tiến bộ học sinh (Trang 9): Biểu đồ đường thời gian, bảng lịch sử thay đổi điểm (Ai sửa, lúc nào, điểm cũ -> điểm mới, lý do).
  * [`pages/student/grades.html`](file:///d:/project_cnpm/pages/student/grades.html) (Trang 35, 36 PDF): Xem kết quả học tập & phân tích điểm chi tiết từng câu trong bài kiểm tra (Câu 1, 2, 3, 4).
  * [`pages/student/assignments.html`](file:///d:/project_cnpm/pages/student/assignments.html) (Trang 37, 38 PDF): Danh sách bài tập và khu vực Drag & Drop nộp file bài làm PDF/ảnh.
* **Thẻ phụ trách:** Giáo viên: tóm tắt điểm/bài tập của lớp nếu có dữ liệu tương ứng; học sinh: điểm trung bình, điểm gần đây, tiến bộ và bài tập chưa nộp; phụ huynh: điểm trung bình/điểm mới nhất và tiến bộ học tập của con.
* **Code khoét lỗ:** `assets/js/modules/teacher/exam-homework.js`, `assets/js/modules/teacher/grade-entry.js`, `assets/js/modules/student/grade-progress.js`.

#### 5. Võ Trần Gia Bảo
* **Trang phụ trách:**
  * [`pages/teacher/tuition.html`](file:///d:/project_cnpm/pages/teacher/tuition.html) (Trang 10, 11, 17, 18 PDF):
    - Quản lý học phí tháng 10: 76.4M đ Phải thu, 68.4M đ Đã thu, 8.0M đ Còn lại (Trang 10).
    - Modal ghi nhận đã nhận tiền mặt/chuyển khoản ngoài hệ thống (Trang 11).
    - Modal chi tiết học phí học sinh và lịch sử các lần nộp (Trang 17, 18).
  * [`pages/parent/tuition.html`](file:///d:/project_cnpm/pages/parent/tuition.html) (Trang 27 PDF): Cổng học phí phụ huynh, thanh đối soát tiến độ đóng 66.7%, bảng lịch sử đóng phí minh bạch.
  * [`pages/parent/notifications.html`](file:///d:/project_cnpm/pages/parent/notifications.html) (Trang 28 PDF): Báo phí và nhắc nhở hạn nộp học phí gửi tới phụ huynh.
* **Thẻ Tổng phụ trách:** Giáo viên: tổng học phí phải thu/đã thu/còn lại và học sinh cần theo dõi; phụ huynh: học phí còn phải đóng và hạn thanh toán. Dashboard học sinh hiện không có thẻ học phí.
* **Code khoét lỗ:** `assets/js/modules/teacher/tuition-fee.js`, `assets/js/modules/parent/tuition-invoice.js`.

---

## 🚀 3. HƯỚNG DẪN KHỞI CHẠY VÀ KIỂM THỬ

1. **Khởi chạy trực tiếp:** Mở tệp [`index.html`](file:///d:/project_cnpm/index.html) bằng bất kỳ trình duyệt nào.
2. **Khởi chạy qua HTTP Server:**
   ```powershell
   python -m http.server 3000
   ```
   Truy cập: `http://localhost:3000`

### Tạo tài khoản thử nghiệm

Sau khi đã áp dụng `database/schema.sql`, chạy từ thư mục gốc dự án:
```powershell
psql "$env:DATABASE_URL" -v ON_ERROR_STOP=1 -f database\seed_test_accounts.sql
```

Các tài khoản đăng nhập (mật khẩu chung `123`):
- **Giáo viên:** `giaovien@lopminh.edu.vn` hoặc `teacher`
- **Học sinh:** `hocsinh@lopminh.edu.vn` hoặc `student`
- **Phụ huynh:** `phuhuynh@lopminh.edu.vn` hoặc `parent`

Script cũng tạo hồ sơ học sinh mã `HS001` và liên kết phụ huynh với học sinh đó. Mật khẩu được lưu dưới dạng scrypt hash với salt riêng cho từng tài khoản. Các thông tin đăng nhập yếu này chỉ dùng local/dev; tuyệt đối không chạy seed hoặc dùng tài khoản này trên production. Có thể chạy lại script để đặt lại mật khẩu thử nghiệm và mở khóa tài khoản.
