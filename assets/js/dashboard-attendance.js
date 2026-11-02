/** Thống kê chuyên cần trên trang Tổng quan theo từng vai trò.
 * Chỉ sử dụng dữ liệu từ API; không hiển thị số giả khi API lỗi.
 * "Tham gia" = Có mặt + Trễ; mẫu số = số bản ghi giáo viên đã lưu.
 */
const DashboardAttendance = {
  el(id) { return document.getElementById(id); },
  count(records) {
    const counts = { present: 0, absent: 0, late: 0, excused: 0 };
    (records || []).forEach(row => {
      if (Object.prototype.hasOwnProperty.call(counts, row.status)) counts[row.status]++;
    });
    const total = Object.values(counts).reduce((sum, n) => sum + n, 0);
    const attended = counts.present + counts.late;
    return { ...counts, total, attended, rate: total ? Math.round(attended / total * 1000) / 10 : 0 };
  },
  rateText(count) {
    return `${count.rate.toLocaleString('vi-VN', { maximumFractionDigits: 1 })}%`;
  },
  notifySelectedChild(studentCode) {
    if (typeof window.dispatchEvent === 'function' && typeof CustomEvent === 'function') {
      window.dispatchEvent(new CustomEvent('dashboard:child-selected', {
        detail: { studentCode }
      }));
    }
  },
  dateText(date) { return new Date(date).toLocaleDateString('vi-VN'); },
  setText(id, value) { const node = this.el(id); if (node) node.textContent = value; },
  setTitle(id, value) { const node = this.el(id); if (node) node.title = value; },
  async init(role) {
    if (!AuthService.requireAuth(role)) return;
    try {
      if (role === 'teacher') await this.teacher();
      else if (role === 'student') await this.student();
      else if (role === 'parent') await this.parent();
    } catch (error) {
      const errorText = `Không tải được chuyên cần: ${error.message}`;
      if (role === 'teacher') {
        this.setText('teacherStudentCount', '—');
        this.setTitle('teacherStudentCountHint', errorText);
        this.renderRecentError(errorText);
      } else if (role === 'student') {
        this.setText('studentAttendanceCount', '—');
        this.setText('studentAttendanceDesc', errorText);
        this.setText('studentRecentAttendanceSubtitle', errorText);
        this.setText('studentRecentAttendanceText', 'Vui lòng kiểm tra kết nối rồi tải lại trang.');
      } else {
        this.setText('parentAttendanceCount', '—');
        this.setText('parentAttendanceDesc', errorText);
      }
    }
  },
  async teacher() {
    // Sĩ số là số học sinh duy nhất đang ghi danh tại các lớp do giáo viên quản lý.
    // Tách 2 lời gọi để khi một API lỗi, không hiển thị số liệu mẫu sai lệch.
    try {
      const dashboard = await AuthService.api('/dashboard');
      this.setText('teacherStudentCount', String(Number(dashboard.students?.student_count ?? 0)));
      this.setTitle('teacherStudentCountHint', '');
    } catch (error) {
      this.setText('teacherStudentCount', '—');
      this.setTitle('teacherStudentCountHint', `Không tải được sĩ số: ${error.message}`);
    }
    try { this.renderRecent(await AuthService.api('/attendance')); }
    catch (error) { this.renderRecentError(`Không tải được điểm danh: ${error.message}`); }
  },
  renderRecentError(message) {
    const tbody = this.el('teacherRecentAttendanceRows');
    if (!tbody) return;
    tbody.replaceChildren();
    const tr = tbody.insertRow(); const td = tr.insertCell();
    td.colSpan = 4; td.textContent = message;
  },
  recentGroups(records) {
    const groups = new Map();
    (records || []).forEach(row => {
      // Một buổi có nhiều học sinh: gom theo session_id, không đếm trùng buổi.
      const key = String(row.session_id);
      if (!groups.has(key)) groups.set(key, { id: key, className: row.class_name || row.class_code || 'Lớp học', starts_at: row.starts_at, records: [] });
      groups.get(key).records.push(row);
    });
    return [...groups.values()].sort((a,b) => new Date(b.starts_at) - new Date(a.starts_at)).slice(0, 5);
  },
  renderRecent(records) {
    const tbody = this.el('teacherRecentAttendanceRows');
    if (!tbody) return;
    tbody.replaceChildren();
    const groups = this.recentGroups(records);
    if (!groups.length) { this.renderRecentError('Chưa có buổi học nào được ghi điểm danh.'); return; }
    groups.forEach(group => {
      const c = this.count(group.records);
      const tr = tbody.insertRow();
      tr.insertCell().textContent = group.className;
      tr.insertCell().textContent = this.dateText(group.starts_at);
      tr.insertCell().textContent = `${c.attended} / ${c.total}`;
      const status = tr.insertCell();
      const tag = document.createElement('span');
      tag.className = 'badge badge-success'; tag.textContent = 'Đã ghi'; status.append(tag);
    });
  },
  async student() {
    const records = await AuthService.api('/attendance');
    const stats = this.count(records);
    this.setText('studentAttendanceCount', `${stats.attended} / ${stats.total} buổi`);
    this.setText('studentAttendanceDesc', `${this.rateText(stats)} tham gia · ${stats.present} có mặt · ${stats.late} trễ`);
    this.setText('studentRecentAttendanceSubtitle', `${stats.absent} vắng · ${stats.excused} có phép · ${stats.total} buổi đã ghi`);
    const latest = [...records].sort((a,b) => new Date(b.starts_at) - new Date(a.starts_at))[0];
    this.setText('studentRecentAttendanceText', latest
      ? `Tỷ lệ tham gia: ${this.rateText(stats)} (Có mặt + Trễ). Lần ghi nhận gần nhất: ${this.dateText(latest.starts_at)} · ${latest.class_name || 'Lớp học'}.`
      : 'Chưa có kết quả điểm danh. Giáo viên cần lưu điểm danh để hiển thị ở đây.');
  },
  async parent() {
    const [children, records] = await Promise.all([
      AuthService.api('/children'), AuthService.api('/attendance')
    ]);
    const select = this.el('parentAttendanceChild');
    select.replaceChildren();
    if (!children.length) {
      select.add(new Option('Chưa liên kết học sinh', ''));
      select.disabled = true;
      this.setText('parentDashboardChildName', 'Chưa có học sinh liên kết');
      this.setText('parentDashboardChildCopy', 'Chưa có học sinh được liên kết với tài khoản này.');
      this.setText('parentDashboardChildAvatar', 'HS');
      this.setText('parentAttendanceCount', '—');
      this.setText('parentAttendanceDesc', 'Chưa có hồ sơ học sinh được liên kết.');
      this.notifySelectedChild('');
      return;
    }
    children.forEach(child => select.add(new Option(`${child.full_name} (${child.student_code})`, child.student_code)));
    select.disabled = children.length < 2;
    let firstUpdate = true;
    const update = () => {
      const child = children.find(entry => entry.student_code === select.value);
      const childName = child?.full_name || 'Học sinh';
      this.setText('parentDashboardChildName', childName);
      this.setText('parentDashboardChildCopy', `Theo dõi tiến bộ học tập của ${childName}.`);
      this.setText(
        'parentDashboardChildAvatar',
        childName.split(/\s+/).slice(-2).map(part => part[0]).join('').toLocaleUpperCase('vi-VN')
      );
      const own = records.filter(row => row.student_code === select.value);
      const c = this.count(own);
      this.setText('parentAttendanceCount', `${c.attended}/${c.total} buổi`);
      this.setText('parentAttendanceDesc', c.total
        ? `${this.rateText(c)} tham gia · ${c.present} có mặt · ${c.late} trễ · ${c.absent} vắng · ${c.excused} có phép`
        : 'Chưa có buổi được giáo viên ghi điểm danh.');
      if (firstUpdate) {
        this.notifySelectedChild(select.value);
        firstUpdate = false;
      }
    };
    select.addEventListener('change', update);
    update();
  }
};
window.DashboardAttendance = DashboardAttendance;
