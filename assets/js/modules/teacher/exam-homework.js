const ExamHomeworkModule = {
  getAssignments(classId) {
    const query = classId ? `?class_id=${encodeURIComponent(classId)}` : '';
    return AuthService.api(`/assignments${query}`);
  },
  createAssignment(payload) {
    return AuthService.api('/assignments', { method: 'POST', body: JSON.stringify(payload) });
  },
  createAssignmentWithAttachment(payload, file) {
    const data = new FormData();
    for (const [key, value] of Object.entries(payload)) {
      if (value !== null && value !== undefined) data.append(key, value);
    }
    data.append('file', file);
    return AuthService.api('/assignments/with-attachment', { method: 'POST', body: data });
  },
  replaceAttachment(assignmentId, file) {
    const data = new FormData();
    data.append('file', file);
    return AuthService.api(`/assignments/${encodeURIComponent(assignmentId)}/attachment`, { method: 'PUT', body: data });
  },
  updateAssignment(assignmentId, updates) {
    return AuthService.api(`/assignments/${encodeURIComponent(assignmentId)}`, {
      method: 'PATCH',
      body: JSON.stringify(updates)
    });
  }
};

window.ExamHomeworkModule = ExamHomeworkModule;
