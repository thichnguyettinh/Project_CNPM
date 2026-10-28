const StudentGradeProgressModule = {
  async getMyGrades(studentCode) {
    const user = AuthService.getCurrentUser();
    const code = studentCode || user?.studentCode;
    if (!code) throw new Error('Tài khoản chưa có mã học sinh.');
    return AuthService.api(`/students/${encodeURIComponent(code)}/progress`);
  },
  renderProgressChart(canvasId, gradesData) {
    console.info(`[UC-11] Dữ liệu ${gradesData.length} điểm đã sẵn sàng cho biểu đồ ${canvasId}.`);
  }
};

window.StudentGradeProgressModule = StudentGradeProgressModule;
