const ParentScheduleModule = {
  getChildSchedule() {
    return AuthService.api('/sessions');
  }
};

window.ParentScheduleModule = ParentScheduleModule;
