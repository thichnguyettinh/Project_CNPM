const StudentScheduleModule = {
  getMySchedule() {
    return AuthService.api('/sessions');
  },
  getSessionDetail(sessionId) {
    return AuthService.api(`/sessions/${sessionId}/attendance`);
  }
};

window.StudentScheduleModule = StudentScheduleModule;
