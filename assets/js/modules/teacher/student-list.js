const StudentListModule = {
  getStudentsByClass(classId) {
    return AuthService.api(`/classes/${encodeURIComponent(classId)}/students`);
  },
  addStudentToClass(classId, studentCode, enrolledOn = new Date().toISOString().slice(0, 10)) {
    return AuthService.api(`/classes/${encodeURIComponent(classId)}/students`, {
      method: 'POST',
      body: JSON.stringify({ student_code: studentCode, enrolled_on: enrolledOn })
    });
  },
  removeStudentFromClass(classId, studentCode) {
    return AuthService.api(
      `/classes/${encodeURIComponent(classId)}/students/${encodeURIComponent(studentCode)}`,
      { method: 'DELETE' }
    );
  }
};

window.StudentListModule = StudentListModule;
