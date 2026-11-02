const DashboardWidgets = {
  el(id) {
    return document.getElementById(id);
  },
  showMessage(id, message, isError = false) {
    const node = this.el(id);
    if (!node) return;
    node.replaceChildren();
    const text = document.createElement('p');
    text.className = 'text-caption';
    text.textContent = message;
    if (isError) text.setAttribute('role', 'alert');
    node.append(text);
  },
  formatDate(value) {
    if (!value) return 'Chưa có ngày';
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? 'Chưa có ngày' : date.toLocaleDateString('vi-VN');
  },
  formatScore(value) {
    const score = Number(value);
    return Number.isFinite(score) ? `${score.toLocaleString('vi-VN')} / 10` : '—';
  },
  renderItems(container, entries, emptyMessage, renderEntry) {
    if (!container) return;
    container.replaceChildren();
    if (!entries.length) {
      this.showMessage(container.id, emptyMessage);
      return;
    }
    entries.forEach(entry => container.append(renderEntry(entry)));
  },
  notificationItem(notification) {
    const item = document.createElement('div');
    item.className = 'widget-notify-item';
    const title = document.createElement('div');
    title.className = 'widget-notify-title';
    title.textContent = notification.title;
    const body = document.createElement('div');
    body.className = 'widget-notify-desc';
    body.textContent = notification.body;
    item.append(title, body);
    return item;
  },
  async loadNotifications() {
    const list = this.el('dashboardNotificationList');
    const unreadCount = this.el('dashboardUnreadNotificationCount');
    if (!list || !unreadCount) return;
    try {
      const [notifications, unread] = await Promise.all([
        AuthService.api('/notifications'),
        AuthService.api('/notifications/unread-count')
      ]);
      if (!Array.isArray(notifications) || !Number.isInteger(unread.count) || unread.count < 0) {
        throw new Error('Dữ liệu thông báo từ máy chủ không hợp lệ.');
      }
      unreadCount.textContent = `${unread.count} chưa đọc`;
      this.renderItems(
        list,
        notifications.slice(0, 3),
        'Chưa có thông báo.',
        notification => {
          if (typeof notification.title !== 'string' || typeof notification.body !== 'string') {
            throw new Error('Nội dung thông báo từ máy chủ không hợp lệ.');
          }
          return this.notificationItem(notification);
        }
      );
    } catch (error) {
      console.error('Không thể nạp thông báo bảng điều khiển:', error);
      unreadCount.textContent = 'Không tải được';
      this.showMessage(list.id, `Không tải được thông báo: ${error.message}`, true);
    }
  },
  async loadStudent() {
    const grades = this.el('studentRecentGradesList');
    const assignmentsList = this.el('studentPendingAssignmentsList');
    try {
      const student = await AuthService.api('/students/me');
      if (!student?.student_code) {
        throw new Error('Tài khoản học sinh chưa được cấp mã học sinh.');
      }
      const [progress, assignments] = await Promise.all([
        AuthService.api(`/students/${encodeURIComponent(student.student_code)}/progress`),
        AuthService.api('/assignments')
      ]);
      if (!Array.isArray(progress) || !Array.isArray(assignments)) {
        throw new Error('Dữ liệu bài tập hoặc điểm số từ máy chủ không hợp lệ.');
      }

      const recentGrades = progress
        .filter(row => row.score !== null && row.score !== undefined)
        .sort((a, b) => new Date(b.graded_at || b.assigned_at) - new Date(a.graded_at || a.assigned_at))
        .slice(0, 3);
      const scoreSubtitle = this.el('studentRecentGradesSubtitle');
      if (scoreSubtitle) scoreSubtitle.textContent = `${recentGrades.length} kết quả mới nhất`;
      this.renderItems(grades, recentGrades, 'Chưa có bài được chấm điểm.', row => {
        const item = document.createElement('div');
        item.className = 'dashboard-data-row';
        const copy = document.createElement('div');
        const title = document.createElement('strong');
        title.textContent = row.title || 'Bài đánh giá';
        const date = document.createElement('p');
        date.className = 'text-caption';
        date.textContent = this.formatDate(row.graded_at || row.assigned_at);
        copy.append(title, date);
        const score = document.createElement('strong');
        score.className = 'dashboard-data-score';
        score.textContent = this.formatScore(row.score);
        item.append(copy, score);
        return item;
      });

      const pending = assignments
        .filter(row => !row.my_submission_id)
        .sort((a, b) => {
          if (!a.due_at) return 1;
          if (!b.due_at) return -1;
          return new Date(a.due_at) - new Date(b.due_at);
        })
        .slice(0, 3);
      this.renderItems(assignmentsList, pending, 'Bạn đã hoàn thành tất cả bài tập được giao.', row => {
        const item = document.createElement('div');
        item.className = 'dashboard-assignment-item';
        const title = document.createElement('strong');
        title.textContent = row.title || 'Bài tập';
        const due = document.createElement('p');
        due.className = 'text-caption';
        due.textContent = row.due_at
          ? `Hạn nộp: ${new Date(row.due_at).toLocaleString('vi-VN')}`
          : 'Chưa có hạn nộp';
        item.append(title, due);
        return item;
      });
    } catch (error) {
      console.error('Không thể nạp dữ liệu học tập trên bảng điều khiển:', error);
      this.showMessage(grades?.id, `Không tải được điểm số: ${error.message}`, true);
      this.showMessage(assignmentsList?.id, `Không tải được bài tập: ${error.message}`, true);
    }
  },
  parentProgressRequest: 0,
  async loadParentProgress(studentCode) {
    const request = ++this.parentProgressRequest;
    const chart = this.el('parentProgressChart');
    const summary = this.el('parentProgressSummary');
    if (!chart || !summary) return;
    if (!studentCode) {
      summary.textContent = 'Chưa có học sinh được liên kết.';
      this.showMessage(chart.id, 'Chưa có dữ liệu tiến bộ.');
      return;
    }
    summary.textContent = 'Đang tải kết quả học tập…';
    this.showMessage(chart.id, 'Đang tải tiến bộ học tập…');
    try {
      const rows = await AuthService.api(`/students/${encodeURIComponent(studentCode)}/progress`);
      if (request !== this.parentProgressRequest) return;
      if (!Array.isArray(rows)) throw new Error('Dữ liệu tiến bộ từ máy chủ không hợp lệ.');
      const graded = rows
        .filter(row => row.score !== null && row.score !== undefined)
        .sort((a, b) => new Date(a.graded_at || a.assigned_at) - new Date(b.graded_at || b.assigned_at))
        .slice(-5);
      if (!graded.length) {
        summary.textContent = 'Chưa có bài được chấm điểm.';
        this.showMessage(chart.id, 'Chưa có dữ liệu tiến bộ học tập.');
        return;
      }
      const firstScore = Number(graded[0].score);
      const lastScore = Number(graded[graded.length - 1].score);
      const change = lastScore - firstScore;
      summary.textContent = `${graded.length} bài đã chấm · ${change > 0 ? 'Tăng' : change < 0 ? 'Giảm' : 'Không đổi'} ${Math.abs(change).toLocaleString('vi-VN')} điểm từ bài đầu đến bài gần nhất`;
      chart.replaceChildren();
      const maxScore = 10;
      graded.forEach(row => {
        const score = Number(row.score);
        const point = document.createElement('div');
        point.className = 'dashboard-progress-point';
        const value = document.createElement('strong');
        value.textContent = this.formatScore(score);
        const bar = document.createElement('div');
        bar.className = 'dashboard-progress-bar';
        bar.style.height = `${Math.max(4, Math.min(100, score / maxScore * 100))}%`;
        bar.setAttribute('role', 'img');
        bar.setAttribute('aria-label', `${row.title || 'Bài đánh giá'}: ${this.formatScore(score)}`);
        const label = document.createElement('span');
        label.textContent = row.title || this.formatDate(row.graded_at || row.assigned_at);
        point.append(value, bar, label);
        chart.append(point);
      });
    } catch (error) {
      if (request !== this.parentProgressRequest) return;
      console.error('Không thể nạp tiến bộ học tập của học sinh:', error);
      summary.textContent = 'Không tải được tiến bộ học tập.';
      this.showMessage(chart.id, `Không tải được kết quả: ${error.message}`, true);
    }
  },
  init(role) {
    this.loadNotifications();
    if (role === 'student') {
      this.loadStudent();
      return;
    }
    if (role === 'parent') {
      const select = this.el('parentAttendanceChild');
      const loadSelected = () => this.loadParentProgress(select?.value || '');
      window.addEventListener('dashboard:child-selected', event => {
        this.loadParentProgress(event.detail?.studentCode || '');
      });
      select?.addEventListener('change', loadSelected);
      loadSelected();
    }
  }
};

window.DashboardWidgets = DashboardWidgets;
document.addEventListener('DOMContentLoaded', () => {
  const role = document.body.dataset.dashboardRole;
  if (role) DashboardWidgets.init(role);
});
