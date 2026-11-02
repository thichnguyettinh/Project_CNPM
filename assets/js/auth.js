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
    } catch {
      throw new Error('Chưa thể kết nối để tải dữ liệu. Vui lòng thử lại sau.');
    }

    if (response.status === 204) return null;
    const result = await response.json().catch(() => ({}));
    if (!response.ok) {
      if (response.status === 401) this.clearSession();
      throw new Error(result.detail || `Yêu cầu thất bại (${response.status}).`);
    }
    return result;
  },

  async apiBlob(path) {
    const headers = new Headers();
    const token = this.getToken();
    if (token) headers.set('Authorization', `******`);

    let response;
    try {
      response = await fetch(`${this.API_BASE_URL}${path}`, { headers });
    } catch {
      throw new Error('Chưa thể kết nối để tải dữ liệu. Vui lòng thử lại sau.');
    }

    if (response.status === 204) return null;
    if (!response.ok) {
      const result = await response.json().catch(() => ({}));
      if (response.status === 401) this.clearSession();
      throw new Error(result.detail || `Yêu cầu thất bại (${response.status}).`);
    }
    return response.blob();
  },

  updateNotificationIndicators() {
    const badges = document.querySelectorAll(
      'a.nav-item-link[href$="notifications.html"] .sidebar-nav-badge'
    );
    const dots = document.querySelectorAll('.notify-dot');
    [...badges, ...dots].forEach(indicator => {
      indicator.hidden = true;
      indicator.removeAttribute('data-notification-count-loaded');
    });

    return this.api('/notifications/unread-count')
      .then(result => {
        if (!Number.isInteger(result.count) || result.count < 0) {
          throw new Error('Dữ liệu số thông báo chưa đọc từ máy chủ không hợp lệ.');
        }
        badges.forEach(badge => {
          badge.textContent = String(result.count);
          badge.hidden = result.count === 0;
          badge.dataset.notificationCountLoaded = 'true';
        });
        dots.forEach(dot => {
          dot.hidden = result.count === 0;
          dot.dataset.notificationCountLoaded = 'true';
        });
      })
      .catch(error => {
        console.error('Không thể cập nhật số thông báo chưa đọc:', error);
      });
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

  getAcademicYear(date = new Date()) {
    const calendarYear = date.getFullYear();
    const startYear = date.getMonth() >= 7 ? calendarYear : calendarYear - 1;
    return `${startYear}-${startYear + 1}`;
  },

  initializePasswordVisibility(root = document) {
    const fields = root.matches?.('input[type="password"]')
      ? [root]
      : root.querySelectorAll?.('input[type="password"]') || [];

    fields.forEach(input => {
      if (input.dataset.passwordVisibilityInitialized === 'true') return;

      let wrapper = input.parentElement;
      if (!wrapper?.classList.contains('password-input-wrap')) {
        if (wrapper?.classList.contains('input-wrapper')) {
          wrapper.classList.add('password-input-wrap');
        } else {
          wrapper = document.createElement('div');
          wrapper.className = 'password-input-wrap';
          input.parentNode.insertBefore(wrapper, input);
          wrapper.appendChild(input);
        }
      }

      const toggle = document.createElement('button');
      toggle.type = 'button';
      toggle.className = 'password-visibility-toggle';
      toggle.setAttribute('aria-label', 'Hiện mật khẩu');
      toggle.setAttribute('aria-pressed', 'false');
      toggle.title = 'Hiện mật khẩu';
      toggle.innerHTML = '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>';

      toggle.addEventListener('mousedown', event => event.preventDefault());
      toggle.addEventListener('click', () => {
        const isVisible = input.type === 'password';
        input.type = isVisible ? 'text' : 'password';
        toggle.setAttribute('aria-pressed', String(isVisible));
        toggle.setAttribute('aria-label', isVisible ? 'Ẩn mật khẩu' : 'Hiện mật khẩu');
        toggle.title = isVisible ? 'Ẩn mật khẩu' : 'Hiện mật khẩu';
        toggle.innerHTML = isVisible
          ? '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 3l18 18"/><path d="M10.6 10.6a2 2 0 0 0 2.8 2.8"/><path d="M9.9 5.2A11 11 0 0 1 12 5c7 0 11 7 11 7a13 13 0 0 1-3.1 3.8"/><path d="M6.6 6.6C3.6 8.3 1 12 1 12s4 7 11 7c1.2 0 2.3-.2 3.3-.6"/></svg>'
          : '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>';
      });

      input.classList.add('password-toggle-input');
      input.dataset.passwordVisibilityInitialized = 'true';
      wrapper.appendChild(toggle);
    });
  },

  updateWorkspaceBranding(user = this.getCurrentUser()) {
    const role = user?.role;
    const fullName = user?.fullName?.trim();
    const roleLabel = role === 'teacher' ? 'Giáo viên'
      : role === 'student' ? 'Học sinh'
        : role === 'parent' ? 'Phụ huynh' : '';
    const nameParts = (fullName || '').split(/\s+/).filter(Boolean);
    const initials = user?.avatarText
      || nameParts.slice(-2).map(part => part[0]).join('').toLocaleUpperCase('vi-VN');
    const currentDate = new Date().toLocaleDateString('vi-VN', {
      weekday: 'long',
      day: '2-digit',
      month: '2-digit',
      year: 'numeric'
    });
    const workspaceLabel = role === 'teacher'
      ? `Lớp học ${user.fullName || 'Giáo viên'}`
      : role === 'student' ? 'Cổng học sinh'
        : role === 'parent' ? 'Cổng phụ huynh' : '';
    document.querySelectorAll('.sidebar-sub-brand').forEach(brand => {
      if (!workspaceLabel) return;
      brand.replaceChildren(
        document.createTextNode(workspaceLabel),
        document.createElement('br'),
        document.createTextNode(`Năm học ${this.getAcademicYear()}`)
      );
    });

    if (fullName && roleLabel) {
      document.querySelectorAll('.sidebar-user-bottom .user-mini-profile').forEach(profile => {
        const name = profile.querySelector('.user-mini-meta h5');
        const avatar = profile.querySelector('.avatar-badge');
        if (name) name.textContent = fullName;
        if (avatar && initials) avatar.textContent = initials;
      });

      document.querySelectorAll('.app-header .header-actions').forEach(actions => {
        actions.querySelectorAll('.avatar-badge').forEach(avatar => {
          if (initials) avatar.textContent = initials;
          const identity = Array.from(avatar.parentElement?.children || [])
            .find(child => child.tagName === 'SPAN');
          if (identity) identity.textContent = `${fullName} · ${roleLabel}`;
        });
        actions.querySelectorAll('[data-teacher-header-label]').forEach(label => {
          label.textContent = `${fullName} · ${roleLabel}`;
        });
        actions.querySelectorAll('#roleHeaderName').forEach(label => {
          label.textContent = `${fullName} · ${roleLabel}`;
        });
      });
    }

    document.querySelectorAll('.app-header .header-actions > span').forEach(label => {
      if (/\d{1,2}\/\d{1,2}\/\d{4}/.test(label.textContent)) {
        label.textContent = currentDate;
      }
    });
    document.querySelectorAll('#teacherCurrentDateLabel, #uc11-teacher-current-date').forEach(label => {
      label.textContent = currentDate;
    });

    const academicYear = this.getAcademicYear();
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    let node;
    while ((node = walker.nextNode())) {
      if (node.parentElement?.closest('script, style')) continue;
      node.nodeValue = node.nodeValue.replace(/\b20\d{2}[-–]20\d{2}\b/g, academicYear);
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

    this.updateWorkspaceBranding(user);
    if (allowedRole && user.role !== allowedRole) {
      alert(`Bạn không có quyền truy cập khu vực này. Vai trò hiện tại của bạn là: ${this.getRoleLabel(user.role)}`);
      window.location.href = this.getDashboardPath(user.role);
      return null;
    }

    this.updateNotificationIndicators();
    this.api('/auth/me')
      .then(serverUser => {
        localStorage.setItem(this.CURRENT_USER_KEY, JSON.stringify(serverUser));
        this.updateWorkspaceBranding(serverUser);
        window.dispatchEvent(new CustomEvent('auth:user-updated', { detail: serverUser }));
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

const updateWorkspaceBranding = () => AuthService.updateWorkspaceBranding();
const initializePasswordVisibility = () => {
  AuthService.initializePasswordVisibility();
  const observer = new MutationObserver(records => {
    records.forEach(record => record.addedNodes.forEach(node => {
      if (node instanceof Element) AuthService.initializePasswordVisibility(node);
    }));
  });
  observer.observe(document.body, { childList: true, subtree: true });
};
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => {
    updateWorkspaceBranding();
    initializePasswordVisibility();
  }, { once: true });
} else {
  updateWorkspaceBranding();
  initializePasswordVisibility();
}
