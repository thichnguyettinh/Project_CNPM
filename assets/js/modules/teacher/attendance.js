const AttendanceModule = {
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
      note: record.note || null
    }));
    return AuthService.api(`/sessions/${sessionId}/attendance`, {
      method: 'PUT',
      body: JSON.stringify({ records })
    });
  },
  getHistory(filters = {}) {
    const query = new URLSearchParams(filters).toString();
    return AuthService.api(`/attendance${query ? `?${query}` : ''}`);
  }
};

window.AttendanceModule = AttendanceModule;
