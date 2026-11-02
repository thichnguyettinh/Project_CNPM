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

  formatDate(value) {
    if (!value) return 'Chưa cập nhật';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return 'Chưa cập nhật';
    return new Intl.DateTimeFormat('vi-VN', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric'
    }).format(date);
  },

  renderStudentDetails(student) {
    const values = {
      studentCode: student.student_code || 'Chưa cập nhật',
      studentJoinedAt: `Thành viên từ ${this.formatDate(student.created_at)}`,
      studentStatus: student.student_status === 'active'
        ? 'Đang học'
        : student.student_status === 'graduated'
          ? 'Đã tốt nghiệp'
          : student.student_status === 'inactive'
            ? 'Ngừng học'
            : 'Chưa cập nhật',
      studentSchoolClass: 'Chưa cập nhật trong hồ sơ hệ thống',
      studentSchoolName: 'Chưa cập nhật trong hồ sơ hệ thống',
      studentGuardianName: student.guardian_name || 'Chưa có phụ huynh liên kết',
      studentGuardianRelationship: student.guardian_relationship || 'Chưa cập nhật',
      studentGuardianPhone: student.guardian_phone || 'Chưa cập nhật',
      studentGuardianEmail: student.guardian_email || 'Chưa cập nhật',
    };
    Object.entries(values).forEach(([id, value]) => {
      const element = document.getElementById(id);
      if (!element) return;
      if (element instanceof HTMLInputElement) element.value = value;
      else element.textContent = value;
    });
    const status = document.getElementById('studentStatus');
    if (status) status.classList.toggle('badge-success', student.student_status === 'active');
  },

  renderStudentClasses(classes) {
    const list = document.getElementById('studentProfileClasses');
    if (!list) return;
    list.replaceChildren();
    const activeClasses = classes.filter(item => item.status !== 'archived');
    if (!activeClasses.length) {
      const empty = document.createElement('p');
      empty.className = 'text-caption';
      empty.textContent = 'Chưa có lớp học được ghi danh.';
      list.append(empty);
      return;
    }

    activeClasses.forEach(item => {
      const card = document.createElement('article');
      card.className = 'student-profile-class-item';
      const title = document.createElement('p');
      title.className = 'student-profile-class-name';
      title.textContent = `${item.name || 'Lớp học'}${item.code ? ` (${item.code})` : ''}`;
      const details = document.createElement('p');
      details.className = 'text-caption';
      details.textContent = [
        item.teacher_name ? `Giáo viên: ${item.teacher_name}` : '',
        item.schedule_summary || '',
        item.room ? `Phòng: ${item.room}` : ''
      ].filter(Boolean).join(' · ') || 'Chưa có thông tin lịch học.';
      card.append(title, details);
      list.append(card);
    });
  },

  async loadStudentDetails() {
    const [studentResult, classesResult] = await Promise.allSettled([
      AuthService.api('/students/me'),
      AuthService.api('/classes')
    ]);
    if (studentResult.status === 'fulfilled') {
      this.renderStudentDetails(studentResult.value);
    } else {
      const notice = document.getElementById('studentProfileDetailsStatus');
      if (notice) notice.textContent = `Không tải được thông tin học sinh: ${studentResult.reason.message}`;
      [
        'studentCode',
        'studentJoinedAt',
        'studentStatus',
        'studentGuardianName',
        'studentGuardianRelationship',
        'studentGuardianPhone',
        'studentGuardianEmail'
      ].forEach(id => {
        const element = document.getElementById(id);
        if (element) element.textContent = 'Không tải được dữ liệu';
      });
    }
    if (classesResult.status === 'fulfilled') {
      this.renderStudentClasses(classesResult.value);
    } else {
      const list = document.getElementById('studentProfileClasses');
      if (list) {
        list.replaceChildren();
        const error = document.createElement('p');
        error.className = 'text-caption';
        error.textContent = `Không tải được danh sách lớp: ${classesResult.reason.message}`;
        list.append(error);
      }
    }
  },

  async load() {
    this.setStatus('');
    try {
      const profile = await AuthService.api('/profile');
      this.render(profile);
      const today = document.getElementById('profileTodayLabel');
      if (today) {
        today.textContent = new Intl.DateTimeFormat('vi-VN', {
          weekday: 'long',
          day: '2-digit',
          month: '2-digit',
          year: 'numeric'
        }).format(new Date());
      }
      if (document.body.dataset.profileRole === 'student') {
        await this.loadStudentDetails();
      }
      return profile;
    } catch (error) {
      this.setStatus(`Không tải được hồ sơ: ${error.message}`, true);
      document.querySelectorAll('[data-profile-name]').forEach(node => {
        node.textContent = 'Không tải được hồ sơ';
      });
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
