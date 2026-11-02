/**
 * MODULE: QUẢN LÝ NGƯỜI DÙNG & PHÂN QUYỀN (UC-02)
 * Đối tượng thực hiện: Giáo viên (Actor chính)
 */

const UserManagementModule = {
  getUsersList(role) {
    const query = role ? `?role=${encodeURIComponent(role)}` : '';
    return AuthService.api(`/users${query}`);
  },

  createUser(userData) {
    return AuthService.api('/users', {
      method: 'POST',
      body: JSON.stringify(userData)
    });
  },

  linkParentToStudent(parentUserId, studentCode, relationship = '') {
    return AuthService.api(`/users/${encodeURIComponent(parentUserId)}/parent-link`, {
      method: 'POST',
      body: JSON.stringify({ student_code: studentCode, relationship: relationship || null })
    });
  },

  resetPassword(userId, newPassword) {
    return AuthService.api(`/users/${encodeURIComponent(userId)}/reset-password`, {
      method: 'POST',
      body: JSON.stringify({ new_password: newPassword })
    });
  },

  updateUser(userId, updatedData) {
    return AuthService.api(`/users/${encodeURIComponent(userId)}`, {
      method: 'PATCH',
      body: JSON.stringify(updatedData)
    });
  },

  deleteUser(userId) {
    return AuthService.api(`/users/${encodeURIComponent(userId)}`, { method: 'DELETE' });
  }
};

window.UserManagementModule = UserManagementModule;

