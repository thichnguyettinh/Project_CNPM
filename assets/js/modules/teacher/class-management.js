/**
 * UC-03: QUẢN LÝ LỚP HỌC (TEACHER CLASS MANAGEMENT MODULE)
 * Phụ trách: Phạm Nguyễn Hoàng Kim
 */

const ClassManagementModule = {
  // Lấy toàn bộ danh sách lớp của giáo viên
  getClasses() {
    return AuthService.api('/classes');
  },

  // Lấy thông tin chi tiết một lớp theo ID hoặc mã lớp
  getClass(classId) {
    return AuthService.api(`/classes/${encodeURIComponent(classId)}`);
  },

  // Tạo lớp học mới (sĩ số ban đầu là 0)
  createClass(classData) {
    const payload = {
      class_code: (classData.class_code || classData.code || '').trim().toUpperCase(),
      name: (classData.name || '').trim(),
      subject: (classData.subject || 'Toán').trim(),
      monthly_fee: Number(classData.monthly_fee || classData.monthlyFee || 0),
      default_room: classData.default_room || classData.room || null,
      description: classData.description || null,
      status: classData.status || 'active'
    };
    return AuthService.api('/classes', {
      method: 'POST',
      body: JSON.stringify(payload)
    });
  },

  // Cập nhật thông tin lớp học
  updateClass(classId, payload) {
    const body = {};
    if (payload.name !== undefined) body.name = payload.name.trim();
    if (payload.subject !== undefined) body.subject = payload.subject.trim();
    if (payload.monthly_fee !== undefined) body.monthly_fee = Number(payload.monthly_fee);
    if (payload.default_room !== undefined) body.default_room = payload.default_room;
    if (payload.description !== undefined) body.description = payload.description;
    if (payload.status !== undefined) body.status = payload.status;

    return AuthService.api(`/classes/${encodeURIComponent(classId)}`, {
      method: 'PATCH',
      body: JSON.stringify(body)
    });
  },

  // Đóng lớp học (chuyển sang trạng thái completed)
  closeClass(classId) {
    return AuthService.api(`/classes/${encodeURIComponent(classId)}/close`, { method: 'POST' });
  },

  // Lưu trữ lớp học (chuyển sang trạng thái archived)
  archiveClass(classId) {
    return AuthService.api(`/classes/${encodeURIComponent(classId)}/archive`, { method: 'POST' });
  },

  // Khôi phục lớp học
  restoreClass(classId) {
    return AuthService.api(`/classes/${encodeURIComponent(classId)}/restore`, { method: 'POST' });
  },

  // Lấy danh sách học sinh thuộc lớp
  getClassStudents(classId) {
    return AuthService.api(`/classes/${encodeURIComponent(classId)}/students`);
  },

  // Thêm học sinh vào lớp
  enrollStudent(classId, studentCode) {
    return AuthService.api(`/classes/${encodeURIComponent(classId)}/students`, {
      method: 'POST',
      body: JSON.stringify({
        student_code: studentCode.trim().toUpperCase(),
        enrolled_on: new Date().toISOString().slice(0, 10)
      })
    });
  },

  // Xóa/rút học sinh khỏi lớp
  unenrollStudent(classId, studentCode) {
    return AuthService.api(`/classes/${encodeURIComponent(classId)}/students/${encodeURIComponent(studentCode)}`, {
      method: 'DELETE'
    });
  }
};

window.ClassManagementModule = ClassManagementModule;
