const ClassManagementModule = {
  getClasses() {
    return AuthService.api('/classes');
  },
  createClass(classData) {
    return AuthService.api('/classes', { method: 'POST', body: JSON.stringify(classData) });
  },
  updateClass(classId, payload) {
    return AuthService.api(`/classes/${encodeURIComponent(classId)}`, {
      method: 'PATCH',
      body: JSON.stringify(payload)
    });
  },
  closeClass(classId) {
    return this.updateClass(classId, { status: 'completed' });
  }
};

window.ClassManagementModule = ClassManagementModule;
