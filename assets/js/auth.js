/**
 * LỚP MÌNH - XÁC THỰC, PHÂN QUYỀN VÀ KẾT NỐI API
 */

const AuthService = {
  CURRENT_USER_KEY: 'lopminh_current_user',
  SESSION_TOKEN_KEY: 'lopminh_access_token',
  API_BASE_URL: 'http://127.0.0.1:8001/api',

  getToken() {
    return sessionStorage.getItem(this.SESSION_TOKEN_KEY)
      || localStorage.getItem(this.SESSION_TOKEN_KEY);
  },

  async api(path, options = {}) {
    const headers = new Headers(options.headers || {});
    const token = this.getToken();
    if (token) headers.set('Authorization', `Bearer ${token}`);
    if (options.body && !(options.body instanceof FormData)) {
      headers.set('Content-Type', 'application/json');
    }

    let response;
    try {
      response = await fetch(`${this.API_BASE_URL}${path}`, {
        ...options,
        headers
      });
    } catch (error) {
      throw new Error('Không kết nối được backend. Hãy kiểm tra API đang chạy.');
    }

    if (response.status === 204) return null;
    const result = await response.json().catch(() => ({}));
    if (!response.ok) {
      if (response.status === 401) this.clearSession();
      throw new Error(result.detail || `Yêu cầu thất bại (${response.status}).`);
    }
    return result;
  },

  async login(identity, password, remember = false) {
    const trimmedIdentity = (identity || '').trim();
    if (!trimmedIdentity || !password) {
      return { success: false, message: 'Vui lòng điền đầy đủ tên đăng nhập/email và mật khẩu.' };
    }

    try {
      const result = await this.api('/auth/login', {
        method: 'POST',
        body: JSON.stringify({ identity: trimmedIdentity, password })
      });
      this.clearSession();
      const storage = remember ? localStorage : sessionStorage;
      storage.setItem(this.SESSION_TOKEN_KEY, result.access_token);
      localStorage.setItem(this.CURRENT_USER_KEY, JSON.stringify(result.user));
      return { success: true, user: result.user };
    } catch (error) {
      return { success: false, message: error.message };
    }
  },

  clearSession() {
    localStorage.removeItem(this.SESSION_TOKEN_KEY);
    sessionStorage.removeItem(this.SESSION_TOKEN_KEY);
    localStorage.removeItem(this.CURRENT_USER_KEY);
  },

  getCurrentUser() {
    const raw = localStorage.getItem(this.CURRENT_USER_KEY);
    try {
      return raw ? JSON.parse(raw) : null;
    } catch (error) {
      this.clearSession();
      return null;
    }
  },

  getDashboardPath(role) {
    const isRoot = window.location.pathname.endsWith('index.html') || window.location.pathname.endsWith('/');

    switch (role) {
      case 'teacher':
        return isRoot ? 'pages/teacher/dashboard.html' : '../teacher/dashboard.html';
      case 'student':
        return isRoot ? 'pages/student/dashboard.html' : '../student/dashboard.html';
      case 'parent':
        return isRoot ? 'pages/parent/dashboard.html' : '../parent/dashboard.html';
      default:
        return 'index.html';
    }
  },

  requireAuth(allowedRole = null) {
    const user = this.getCurrentUser();
    if (!user || !this.getToken()) {
      const isRoot = window.location.pathname.endsWith('index.html') || window.location.pathname.endsWith('/');
      window.location.href = isRoot ? 'index.html' : '../../index.html';
      return null;
    }

    if (allowedRole && user.role !== allowedRole) {
      alert(`Bạn không có quyền truy cập khu vực này. Vai trò hiện tại của bạn là: ${this.getRoleLabel(user.role)}`);
      window.location.href = this.getDashboardPath(user.role);
      return null;
    }

    this.api('/auth/me')
      .then(serverUser => {
        localStorage.setItem(this.CURRENT_USER_KEY, JSON.stringify(serverUser));
      })
      .catch(error => {
        this.clearSession();
        alert(error.message);
        const isRoot = window.location.pathname.endsWith('index.html') || window.location.pathname.endsWith('/');
        window.location.href = isRoot ? 'index.html' : '../../index.html';
      });
    return user;
  },

  async logout() {
    try {
      if (this.getToken()) await this.api('/auth/logout', { method: 'POST' });
    } catch (error) {
      console.error('Không thể thu hồi phiên đăng nhập phía máy chủ:', error);
    } finally {
      this.clearSession();
      const isRoot = window.location.pathname.endsWith('index.html') || window.location.pathname.endsWith('/');
      window.location.href = isRoot ? 'index.html' : '../../index.html';
    }
  },

  changePassword(currentPassword, newPassword) {
    return this.api('/auth/change-password', {
      method: 'POST',
      body: JSON.stringify({
        current_password: currentPassword,
        new_password: newPassword
      })
    }).then(result => {
      this.clearSession();
      return result;
    });
  },

  getPasswordRequirements(password) {
    return [
      { rule: 'length', label: 'Ít nhất 8 ký tự', passed: password.length >= 8 },
      { rule: 'uppercase', label: 'Có 1 chữ hoa (A-Z)', passed: /[A-Z]/.test(password) },
      { rule: 'number', label: 'Có 1 chữ số (0-9)', passed: /[0-9]/.test(password) },
      { rule: 'special', label: 'Có 1 ký tự đặc biệt (!@#...)', passed: /[^A-Za-z0-9\s]/.test(password) }
    ];
  },

  updatePasswordStrength(inputId, checklistId, meterId, labelId) {
    const password = document.getElementById(inputId).value;
    const requirements = this.getPasswordRequirements(password);
    const checklist = document.getElementById(checklistId);
    const meter = document.getElementById(meterId);
    const label = document.getElementById(labelId);
    const passedCount = requirements.filter(requirement => requirement.passed).length;

    requirements.forEach(requirement => {
      const item = checklist.querySelector(`[data-rule="${requirement.rule}"]`);
      const icon = item.querySelector('[data-rule-icon]');
      const color = password.length === 0
        ? '#64748B'
        : requirement.passed ? '#15803D' : '#DC2626';
      icon.textContent = password.length === 0 ? '○' : requirement.passed ? '✓' : '×';
      item.style.color = color;
      item.setAttribute('aria-label', `${requirement.label}: ${password.length === 0 ? 'chưa kiểm tra' : requirement.passed ? 'đạt' : 'chưa đạt'}`);
    });

    let strength;
    if (password.length === 0) {
      strength = { text: 'Chưa nhập', color: '#94A3B8', width: '0%' };
    } else if (password.length < 8 || passedCount < 2) {
      strength = { text: 'Yếu', color: '#DC2626', width: '33%' };
    } else if (passedCount < requirements.length) {
      strength = { text: 'Trung bình', color: '#D97706', width: '66%' };
    } else {
      strength = { text: 'Mạnh', color: '#15803D', width: '100%' };
    }

    meter.style.width = strength.width;
    meter.style.backgroundColor = strength.color;
    label.textContent = `Độ mạnh: ${strength.text}`;
    label.style.color = strength.color;
    meter.parentElement.setAttribute('aria-valuenow', String(passedCount));
  },

  async changePasswordFromForm(currentId, newId, confirmId) {
    const currentPassword = document.getElementById(currentId).value;
    const newPassword = document.getElementById(newId).value;
    const confirmation = document.getElementById(confirmId).value;

    if (!currentPassword || !newPassword || !confirmation) {
      alert('Vui lòng nhập đầy đủ các trường mật khẩu.');
      return;
    }
    const unmetRequirements = this.getPasswordRequirements(newPassword)
      .filter(requirement => !requirement.passed)
      .map(requirement => requirement.label);
    if (unmetRequirements.length > 0) {
      alert(`Mật khẩu mới chưa đạt yêu cầu: ${unmetRequirements.join(', ')}.`);
      return;
    }
    if (newPassword === currentPassword) {
      alert('Mật khẩu mới phải khác mật khẩu hiện tại.');
      return;
    }
    if (newPassword !== confirmation) {
      alert('Mật khẩu xác nhận không khớp.');
      return;
    }

    try {
      const result = await this.changePassword(currentPassword, newPassword);
      alert(result.message || 'Đã đổi mật khẩu. Vui lòng đăng nhập lại.');
      window.location.href = window.location.pathname.includes('/pages/')
        ? '../../index.html'
        : 'index.html';
    } catch (error) {
      alert(error.message);
    }
  },

  getRoleLabel(role) {
    switch (role) {
      case 'teacher': return 'Giáo viên / Gia sư';
      case 'student': return 'Học sinh';
      case 'parent': return 'Phụ huynh';
      default: return 'Khách';
    }
  }
};

window.AuthService = AuthService;
