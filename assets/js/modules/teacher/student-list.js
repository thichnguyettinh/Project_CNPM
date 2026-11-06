/** UC-05: ghi danh học sinh vào lớp (không tạo/xóa tài khoản). */
const StudentListModule = {
  getClasses() { return AuthService.api('/classes'); },
  getAvailableStudents() { return AuthService.api('/users?role=student'); },
  createStudentAccount(payload) {
    return AuthService.api('/users', { method: 'POST', body: JSON.stringify({ ...payload, role: 'student' }) });
  },
  getClassSessions(classId) {
    return AuthService.api(`/sessions?class_id=${encodeURIComponent(classId)}`);
  },
  getStudentsByClass(classId) {
    return AuthService.api(`/classes/${encodeURIComponent(classId)}/students`);
  },
  addStudentToClass(classId, studentCode) {
    return AuthService.api(`/classes/${encodeURIComponent(classId)}/students`, {
      method: 'POST', body: JSON.stringify({ student_code: studentCode })
    });
  },
  
  getStudentTuitionInvoices(classId, studentCode) {
    return AuthService.api(
      `/tuition/invoices?class_id=${encodeURIComponent(classId)}&student_code=${encodeURIComponent(studentCode)}`
    );
  },

  removeStudentFromClass(classId, studentCode) {
    return AuthService.api(`/classes/${encodeURIComponent(classId)}/students/${encodeURIComponent(studentCode)}`, {
      method: 'DELETE'
    });
  }
};
window.StudentListModule = StudentListModule;

