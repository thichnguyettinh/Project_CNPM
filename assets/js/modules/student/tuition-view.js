const StudentTuitionViewModule = {
  getMyTuitionStatus() {
    return AuthService.api('/tuition/invoices');
  }
};

window.StudentTuitionViewModule = StudentTuitionViewModule;
