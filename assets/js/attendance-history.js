/** Lịch sử chuyên cần UC-06 cho học sinh và phụ huynh. Dữ liệu chỉ lấy từ API. */
const AttendanceHistoryPage = {
  state: { role: '', all: [], children: [], student: null },
  el(id) { return document.getElementById(id); },
  statuses: {
    present: { label: 'Có mặt', badge: 'success' },
    absent: { label: 'Vắng', badge: 'danger' },
    late: { label: 'Trễ', badge: 'warning' },
    excused: { label: 'Có phép', badge: 'info' }
  },
  say(text, type = 'info') {
    const el = this.el('historyMessage');
    el.className = `alert alert-${type}`; el.textContent = text; el.hidden = !text;
  },
  stamp(value) { return new Date(value); },
  monthKey(value) {
    const date = this.stamp(value);
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
  },
  monthLabel(value) {
    const [year, month] = value.split('-');
    return `Tháng ${month}/${year}`;
  },
  dateLabel(value) { return this.stamp(value).toLocaleDateString('vi-VN'); },
  timeLabel(value) { return value ? this.stamp(value).toLocaleTimeString('vi-VN', {hour:'2-digit', minute:'2-digit'}) : '—'; },
  fillOptions(element, entries, first) {
    const previous = element.value;
    element.replaceChildren(new Option(first[0], first[1]));
    entries.forEach(({ value, label }) => element.add(new Option(label, value)));
    if (entries.some(e => e.value === previous)) element.value = previous;
  },
  async init(role) {
    this.state.role = role;
    if (!AuthService.requireAuth(role)) return;
    ['filterClass', 'filterMonth', 'filterStatus', 'filterChild'].forEach(id => {
      const element = this.el(id);
      if (element) element.addEventListener('change', () => this.render());
    });
    const user = AuthService.getCurrentUser();
    if (user?.fullName) {
      const header = this.el('roleHeaderName');
      if (header) header.textContent = `${user.fullName} · ${role === 'parent' ? 'Phụ huynh' : 'Học sinh'}`;
      const mini = document.querySelector('.sidebar-user-bottom .user-mini-meta h5');
      if (mini) mini.textContent = user.fullName;
    }
    this.say('Đang tải dữ liệu điểm danh…');
    try {
      const [history, identity] = await Promise.all([
        AuthService.api('/attendance'),
        role === 'student' ? AuthService.api('/students/me') : AuthService.api('/children')
      ]);
      this.state.all = history;
      if (role === 'student') {
        this.state.student = identity;
        this.el('historyIdentity').textContent = `${identity.full_name} · ${identity.student_code}`;
      } else {
        this.state.children = identity;
        const select = this.el('filterChild');
        select.replaceChildren();
        identity.forEach(child => select.add(new Option(`${child.full_name} (${child.student_code})`, child.student_code)));
        if (!identity.length) select.add(new Option('Không có học sinh được liên kết', ''));
        select.disabled = !identity.length;
        this.el('historyIdentity').textContent = identity.length
          ? `Theo dõi điểm danh của ${identity.length} học sinh được liên kết.`
          : 'Tài khoản chưa liên kết hồ sơ học sinh.';
      }
      this.say(''); this.render();
    } catch (error) { this.say(`Không thể tải dữ liệu: ${error.message}`, 'danger'); }
  },
  currentChild() {
    return this.state.role === 'parent' ? this.el('filterChild').value : this.state.student?.student_code;
  },
  render() {
    const child = this.currentChild();
    const ownRecords = this.state.all.filter(row => row.student_code === child);
    const classes = new Map(ownRecords.map(row => [row.class_code, row.class_name]));
    this.fillOptions(this.el('filterClass'), [...classes].map(([value, label]) => ({value, label: `${label} (${value})`})), ['Tất cả lớp', '']);
    const months = [...new Set(ownRecords.map(row => this.monthKey(row.starts_at)))].sort().reverse();
    this.fillOptions(this.el('filterMonth'), months.map(m => ({value: m, label: this.monthLabel(m)})), ['Tất cả tháng', '']);
    const course = this.el('filterClass').value;
    const month = this.el('filterMonth').value;
    const status = this.el('filterStatus').value;
    const matching = ownRecords.filter(row =>
      (!course || row.class_code === course) && (!month || this.monthKey(row.starts_at) === month) &&
      (!status || row.status === status)
    );
    const count = {present:0, absent:0, late:0, excused:0};
    matching.forEach(row => { if (row.status in count) count[row.status]++; });
    Object.entries(count).forEach(([key, value]) => { this.el(`history-${key}`).textContent = value; });
    const total = matching.length;
    const attended = count.present + count.late;
    const rate = total ? (attended / total * 100).toLocaleString('vi-VN', { maximumFractionDigits: 1 }) : '0';
    this.el('historyRate').textContent = `${attended}/${total} buổi · ${rate}%`;
    this.el('historyTotal').textContent = `${total} buổi có điểm danh`;
    this.el('historyFormula').textContent = 'Tỷ lệ tham gia = (Có mặt + Trễ) / Số buổi đã được ghi điểm danh trong bộ lọc. Buổi chưa điểm danh không tính.';
    ['present', 'absent', 'late', 'excused'].forEach(key => {
      const el = this.el(`bar-${key}`);
      if (el) el.style.width = `${total ? count[key] / total * 100 : 0}%`;
    });
    const tbody = this.el('historyRows');
    tbody.replaceChildren();
    if (!matching.length) {
      const tr = tbody.insertRow(); const cell = tr.insertCell();
      cell.colSpan = this.state.role === 'parent' ? 5 : 4;
      cell.textContent = !child ? 'Chưa có học sinh liên kết.' : 'Chưa có bản ghi điểm danh trong bộ lọc này.';
      return;
    }
    matching.forEach(row => {
      const tr = tbody.insertRow();
      const date = document.createElement('strong'); date.textContent = this.dateLabel(row.starts_at);
      const dateTd = tr.insertCell(); dateTd.append(date);
      const times = `${this.timeLabel(row.starts_at)}–${this.timeLabel(row.ends_at)}`;
      if (this.state.role === 'parent') {
        const classTd = tr.insertCell(); classTd.textContent = `${row.class_name} (${row.class_code})`;
        tr.insertCell().textContent = times;
      } else {
        tr.insertCell().textContent = `${row.class_name} · ${row.room || 'Chưa có phòng'} · ${times}`;
      }
      const badge = document.createElement('span');
      badge.className = `badge badge-${this.statuses[row.status]?.badge || 'info'}`;
      badge.textContent = this.statuses[row.status]?.label || 'Chưa ghi';
      const td = tr.insertCell(); td.append(badge);
      tr.insertCell().textContent = row.note || '—';
    });
  }
};
window.AttendanceHistoryPage = AttendanceHistoryPage;