const UserManagementPage = {
  state: { users: [], role: 'all', query: '', busy: false },
  el(id) { return document.getElementById(id); },
  message(text, type = 'info') {
    const box = this.el('userManagementMessage');
    box.textContent = text;
    box.className = `alert alert-${type}`;
    box.hidden = !text;
  },
  async init() {
    if (!AuthService.requireAuth('teacher')) return;
    this.el('createAccountForm').addEventListener('submit', event => {
      event.preventDefault();
      this.createAccount();
    });
    this.el('createRole').addEventListener('change', () => this.updateCreateFields());
    this.el('linkParentForm').addEventListener('submit', event => {
      event.preventDefault();
      this.linkParent();
    });
    this.el('resetPasswordForm').addEventListener('submit', event => {
      event.preventDefault();
      this.resetAccountPassword();
    });
    this.el('editAccountForm').addEventListener('submit', event => {
      event.preventDefault();
      this.saveAccountEdit();
    });
    this.el('searchUserInput').addEventListener('input', event => {
      this.state.query = event.target.value.trim().toLocaleLowerCase('vi');
      this.render();
    });
    this.updateCreateFields();
    await this.loadUsers();
  },
  async loadUsers() {
    this.message('Đang tải tài khoản…');
    try {
      const [students, parents] = await Promise.all([
        UserManagementModule.getUsersList('student'),
        UserManagementModule.getUsersList('parent')
      ]);
      this.state.users = [...students, ...parents];
      this.message('');
      this.render();
    } catch (error) {
      this.message(`Không tải được tài khoản: ${error.message}`, 'danger');
      this.el('userRows').replaceChildren();
      return false;
    }
    return true;
  },
  setRole(role, button) {
    this.state.role = role;
    document.querySelectorAll('[data-user-role]').forEach(tab => tab.classList.remove('active'));
    button.classList.add('active');
    this.render();
  },
  render() {
    const students = this.state.users.filter(user => user.role === 'student');
    const parents = this.state.users.filter(user => user.role === 'parent');
    this.el('countAllUsers').textContent = `Tất cả (${students.length + parents.length})`;
    this.el('countStudentUsers').textContent = `Học sinh (${students.length})`;
    this.el('countParentUsers').textContent = `Phụ huynh (${parents.length})`;
    const visible = this.state.users.filter(user => {
      const matchesRole = this.state.role === 'all' || user.role === this.state.role;
      const query = `${user.full_name} ${user.username} ${user.student_code || ''} ${user.email || ''} ${user.linked_names || ''}`
        .toLocaleLowerCase('vi');
      return matchesRole && query.includes(this.state.query);
    });
    const tbody = this.el('userRows');
    tbody.replaceChildren();
    this.el('emptySearchBox').hidden = visible.length > 0;
    this.el('tableAccountContainer').hidden = visible.length === 0;
    if (!visible.length) return;
    visible.forEach(user => {
      const row = tbody.insertRow();
      const account = row.insertCell();
      const name = document.createElement('strong');
      name.textContent = user.full_name;
      const detail = document.createElement('span');
      detail.className = 'text-caption';
      detail.textContent = `${user.student_code ? `${user.student_code} · ` : ''}${user.username}`;
      account.append(name, document.createElement('br'), detail);
      const role = row.insertCell();
      const roleBadge = document.createElement('span');
      roleBadge.className = `badge badge-${user.role === 'student' ? 'info' : 'warning'}`;
      roleBadge.textContent = user.role === 'student' ? 'Học sinh' : 'Phụ huynh';
      role.append(roleBadge);
      row.insertCell().textContent = user.class_names || '—';
      row.insertCell().textContent = user.linked_names || '—';
      const status = row.insertCell();
      const statusBadge = document.createElement('span');
      const statusLabels = { active: 'Hoạt động', inactive: 'Vô hiệu hóa', locked: 'Đang khóa' };
      statusBadge.className = `badge badge-${user.status === 'active' ? 'success' : 'neutral'}`;
      statusBadge.textContent = statusLabels[user.status] || user.status;
      status.append(statusBadge);
      const actions = row.insertCell();
      actions.style.textAlign = 'right';
      if (user.role === 'student' && user.status === 'active') {
        const linkButton = document.createElement('button');
        linkButton.type = 'button';
        linkButton.className = 'btn btn-link btn-sm';
        linkButton.textContent = 'Liên kết phụ huynh';
        linkButton.addEventListener('click', () => this.openParentLink(user));
        actions.append(linkButton);
      }
      const resetButton = document.createElement('button');
      resetButton.type = 'button';
      resetButton.className = 'btn btn-link btn-sm';
      resetButton.textContent = 'Đặt lại mật khẩu';
      resetButton.addEventListener('click', () => this.openPasswordReset(user));
      const editButton = document.createElement('button');
      editButton.type = 'button';
      editButton.className = 'btn btn-link btn-sm';
      editButton.textContent = 'Chỉnh sửa';
      editButton.addEventListener('click', () => this.openAccountEdit(user));
      actions.append(editButton, resetButton);
      if (user.status === 'active' || user.status === 'inactive') {
        const statusButton = document.createElement('button');
        statusButton.type = 'button';
        statusButton.className = 'btn btn-link btn-sm';
        statusButton.textContent = user.status === 'active' ? 'Vô hiệu hóa' : 'Kích hoạt';
        statusButton.addEventListener('click', () => this.toggleAccountStatus(user));
        actions.append(statusButton);
      }
    });
  },
  updateCreateFields() {
    const isStudent = this.el('createRole').value === 'student';
    this.el('createStudentCodeGroup').hidden = !isStudent;
    this.el('createLinkedStudentGroup').hidden = isStudent;
    this.el('createStudentCode').required = isStudent;
    this.el('createLinkedStudentCode').required = !isStudent;
  },
  async createAccount() {
    const form = this.el('createAccountForm');
    if (!form.reportValidity() || this.state.busy) return;
    const role = this.el('createRole').value;
    const unmetRequirements = AuthService.getPasswordRequirements(this.el('createPassword').value)
      .filter(requirement => !requirement.passed);
    if (unmetRequirements.length) {
      this.message(`Mật khẩu cần đáp ứng: ${unmetRequirements.map(item => item.label).join(', ')}.`, 'warning');
      return;
    }
    const payload = {
      full_name: this.el('createFullName').value.trim(),
      username: this.el('createUsername').value.trim(),
      email: this.el('createEmail').value.trim() || null,
      phone: this.el('createPhone').value.trim() || null,
      password: this.el('createPassword').value,
      role
    };
    if (role === 'student') {
      payload.student_code = this.el('createStudentCode').value.trim();
    } else {
      payload.linked_student_code = this.el('createLinkedStudentCode').value.trim();
      payload.relationship = this.el('createRelationship').value || null;
    }
    this.state.busy = true;
    this.message('Đang tạo tài khoản…');
    try {
      await UserManagementModule.createUser(payload);
      form.reset();
      this.updateCreateFields();
      closeModal('modalCreateAccount');
      const refreshed = await this.loadUsers();
      this.message(
        refreshed ? 'Đã tạo tài khoản thành công.' : 'Tài khoản đã tạo nhưng không tải lại được danh sách.',
        refreshed ? 'success' : 'warning'
      );
    } catch (error) {
      this.message(`Không tạo được tài khoản: ${error.message}`, 'danger');
    } finally {
      this.el('createPassword').value = '';
      this.state.busy = false;
    }
  },
  async openParentLink(student) {
    this.el('linkStudentCode').value = student.student_code;
    this.el('linkStudentName').textContent = `${student.full_name} (${student.student_code})`;
    this.el('linkRelationship').value = '';
    this.el('linkParentMessage').hidden = true;
    const select = this.el('linkParentUser');
    select.replaceChildren(new Option('Đang tải tài khoản phụ huynh…', ''));
    select.disabled = true;
    openModal('modalLinkParent');
    try {
      const parents = await UserManagementModule.getUsersList('parent');
      const available = parents.filter(parent =>
        parent.status === 'active' && !this.parentAlreadyLinked(student, parent)
      );
      select.replaceChildren(new Option(
        available.length ? '— Chọn phụ huynh —' : 'Không còn phụ huynh chưa liên kết',
        ''
      ));
      available.forEach(parent => select.add(new Option(`${parent.full_name} (${parent.username})`, parent.id)));
      select.disabled = available.length === 0;
    } catch (error) {
      this.linkMessage(`Không tải được tài khoản phụ huynh: ${error.message}`, 'danger');
    }
  },
  parentAlreadyLinked(student, parent) {
    return (student.linked_user_ids || []).includes(parent.id);
  },
  linkMessage(text, type = 'info') {
    const box = this.el('linkParentMessage');
    box.textContent = text;
    box.className = `alert alert-${type}`;
    box.hidden = !text;
  },
  async linkParent() {
    const studentCode = this.el('linkStudentCode').value;
    const parentUserId = this.el('linkParentUser').value;
    if (!parentUserId || this.state.busy) {
      this.linkMessage('Vui lòng chọn tài khoản phụ huynh.', 'warning');
      return;
    }
    this.state.busy = true;
    try {
      await UserManagementModule.linkParentToStudent(
        parentUserId,
        studentCode,
        this.el('linkRelationship').value.trim()
      );
      closeModal('modalLinkParent');
      const refreshed = await this.loadUsers();
      this.message(
        refreshed ? 'Đã liên kết phụ huynh với học sinh.' : 'Đã liên kết nhưng không tải lại được danh sách.',
        refreshed ? 'success' : 'warning'
      );
    } catch (error) {
      this.linkMessage(`Không liên kết được: ${error.message}`, 'danger');
    } finally {
      this.state.busy = false;
    }
  },
  openPasswordReset(user) {
    this.el('resetUserId').value = user.id;
    this.el('resetUserName').textContent = `${user.full_name} (${user.username})`;
    this.el('resetNewPassword').value = '';
    this.el('resetConfirmPassword').value = '';
    this.el('resetPasswordMessage').hidden = true;
    openModal('modalResetPassword');
  },
  async resetAccountPassword() {
    const form = this.el('resetPasswordForm');
    if (!form.reportValidity() || this.state.busy) return;
    const password = this.el('resetNewPassword').value;
    if (password !== this.el('resetConfirmPassword').value) {
      this.resetMessage('Mật khẩu xác nhận không khớp.', 'warning');
      return;
    }
    const unmetRequirements = AuthService.getPasswordRequirements(password)
      .filter(requirement => !requirement.passed);
    if (unmetRequirements.length) {
      this.resetMessage(`Mật khẩu cần đáp ứng: ${unmetRequirements.map(item => item.label).join(', ')}.`, 'warning');
      return;
    }
    this.state.busy = true;
    try {
      await UserManagementModule.resetPassword(this.el('resetUserId').value, password);
      closeModal('modalResetPassword');
      this.message('Đã đặt lại mật khẩu; mọi phiên đăng nhập trước đó đã bị thu hồi.', 'success');
    } catch (error) {
      this.resetMessage(`Không đặt lại được mật khẩu: ${error.message}`, 'danger');
    } finally {
      this.el('resetNewPassword').value = '';
      this.el('resetConfirmPassword').value = '';
      this.state.busy = false;
    }
  },
  openAccountEdit(user) {
    this.el('editUserId').value = user.id;
    this.el('editFullName').value = user.full_name || '';
    this.el('editEmail').value = user.email || '';
    this.el('editPhone').value = user.phone || '';
    this.el('editAccountMessage').hidden = true;
    openModal('modalEditAccount');
  },
  async saveAccountEdit() {
    const form = this.el('editAccountForm');
    if (!form.reportValidity() || this.state.busy) return;
    this.state.busy = true;
    const payload = {
      full_name: this.el('editFullName').value.trim(),
      email: this.el('editEmail').value.trim() || null,
      phone: this.el('editPhone').value.trim() || null,
    };
    try {
      await UserManagementModule.updateUser(this.el('editUserId').value, payload);
      closeModal('modalEditAccount');
      const refreshed = await this.loadUsers();
      this.message(
        refreshed ? 'Đã cập nhật tài khoản.' : 'Đã cập nhật nhưng không tải lại được danh sách.',
        refreshed ? 'success' : 'warning'
      );
    } catch (error) {
      const box = this.el('editAccountMessage');
      box.textContent = `Không cập nhật được tài khoản: ${error.message}`;
      box.className = 'alert alert-danger';
      box.hidden = false;
    } finally {
      this.state.busy = false;
    }
  },
  async toggleAccountStatus(user) {
    const activating = user.status !== 'active';
    const action = activating ? 'kích hoạt' : 'vô hiệu hóa';
    if (!confirm(`Bạn có chắc muốn ${action} tài khoản ${user.full_name}?`)) return;
    this.state.busy = true;
    try {
      if (activating) {
        await UserManagementModule.updateUser(user.id, { status: 'active' });
      } else {
        await UserManagementModule.deleteUser(user.id);
      }
      const refreshed = await this.loadUsers();
      this.message(
        refreshed ? `Đã ${action} tài khoản.` : `Đã ${action} nhưng không tải lại được danh sách.`,
        refreshed ? 'success' : 'warning'
      );
    } catch (error) {
      this.message(`Không thể ${action} tài khoản: ${error.message}`, 'danger');
    } finally {
      this.state.busy = false;
    }
  },
  resetMessage(text, type = 'info') {
    const box = this.el('resetPasswordMessage');
    box.textContent = text;
    box.className = `alert alert-${type}`;
    box.hidden = !text;
  }
};

window.UserManagementPage = UserManagementPage;
