/** Cập nhật các thẻ thống kê tổng quan từ API dashboard theo vai trò. */
const DashboardStats = {
  role: null,
  students: [],
  el(id) { return document.getElementById(id); },
  setText(id, value) {
    const node = this.el(id);
    if (node) node.textContent = value;
  },
  setTitle(id, value) {
    const node = this.el(id);
    if (node) node.title = value;
  },
  formatScore(score) {
    return score === null || score === undefined
      ? '—'
      : `${Number(score).toLocaleString('vi-VN', { maximumFractionDigits: 2 })} / 10`;
  },
  formatDate(value) {
    if (!value) return '';
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? '' : date.toLocaleDateString('vi-VN');
  },
  formatTime(value) {
    if (!value) return '';
    const date = new Date(value);
    return Number.isNaN(date.getTime())
      ? ''
      : date.toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' });
  },
  async init(role) {
    this.role = role;
    if (role === 'parent') {
      this.el('parentAttendanceChild')?.addEventListener('change', event => {
        this.renderChild(event.target.value || '');
      });
      window.addEventListener('dashboard:child-selected', event => {
        this.renderChild(event.detail?.studentCode || '');
      });
    }
    try {
      const summary = await AuthService.api('/dashboard');
      if (role === 'teacher') {
        this.renderTeacher(summary);
      } else {
        this.students = Array.isArray(summary.students) ? summary.students : [];
        if (role === 'student') {
          this.renderChild(this.students[0]?.student_code || '');
        } else {
          this.renderChild(this.el('parentAttendanceChild')?.value || '');
        }
      }
    } catch (error) {
      this.renderError(error);
    }
  },
  renderTeacher(summary) {
    const classes = summary.classes || {};
    const students = summary.students || {};
    const today = summary.today_sessions || {};
    const activeClassCount = Number(classes.active_classes || 0);
    this.setText('teacherClassCount', String(activeClassCount));
    this.setText(
      'teacherStudentCountHint',
      activeClassCount ? `Trong ${activeClassCount} lớp học` : 'Chưa có lớp học'
    );
    this.setText('teacherStudentCount', String(Number(students.student_count || 0)));
    const sessionCount = Number(today.session_count || 0);
    this.setText('teacherTodaySessionCount', String(sessionCount));
  },
  renderChild(studentCode) {
    const student = this.students.find(item => item.student_code === studentCode);
    if (!student) {
      if (this.role === 'student') {
        this.setText('studentClassCount', '—');
        this.setText('studentClassCountHint', 'Chưa có dữ liệu ghi danh');
        this.setText('studentAverageScore', '—');
        this.setText('studentGradeSummary', 'Chưa có dữ liệu điểm');
        this.setText('studentPendingAssignmentCount', '—');
        this.setText('studentPendingAssignmentHint', 'Chưa có dữ liệu bài tập');
      } else if (this.role === 'parent' && !this.students.length) {
        this.setText('parentAverageScore', '—');
        this.setText('parentGradeSummary', 'Chưa có học sinh được liên kết');
        this.setText('parentLatestScore', '—');
        this.setText('parentLatestScoreHint', 'Chưa có dữ liệu điểm');
      }
      return;
    }
    const average = this.formatScore(student.average_score);
    const gradedCount = Number(student.graded_count || 0);
    const latest = this.formatScore(student.latest_score);
    const latestDate = this.formatDate(student.latest_graded_at);
    if (this.role === 'student') {
      this.setText('studentClassCount', String(Number(student.class_count || 0)));
      this.setText(
        'studentClassCountHint',
        Number(student.class_count || 0) ? 'Lớp đang ghi danh' : 'Chưa ghi danh lớp học'
      );
      this.setText('studentAverageScore', average);
      this.setText(
        'studentGradeSummary',
        gradedCount ? `${gradedCount} bài đã có điểm` : 'Chưa có bài được chấm điểm'
      );
      const pendingCount = Number(student.pending_assignment_count || 0);
      this.setText('studentPendingAssignmentCount', String(pendingCount));
      const dueDate = this.formatDate(student.nearest_pending_due_at);
      this.setText(
        'studentPendingAssignmentHint',
        pendingCount
          ? (dueDate ? `Hạn gần nhất: ${dueDate}` : 'Bài tập chưa có hạn nộp')
          : 'Đã nộp tất cả bài được giao'
      );
      return;
    }
    this.setText('parentAverageScore', average);
    this.setText(
      'parentGradeSummary',
      gradedCount ? `${student.full_name} · ${gradedCount} bài đã có điểm` : 'Chưa có bài được chấm điểm'
    );
    this.setText('parentLatestScore', latest);
    this.setText(
      'parentLatestScoreHint',
      student.latest_assignment_title
        ? `${student.latest_assignment_title}${latestDate ? ` · ${latestDate}` : ''}`
        : 'Chưa có điểm mới nhất'
    );
  },
  renderError(error) {
    const message = `Không tải được số liệu tổng quan: ${error.message}`;
    if (this.role === 'teacher') {
      this.setText('teacherClassCount', '—');
      this.setTitle('teacherClassCountHint', message);
      this.setText('teacherStudentCount', '—');
      this.setTitle('teacherStudentCountHint', message);
      this.setText('teacherTodaySessionCount', '—');
      this.setTitle('teacherTodaySessionHint', message);
    } else if (this.role === 'student') {
      this.setText('studentClassCount', '—');
      this.setText('studentClassCountHint', message);
      this.setText('studentAverageScore', '—');
      this.setText('studentGradeSummary', message);
      this.setText('studentPendingAssignmentCount', '—');
      this.setText('studentPendingAssignmentHint', message);
    } else {
      this.setText('parentAverageScore', '—');
      this.setText('parentGradeSummary', message);
      this.setText('parentLatestScore', '—');
      this.setText('parentLatestScoreHint', message);
    }
  }
};

window.DashboardStats = DashboardStats;

document.addEventListener('DOMContentLoaded', () => {
  const main = document.querySelector('.teacher-dashboard');
  const role = main ? 'teacher'
    : document.getElementById('parentAttendanceChild') ? 'parent'
      : document.getElementById('studentAttendanceCount') ? 'student'
        : null;
  if (role) DashboardStats.init(role);
});
