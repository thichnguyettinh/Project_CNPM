/**
 * THỜI KHÓA BIỂU PHỤ HUYNH (PARENT SCHEDULE MODULE)
 * Phụ trách: Phạm Nguyễn Hoàng Kim
 */

const ParentScheduleModule = {
  // Lấy danh sách lịch học của con đang liên kết
  getChildSchedule(filter = {}) {
    const params = new URLSearchParams();
    if (filter.date_from) params.append('date_from', filter.date_from);
    if (filter.date_to) params.append('date_to', filter.date_to);
    if (filter.class_id) params.append('class_id', filter.class_id);
    if (filter.student_code) params.append('student_code', filter.student_code);

    const query = params.toString();
    return AuthService.api(`/sessions${query ? `?${query}` : ''}`);
  },

  getLinkedChildren() {
    return AuthService.api('/children');
  }
};

window.ParentScheduleModule = ParentScheduleModule;
