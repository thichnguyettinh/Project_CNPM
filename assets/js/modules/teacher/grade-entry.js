const GradeEntryModule = {
  getGradeSheet(assignmentId) {
    return AuthService.api(`/assignments/${encodeURIComponent(assignmentId)}/results`);
  },
  saveScores(assignmentId, scoresList) {
    const results = scoresList.map(result => ({
      student_code: result.student_code || result.studentCode,
      score: result.score,
      teacher_comment: result.teacher_comment || result.comment || null,
      change_reason: result.change_reason || result.reason || null
    }));
    return AuthService.api(`/assignments/${encodeURIComponent(assignmentId)}/results`, {
      method: 'PUT',
      body: JSON.stringify({ results })
    });
  },
  getGradeHistory(studentCode) {
    return AuthService.api(`/grade-history/${encodeURIComponent(studentCode)}`);
  }
};

window.GradeEntryModule = GradeEntryModule;
