const ExamHomeworkModule = {
  getAssignments(classId) {
    const query = classId ? `?class_id=${encodeURIComponent(classId)}` : '';
    return AuthService.api(`/assignments${query}`);
  },
  createAssignment(payload) {
    return AuthService.api('/assignments', { method: 'POST', body: JSON.stringify(payload) });
  },
  updateAssignment(assignmentId, updates) {
    return AuthService.api(`/assignments/${encodeURIComponent(assignmentId)}`, {
      method: 'PATCH',
      body: JSON.stringify(updates)
    });
  }
};

window.ExamHomeworkModule = ExamHomeworkModule;
