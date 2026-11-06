/**
 * UC-04: THỜI KHÓA BIỂU GIÁO VIÊN (TEACHER SCHEDULE MODULE)
 * Phụ trách: Phạm Nguyễn Hoàng Kim
 */

const ScheduleModule = {
  // Lấy danh sách buổi học theo bộ lọc (class_id, date_from, date_to)
  getSchedules(filter = {}) {
    const params = new URLSearchParams();
    if (filter.class_id) params.append('class_id', filter.class_id);
    if (filter.date_from) params.append('date_from', filter.date_from);
    if (filter.date_to) params.append('date_to', filter.date_to);

    const query = params.toString();
    return AuthService.api(`/sessions${query ? `?${query}` : ''}`);
  },

  // Lấy chi tiết một buổi học
  getSessionDetail(sessionId) {
    return AuthService.api(`/sessions/${encodeURIComponent(sessionId)}`);
  },

  // Thêm buổi học mới (chỉ một buổi)
  addSchedule(scheduleData) {
    return AuthService.api('/sessions', {
      method: 'POST',
      body: JSON.stringify(scheduleData)
    });
  },

  // Thêm chuỗi buổi học lặp lại hàng tuần
  addRecurringSchedule(scheduleData) {
    return AuthService.api('/sessions/recurring', {
      method: 'POST',
      body: JSON.stringify(scheduleData)
    });
  },

  // Chỉnh sửa hoặc dời lịch buổi học
  rescheduleSession(sessionId, updates) {
    return AuthService.api(`/sessions/${encodeURIComponent(sessionId)}`, {
      method: 'PATCH',
      body: JSON.stringify(updates)
    });
  }
};

window.ScheduleModule = ScheduleModule;
