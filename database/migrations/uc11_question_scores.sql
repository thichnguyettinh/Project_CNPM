-- UC-11: lưu điểm chi tiết từng câu, chạy 1 lần trên database local đã có schema cũ.
CREATE TABLE IF NOT EXISTS assignment_question_scores (
  assignment_id VARCHAR(36) NOT NULL,
  student_id BIGINT NOT NULL,
  question_no SMALLINT NOT NULL CHECK (question_no BETWEEN 1 AND 100),
  max_score NUMERIC(4,2) NOT NULL CHECK (max_score > 0 AND max_score <= 10 AND max_score * 2 = FLOOR(max_score * 2)),
  earned_score NUMERIC(4,2) NOT NULL CHECK (earned_score >= 0 AND earned_score <= max_score AND earned_score * 2 = FLOOR(earned_score * 2)),
  PRIMARY KEY (assignment_id, student_id, question_no),
  FOREIGN KEY (assignment_id, student_id)
    REFERENCES assignment_results(assignment_id, student_id) ON DELETE CASCADE
);
