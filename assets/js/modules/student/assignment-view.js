const StudentAssignmentModule = {
  getAssignments(classId) {
    const query = classId ? `?class_id=${encodeURIComponent(classId)}` : '';
    return AuthService.api(`/assignments${query}`);
  },
  submitAssignment(assignmentId, file) {
    const body = new FormData();
    body.append('file', file);
    return AuthService.api(`/assignments/${encodeURIComponent(assignmentId)}/submissions`, {
      method: 'POST',
      body
    });
  }
};

window.StudentAssignmentModule = StudentAssignmentModule;