const StudentListPage = {
  state: { classes: [], users: [], roster: [], sessions: [], classId: '', busy: false },
  el(id) { return document.getElementById(id); },
  message(message, type = 'info', action = null) {
    const box = this.el('studentMessage');
    box.replaceChildren();
    if (message) {
      box.append(document.createTextNode(message));
      if (action) {
        box.append(document.createTextNode(' '));
        const link = document.createElement('a');
        link.href = action.href;
        link.textContent = action.label;
        box.append(link);
      }
    }
    box.className = `alert alert-${type}`;
    box.hidden = !message;
  },
  async init() {
    if (!AuthService.requireAuth('teacher')) return;
    const current = AuthService.getCurrentUser();
    if (current?.fullName) {
      const header = this.el('roleHeaderName');
      if (header) header.textContent = `${current.fullName} · Giáo viên`;
      const sidebar = document.querySelector('.sidebar-user-bottom .user-mini-meta h5');
      if (sidebar) sidebar.textContent = current.fullName;
    }
    this.el('studentClass').addEventListener('change', event => this.selectClass(event.target.value));
    this.el('studentSearch').addEventListener('input', () => this.render());
    this.el('studentEnroll').addEventListener('submit', event => { event.preventDefault(); this.enroll(); });
    this.el('studentCreateForm').addEventListener('submit', event => { event.preventDefault(); this.createStudent(); });
    try {
      const [classes, users] = await Promise.all([
        StudentListModule.getClasses(), StudentListModule.getAvailableStudents()
      ]);
      this.state.classes = classes;
      this.state.users = users.filter(u => u.status === 'active' && !!u.student_code);
      const select = this.el('studentClass');
      select.replaceChildren(new Option('— Chọn lớp học —', ''));
      classes.forEach(c => select.add(new Option(`${c.name} (${c.code})`, c.id)));
      const requested = new URLSearchParams(location.search).get('class_id');
      const first = classes.some(c => c.id === requested) ? requested : (classes[0]?.id || '');
      select.value = first;
      if (first) await this.selectClass(first);
      else this.message(
        'Tài khoản của bạn chưa có lớp học để quản lý học sinh.',
        'info',
        { label: 'Tạo lớp học', href: 'classes.html' }
      );
    } catch (error) { this.message(`Không tải được dữ liệu: ${error.message}`, 'danger'); }
  },
  async selectClass(classId) {
    this.state.classId = classId;
    this.state.roster = [];
    this.state.sessions = [];
    this.render();
    this.renderSessions();
    if (!classId) return;
    this.message('Đang tải danh sách học sinh…');
    const [rosterResult, sessionsResult] = await Promise.allSettled([
      StudentListModule.getStudentsByClass(classId),
      StudentListModule.getClassSessions(classId)
    ]);
    if (this.state.classId !== classId) return;
    if (rosterResult.status === 'fulfilled') {
      this.state.roster = rosterResult.value.filter(row => row.status === 'active');
      this.message('');
    } else {
      this.message(`Không tải được danh sách học sinh: ${rosterResult.reason.message}`, 'danger');
    }
    if (sessionsResult.status === 'fulfilled') {
      this.state.sessions = sessionsResult.value;
      this.renderSessions();
    } else {
      this.renderSessions();
      this.el('studentClassScheduleMessage').textContent = `Không tải được lịch buổi học: ${sessionsResult.reason.message}`;
    }
    this.render();
  },
  render() {
    const { classId, roster, users, busy } = this.state;
    const activeCodes = new Set(roster.map(row => row.student_code));
    const available = users.filter(u => !activeCodes.has(u.student_code));
    const select = this.el('studentToAdd');
    const previous = select.value;
    select.replaceChildren(new Option('— Chọn học sinh chưa ghi danh —', ''));
    available.forEach(u => select.add(new Option(`${u.full_name} (${u.student_code})`, u.student_code)));
    select.value = available.some(u => u.student_code === previous) ? previous : '';
    this.el('enrollButton').disabled = !classId || busy || available.length === 0;
    this.el('studentCreateButton').disabled = busy;
    select.disabled = !classId || busy || available.length === 0;
    const cls = this.state.classes.find(c => c.id === classId);
    const count = cls?.student_count == null ? roster.length : Number(cls.student_count);
    this.el('studentCount').textContent = classId ? `Sĩ số hiện tại: ${count} học sinh đang học` : 'Chưa chọn lớp';
    this.el('studentAvailableHint').textContent = !classId
      ? 'Chọn lớp trước khi ghi danh.'
      : !available.length
        ? 'Không có học sinh chưa ghi danh. Hãy mở mục Tạo nhanh học sinh mới bên dưới, sau đó ghi danh.'
        : `Có ${available.length} học sinh có thể ghi danh. Nếu cần tạo thêm tài khoản, dùng mục Tạo nhanh học sinh mới.`;
    const q = this.el('studentSearch').value.trim().toLocaleLowerCase('vi');
    const filtered = roster.filter(row => `${row.full_name} ${row.student_code} ${row.email || ''}`.toLocaleLowerCase('vi').includes(q));
    const tbody = this.el('studentRows');
    tbody.replaceChildren();
    if (!filtered.length) {
      const tr = tbody.insertRow();
      const td = tr.insertCell(); td.colSpan = 5;
      td.textContent = !classId ? 'Chọn lớp học để xem danh sách.' : 'Không có học sinh phù hợp.';
      return;
    }
    filtered.forEach((student, i) => {
      const tr = tbody.insertRow();
      [String(i + 1), student.student_code, student.full_name, student.phone || student.email || '—'].forEach(value => {
        tr.insertCell().textContent = value;
      });
      const button = document.createElement('button');
      button.className = 'btn btn-secondary btn-sm'; button.type = 'button';
      button.textContent = 'Bớt khỏi lớp'; button.disabled = busy;
      button.addEventListener('click', () => this.unenroll(student));
      tr.insertCell().append(button);
    });
  },
  async createStudent() {
    if (this.state.busy) return;
    const value = id => this.el(id).value.trim();
    const payload = {
      full_name: value('newStudentName'),
      student_code: value('newStudentCode'),
      username: value('newStudentUsername'),
      password: this.el('newStudentPassword').value
    };
    const email = value('newStudentEmail');
    if (email) payload.email = email;

    if (!payload.student_code || payload.student_code.length > 30) {
      this.message(
        'Mã học sinh phải có từ 1 đến 30 ký tự. Ví dụ: HS01, HS02.',
        'warning'
      );
      return;
    }

    if (!payload.full_name || payload.username.length < 3) {
      this.message(
        'Vui lòng nhập họ tên và tên đăng nhập ít nhất 3 ký tự.',
        'warning'
      );
      return;
    }

    if (payload.password.length < 8 ||
        !/[A-Z]/.test(payload.password) ||
        !/[0-9]/.test(payload.password) ||
        !/[^A-Za-z0-9\s]/.test(payload.password)) {
      this.message(
        'Mật khẩu phải có ít nhất 8 ký tự, bao gồm chữ hoa, số và ký tự đặc biệt.',
        'warning'
      );
      return;
    }

    this.state.busy = true; this.render();
    try {
      await StudentListModule.createStudentAccount(payload);
    } catch (error) {
      this.message(`Không tạo được tài khoản: ${error.message}`, 'danger');
      this.state.busy = false; this.render();
      return;
    } finally {
      // Không lưu mật khẩu mới vào bộ nhớ trình duyệt hoặc thông báo.
      this.el('newStudentPassword').value = '';
    }
    try {
      const users = await StudentListModule.getAvailableStudents();
      this.state.users = users.filter(u => u.status === 'active' && !!u.student_code);
      this.message(`Đã tạo tài khoản ${payload.student_code}. Chọn em trong danh sách và nhấn “Thêm vào lớp”.`, 'success');
      this.el('studentCreateForm').reset();
    } catch (error) {
      this.message(`Đã tạo tài khoản ${payload.student_code} nhưng không tải lại được danh sách: ${error.message}. Hãy tải lại trang.`, 'warning');
    } finally {
      this.state.busy = false; this.render();
      const select = this.el('studentToAdd');
      if (Array.from(select.options).some(o => o.value === payload.student_code)) select.value = payload.student_code;
    }
  },
  async enroll() {
    const { classId } = this.state;
    const studentCode = this.el('studentToAdd').value;
    if (!classId || !studentCode || this.state.busy) return;
    this.state.busy = true; this.render();
    try {
      await StudentListModule.addStudentToClass(classId, studentCode);
    } catch (error) {
      this.message(`Không thể ghi danh: ${error.message}`, 'danger');
      this.state.busy = false; this.render();
      return;
    }
    try {
      await this.refresh(classId);
      this.message(`Đã thêm ${studentCode}. Sĩ số được cập nhật; lịch học sinh tự lấy các buổi học của lớp.`, 'success');
    } catch (error) {
      this.message(`Đã ghi danh ${studentCode}, nhưng chưa tải lại được danh sách: ${error.message}. Hãy tải lại trang để kiểm tra.`, 'warning');
    } finally { this.state.busy = false; this.render(); }
  },
  
  escapeHtml(str) {
    if (str == null) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  },

  // Hiển thị hộp thoại xác nhận bớt học sinh / cảnh báo nợ học phí đẹp mắt
  promptUnenrollConfirmation(student, invoices) {
    const modal = this.el('modalConfirmUnenroll');
    if (!modal) {
      // Fallback khi chạy kiểm thử hoặc không có modal trong DOM
      const msg = this.buildUnenrollConfirmation(student, invoices);
      return Promise.resolve(window.confirm(msg));
    }

    const outstanding = (Array.isArray(invoices) ? invoices : []).filter(invoice => {
      const remaining = Number(invoice.amount_remaining);
      return Number.isFinite(remaining) && remaining > 0 && invoice.payment_status !== 'void';
    });

    const hasDebt = outstanding.length > 0;
    const titleEl = this.el('unenrollModalTitle');
    const iconEl = this.el('unenrollModalIcon');
    const bodyEl = this.el('unenrollModalBody');
    const confirmBtn = this.el('btnUnenrollConfirm');
    const cancelBtn = this.el('btnUnenrollCancel');
    const closeBtn = this.el('btnUnenrollClose');

    const studentLabel = `${student.full_name} (${student.student_code})`;

    if (hasDebt) {
      const total = outstanding.reduce((sum, inv) => sum + Number(inv.amount_remaining), 0);
      titleEl.textContent = 'CẢNH BÁO: HỌC SINH CÒN NỢ HỌC PHÍ!';
      titleEl.style.color = '#B91C1C';
      iconEl.style.background = '#FEE2E2';
      iconEl.style.color = '#DC2626';
      iconEl.innerHTML = `
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
          <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/>
          <line x1="12" y1="9" x2="12" y2="13"/>
          <line x1="12" y1="17" x2="12.01" y2="17"/>
        </svg>
      `;

      const invoiceRows = outstanding.map(inv => {
        const month = String(inv.billing_month).padStart(2, '0');
        return `
          <tr style="border-bottom: 1px solid #F1F5F9;">
            <td style="padding: 10px 12px; color: var(--color-text-main); font-weight: 500;">
              • Học phí tháng ${month}/${inv.billing_year}
            </td>
            <td style="padding: 10px 12px; text-align: right; font-weight: 700; color: #DC2626; white-space: nowrap;">
              còn ${this.formatCurrency(inv.amount_remaining)}
            </td>
          </tr>
        `;
      }).join('');

      bodyEl.innerHTML = `
        <div class="alert alert-danger" style="margin-bottom: 16px; border-radius: 8px; font-size: 13px; line-height: 1.5;">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="flex-shrink:0; margin-top:1px;">
            <circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>
          </svg>
          <div>
            <strong>Chú ý:</strong> Học sinh này hiện còn hóa đơn học phí chưa thanh toán đủ. Vui lòng kiểm tra kỹ trước khi bớt khỏi danh sách lớp.
          </div>
        </div>

        <div style="background: #F8FAFC; border: 1px solid var(--color-border); border-radius: 8px; padding: 14px 16px; margin-bottom: 14px;">
          <div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 10px;">
            <div>
              <div style="font-size: 11px; color: var(--color-text-secondary); text-transform: uppercase; font-weight: 700; letter-spacing: 0.5px;">Học sinh</div>
              <div style="font-weight: 700; font-size: 15px; color: var(--color-text-main); margin-top: 2px;">
                ${this.escapeHtml(student.full_name)} <span style="font-weight: 500; color: var(--color-text-secondary);">(${this.escapeHtml(student.student_code)})</span>
              </div>
            </div>
            <span class="badge badge-danger" style="font-size: 12px; font-weight: 600; padding: 4px 10px; border-radius: 999px;">
              ${outstanding.length} hóa đơn nợ
            </span>
          </div>

          <div style="display: flex; justify-content: space-between; align-items: baseline; padding-top: 10px; border-top: 1px dashed var(--color-border);">
            <span style="font-size: 13px; font-weight: 700; color: var(--color-text-secondary); text-transform: uppercase; letter-spacing: 0.3px;">TỔNG CÒN NỢ:</span>
            <span style="font-size: 20px; font-weight: 800; color: #DC2626; letter-spacing: -0.5px;">
              ${this.formatCurrency(total)}
            </span>
          </div>
        </div>

        <div style="margin-bottom: 14px;">
          <div style="font-size: 13px; font-weight: 600; color: var(--color-text-main); margin-bottom: 6px;">
            Chi tiết các khoản học phí còn nợ:
          </div>
          <div style="max-height: 150px; overflow-y: auto; border: 1px solid var(--color-border); border-radius: 6px; background: #FFFFFF;">
            <table style="width: 100%; border-collapse: collapse; font-size: 13px;">
              <thead style="background: #F1F5F9; position: sticky; top: 0; z-index: 1;">
                <tr>
                  <th style="text-align: left; padding: 8px 12px; font-weight: 600; color: var(--color-text-secondary); border-bottom: 1px solid var(--color-border);">Khoản thu</th>
                  <th style="text-align: right; padding: 8px 12px; font-weight: 600; color: var(--color-text-secondary); border-bottom: 1px solid var(--color-border);">Còn nợ</th>
                </tr>
              </thead>
              <tbody>
                ${invoiceRows}
              </tbody>
            </table>
          </div>
        </div>

        <div style="padding: 10px 12px; background: #EFF6FF; border: 1px solid #BFDBFE; border-radius: 6px; font-size: 12px; color: #1E40AF; line-height: 1.45;">
          <strong style="color: #1E3A8A;">Bạn vẫn muốn bớt học sinh khỏi lớp?</strong><br>
          Tài khoản và các hóa đơn học phí của học sinh sẽ không bị xóa; hệ thống chỉ hủy ghi danh khỏi lớp này.
        </div>
      `;

      confirmBtn.className = 'btn btn-danger';
      confirmBtn.textContent = 'Vẫn bớt khỏi lớp';
    } else {
      titleEl.textContent = 'Xác nhận bớt học sinh khỏi lớp';
      titleEl.style.color = 'var(--color-text-main)';
      iconEl.style.background = '#EFF6FF';
      iconEl.style.color = '#1D4ED8';
      iconEl.innerHTML = `
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <path d="M16 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/>
          <circle cx="8.5" cy="7" r="4"/>
          <line x1="18" y1="11" x2="23" y2="11"/>
        </svg>
      `;

      bodyEl.innerHTML = `
        <div style="background: #F8FAFC; border: 1px solid var(--color-border); border-radius: 8px; padding: 14px 16px; margin-bottom: 16px;">
          <div style="display: flex; justify-content: space-between; align-items: center;">
            <div>
              <div style="font-size: 11px; color: var(--color-text-secondary); text-transform: uppercase; font-weight: 700; letter-spacing: 0.5px;">Học sinh</div>
              <div style="font-weight: 700; font-size: 15px; color: var(--color-text-main); margin-top: 2px;">
                ${this.escapeHtml(student.full_name)} <span style="font-weight: 500; color: var(--color-text-secondary);">(${this.escapeHtml(student.student_code)})</span>
              </div>
            </div>
            <span class="badge badge-success" style="font-size: 12px; font-weight: 600; padding: 4px 10px; border-radius: 999px;">
              Đã hoàn thành học phí
            </span>
          </div>
        </div>

        <p style="font-size: 14px; color: var(--color-text-main); margin-bottom: 12px; line-height: 1.5;">
          Bạn có chắc chắn muốn bớt <strong>${this.escapeHtml(studentLabel)}</strong> khỏi lớp không?
        </p>

        <div style="padding: 10px 12px; background: #F1F5F9; border: 1px solid var(--color-border); border-radius: 6px; font-size: 12px; color: var(--color-text-secondary); line-height: 1.45;">
          Tài khoản học sinh sẽ không bị xóa; lịch học hiện hành của học sinh sẽ không còn các buổi thuộc lớp này.
        </div>
      `;

      confirmBtn.className = 'btn btn-danger';
      confirmBtn.textContent = 'Xác nhận bớt';
    }

    return new Promise(resolve => {
      let resolved = false;

      const finish = (result) => {
        if (resolved) return;
        resolved = true;
        modal.classList.remove('active');
        document.removeEventListener('keydown', onKeyDown);
        modal.removeEventListener('click', onBackdropClick);
        confirmBtn.removeEventListener('click', onConfirm);
        cancelBtn.removeEventListener('click', onCancel);
        closeBtn.removeEventListener('click', onCancel);
        resolve(result);
      };

      const onConfirm = () => finish(true);
      const onCancel = () => finish(false);
      const onKeyDown = (e) => {
        if (e.key === 'Escape') finish(false);
      };
      const onBackdropClick = (e) => {
        if (e.target === modal) finish(false);
      };

      confirmBtn.addEventListener('click', onConfirm);
      cancelBtn.addEventListener('click', onCancel);
      closeBtn.addEventListener('click', onCancel);
      document.addEventListener('keydown', onKeyDown);
      modal.addEventListener('click', onBackdropClick);

      modal.classList.add('active');
      cancelBtn.focus();
    });
  },

  // Định dạng số tiền học phí
  formatCurrency(value) {
    return `${Math.round(Number(value)).toLocaleString('vi-VN')} ₫`;
  },

  // Tạo cảnh báo học phí trước khi cho học sinh nghỉ
  buildUnenrollConfirmation(student, invoices) {
    if (!Array.isArray(invoices)) {
      throw new Error('Phản hồi học phí không hợp lệ.');
    }

    // Lọc các hóa đơn còn nợ
    const outstanding = invoices.filter(invoice => {
      const remaining = Number(invoice.amount_remaining);

      if (!Number.isFinite(remaining) || remaining < 0) {
        throw new Error('Số tiền còn nợ không hợp lệ.');
      }

      return remaining > 0 &&
             invoice.payment_status !== 'void';
    });

    const studentLabel =
      `${student.full_name} (${student.student_code})`;

    // Không còn nợ: hiện xác nhận thông thường
    if (outstanding.length === 0) {
      return `Bớt ${studentLabel} khỏi lớp? Tài khoản học sinh sẽ không bị xóa.`;
    }

    // Tính tổng học phí còn nợ
    const total = outstanding.reduce(
      (sum, invoice) =>
        sum + Number(invoice.amount_remaining),
      0
    );

    // Danh sách khoản học phí chưa đóng đủ
    const details = outstanding.map(invoice => {
      const month =
        String(invoice.billing_month).padStart(2, '0');

      return `• Học phí tháng ${month}/${invoice.billing_year}: còn ${this.formatCurrency(invoice.amount_remaining)}`;
    });

    return [
      'CẢNH BÁO: HỌC SINH CÒN NỢ HỌC PHÍ!',
      '',
      `Học sinh: ${studentLabel}`,
      `Số hóa đơn còn nợ: ${outstanding.length}`,
      '',
      ...details,
      '',
      `TỔNG CÒN NỢ: ${this.formatCurrency(total)}`,
      '',
      'Bạn vẫn muốn bớt học sinh khỏi lớp?',
      'Tài khoản và các hóa đơn học phí sẽ không bị xóa.'
    ].join('\n');
  },

  // Xử lý bớt học sinh khỏi lớp
  async unenroll(student) {
    const classId = this.state.classId;

    if (this.state.busy || !classId) return;

    this.state.busy = true;
    this.render();

    let confirmation = '';
    let invoices = [];

    // Kiểm tra học phí trước khi xác nhận
    try {
      invoices =
        await StudentListModule.getStudentTuitionInvoices(
          classId,
          student.student_code
        );

      if (this.state.classId !== classId) return;

      confirmation = this.buildUnenrollConfirmation(
        student,
        invoices
      );

    } catch (error) {
      this.message(
        `Không kiểm tra được học phí của ${student.student_code}: ${error.message}. Chưa bớt học sinh khỏi lớp.`,
        'danger'
      );
      return;

    } finally {
      this.state.busy = false;
      this.render();
    }

    if (this.state.classId !== classId) return;

    // Hiển thị hộp thoại xác nhận bớt học sinh / cảnh báo nợ học phí đẹp mắt
    let confirmed = false;
    try {
      confirmed = await this.promptUnenrollConfirmation(student, invoices);
    } catch (err) {
      console.error('Lỗi hiển thị modal cảnh báo:', err);
      confirmed = window.confirm(confirmation || this.buildUnenrollConfirmation(student, invoices));
    }

    // Giáo viên chọn Hủy thì không bớt học sinh
    if (!confirmed || this.state.classId !== classId) {
      return;
    }

    // Chỉ thực hiện xóa liên kết lớp khi chọn OK
    this.state.busy = true;
    this.render();

    try {
      await StudentListModule.removeStudentFromClass(
        classId,
        student.student_code
      );

    } catch (error) {
      this.message(
        `Không thể bớt học sinh: ${error.message}`,
        'danger'
      );
      this.state.busy = false;
      this.render();
      return;
    }

    // Cập nhật danh sách sau khi bớt học sinh
    try {
      await this.refresh(classId);

      this.message(
        `Đã bớt ${student.full_name}. Sĩ số giảm; lịch học hiện hành của học sinh không còn các buổi thuộc lớp.`,
        'success'
      );

    } catch (error) {
      this.message(
        `Đã bớt học sinh nhưng chưa tải lại được danh sách: ${error.message}. Hãy tải lại trang để kiểm tra.`,
        'warning'
      );

    } finally {
      this.state.busy = false;
      this.render();
    }
  },
  async refresh(classId) {
    const [roster, classes] = await Promise.all([
      StudentListModule.getStudentsByClass(classId), StudentListModule.getClasses()
    ]);
    if (classId === this.state.classId) {
      this.state.roster = roster.filter(row => row.status === 'active');
      this.state.classes = classes;
    }
  },
  renderSessions() {
    const tbody = this.el('studentClassScheduleRows');
    const message = this.el('studentClassScheduleMessage');
    tbody.replaceChildren();
    if (!this.state.classId) {
      message.textContent = 'Chọn lớp học để xem lịch buổi học.';
      const td = tbody.insertRow().insertCell(); td.colSpan = 4; td.textContent = 'Chưa chọn lớp học.';
      return;
    }
    const sessions = [...this.state.sessions]
      .filter(session => session.status !== 'cancelled')
      .sort((a, b) => new Date(a.starts_at) - new Date(b.starts_at));
    message.textContent = sessions.length
      ? `${sessions.length} buổi học đã được lập cho lớp. Danh sách được cập nhật bởi chức năng Lịch học.`
      : 'Lớp chưa có buổi học. Hãy lập lịch ở mục Lịch học.';
    if (!sessions.length) {
      const td = tbody.insertRow().insertCell(); td.colSpan = 4; td.textContent = 'Chưa có buổi học trong lớp.';
      return;
    }
    sessions.forEach(session => {
      const tr = tbody.insertRow();
      const start = new Date(session.starts_at);
      const end = new Date(session.ends_at);
      const dateFmt = new Intl.DateTimeFormat('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh', day: '2-digit', month: '2-digit', year: 'numeric' });
      const timeFmt = new Intl.DateTimeFormat('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });
      [dateFmt.format(start), `${timeFmt.format(start)}–${timeFmt.format(end)}`, session.topic || 'Buổi học', session.room || '—']
        .forEach(value => { tr.insertCell().textContent = value; });
    });
  }
};
window.StudentListPage = StudentListPage;

