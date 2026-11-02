const ProfileModule = {
  fields: [],
  avatarUrls: [],

  formatTimestamp(value) {
    if (!value) return 'Chưa có thời gian cập nhật';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return 'Thời gian cập nhật không hợp lệ';
    return `Cập nhật lần cuối: ${date.toLocaleString('vi-VN', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit'
    })}`;
  },

  setStatus(message, isError = false) {
    const status = document.getElementById('profileSaveStatus');
    if (status) {
      status.textContent = message;
      status.style.color = isError ? 'var(--color-danger)' : '';
    }
  },

  render(profile) {
    this.fields.forEach(field => {
      field.value = profile[field.dataset.profileField] || '';
    });

    const fullName = profile.full_name || '';
    document.querySelectorAll('[data-profile-name]').forEach(node => {
      node.textContent = fullName;
    });
    const nameParts = fullName.trim().split(/\s+/).filter(Boolean);
    const initials = nameParts.slice(-2).map(part => part[0]).join('').toLocaleUpperCase('vi-VN');
    document.querySelectorAll('[data-profile-avatar]').forEach(node => {
      node.textContent = initials;
      node.style.backgroundImage = '';
      node.style.backgroundSize = '';
      node.style.backgroundPosition = '';
    });

    const updatedAt = document.getElementById('profileUpdatedAt');
    if (updatedAt) {
      const message = this.formatTimestamp(profile.updated_at);
      const content = updatedAt.querySelector('[data-profile-updated-text]');
      if (content) content.textContent = message;
      else updatedAt.textContent = message;
    }

    const currentUser = AuthService.getCurrentUser();
    if (currentUser) {
      currentUser.fullName = profile.full_name;
      currentUser.email = profile.email;
      currentUser.phone = profile.phone;
      currentUser.avatarText = initials;
      localStorage.setItem(AuthService.CURRENT_USER_KEY, JSON.stringify(currentUser));
    }
  },

  async load() {
    this.setStatus('');
    try {
      const profile = await AuthService.api('/profile');
      this.render(profile);
      return profile;
    } catch (error) {
      this.setStatus(`Không tải được hồ sơ: ${error.message}`, true);
      const updatedAt = document.getElementById('profileUpdatedAt');
      if (updatedAt) {
        const content = updatedAt.querySelector('[data-profile-updated-text]');
        if (content) content.textContent = 'Không tải được thời gian cập nhật';
        else updatedAt.textContent = 'Không tải được thời gian cập nhật';
      }
      return null;
    }
  },

  async loadAvatar() {
    try {
      const blob = await AuthService.apiBlob('/profile/avatar');
      this.avatarUrls.forEach(url => URL.revokeObjectURL(url));
      this.avatarUrls = [];
      if (!blob) return true;
      const url = URL.createObjectURL(blob);
      this.avatarUrls.push(url);
      document.querySelectorAll('[data-profile-avatar]').forEach(node => {
        node.textContent = '';
        node.style.backgroundImage = `url("${url}")`;
        node.style.backgroundSize = 'cover';
        node.style.backgroundPosition = 'center';
      });
      return true;
    } catch (error) {
      console.error('Không thể tải ảnh đại diện:', error);
      this.setStatus(`Không tải được ảnh đại diện: ${error.message}`, true);
      return false;
    }
  },

  async uploadAvatar(file) {
    if (!file) return;
    const allowedTypes = ['image/jpeg', 'image/png', 'image/webp'];
    if (!allowedTypes.includes(file.type)) {
      this.setStatus('Chỉ chấp nhận ảnh JPEG, PNG hoặc WebP.', true);
      return;
    }
    if (file.size === 0 || file.size > 5 * 1024 * 1024) {
      this.setStatus('Ảnh phải có dung lượng lớn hơn 0 và không vượt quá 5 MB.', true);
      return;
    }

    const button = document.getElementById('profileAvatarButton');
    const input = document.getElementById('profileAvatarInput');
    if (button) {
      button.disabled = true;
      button.textContent = 'Đang tải ảnh…';
    }
    this.setStatus('Đang tải ảnh đại diện…');
    try {
      const formData = new FormData();
      formData.append('file', file);
      await AuthService.api('/profile/avatar', { method: 'PUT', body: formData });
      if (!await this.loadAvatar()) throw new Error('Ảnh đã tải lên nhưng không thể hiển thị lại.');
      this.setStatus('Đã cập nhật ảnh đại diện.');
    } catch (error) {
      this.setStatus(`Không cập nhật được ảnh đại diện: ${error.message}`, true);
    } finally {
      if (button) {
        button.disabled = false;
        button.textContent = 'Đổi ảnh';
      }
      if (input) input.value = '';
    }
  },

  async save() {
    const invalidField = this.fields.find(field => !field.checkValidity());
    if (invalidField) {
      invalidField.reportValidity();
      this.setStatus('Vui lòng kiểm tra lại thông tin hồ sơ.', true);
      return;
    }

    const fullNameField = this.fields.find(field => field.dataset.profileField === 'full_name');
    if (fullNameField && !fullNameField.value.trim()) {
      this.setStatus('Họ và tên không được để trống.', true);
      fullNameField.focus();
      return;
    }

    const payload = {};
    this.fields.forEach(field => {
      const key = field.dataset.profileField;
      const value = field.value.trim();
      payload[key] = value || null;
    });

    this.setStatus('Đang lưu hồ sơ…');
    try {
      const profile = await AuthService.api('/profile', {
        method: 'PATCH',
        body: JSON.stringify(payload)
      });
      this.render(profile);
      this.setStatus('Đã lưu hồ sơ thành công.');
    } catch (error) {
      this.setStatus(`Không lưu được hồ sơ: ${error.message}`, true);
    }
  },

  async init() {
    this.fields = [...document.querySelectorAll('[data-profile-field]')];
    const avatarButton = document.getElementById('profileAvatarButton');
    const avatarInput = document.getElementById('profileAvatarInput');
    avatarButton?.addEventListener('click', () => avatarInput?.click());
    avatarInput?.addEventListener('change', () => this.uploadAvatar(avatarInput.files?.[0]));
    await this.load();
    await this.loadAvatar();
  }
};

window.ProfileModule = ProfileModule;

document.addEventListener('DOMContentLoaded', () => {
  if (document.body.dataset.profileRole) ProfileModule.init();
});
