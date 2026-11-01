/** UC-06: Điểm danh từng buổi học. Phần đọc/ghi đều đi qua FastAPI. */
const AttendanceModule = {
  getClasses() { return AuthService.api('/classes'); },
  getSessions(classId) {
    return AuthService.api(`/sessions?class_id=${encodeURIComponent(classId)}`);
  },
  getSessionAttendance(sessionId) {
    return AuthService.api(`/sessions/${encodeURIComponent(sessionId)}/attendance`);
  },
  getSessionRoster(classId) {
    return AuthService.api(`/classes/${encodeURIComponent(classId)}/students`);
  },
  markAttendance(sessionId, studentCode, status, note = '') {
    return this.saveAttendanceSheet(sessionId, [{ student_code: studentCode, status, note }]);
  },
  saveAttendanceSheet(sessionId, attendanceData) {
    const records = attendanceData.map(record => ({
      student_code: record.student_code || record.studentCode,
      status: record.status,
      note: record.note?.trim() || null
    }));
    return AuthService.api(`/sessions/${encodeURIComponent(sessionId)}/attendance`, {
      method: 'PUT', body: JSON.stringify({ records })
    });
  },
  getHistory(filters = {}) {
    const query = new URLSearchParams(filters).toString();
    return AuthService.api(`/attendance${query ? `?${query}` : ''}`);
  }
};
window.AttendanceModule = AttendanceModule;

