const ParentChildProgressModule = {
  getChildProgress(studentCode) {
    return AuthService.api(`/students/${encodeURIComponent(studentCode)}/progress`);
  },
  getChildAttendanceHistory(studentCode) {
    const query = studentCode ? `?student_code=${encodeURIComponent(studentCode)}` : '';
    return AuthService.api(`/attendance${query}`);
  }
};

window.ParentChildProgressModule = ParentChildProgressModule;
