/**
 * MODULE: QUẢN LÝ NGƯỜI DÙNG & PHÂN QUYỀN (UC-02)
 * Đối tượng thực hiện: Giáo viên (Actor chính)
 */

function escapeHtml(text) {
  if (text == null) return '';
  return String(text)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

const UserManagementModule = {
  checkUsername(username) {
    return AuthService.api(`/users/check-username?username=${encodeURIComponent(username)}`);
  },

  createStudentWithParent(payload) {
    return AuthService.api('/users/student-with-parent', {
      method: 'POST',
      body: JSON.stringify(payload)
    });
  },

  getClasses() {
    return AuthService.api('/classes');
  },
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
  _initDropdownClose() {
    document.addEventListener('click', () => {
      document.querySelectorAll('.action-dropdown.open').forEach(d => d.classList.remove('open'));
    });
  },
  async init() {
    if (!AuthService.requireAuth('teacher')) return;
    this._initDropdownClose();
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

      // Cột 1: Tài khoản (chống rớt dòng tên)
      const account = row.insertCell();
      account.style.whiteSpace = 'nowrap';
      account.style.verticalAlign = 'middle';
      const name = document.createElement('strong');
      name.textContent = user.full_name;
      name.style.display = 'inline-block';
      name.style.whiteSpace = 'nowrap';
      const detail = document.createElement('span');
      detail.className = 'text-caption';
      detail.style.whiteSpace = 'nowrap';
      detail.textContent = `${user.student_code ? `${user.student_code} · ` : ''}${user.username}`;
      account.append(name, document.createElement('br'), detail);

      // Cột 2: Vai trò
      const role = row.insertCell();
      role.style.whiteSpace = 'nowrap';
      role.style.verticalAlign = 'middle';
      role.style.textAlign = 'center';
      const roleBadge = document.createElement('span');
      roleBadge.className = `badge badge-${user.role === 'student' ? 'info' : 'warning'}`;
      roleBadge.textContent = user.role === 'student' ? 'Học sinh' : 'Phụ huynh';
      role.append(roleBadge);

      // Cột 3: Lớp học
      const classCell = row.insertCell();
      classCell.style.whiteSpace = 'nowrap';
      classCell.style.verticalAlign = 'middle';
      classCell.textContent = user.class_names || '—';

      // Cột 4: Liên kết gia đình (chống nhảy dòng)
      const familyCell = row.insertCell();
      familyCell.style.whiteSpace = 'nowrap';
      familyCell.style.verticalAlign = 'middle';
      familyCell.textContent = user.linked_names || '—';

      // Cột 5: Trạng thái
      const status = row.insertCell();
      status.style.whiteSpace = 'nowrap';
      status.style.verticalAlign = 'middle';
      status.style.textAlign = 'center';
      const statusBadge = document.createElement('span');
      const statusLabels = { active: 'Hoạt động', inactive: 'Vô hiệu hóa', locked: 'Đang khóa' };
      statusBadge.className = `badge badge-${user.status === 'active' ? 'success' : 'neutral'}`;
      statusBadge.textContent = statusLabels[user.status] || user.status;
      status.append(statusBadge);

      // Cột 6: Thao tác — dropdown ⋮ menu
      const actions = row.insertCell();
      actions.style.textAlign = 'center';
      actions.style.verticalAlign = 'middle';
      actions.style.width = '56px';

      const menuWrap = document.createElement('div');
      menuWrap.className = 'action-menu-wrap';

      const menuBtn = document.createElement('button');
      menuBtn.type = 'button';
      menuBtn.className = 'action-menu-btn';
      menuBtn.title = 'Thao tác';
      menuBtn.innerHTML = `<svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><circle cx="12" cy="5" r="1.5"/><circle cx="12" cy="12" r="1.5"/><circle cx="12" cy="19" r="1.5"/></svg>`;

      const dropdown = document.createElement('div');
      dropdown.className = 'action-dropdown';

      // Mục: Chỉnh sửa
      const itemEdit = document.createElement('button');
      itemEdit.type = 'button';
      itemEdit.className = 'action-dropdown-item';
      itemEdit.innerHTML = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg> Chỉnh sửa`;
      itemEdit.addEventListener('click', () => { dropdown.classList.remove('open'); this.openAccountEdit(user); });
      dropdown.append(itemEdit);

      // Mục: Đặt lại mật khẩu
      const itemReset = document.createElement('button');
      itemReset.type = 'button';
      itemReset.className = 'action-dropdown-item';
      itemReset.innerHTML = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg> Đặt lại mật khẩu`;
      itemReset.addEventListener('click', () => { dropdown.classList.remove('open'); this.openPasswordReset(user); });
      dropdown.append(itemReset);

      // Mục: Liên kết phụ huynh (chỉ cho học sinh đang hoạt động)
      if (user.role === 'student' && user.status === 'active') {
        const divider1 = document.createElement('div');
        divider1.className = 'action-dropdown-divider';
        dropdown.append(divider1);

        const itemLink = document.createElement('button');
        itemLink.type = 'button';
        itemLink.className = 'action-dropdown-item';
        itemLink.innerHTML = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg> Liên kết phụ huynh`;
        itemLink.addEventListener('click', () => { dropdown.classList.remove('open'); this.openParentLink(user); });
        dropdown.append(itemLink);
      }

      // Mục: Vô hiệu hóa / Kích hoạt
      if (user.status === 'active' || user.status === 'inactive') {
        const divider2 = document.createElement('div');
        divider2.className = 'action-dropdown-divider';
        dropdown.append(divider2);

        const itemStatus = document.createElement('button');
        itemStatus.type = 'button';
        itemStatus.className = user.status === 'active' ? 'action-dropdown-item danger' : 'action-dropdown-item';
        const statusIcon = user.status === 'active'
          ? `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="4.93" y1="4.93" x2="19.07" y2="19.07"/></svg>`
          : `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>`;
        itemStatus.innerHTML = statusIcon + (user.status === 'active' ? ' Vô hiệu hóa' : ' Kích hoạt');
        itemStatus.addEventListener('click', () => { dropdown.classList.remove('open'); this.toggleAccountStatus(user); });
        dropdown.append(itemStatus);
      }

      // Toggle dropdown khi click nút ⋮ - dùng position fixed tránh bị clip bởi overflow
      menuBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        const isOpen = dropdown.classList.contains('open');
        // Đóng tất cả dropdown đang mở khác
        document.querySelectorAll('.action-dropdown.open').forEach(d => {
          d.classList.remove('open');
          d.style.removeProperty('position');
          d.style.removeProperty('top');
          d.style.removeProperty('right');
          d.style.removeProperty('left');
        });
        if (!isOpen) {
          const rect = menuBtn.getBoundingClientRect();
          dropdown.style.position = 'fixed';
          dropdown.style.top = (rect.bottom + 4) + 'px';
          dropdown.style.right = (window.innerWidth - rect.right) + 'px';
          dropdown.style.left = 'auto';
          dropdown.classList.add('open');
        }
      });

      menuWrap.append(menuBtn, dropdown);
      actions.append(menuWrap);
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
  },

  // ==========================================
  // VIEW QUẢN LÝ TẠO HỌC SINH THEO DESIGN MỚI
  // ==========================================
  parentMode: 'new',
  cachedClasses: [],

  async showCreateStudentView() {
    const listView = document.getElementById('userListView');
    const createView = document.getElementById('userCreateStudentView');
    if (!createView) return;

    listView.style.display = 'none';
    createView.style.display = 'block';

    // Reset form sạch sẽ, không gán dữ liệu mẫu
    const form = document.getElementById('formCreateStudentDesign');
    if (form) form.reset();
    document.getElementById('dsRequirePasswordChange').checked = true;
    document.getElementById('dsIsActive').checked = true;

    this.setParentMode('new');

    // Nạp danh sách lớp học và phụ huynh từ Backend API thực tế
    await Promise.all([
      this.loadClassesForStudentForm(),
      this.loadParentsForStudentForm()
    ]);

    this.updatePreview();
  },

  showListView() {
    const listView = document.getElementById('userListView');
    const createView = document.getElementById('userCreateStudentView');
    if (createView) createView.style.display = 'none';
    if (listView) listView.style.display = 'block';
  },

  setParentMode(mode) {
    this.parentMode = mode;
    const btnNew = document.getElementById('btnParentModeNew');
    const btnExisting = document.getElementById('btnParentModeExisting');
    const newFields = document.getElementById('parentModeNewFields');
    const existingFields = document.getElementById('parentModeExistingFields');
    const submitText = document.getElementById('btnSubmitText');

    if (mode === 'new') {
      btnNew.className = 'btn btn-primary';
      btnExisting.className = 'btn btn-secondary';
      newFields.style.display = 'block';
      existingFields.style.display = 'none';
      if (submitText) submitText.innerText = 'Tạo 2 tài khoản & liên kết';
    } else {
      btnNew.className = 'btn btn-secondary';
      btnExisting.className = 'btn btn-primary';
      newFields.style.display = 'none';
      existingFields.style.display = 'block';
      if (submitText) submitText.innerText = 'Tạo tài khoản học sinh & liên kết';
    }
    this.updatePreview();
  },

  async loadClassesForStudentForm() {
    const select = document.getElementById('dsStudentClassId');
    if (!select) return;
    try {
      select.innerHTML = '<option value="">Đang tải danh sách lớp...</option>';
      const classes = await UserManagementModule.getClasses();
      this.cachedClasses = Array.isArray(classes) ? classes : [];
      if (!this.cachedClasses.length) {
        select.innerHTML = '<option value="">Chưa có lớp học nào trong hệ thống</option>';
        return;
      }
      select.innerHTML = '<option value="" selected disabled>-- Chọn lớp học --</option>' +
        this.cachedClasses.map(c => {
          const cId = c.id || c.class_id;
          const cName = c.name || '';
          const cCode = c.code || c.class_code || '';
          return `<option value="${escapeHtml(cId)}">${escapeHtml(cName)} (${escapeHtml(cCode)})</option>`;
        }).join('');
    } catch (e) {
      console.warn('Lỗi nạp lớp:', e);
      select.innerHTML = `<option value="">Không thể nạp danh sách lớp (${escapeHtml(e.message)})</option>`;
    }
  },

  async loadParentsForStudentForm() {
    const select = document.getElementById('dsExistingParentSelect');
    if (!select) return;
    try {
      select.innerHTML = '<option value="">Đang tải danh sách phụ huynh...</option>';
      const parents = await UserManagementModule.getUsersList('parent');
      const activeParents = (Array.isArray(parents) ? parents : []).filter(p => p.status === 'active');
      if (!activeParents.length) {
        select.innerHTML = '<option value="">Chưa có phụ huynh nào trong hệ thống</option>';
        return;
      }
      select.innerHTML = '<option value="" selected disabled>-- Chọn phụ huynh có sẵn --</option>' +
        activeParents.map(p => `<option value="${escapeHtml(p.id)}">${escapeHtml(p.full_name)} (${escapeHtml(p.username)})</option>`).join('');
    } catch (e) {
      console.warn('Lỗi nạp phụ huynh:', e);
      select.innerHTML = `<option value="">Không thể nạp danh sách phụ huynh (${escapeHtml(e.message)})</option>`;
    }
  },

  updatePreview() {
    const sName = (document.getElementById('dsStudentFullName')?.value || '').trim();
    const classId = document.getElementById('dsStudentClassId')?.value;
    const selectedCls = this.cachedClasses.find(c => (c.id || c.class_id) === classId);

    const prevSName = document.getElementById('previewStudentName');
    if (prevSName) {
      prevSName.innerText = sName || 'Chưa nhập họ tên';
      prevSName.style.opacity = sName ? '1' : '0.6';
    }

    const prevCName = document.getElementById('previewClassName');
    if (prevCName) {
      prevCName.innerText = selectedCls ? `${selectedCls.name} (${selectedCls.code || selectedCls.class_code})` : 'Chưa chọn lớp học';
      prevCName.style.opacity = selectedCls ? '1' : '0.6';
    }

    const prevCap = document.getElementById('previewCapacityNum');
    if (prevCap) {
      if (selectedCls) {
        const currentCount = Number(selectedCls.student_count || 0);
        prevCap.innerText = `${currentCount + 1} học sinh (hiện tại: ${currentCount})`;
      } else {
        prevCap.innerText = '—';
      }
    }

    const prevPName = document.getElementById('previewParentName');
    const prevPRelation = document.getElementById('previewParentRelation');
    const linkPermText = document.getElementById('dsLinkPermissionText');

    let pName = '';
    let pRel = '';

    if (this.parentMode === 'new') {
      pName = (document.getElementById('dsParentFullName')?.value || '').trim();
      pRel = document.getElementById('dsParentRelationship')?.value || '';
      if (prevPName) {
        prevPName.innerText = pName || 'Chưa nhập thông tin phụ huynh';
        prevPName.style.opacity = pName ? '1' : '0.6';
      }
      if (prevPRelation) {
        if (!pName && !pRel) {
          prevPRelation.innerText = '—';
        } else {
          const relLabel = pRel || 'Chưa chọn quan hệ';
          prevPRelation.innerText = `${relLabel} · Tài khoản mới`;
        }
      }
    } else {
      const selParent = document.getElementById('dsExistingParentSelect');
      const selectedOption = selParent?.options[selParent.selectedIndex];
      const hasSelected = selectedOption && selectedOption.value;
      pName = hasSelected ? selectedOption.text.split('(')[0].trim() : '';
      pRel = document.getElementById('dsExistingParentRelationship')?.value || '';
      if (prevPName) {
        prevPName.innerText = pName || 'Chưa chọn phụ huynh';
        prevPName.style.opacity = pName ? '1' : '0.6';
      }
      if (prevPRelation) {
        if (!pName && !pRel) {
          prevPRelation.innerText = '—';
        } else {
          const relLabel = pRel || 'Chưa chọn quan hệ';
          prevPRelation.innerText = `${relLabel} · Tài khoản có sẵn`;
        }
      }
    }

    if (linkPermText) {
      const guardianStr = pName || 'Phụ huynh';
      const studentStr = sName || 'học sinh';
      linkPermText.innerText = `${guardianStr} chỉ xem được thông tin của ${studentStr} sau khi tài khoản được tạo.`;
    }
  },

  async checkStudentUsername() {
    const input = document.getElementById('dsStudentUsername');
    const helper = document.getElementById('dsStudentUsernameHelper');
    if (!input || !helper) return;

    const u = input.value.trim();
    if (u.length < 3) {
      helper.innerText = 'Tên đăng nhập phải có ít nhất 3 ký tự.';
      helper.style.color = 'var(--color-text-secondary)';
      return;
    }

    try {
      const res = await UserManagementModule.checkUsername(u);
      if (res.available) {
        helper.innerText = 'Tên đăng nhập chưa được sử dụng.';
        helper.style.color = '#059669';
      } else {
        helper.innerText = 'Tên đăng nhập đã được sử dụng!';
        helper.style.color = '#dc2626';
      }
    } catch (e) {
      // Bỏ qua lỗi kết nối
    }
  },

  togglePasswordVisibility(inputId, btn) {
    const input = document.getElementById(inputId);
    if (!input) return;
    if (input.type === 'password') {
      input.type = 'text';
      btn.style.color = 'var(--color-primary)';
    } else {
      input.type = 'password';
      btn.style.color = 'var(--color-text-secondary)';
    }
  },

  async handleCreateStudentDesign(event) {
    event.preventDefault();
    const btn = document.getElementById('btnSubmitCreateStudentDesign');
    btn.disabled = true;

    try {
      const payload = {
        full_name: document.getElementById('dsStudentFullName').value.trim(),
        date_of_birth: document.getElementById('dsStudentDob').value || null,
        phone: document.getElementById('dsStudentPhone').value.trim() || null,
        class_id: document.getElementById('dsStudentClassId').value,
        address: document.getElementById('dsStudentAddress').value.trim() || null,
        username: document.getElementById('dsStudentUsername').value.trim(),
        password: document.getElementById('dsStudentPassword').value,
        require_password_change: document.getElementById('dsRequirePasswordChange').checked,
        is_active: document.getElementById('dsIsActive').checked,
        parent_mode: this.parentMode
      };

      if (!payload.class_id) {
        alert('Vui lòng chọn lớp học cho học sinh.');
        btn.disabled = false;
        return;
      }

      if (this.parentMode === 'new') {
        payload.parent_full_name = document.getElementById('dsParentFullName').value.trim();
        payload.parent_relationship = document.getElementById('dsParentRelationship').value;
        payload.parent_phone = document.getElementById('dsParentPhone').value.trim() || null;
        payload.parent_username = document.getElementById('dsParentUsername').value.trim();
        payload.parent_password = document.getElementById('dsParentPassword').value;

        if (!payload.parent_full_name || !payload.parent_username || !payload.parent_password) {
          alert('Vui lòng nhập đầy đủ thông tin tài khoản phụ huynh mới.');
          btn.disabled = false;
          return;
        }
        if (!payload.parent_relationship) {
          alert('Vui lòng chọn quan hệ với học sinh (Bố, Mẹ, Người giám hộ...).');
          btn.disabled = false;
          return;
        }
      } else {
        payload.existing_parent_user_id = document.getElementById('dsExistingParentSelect').value;
        payload.parent_relationship = document.getElementById('dsExistingParentRelationship').value;

        if (!payload.existing_parent_user_id) {
          alert('Vui lòng chọn tài khoản phụ huynh có sẵn.');
          btn.disabled = false;
          return;
        }
        if (!payload.parent_relationship) {
          alert('Vui lòng chọn quan hệ với học sinh (Bố, Mẹ, Người giám hộ...).');
          btn.disabled = false;
          return;
        }
      }

      const result = await UserManagementModule.createStudentWithParent(payload);
      alert(result.message || 'Tạo tài khoản học sinh thành công!');

      this.showListView();
      await this.loadUsers();
    } catch (err) {
      alert('Không tạo được tài khoản: ' + err.message);
    } finally {
      btn.disabled = false;
    }
  }
};

window.UserManagementPage = UserManagementPage;