const TeacherAttendancePage = {
  state: { classes: [], sessions: [], classId: '', sessionId: '', rows: [], saved: [], busy: false },
  el(id) { return document.getElementById(id); },
  statuses: [
    { key: 'present', title: 'Có mặt' },
    { key: 'absent', title: 'Vắng' },
    { key: 'late', title: 'Trễ' },
    { key: 'excused', title: 'Có phép' }
  ],
  message(message, type = 'info') {
    const box = this.el('attendanceMessage');
    box.textContent = message;
    box.className = `alert alert-${type}`;
    box.hidden = !message;
  },
  snapshot(rows) {
    return JSON.stringify(rows.map(({ student_code, status, note }) => ({ student_code, status, note })));
  },
  isDirty() { return this.snapshot(this.state.rows) !== this.snapshot(this.state.saved); },
  confirmLeave() {
    return !this.isDirty() || confirm('Bạn có thay đổi điểm danh chưa lưu. Bỏ các thay đổi này?');
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
    this.el('attendanceClass').addEventListener('change', async event => {
      const target = event.target;
      if (!this.confirmLeave()) { target.value = this.state.classId; return; }
      await this.selectClass(target.value);
    });
    this.el('attendanceSession').addEventListener('change', async event => {
      const target = event.target;
      if (!this.confirmLeave()) { target.value = this.state.sessionId; return; }
      await this.selectSession(target.value);
    });
    this.el('attendanceSearch').addEventListener('input', () => this.renderRows());
    this.el('allPresent').addEventListener('click', () => {
      if (!this.state.rows.length || this.state.busy) return;
      this.state.rows.forEach(row => { row.status = 'present'; });
      this.render();
    });
    this.el('attendanceUndo').addEventListener('click', () => {
      this.state.rows = this.state.saved.map(row => ({ ...row }));
      this.render(); this.message('Đã hoàn tác các thay đổi chưa lưu.');
    });
    this.el('attendanceSave').addEventListener('click', () => this.save());
    try {
      const classes = await AttendanceModule.getClasses();
      this.state.classes = classes;
      const select = this.el('attendanceClass');
      select.replaceChildren(new Option('— Chọn lớp học —', ''));
      classes.forEach(c => select.add(new Option(`${c.name} (${c.code})`, c.id)));
      const desired = new URLSearchParams(location.search).get('class_id');
      const selected = classes.some(c => c.id === desired) ? desired : (classes[0]?.id || '');
      select.value = selected;
      if (selected) await this.selectClass(selected);
      else this.message('Chưa có lớp học. Tạo lớp tại trang Lớp học hoặc qua API /docs.');
    } catch (error) { this.message(`Không thể tải lớp: ${error.message}`, 'danger'); }
  },
  async selectClass(classId) {
    this.state.classId = classId;
    this.state.sessionId = '';
    this.state.rows = []; this.state.saved = []; this.state.sessions = [];
    const select = this.el('attendanceSession');
    select.replaceChildren(new Option('— Chọn buổi học —', ''));
    this.render();
    if (!classId) return;
    this.message('Đang tải các buổi học…');
    try {
      const sessions = (await AttendanceModule.getSessions(classId))
        .sort((a, b) => new Date(b.starts_at) - new Date(a.starts_at));
      if (classId !== this.state.classId) return;
      this.state.sessions = sessions;
      sessions.forEach(s => select.add(new Option(
        `${this.formatDate(s.starts_at)} · ${this.formatTime(s.starts_at)}–${this.formatTime(s.ends_at)} · ${s.topic || 'Buổi học'}`,
        String(s.session_id)
      )));
      if (sessions.length) {
        select.value = String(sessions[0].session_id);
        await this.selectSession(select.value);
      } else this.message('Lớp chưa có buổi học. Hãy tạo buổi tại Lịch học hoặc qua API /docs.');
    } catch (error) { this.message(`Không tải được buổi học: ${error.message}`, 'danger'); }
  },
  async selectSession(sessionId) {
    this.state.sessionId = String(sessionId || '');
    this.state.rows = []; this.state.saved = [];
    this.render();
    if (!sessionId) return;
    this.message('Đang tải sổ điểm danh…');
    try {
      const records = await AttendanceModule.getSessionAttendance(sessionId);
      if (String(sessionId) !== this.state.sessionId) return;
      this.state.rows = records.map(row => ({
        student_code: row.student_code, full_name: row.full_name,
        status: row.status || '', note: row.note || ''
      }));
      this.state.saved = this.state.rows.map(row => ({ ...row }));
      this.render();
      this.message(records.some(r => r.status) ? 'Đã tải điểm danh đã lưu. Bạn có thể chỉnh sửa và lưu lại.' :
        'Chưa có kết quả điểm danh cho buổi này. Chọn trạng thái từng học sinh hoặc bấm Tất cả có mặt.');
    } catch (error) { this.message(`Không tải được sổ điểm danh: ${error.message}`, 'danger'); }
  },
  formatDate(iso) { return new Date(iso).toLocaleDateString('vi-VN'); },
  formatTime(iso) { return new Date(iso).toLocaleTimeString('vi-VN', { hour:'2-digit', minute:'2-digit' }); },
  render() {
    const counts = Object.fromEntries(this.statuses.map(s => [s.key, 0]));
    this.state.rows.forEach(row => { if (row.status in counts) counts[row.status]++; });
    ['Present', 'Absent', 'Late', 'Excused'].forEach((label, i) => {
      this.el(`count${label}`).textContent = counts[this.statuses[i].key];
    });
    const session = this.state.sessions.find(s => String(s.session_id) === this.state.sessionId);
    this.el('attendanceRoom').textContent = session ? `Phòng: ${session.room || 'Chưa cập nhật'}` : '';
    this.el('attendanceSummary').textContent = this.state.rows.length
      ? `${this.state.rows.length} học sinh · ${this.state.rows.filter(row => !!row.status).length} đã chọn trạng thái`
      : 'Chưa có học sinh. Hãy kiểm tra danh sách lớp và buổi học.';
    const active = this.state.rows.length > 0 && !this.state.busy;
    this.el('allPresent').disabled = !active;
    this.el('attendanceUndo').disabled = !active || !this.isDirty();
    this.el('attendanceSave').disabled = !active || !this.isDirty();
    this.renderRows();
  },
  renderRows() {
    const query = this.el('attendanceSearch').value.trim().toLocaleLowerCase('vi');
    const tbody = this.el('attendanceRows');
    tbody.replaceChildren();
    const visible = this.state.rows.filter(row =>
      `${row.full_name} ${row.student_code}`.toLocaleLowerCase('vi').includes(query));
    if (!visible.length) {
      const row = tbody.insertRow(); const cell = row.insertCell(); cell.colSpan = 3;
      cell.textContent = !this.state.sessionId ? 'Chọn buổi học để xem sổ điểm danh.' :
        !this.state.rows.length ? 'Lớp chưa có học sinh đang học. Vào Danh sách học sinh để ghi danh.' :
        'Không tìm thấy học sinh phù hợp.';
      return;
    }
    visible.forEach(student => {
      const tr = tbody.insertRow();
      const nameTd = tr.insertCell();
      const name = document.createElement('strong'); name.textContent = student.full_name;
      const code = document.createElement('span'); code.className = 'text-caption'; code.textContent = student.student_code;
      nameTd.append(name, document.createElement('br'), code);
      const statusTd = tr.insertCell();
      const group = document.createElement('div'); group.className = 'attendance-btn-group';
      this.statuses.forEach(({ key, title }) => {
        const button = document.createElement('button'); button.type = 'button';
        button.className = `att-btn${student.status === key ? ` active-${key}` : ''}`;
        button.textContent = title; button.disabled = this.state.busy;
        button.setAttribute('aria-pressed', String(student.status === key));
        button.addEventListener('click', () => { student.status = key; this.render(); });
        group.append(button);
      });
      statusTd.append(group);
      const noteTd = tr.insertCell();
      const note = document.createElement('input'); note.type = 'text';
      note.className = 'form-control'; note.maxLength = 500;
      note.placeholder = 'Ghi chú (nếu có)'; note.value = student.note;
      note.disabled = this.state.busy;
      note.setAttribute('aria-label', `Ghi chú của ${student.full_name}`);
      note.addEventListener('input', () => {
        student.note = note.value;
        this.el('attendanceUndo').disabled = !this.isDirty();
        this.el('attendanceSave').disabled = !this.isDirty();
      });
      noteTd.append(note);
    });
  },
  async save() {
    const { sessionId, rows, busy } = this.state;
    if (!sessionId || busy || !rows.length || !this.isDirty()) return;
    if (rows.some(row => !row.status)) {
      this.message('Vui lòng chọn trạng thái cho tất cả học sinh trước khi lưu.', 'danger');
      return;
    }
    this.state.busy = true; this.render();
    try {
      await AttendanceModule.saveAttendanceSheet(sessionId, rows);
      this.state.saved = rows.map(row => ({ ...row }));
      this.message(`Đã lưu điểm danh cho ${rows.length} học sinh vào cơ sở dữ liệu.`, 'success');
    } catch (error) { this.message(`Lưu thất bại: ${error.message}. Các thay đổi vẫn còn trên màn hình.`, 'danger'); }
    finally { this.state.busy = false; this.render(); }
  }
};
window.TeacherAttendancePage = TeacherAttendancePage;
