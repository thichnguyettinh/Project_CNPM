/**
 * THỜI KHÓA BIỂU PHỤ HUYNH (PARENT SCHEDULE MODULE)
 * Phụ trách: Phạm Nguyễn Hoàng Kim
 */

const ParentScheduleModule = {
  // Lấy danh sách lớp học của con
  getChildClasses(studentCode = '') {
    const params = new URLSearchParams();
    if (studentCode) params.append('student_code', studentCode);
    const query = params.toString();
    return AuthService.api(`/classes${query ? `?${query}` : ''}`);
  },

  getMyClasses(studentCode = '') {
    return this.getChildClasses(studentCode);
  },

  // Lấy danh sách lịch học của con đang liên kết (hỗ trợ lọc theo tuần, mã học sinh, lớp học)
  getChildSchedule(filter = {}) {
    const params = new URLSearchParams();
    if (filter.date_from) params.append('date_from', filter.date_from);
    if (filter.date_to) params.append('date_to', filter.date_to);
    if (filter.class_id) params.append('class_id', filter.class_id);
    if (filter.student_code) params.append('student_code', filter.student_code);

    const query = params.toString();
    return AuthService.api(`/sessions${query ? `?${query}` : ''}`);
  },

  // Lấy chi tiết một buổi học
  getSessionDetail(sessionId) {
    return AuthService.api(`/sessions/${encodeURIComponent(sessionId)}`);
  },

  getLinkedChildren() {
    return AuthService.api('/children');
  },
  getAbsenceRequests(sessionId, studentCode) {
    const query = new URLSearchParams({ session_id: String(sessionId), student_code: studentCode });
    return AuthService.api(`/absence-requests?${query}`);
  },
  submitAbsenceRequest(sessionId, studentCode, reason) {
    return AuthService.api(`/sessions/${encodeURIComponent(sessionId)}/absence-requests`, {
      method: 'POST', body: JSON.stringify({ student_code: studentCode, reason })
    });
  }
};

window.ParentScheduleModule = ParentScheduleModule;
