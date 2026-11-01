/* UC-08 — Sổ điểm theo bài và lớp, sử dụng API thật của FastAPI.
 * Chỉ gửi những học sinh có điểm/nhận xét thay đổi, không ghi đè các điểm khác.
 */
(() => {
  'use strict';

  const rules = {
    parseScore(raw) {
      const value = String(raw ?? '').trim();
      if (!value) return null;
      if (!/^(?:\d+(?:\.\d+)?|\.\d+)$/.test(value)) {
        throw new Error('Điểm phải là số, sử dụng dấu chấm làm dấu thập phân.');
      }
      const score = Number(value);
      if (!Number.isFinite(score) || score < 0 || score > 10 || !Number.isInteger(score * 2)) {
        throw new Error('Điểm phải từ 0 đến 10 và tăng theo bước 0,5.');
      }
      return score;
    },
    compareRow(studentCode, initial, current) {
      const score = rules.parseScore(current.score);
      const comment = String(current.comment ?? '').trim();
      const reason = String(current.reason ?? '').trim();
      const previousScore = initial.score == null ? null : Number(initial.score);
      const previousComment = String(initial.teacher_comment ?? '').trim();
      const changedScore = score !== previousScore;
      if (!changedScore && comment === previousComment) return null;
      if (changedScore && (previousScore !== null || initial.graded_at) && !reason) {
        throw new Error(`Học sinh ${studentCode}: phải nhập lý do khi sửa điểm cũ.`);
      }
      if (reason.length > 500) throw new Error(`Học sinh ${studentCode}: lý do tối đa 500 ký tự.`);
      return {
        student_code: studentCode,
        score,
        teacher_comment: comment || null,
        change_reason: changedScore ? (reason || null) : null
      };
    }
  };
  // Export quy tắc thuần để kiểm thử với Node.js mà không cần khởi động trình duyệt.
  if (typeof module !== 'undefined' && module.exports) module.exports = rules;
  if (typeof document === 'undefined') return;

  const $ = id => document.getElementById(id);
  const safe = value => String(value ?? '').replace(/[&<>"']/g, c => ({
    '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;'
  }[c]));
  const state = { assignments: [], assignmentId: '', students: [], classId: '', requestId: 0 };
  const label = item => ({homework:'Bài tập',quiz:'Bài kiểm tra',midterm:'Giữa kỳ',final:'Cuối kỳ'})[item.assignment_type] || 'Bài';
  const displayScore = score => score == null ? '—' : Number(score).toLocaleString('vi-VN',{maximumFractionDigits:1});
  const displayDate = date => {
    if (!date) return '—';
    const d = new Date(date);
    return Number.isNaN(d.getTime()) ? '—' : d.toLocaleString('vi-VN');
  };

  function notice(message, isError=false) {
    const el = $('uc08-notice');
    if (!el) return;
    el.hidden = !message;
    el.textContent = message;
    el.classList.toggle('uc08-error', isError);
  }
  function emptyTable(message) {
    $('uc08-rows').innerHTML = `<tr><td colspan="5" class="uc08-empty">${safe(message)}</td></tr>`;
  }
  function clearSummary() {
    $('uc08-graded-count').textContent = '—';
    $('uc08-average').textContent = '—';
    $('uc08-summary-average').textContent = '—';
    $('uc08-save').disabled = true;
  }
  function pendingEdits() {
    if (!state.students.length) return false;
    return Array.from($('uc08-rows').querySelectorAll('tr[data-student-code]')).some(tr => {
      const initial = state.students.find(s => s.student_code === tr.dataset.studentCode);
      if (!initial) return false;
      const scoreRaw = tr.querySelector('[data-uc08-score]').value.trim();
      const scoreWas = initial.score == null ? '' : String(Number(initial.score));
      const note = tr.querySelector('[data-uc08-comment]').value.trim();
      return scoreRaw !== scoreWas || note !== String(initial.teacher_comment ?? '').trim();
    });
  }
  function askDiscard() {
    return !pendingEdits() || window.confirm('Bạn có thay đổi chưa lưu. Chuyển bài sẽ bỏ các thay đổi đó. Tiếp tục?');
  }

  async function refreshAssignments(preferredId = '') {
    const classId = $('uc07-class')?.value || '';
    const req = ++state.requestId;
    state.classId = classId;
    state.students = [];
    state.assignmentId = '';
    clearSummary();
    $('uc08-history-panel').hidden = true;
    if (!classId) {
      $('uc08-assignment').innerHTML = '<option value="">Vui lòng tạo và chọn lớp học</option>';
      emptyTable('Chưa có lớp học.');
      return;
    }
    notice('Đang tải bài tập và bài kiểm tra...');
    try {
      const assignments = await ExamHomeworkModule.getAssignments(classId);
      if (req !== state.requestId) return;
      state.assignments = assignments;
      $('uc08-assignment').innerHTML = assignments.length
        ? assignments.map(a => `<option value="${safe(a.id)}">${safe(label(a))}: ${safe(a.title)}</option>`).join('')
        : '<option value="">Chưa có bài tập/bài kiểm tra trong lớp</option>';
      if (!assignments.length) {
        notice('Chưa có bài để nhập điểm. Hãy tạo bài ở UC-07.');
        emptyTable('Danh sách bài hiện trống.');
        return;
      }
      const id = assignments.some(a => a.id === preferredId) ? preferredId : assignments[0].id;
      $('uc08-assignment').value = id;
      await loadGrades(id, req);
    } catch (error) {
      if (req !== state.requestId) return;
      notice(error.message || 'Không tải được danh sách bài.', true);
      emptyTable('Không tải được dữ liệu. Hãy kiểm tra backend và quyền giáo viên.');
    }
  }
  async function loadGrades(assignmentId, originalRequest = null) {
    const req = originalRequest ?? ++state.requestId;
    state.assignmentId = assignmentId;
    state.students = [];
    clearSummary();
    $('uc08-history-panel').hidden = true;
    if (!assignmentId) {
      emptyTable('Chưa chọn bài để nhập điểm.');
      return;
    }
    emptyTable('Đang tải bảng điểm...');
    notice('Đang tải học sinh và điểm đã lưu...');
    try {
      const students = await GradeEntryModule.getGradeSheet(assignmentId);
      if (req !== state.requestId || assignmentId !== state.assignmentId) return;
      if (!Array.isArray(students)) throw new Error('API bảng điểm trả về dữ liệu không hợp lệ.');
      state.students = students.map(s => ({
        student_code: String(s.student_code),
        full_name: String(s.full_name || ''),
        score: s.score == null ? null : Number(s.score),
        teacher_comment: s.teacher_comment || '',
        graded_at: s.graded_at || null,
        submission_id: s.submission_id || null,
        file_name: s.file_name || 'bai-nop'
      }));
      renderRows();
      updateSummary();
      $('uc08-save').disabled = students.length === 0;
      notice(`Đã tải ${students.length} học sinh. Bạn có thể nhập/sửa điểm và lưu.`);
    } catch (error) {
      if (req !== state.requestId) return;
      notice(error.message || 'Không tải được bảng điểm.', true);
      emptyTable('Không tải được bảng điểm.');
    }
  }
  function renderRows() {
    if (!state.students.length) {
      emptyTable('Lớp chưa có học sinh được ghi danh.');
      return;
    }
    $('uc08-rows').innerHTML = state.students.map(s => `
      <tr data-student-code="${safe(s.student_code)}">
        <td><strong>${safe(s.full_name)}</strong><div class="text-caption">${safe(s.student_code)}</div></td>
        <td><input type="number" class="form-control" min="0" max="10" step="0.5" inputmode="decimal" data-uc08-score aria-label="Điểm ${safe(s.full_name)}" value="${s.score == null ? '' : safe(s.score)}"></td>
        <td><input type="text" class="form-control" maxlength="1000" data-uc08-comment aria-label="Nhận xét ${safe(s.full_name)}" value="${safe(s.teacher_comment)}"></td>
        <td><input type="text" class="form-control" maxlength="500" data-uc08-reason placeholder="Chỉ nhập khi sửa điểm" aria-label="Lý do sửa điểm ${safe(s.full_name)}"><div class="uc08-row-note" data-uc08-row-note hidden></div></td>
        <td class="uc08-row-actions"><button class="btn btn-secondary btn-sm" type="button" data-uc08-history="${safe(s.student_code)}">Xem lịch sử</button>${s.submission_id ? `<button class="btn btn-secondary btn-sm" type="button" data-uc08-download="${safe(s.submission_id)}" data-uc08-filename="${safe(s.file_name)}">Tải bài nộp</button>` : ''}</td>
      </tr>`).join('');
  }
  function updateSummary() {
    const grades = state.students.filter(s => s.score !== null).map(s => s.score);
    $('uc08-graded-count').textContent = `${grades.length}/${state.students.length}`;
    const average = grades.length ? (grades.reduce((sum,n) => sum+n,0)/grades.length).toLocaleString('vi-VN',{maximumFractionDigits:2})+' / 10' : 'Chưa có điểm';
    $('uc08-average').textContent = average;
    $('uc08-summary-average').textContent = average;
  }
  function markEdits() {
    for (const tr of $('uc08-rows').querySelectorAll('tr[data-student-code]')) {
      const initial = state.students.find(s => s.student_code === tr.dataset.studentCode);
      if (!initial) continue;
      const current = {
        score: tr.querySelector('[data-uc08-score]').value,
        comment: tr.querySelector('[data-uc08-comment]').value,
        reason: tr.querySelector('[data-uc08-reason]').value
      };
      let changed = false;
      let error = '';
      try { changed = Boolean(rules.compareRow(initial.student_code, initial, current)); }
      catch (e) { changed = true; error = e.message; }
      tr.classList.toggle('uc08-dirty', changed);
      const note = tr.querySelector('[data-uc08-row-note]');
      note.hidden = !error;
      note.textContent = error;
    }
  }
  async function save(event) {
    event.preventDefault();
    if (!state.assignmentId) { notice('Hãy chọn bài cần chấm.', true); return; }
    const changed = [];
    try {
      for (const tr of $('uc08-rows').querySelectorAll('tr[data-student-code]')) {
        const code = tr.dataset.studentCode;
        const initial = state.students.find(s => s.student_code === code);
        if (!initial) continue;
        const entry = rules.compareRow(code, initial, {
          score: tr.querySelector('[data-uc08-score]').value,
          comment: tr.querySelector('[data-uc08-comment]').value,
          reason: tr.querySelector('[data-uc08-reason]').value
        });
        if (entry) changed.push(entry);
      }
    } catch (error) {
      notice(error.message, true);
      markEdits();
      return;
    }
    if (!changed.length) { notice('Không có điểm hoặc nhận xét nào thay đổi.'); return; }
    const button = $('uc08-save');
    button.disabled = true;
    notice(`Đang lưu ${changed.length} học sinh...`);
    try {
      await GradeEntryModule.saveScores(state.assignmentId, changed);
      const count = changed.length;
      // Tải lại từ PostgreSQL thay vì giả định API đã lưu thành công.
      await loadGrades(state.assignmentId);
      if (state.students.length) notice(`Đã lưu thành công ${count} học sinh. Bảng điểm đã được tải lại từ PostgreSQL.`);
    } catch (error) {
      notice(error.message || 'Không lưu được bảng điểm.', true);
    } finally {
      if (state.students.length) button.disabled = false;
    }
  }
  async function showHistory(code) {
    const assignmentId = state.assignmentId;
    const s = state.students.find(row => row.student_code === code);
    if (!s || !assignmentId) return;
    $('uc08-history-title').textContent = `Lịch sử sửa điểm · ${s.full_name} (${code})`;
    $('uc08-history-panel').hidden = false;
    $('uc08-history-content').textContent = 'Đang tải...';
    try {
      const entries = await GradeEntryModule.getGradeHistory(code);
      if (assignmentId !== state.assignmentId) return;
      const subset = (Array.isArray(entries) ? entries : []).filter(log => log.assignment_id === assignmentId);
      if (!subset.length) {
        $('uc08-history-content').textContent = 'Chưa có lần chỉnh sửa điểm nào cho học sinh ở bài này. API hiện chỉ ghi lịch sử khi sửa điểm đã lưu.';
        return;
      }
      $('uc08-history-content').innerHTML = `<div class="table-container"><table class="table-custom uc08-history-table">
        <thead><tr><th>Thời điểm</th><th>Người sửa</th><th>Điểm cũ → mới</th><th>Lý do</th></tr></thead>
        <tbody>${subset.map(log => `<tr>
          <td>${safe(displayDate(log.changed_at))}</td>
          <td>${safe(log.changed_by_name)}</td>
          <td>${safe(displayScore(log.old_score))} → <strong>${safe(displayScore(log.new_score))}</strong></td>
          <td>${safe(log.reason)}</td>
        </tr>`).join('')}</tbody></table></div>`;
      $('uc08-history-panel').scrollIntoView({block:'nearest',behavior:'smooth'});
    } catch (error) {
      $('uc08-history-content').textContent = error.message || 'Không tải được lịch sử điểm.';
    }
  }
  async function downloadSubmission(submissionId, fileName) {
    const response = await fetch(`${AuthService.API_BASE_URL}/submissions/${encodeURIComponent(submissionId)}/file`, {
      headers: { Authorization: `Bearer ${AuthService.getToken()}` }
    });
    if (!response.ok) throw new Error('Không tải được bài nộp. Hãy kiểm tra quyền truy cập.');
    const blob = await response.blob();
    const url = URL.createObjectURL(blob);
    try {
      const link = document.createElement('a');
      link.href = url; link.download = fileName || 'bai-nop';
      document.body.appendChild(link); link.click(); link.remove();
    } finally { setTimeout(() => URL.revokeObjectURL(url), 1000); }
  }
  async function openAssignment(id) {
    if (!askDiscard()) return;
    window.switchGradeView('viewEntry', $('tabBtn3'));
    await refreshAssignments(id);
  }
  function start() {
    if (!AuthService.getToken() || AuthService.getCurrentUser()?.role !== 'teacher') return;
    $('tabBtn3')?.addEventListener('click', event => {
      if (!askDiscard()) {
        event.preventDefault();
        event.stopImmediatePropagation();
        return;
      }
      refreshAssignments(state.assignmentId);
    }, true);
    // Kiểm tra thay đổi chưa lưu TRƯỚC listener UC-07 (capture) để không đổi lớp ngoài ý muốn.
    $('uc07-class')?.addEventListener('change', event => {
      if ($('viewEntry').style.display !== 'none' && !askDiscard()) {
        event.target.value = state.classId;
        event.stopImmediatePropagation();
      }
    }, true);
    $('uc07-class')?.addEventListener('change', () => {
      if ($('viewEntry').style.display !== 'none') refreshAssignments();
      else {state.requestId++; state.students = []; state.assignmentId = ''; clearSummary();}
    });
    $('uc08-assignment')?.addEventListener('change', event => {
      if (!askDiscard()) {event.target.value = state.assignmentId;return;}
      loadGrades(event.target.value);
    });
    $('uc08-refresh')?.addEventListener('click', () => {
      if (askDiscard()) refreshAssignments(state.assignmentId);
    });
    $('uc08-form')?.addEventListener('submit', save);
    $('uc08-rows')?.addEventListener('input', markEdits);
    $('uc08-rows')?.addEventListener('click', event => {
      const button = event.target.closest('[data-uc08-history]');
      if (button) showHistory(button.dataset.uc08History);
      const download = event.target.closest('[data-uc08-download]');
      if (download) downloadSubmission(download.dataset.uc08Download, download.dataset.uc08Filename)
        .catch(error => notice(error.message || 'Tải bài nộp thất bại.', true));
    });
    $('uc08-history-close')?.addEventListener('click', () => {$('uc08-history-panel').hidden=true;});
    document.addEventListener('click', event => {
      const button = event.target.closest('[data-uc08-open]');
      if (button) openAssignment(button.dataset.uc08Open);
    });
  }
  window.UC08Gradebook = {openAssignment, refreshAssignments};
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded',start);
  else start();
})();
