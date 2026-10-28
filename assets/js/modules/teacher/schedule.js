const ScheduleModule = {
  getSchedules(filter = {}) {
    const query = new URLSearchParams(filter).toString();
    return AuthService.api(`/sessions${query ? `?${query}` : ''}`);
  },
  addSchedule(scheduleData) {
    return AuthService.api('/sessions', { method: 'POST', body: JSON.stringify(scheduleData) });
  },
  rescheduleSession(sessionId, updates) {
    return AuthService.api(`/sessions/${sessionId}`, {
      method: 'PATCH',
      body: JSON.stringify(updates)
    });
  }
};

window.ScheduleModule = ScheduleModule;
