"""Generate the Word (.docx) report for Section 5.1 & 5.2 of Project_CNPM."""
import os
import docx
from docx import Document
from docx.shared import Inches, Pt, RGBColor
from docx.enum.text import WD_ALIGN_PARAGRAPH
from docx.enum.table import WD_TABLE_ALIGNMENT, WD_ALIGN_VERTICAL
from docx.oxml import OxmlElement, parse_xml
from docx.oxml.ns import nsdecls, qn

def set_cell_margins(cell, top=100, bottom=100, left=150, right=150):
    """Set cell padding in dxa (1 pt = 20 dxa)."""
    tcPr = cell._tc.get_or_add_tcPr()
    tcMar = OxmlElement('w:tcMar')
    for m, val in [('w:top', top), ('w:bottom', bottom), ('w:left', left), ('w:right', right)]:
        node = OxmlElement(m)
        node.set(qn('w:w'), str(val))
        node.set(qn('w:type'), 'dxa')
        tcMar.append(node)
    tcPr.append(tcMar)

def set_cell_shading(cell, color_hex):
    """Set cell background color."""
    shading_elm = parse_xml(f'<w:shd {nsdecls("w")} w:fill="{color_hex}"/>')
    cell._tc.get_or_add_tcPr().append(shading_elm)

def set_cell_borders(cell, top=None, bottom=None, left=None, right=None):
    """Set cell borders with XML."""
    tcPr = cell._tc.get_or_add_tcPr()
    tcBorders = OxmlElement('w:tcBorders')
    
    borders = {'top': top, 'bottom': bottom, 'left': left, 'right': right}
    for b_name, b_val in borders.items():
        if b_val:
            node = OxmlElement(f'w:{b_name}')
            node.set(qn('w:val'), b_val.get('val', 'single'))
            node.set(qn('w:sz'), str(b_val.get('sz', 4)))
            node.set(qn('w:space'), '0')
            node.set(qn('w:color'), b_val.get('color', 'CCCCCC'))
            tcBorders.append(node)
        else:
            node = OxmlElement(f'w:{b_name}')
            node.set(qn('w:val'), 'none')
            tcBorders.append(node)
    tcPr.append(tcBorders)

def add_hyperlink(paragraph, url, text, color="004B91", underline=True):
    """Add a clickable hyperlink to a Word paragraph."""
    part = paragraph.part
    r_id = part.relate_to(url, docx.opc.constants.RELATIONSHIP_TYPE.HYPERLINK, is_external=True)

    hyperlink = parse_xml(f'<w:hyperlink {nsdecls("w", "r")} r:id="{r_id}" w:history="1"/>')
    new_run = parse_xml(f'<w:r {nsdecls("w")}/>')
    rPr = parse_xml(f'<w:rPr {nsdecls("w")}/>')

    if color:
        c = parse_xml(f'<w:color {nsdecls("w")} w:val="{color}"/>')
        rPr.append(c)
    if underline:
        u = parse_xml(f'<w:u {nsdecls("w")} w:val="single"/>')
        rPr.append(u)
    
    # Times New Roman
    rFonts = parse_xml(f'<w:rFonts {nsdecls("w")} w:ascii="Times New Roman" w:hAnsi="Times New Roman" w:cs="Times New Roman"/>')
    rPr.append(rFonts)

    sz = parse_xml(f'<w:sz {nsdecls("w")} w:val="21"/>') # 10.5 pt
    rPr.append(sz)

    new_run.append(rPr)
    new_run_text = parse_xml(f'<w:t {nsdecls("w")}>{text}</w:t>')
    new_run.append(new_run_text)
    hyperlink.append(new_run)
    paragraph._p.append(hyperlink)

