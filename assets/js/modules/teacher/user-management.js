/**
 * MODULE: QUẢN LÝ NGƯỜI DÙNG & PHÂN QUYỀN (UC-02)
 * Đối tượng thực hiện: Giáo viên (Actor chính)
 */

const UserManagementModule = {
  // [KHOÉT LỖ - SLOT 1]: Lấy danh sách tài khoản người dùng
  getUsersList(role) {
    const query = role ? `?role=${encodeURIComponent(role)}` : '';
    return AuthService.api(`/users${query}`);
  },

  // [KHOÉT LỖ - SLOT 2]: Tạo mới tài khoản (Học sinh / Phụ huynh)
  createUser(userData) {
    return AuthService.api('/users', {
      method: 'POST',
      body: JSON.stringify(userData)
    });
  },

  // [KHOÉT LỖ - SLOT 3]: Chỉnh sửa tài khoản
  updateUser(userId, updatedData) {
    return AuthService.api(`/users/${encodeURIComponent(userId)}`, {
      method: 'PATCH',
      body: JSON.stringify(updatedData)
    });
  },

  // [KHOÉT LỖ - SLOT 4]: Vô hiệu hóa hoặc xóa tài khoản
  deleteUser(userId) {
    return AuthService.api(`/users/${encodeURIComponent(userId)}`, { method: 'DELETE' });
  }
};

window.UserManagementModule = UserManagementModule;
