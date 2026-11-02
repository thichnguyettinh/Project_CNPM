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

    const query = params.toString();
    return AuthService.api(`/sessions${query ? `?${query}` : ''}`);
  },

  // Lấy chi tiết một buổi học
  getSessionDetail(sessionId) {
    return AuthService.api(`/sessions/${encodeURIComponent(sessionId)}`);
  },

  // Lấy danh sách con và thông tin tổng quan
  getDashboard() {
    return AuthService.api('/dashboard');
  }
};

window.ParentScheduleModule = ParentScheduleModule;