def create_report(output_path):
    doc = Document()

    # Page setup: A4, Margins: Left 3cm, Right 2cm, Top 2cm, Bottom 2cm
    for section in doc.sections:
        section.page_width = Inches(8.27)   # 21.0 cm
        section.page_height = Inches(11.69) # 29.7 cm
        section.top_margin = Inches(0.79)    # 2.0 cm
        section.bottom_margin = Inches(0.79) # 2.0 cm
        section.left_margin = Inches(1.18)   # 3.0 cm
        section.right_margin = Inches(0.79)  # 2.0 cm

    # Base style
    style_normal = doc.styles['Normal']
    font = style_normal.font
    font.name = 'Times New Roman'
    font.size = Pt(12)
    font.color.rgb = RGBColor(0x1A, 0x1A, 0x1A)

    # 1. Chapter Title
    p_chap = doc.add_paragraph()
    p_chap.paragraph_format.space_before = Pt(0)
    p_chap.paragraph_format.space_after = Pt(12)
    p_chap.paragraph_format.line_spacing = 1.3
    run_chap = p_chap.add_run("CHƯƠNG 5: XÂY DỰNG CHƯƠNG TRÌNH MINH HỌA")
    run_chap.bold = True
    run_chap.font.size = Pt(14)
    run_chap.font.color.rgb = RGBColor(0x00, 0x00, 0x00)

    # 2. Section 5.1
    p_sec1 = doc.add_paragraph()
    p_sec1.paragraph_format.space_before = Pt(6)
    p_sec1.paragraph_format.space_after = Pt(8)
    p_sec1.paragraph_format.line_spacing = 1.3
    run_sec1 = p_sec1.add_run("5.1. Thư viện và công cụ sử dụng")
    run_sec1.bold = True
    run_sec1.font.size = Pt(13)
    run_sec1.font.color.rgb = RGBColor(0x00, 0x00, 0x00)

    # Introductory text
    p_intro = doc.add_paragraph()
    p_intro.paragraph_format.space_before = Pt(0)
    p_intro.paragraph_format.space_after = Pt(10)
    p_intro.paragraph_format.line_spacing = 1.5
    p_intro.paragraph_format.alignment = WD_ALIGN_PARAGRAPH.JUSTIFY
    run_intro = p_intro.add_run(
        "Trong quá trình phát triển ứng dụng quản lý lớp học thêm (hệ thống \"Lớp Mình\"), nhóm chúng em đã sử dụng "
        "các ngôn ngữ lập trình, framework, thư viện, công cụ phát triển và cơ sở dữ liệu phù hợp để đảm bảo tính hiệu quả, "
        "bảo mật và dễ bảo trì. Các công cụ được chọn dựa trên yêu cầu dự án, bao gồm frontend xây dựng trên nền tảng Web "
        "hiện đại (HTML5, CSS3, JavaScript ES6+, Feather Icons), backend dựa trên Python với framework FastAPI và máy chủ "
        "ASGI Uvicorn, cùng hệ quản trị cơ sở dữ liệu quan hệ mạnh mẽ PostgreSQL (v14+). Dưới đây là danh sách chi tiết các "
        "thư viện và công cụ được sử dụng, được trình bày dưới dạng bảng."
    )
    run_intro.font.size = Pt(12)

    # Table data: (Mục đích, Công cụ, Danh sách [(text, url)])
    table_data = [
        ("Môi trường", [
            ("Python (v3.11+)", "https://www.python.org/"),
            ("Node.js (v20+)", "https://nodejs.org/")
        ]),
        ("Ngôn ngữ lập trình", [
            ("Python (v3.11.6)", "https://www.python.org/"),
            ("JavaScript (ES6+ / CommonJS)", "https://developer.mozilla.org/en-US/docs/Web/JavaScript"),
            ("HTML5 / CSS3", "https://developer.mozilla.org/"),
            ("SQL (PostgreSQL Dialect)", "https://www.postgresql.org/docs/")
        ]),
        ("Framework frontend", [
            ("HTML5 Semantic & Vanilla CSS3", "https://developer.mozilla.org/"),
            ("CSS Design System (Variables, Flexbox, Grid)", "https://developer.mozilla.org/en-US/docs/Web/CSS")
        ]),
        ("Build tool & Local server frontend", [
            ("Python HTTP Server (http.server v3.11+)", "https://docs.python.org/3/library/http.server.html")
        ]),
        ("CSS framework", [
            ("Custom Modular CSS Architecture", "https://developer.mozilla.org/en-US/docs/Web/CSS")
        ]),
        ("UI icons library", [
            ("Feather Icons (v4.29.0)", "https://feathericons.com/")
        ]),
        ("Charts & Visualization library", [
            ("HTML5 Canvas & Dynamic SVG", "https://developer.mozilla.org/en-US/docs/Web/API/Canvas_API")
        ]),
        ("Routing library & Access control", [
            ("Client-side Router & Auth Guard (auth.js)", "https://developer.mozilla.org/en-US/docs/Web/API/History_API")
        ]),
        ("Notification library", [
            ("Custom Modal & Toast Notifications", "https://developer.mozilla.org/en-US/docs/Web/API/Notifications_API")
        ]),
        ("HTTP client", [
            ("Fetch API (Native Browser Web API)", "https://developer.mozilla.org/en-US/docs/Web/API/Fetch_API")
        ]),
        ("Typography / Phông chữ", [
            ("Google Fonts (Inter font family)", "https://fonts.google.com/specimen/Inter")
        ]),
        ("Image upload & File handling", [
            ("FormData API & File API (Native Web API)", "https://developer.mozilla.org/en-US/docs/Web/API/FormData")
        ]),
        ("Client-side storage", [
            ("Web Storage API (LocalStorage)", "https://developer.mozilla.org/en-US/docs/Web/API/Window/localStorage")
        ]),
        ("Environment variables", [
            ("Python os & Dotenv configuration (.env)", "https://fastapi.tiangolo.com/advanced/settings/")
        ]),
        ("Framework backend", [
            ("FastAPI (v0.115.0+)", "https://fastapi.tiangolo.com/")
        ]),
        ("Web server backend", [
            ("Uvicorn [standard] (v0.30.0+)", "https://www.uvicorn.org/")
        ]),
        ("Trình kết nối CSDL (Database Driver)", [
            ("Psycopg 3 (psycopg[binary] v3.2.0+)", "https://www.psycopg.org/")
        ]),
        ("ORM & Data Validation", [
            ("Pydantic (v2.x)", "https://docs.pydantic.dev/")
        ]),
        ("Authentication & Security", [
            ("Hashlib & Secrets (scrypt KDF, Salt 16-byte)", "https://docs.python.org/3/library/hashlib.html")
        ]),
        ("Session management", [
            ("Bearer Session Token (SHA-256 token hash)", "https://datatracker.ietf.org/doc/html/rfc6750")
        ]),
        ("File upload backend", [
            ("Python-multipart (v0.0.12+)", "https://github.com/Kludex/python-multipart")
        ]),
        ("Hỗ trợ & Liên hệ trung tâm", [
            ("Parent Hotline 028 3822 8888 & Help Center", "https://lopminh.edu.vn/")
        ]),
        ("Caching & State persistence", [
            ("PostgreSQL Sessions & Browser LocalStorage", "https://www.postgresql.org/")
        ]),
        ("Unique ID generator", [
            ("UUID v4 (Python uuid module)", "https://docs.python.org/3/library/uuid.html")
        ]),
        ("CORS handling", [
            ("FastAPI CORSMiddleware", "https://fastapi.tiangolo.com/tutorial/cors/")
        ]),
        ("Rate limiting & Brute-force protection", [
            ("Lockout sau 3 lần sai / 15 phút (FastAPI & DB)", "https://fastapi.tiangolo.com/")
        ]),
        ("API documentation", [
            ("Swagger UI / OpenAPI 3.0", "https://swagger.io/"),
            ("ReDoc", "https://redocly.com/")
        ]),
        ("Development server", [
            ("Uvicorn Auto-reload (Backend)", "https://www.uvicorn.org/"),
            ("Python HTTP Server (Frontend)", "https://docs.python.org/3/library/http.server.html")
        ]),
        ("Kiểm thử tự động (Automated testing)", [
            ("Python Unittest (API contracts, schema, security)", "https://docs.python.org/3/library/unittest.html"),
            ("Node.js Test Runner (node --test cho frontend)", "https://nodejs.org/api/test.html")
        ]),
        ("Cơ sở dữ liệu chính", [
            ("PostgreSQL (v14+)", "https://www.postgresql.org/")
        ]),
        ("Cơ sở dữ liệu cấu trúc linh hoạt", [
            ("PostgreSQL JSONB (Lưu vết thay đổi điểm & kiểm tra)", "https://www.postgresql.org/docs/current/datatype-json.html")
        ]),
        ("Kịch bản điều phối & Tự động hóa", [
            ("PowerShell (v5.1 / v7+) (run_project.ps1)", "https://learn.microsoft.com/powershell/")
        ]),
        ("IDE lập trình", [
            ("Visual Studio Code (v1.90+)", "https://code.visualstudio.com/")
        ]),
        ("Version control", [
            ("Git (v2.56.0.windows.4)", "https://git-scm.com/")
        ]),
        ("Remote repository", [
            ("GitHub", "https://github.com/")
        ]),
        ("Package manager", [
            ("PIP (Python Package Installer v23.2+)", "https://pip.pypa.io/")
        ]),
        ("Công cụ soạn thảo báo cáo", [
            ("XeLaTeX / LaTeX (TeX Live)", "https://www.latex-project.org/"),
            ("Microsoft Word", "https://www.microsoft.com/microsoft-365/word")
        ])
    ]

    # Create Table
    col_widths = [Inches(1.5), Inches(2.2), Inches(2.7)] # Total = 6.4 inches ~ 16.2 cm
    table = doc.add_table(rows=1, cols=3)
    table.alignment = WD_TABLE_ALIGNMENT.CENTER
    table.autofit = False

    # Prevent row splitting across pages & repeat header
    header_tr = table.rows[0]._tr.get_or_add_trPr()
    header_tr.append(parse_xml(f'<w:tblHeader {nsdecls("w")}/>'))
    header_tr.append(parse_xml(f'<w:cantSplit {nsdecls("w")}/>'))

    # Header Row
    headers = ["Mục đích", "Công cụ", "Địa chỉ URL"]
    border_spec = {'val': 'single', 'sz': 4, 'color': '808080'}
    for i, title in enumerate(headers):
        cell = table.rows[0].cells[i]
        cell.width = col_widths[i]
        set_cell_shading(cell, "EBF1F5") # Light soft gray-blue
        set_cell_margins(cell, top=140, bottom=140, left=150, right=150)
        set_cell_borders(cell, top=border_spec, bottom=border_spec, left=border_spec, right=border_spec)
        p = cell.paragraphs[0]
        p.alignment = WD_ALIGN_PARAGRAPH.CENTER
        p.paragraph_format.space_before = Pt(0)
        p.paragraph_format.space_after = Pt(0)
        p.paragraph_format.line_spacing = 1.15
        run = p.add_run(title)
        run.bold = True
        run.font.name = 'Times New Roman'
        run.font.size = Pt(11)
        run.font.color.rgb = RGBColor(0x00, 0x00, 0x00)

    # Data Rows
    for row_idx, (purpose, tools) in enumerate(table_data):
        row = table.add_row()
        tr_pr = row._tr.get_or_add_trPr()
        tr_pr.append(parse_xml(f'<w:cantSplit {nsdecls("w")}/>'))

        c0 = row.cells[0]
        c1 = row.cells[1]
        c2 = row.cells[2]

        c0.width = col_widths[0]
        c1.width = col_widths[1]
        c2.width = col_widths[2]

        for c in (c0, c1, c2):
            set_cell_margins(c, top=100, bottom=100, left=140, right=140)
            set_cell_borders(c, top=border_spec, bottom=border_spec, left=border_spec, right=border_spec)

        # Col 0: Purpose
        p0 = c0.paragraphs[0]
        p0.alignment = WD_ALIGN_PARAGRAPH.LEFT
        p0.paragraph_format.space_before = Pt(0)
        p0.paragraph_format.space_after = Pt(0)
        p0.paragraph_format.line_spacing = 1.15
        r0 = p0.add_run(purpose)
        r0.font.name = 'Times New Roman'
        r0.font.size = Pt(10.5)

        # Col 1: Tools
        p1 = c1.paragraphs[0]
        p1.alignment = WD_ALIGN_PARAGRAPH.LEFT
        p1.paragraph_format.space_before = Pt(0)
        p1.paragraph_format.space_after = Pt(0)
        p1.paragraph_format.line_spacing = 1.15
        for idx, (t_name, _) in enumerate(tools):
            if idx > 0:
                p1 = c1.add_paragraph()
                p1.alignment = WD_ALIGN_PARAGRAPH.LEFT
                p1.paragraph_format.space_before = Pt(2)
                p1.paragraph_format.space_after = Pt(0)
                p1.paragraph_format.line_spacing = 1.15
            r1 = p1.add_run(t_name)
            r1.font.name = 'Times New Roman'
            r1.font.size = Pt(10.5)

        # Col 2: URLs
        p2 = c2.paragraphs[0]
        p2.alignment = WD_ALIGN_PARAGRAPH.LEFT
        p2.paragraph_format.space_before = Pt(0)
        p2.paragraph_format.space_after = Pt(0)
        p2.paragraph_format.line_spacing = 1.15
        for idx, (_, t_url) in enumerate(tools):
            if idx > 0:
                p2 = c2.add_paragraph()
                p2.alignment = WD_ALIGN_PARAGRAPH.LEFT
                p2.paragraph_format.space_before = Pt(2)
                p2.paragraph_format.space_after = Pt(0)
                p2.paragraph_format.line_spacing = 1.15
            add_hyperlink(p2, t_url, t_url)

    # Caption Bảng 5.1 (Centered, italic, matching sample)
    p_cap = doc.add_paragraph()
    p_cap.paragraph_format.space_before = Pt(6)
    p_cap.paragraph_format.space_after = Pt(16)
    p_cap.paragraph_format.alignment = WD_ALIGN_PARAGRAPH.CENTER
    run_cap = p_cap.add_run("Bảng 5.1. Thư viện và công cụ sử dụng")
    run_cap.italic = True
    run_cap.font.name = 'Times New Roman'
    run_cap.font.size = Pt(11)
    run_cap.font.color.rgb = RGBColor(0x33, 0x33, 0x33)

    # 3. Section 5.2
    p_sec2 = doc.add_paragraph()
    p_sec2.paragraph_format.space_before = Pt(10)
    p_sec2.paragraph_format.space_after = Pt(8)
    p_sec2.paragraph_format.line_spacing = 1.3
    run_sec2 = p_sec2.add_run("5.2. Kết quả chương trình minh họa")
    run_sec2.bold = True
    run_sec2.font.size = Pt(13)
    run_sec2.font.color.rgb = RGBColor(0x00, 0x00, 0x00)

    # Paragraph 1
    p_res1 = doc.add_paragraph()
    p_res1.paragraph_format.space_before = Pt(0)
    p_res1.paragraph_format.space_after = Pt(8)
    p_res1.paragraph_format.line_spacing = 1.5
    p_res1.paragraph_format.alignment = WD_ALIGN_PARAGRAPH.JUSTIFY
    run_res1 = p_res1.add_run(
        "Ứng dụng quản lý lớp học thêm (\"Lớp Mình\") đã được phát triển thành một hệ thống web hoàn chỉnh, "
        "mang lại giải pháp toàn diện cho việc tổ chức, điều hành và theo dõi các hoạt động dạy và học tại các "
        "lớp học tư thục từ đầu đến cuối, với khả năng hỗ trợ đa người dùng qua ba vai trò chuyên biệt: "
        "Giáo viên/Gia sư, Học sinh và Phụ huynh."
    )
    run_res1.font.size = Pt(12)

    # Paragraph 2
    p_res2 = doc.add_paragraph()
    p_res2.paragraph_format.space_before = Pt(0)
    p_res2.paragraph_format.space_after = Pt(8)
    p_res2.paragraph_format.line_spacing = 1.5
    p_res2.paragraph_format.alignment = WD_ALIGN_PARAGRAPH.JUSTIFY
    run_res2 = p_res2.add_run(
        "Kết quả đạt được là một sản phẩm phần mềm có cấu trúc module hóa rõ ràng, đóng gói hoàn chỉnh và sẵn sàng vận hành. "
        "Toàn bộ mã nguồn frontend được xây dựng trên nền tảng web hiện đại với HTML5, CSS3 có hệ thống biến màu sắc và "
        "bố cục nhất quán, kết hợp JavaScript ES6+ và Feather Icons nhằm mang lại trải nghiệm tương tác mượt mà, tối ưu "
        "hiệu năng tải trang và dễ dàng bảo trì mà không phụ thuộc vào framework cồng kềnh. Backend được phát triển trên "
        "nền Python với FastAPI và máy chủ ASGI Uvicorn, triển khai đầy đủ các API RESTful an toàn, có tài liệu trực quan "
        "tự động qua Swagger UI. Cơ sở dữ liệu quan hệ PostgreSQL (v14+) được chuẩn hóa với các ràng buộc toàn vẹn, chỉ mục tối ưu, "
        "view tự động đối soát công nợ học phí (v_tuition_invoice_balances), cùng các cơ chế bảo mật nghiêm ngặt như băm "
        "mật khẩu bằng thuật toán scrypt với salt ngẫu nhiên 16 byte, cơ chế tự động khóa đăng nhập 15 phút sau 3 lần thất bại "
        "liên tiếp, và quản lý phiên bằng Bearer session token băm SHA-256 lưu trong cơ sở dữ liệu. Toàn bộ hệ thống được bảo đảm "
        "chất lượng bởi kịch bản tự động hóa PowerShell và bộ kiểm thử tự động toàn diện kết hợp giữa Python unittest và "
        "Node.js test runner."
    )
    run_res2.font.size = Pt(12)

    # Paragraph 3
    p_res3 = doc.add_paragraph()
    p_res3.paragraph_format.space_before = Pt(0)
    p_res3.paragraph_format.space_after = Pt(12)
    p_res3.paragraph_format.line_spacing = 1.5
    p_res3.paragraph_format.alignment = WD_ALIGN_PARAGRAPH.JUSTIFY
    run_res3 = p_res3.add_run(
        "Ý nghĩa của sản phẩm nằm ở việc số hóa và chuẩn hóa toàn diện quy trình quản lý lớp học thêm truyền thống, "
        "xóa bỏ hoàn toàn các sai sót thủ công trong ghi chép sổ sách và tính toán học phí, đồng thời tăng cường sự kết nối "
        "mật thiết giữa giáo viên, phụ huynh và học sinh thông qua cơ chế thông báo và tra cứu tức thời. Vai trò cốt lõi "
        "của ứng dụng là cung cấp một nền tảng vận hành tập trung, minh bạch: hỗ trợ giáo viên tinh gọn tối đa các tác vụ "
        "hành chính (điểm danh một chạm, quản lý ngân hàng bài tập, sổ điểm điện tử, lập hóa đơn tự động); mang lại cho "
        "phụ huynh cổng thông tin đáng tin cậy để giám sát sát sao chuyên cần, tiến độ học tập và tình trạng học phí của con em; "
        "đồng thời trao quyền cho học sinh chủ động nắm bắt lịch học, nộp bài tập và theo dõi biểu đồ tiến bộ học tập của chính mình."
    )
    run_res3.font.size = Pt(12)

    doc.save(output_path)
    print(f"File created successfully at: {output_path}")

if __name__ == "__main__":
    root_dir = os.path.dirname(os.path.dirname(__file__))
    out_file_root = os.path.join(root_dir, "BaoCao_ThuVien_Va_CongCu_SuDung.docx")
    out_file_latex = os.path.join(root_dir, "latex", "BaoCao_ThuVien_Va_CongCu_SuDung.docx")
    create_report(out_file_root)
    create_report(out_file_latex)
    print("All Word report files generated successfully!")
