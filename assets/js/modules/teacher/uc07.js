/* UC-07 — Khánh Lân: bài tập / bài kiểm tra dùng API thật; không sửa UC-08/11 */
(() => {
  'use strict';
  const $ = id => document.getElementById(id);
  const state = { classes: [], assignments: [], classId: '' };
  const escapeHtml = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const typeLabel = type => ({homework:'Bài tập',quiz:'Bài kiểm tra',midterm:'Giữa kỳ',final:'Cuối kỳ'})[type] || type;
  const MAX_FILE_BYTES = 10 * 1024 * 1024;
  const validExtension = /\.(pdf|docx|png|jpe?g)$/i;
  const isExam = type => type !== 'homework';
  const localDay = date => `${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,'0')}-${String(date.getDate()).padStart(2,'0')}`;
  const formatDate = value => value ? new Date(value).toLocaleDateString('vi-VN') : '—';
  const formatDue = value => value ? new Date(value).toLocaleString('vi-VN', {dateStyle:'short',timeStyle:'short'}) : 'Không giới hạn';
  const localDatetime = value => {
    if (!value) return '';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return '';
    return `${localDay(date)}T${String(date.getHours()).padStart(2,'0')}:${String(date.getMinutes()).padStart(2,'0')}`;
  };
  function notify(message, isError = false) {
    const target = $('uc07-notice');
    target.hidden = !message;
    target.textContent = message;
    target.classList.toggle('uc07-error', isError);
  }
  async function invoke(task) {
    try { await task(); } catch (error) {
      notify(error.message || 'Không thực hiện được yêu cầu.', true);
    }
  }
  async function init() {
    state.classes = await AuthService.api('/classes');
    const select = $('uc07-class');
    const available = state.classes.filter(row => row.status !== 'archived');
    select.innerHTML = available.map(row => `<option value="${escapeHtml(row.id)}">${escapeHtml(row.code)} — ${escapeHtml(row.name)}</option>`).join('');
    if (!available.length) {
      $('uc07-create-homework').disabled = true;
      $('uc07-create-exam').disabled = true;
      $('uc07-exam-list').textContent = 'Chưa có lớp học. Hãy tạo lớp ở mục Lớp học trước.';
      $('uc07-homework-list').textContent = 'Chưa có lớp học.';
      notify('Tài khoản giáo viên hiện chưa có lớp để giao bài.', true);
      return;
    }
    state.classId = available[0].id;
    await reload();
  }
  async function reload() {
    state.classId = $('uc07-class').value;
    if (!state.classId) return;
    state.assignments = await ExamHomeworkModule.getAssignments(state.classId);
    render();
  }
  function validateAttachment(file) {
    if (!file) return;
    if (!validExtension.test(file.name)) throw new Error('Chỉ được tải đề PDF, DOCX, JPG hoặc PNG.');
    if (!file.size) throw new Error('Tệp đề đang trống.');
    if (file.size > MAX_FILE_BYTES) throw new Error('Tệp đề vượt quá 10 MB.');
  }
  function updateFileControls() {
    const currentId = $('uc07-edit-id').value;
    const type = $('uc07-type').value;
    const required = !currentId && isExam(type);
    $('uc07-attachment').required = required;
    $('uc07-file-required').textContent = required ? '(bắt buộc khi tạo bài kiểm tra)' : '(không bắt buộc nếu là bài tập hoặc đã có tệp đề)';
  }
  function tableFor(records, empty) {
    if (!records.length) return `<p class="uc07-empty">${empty}</p>`;
    const rows = records.map(item => `
      <tr>
        <td><strong>${escapeHtml(item.title)}</strong><div class="text-caption">${escapeHtml(item.description || '')}</div></td>
        <td>${escapeHtml(typeLabel(item.assignment_type))}</td>
        <td>${escapeHtml(formatDate(item.assigned_at))}</td>
        <td>${escapeHtml(formatDue(item.due_at))}</td>
        <td>${item.attachment_file_name ? `<button type="button" class="btn btn-secondary btn-sm" data-uc07-download="${escapeHtml(item.id)}" title="Tải đề bài">Tải đề</button><div class="text-caption">${escapeHtml(item.attachment_file_name)}</div>` : '<span class="text-caption">Chưa có tệp đề</span>'}</td>
        <td><span class="badge badge-info">${item.status === 'closed' ? 'Đã đóng' : 'Đã công bố'}</span></td>
        <td class="uc08-row-actions"><button class="btn btn-primary btn-sm" type="button" data-uc08-open="${escapeHtml(item.id)}">Nhập điểm</button><button class="btn btn-secondary btn-sm" type="button" data-uc07-edit="${escapeHtml(item.id)}">Sửa</button></td>
      </tr>`).join('');
    return `<div class="table-container"><table class="table-custom">
      <thead><tr><th>Tên bài</th><th>Loại</th><th>Ngày giao</th><th>Hạn nộp</th><th>Tệp đề</th><th>Trạng thái</th><th>Thao tác</th></tr></thead>
      <tbody>${rows}</tbody></table></div>`;
  }
  function render() {
    const homework = state.assignments.filter(a => a.assignment_type === 'homework');
    const exams = state.assignments.filter(a => a.assignment_type !== 'homework');
    $('uc07-homework-list').innerHTML = tableFor(homework, 'Chưa có bài tập được công bố.');
    $('uc07-exam-list').innerHTML = tableFor(exams, 'Chưa có bài kiểm tra được công bố.');
    $('uc07-count-homework').textContent = homework.length;
    $('uc07-count-exam').textContent = exams.length;
    $('uc07-tab-homework').textContent = homework.length;
    $('uc07-tab-exam').textContent = exams.length;
  }
  function openForm(type = 'homework', assignment = null) {
    if (!state.classId) { notify('Bạn cần chọn lớp học.', true); return; }
    const item = assignment || {};
    $('uc07-form').reset();
    $('uc07-edit-id').value = item.id || '';
    $('uc07-title').value = item.title || '';
    $('uc07-type').value = item.assignment_type || type;
    $('uc07-status').value = item.status === 'closed' ? 'closed' : 'published';
    $('uc07-status').disabled = !item.id;
    $('uc07-date').value = item.assigned_at ? item.assigned_at.slice(0,10) : localDay(new Date());
    $('uc07-due').value = localDatetime(item.due_at);
    $('uc07-description').value = item.description || '';
    $('uc07-attachment').value = '';
    $('uc07-current-attachment').textContent = item.attachment_file_name
      ? `Đề hiện tại: ${item.attachment_file_name} — chọn tệp mới để thay thế.`
      : 'Chưa có tệp đề đính kèm.';
    updateFileControls();
    const currentClass = state.classes.find(c => c.id === state.classId);
    $('uc07-modal-class').textContent = `Lớp: ${currentClass?.code || ''} — ${currentClass?.name || ''}`;
    $('uc07-modal-title').textContent = item.id ? 'Chỉnh sửa bài tập / bài kiểm tra' : type === 'homework' ? 'Tạo bài tập mới' : 'Tạo bài kiểm tra mới';
    $('uc07-modal').hidden = false;
    $('uc07-title').focus();
  }
  async function saveForm(event) {
    event.preventDefault();
    const id = $('uc07-edit-id').value;
    const title = $('uc07-title').value.trim();
    const date = $('uc07-date').value;
    const due = $('uc07-due').value;
    const file = $('uc07-attachment').files[0] || null;
    if (!title || !date) throw new Error('Tên bài và ngày giao không được bỏ trống.');
    if (due && new Date(due) < new Date(`${date}T00:00:00`)) throw new Error('Hạn nộp phải từ ngày giao trở đi.');
    if (!id && isExam($('uc07-type').value) && !file) throw new Error('Vui lòng chọn tệp đề bài kiểm tra trước khi lưu.');
    validateAttachment(file);
    const payload = {
      title, assignment_type: $('uc07-type').value,
      description: $('uc07-description').value.trim(), assigned_at: date,
      due_at: due ? new Date(due).toISOString() : null,
      status: id ? $('uc07-status').value : 'published'
    };
    const btn = $('uc07-save');
    btn.disabled = true;
    try {
      if (id) {
        await ExamHomeworkModule.updateAssignment(id, payload);
        if (file) {
          try {
            await ExamHomeworkModule.replaceAttachment(id, file);
          } catch (error) {
            await reload();
            throw new Error(`Thông tin bài đã cập nhật nhưng tải tệp đề thất bại: ${error.message}. Hãy thử tải lại đề trong mục Sửa.`);
          }
        }
      } else if (file) {
        await ExamHomeworkModule.createAssignmentWithAttachment({class_id: state.classId, ...payload}, file);
      } else {
        await ExamHomeworkModule.createAssignment({class_id: state.classId, ...payload});
      }
      $('uc07-modal').hidden = true;
      await reload();
      notify(id ? 'Đã cập nhật thông tin và tệp đề (nếu có).' : 'Đã tạo bài thành công. Học sinh có thể tải đề đã đính kèm.');
    } finally { btn.disabled = false; }
  }
  function closeModal() { $('uc07-modal').hidden = true; }
  document.addEventListener('DOMContentLoaded', () => {
    if (!AuthService.getToken() || AuthService.getCurrentUser()?.role !== 'teacher') return;
    $('uc07-create-homework').addEventListener('click', () => openForm('homework'));
    $('uc07-create-exam').addEventListener('click', () => openForm('quiz'));
    $('uc07-class').addEventListener('change', () => invoke(reload));
    $('uc07-reload').addEventListener('click', () => invoke(reload));
    $('uc07-cancel').addEventListener('click', closeModal);
    $('uc07-type').addEventListener('change', updateFileControls);
    $('uc07-attachment').addEventListener('change', e => {
      try {
        const file = e.target.files?.[0];
        validateAttachment(file);
        if (file) $('uc07-current-attachment').textContent = `Đã chọn: ${file.name} (${(file.size/1024/1024).toFixed(2)} MB)`;
      } catch (error) {
        e.target.value = '';
        notify(error.message, true);
      }
    });
    $('uc07-form').addEventListener('submit', event => invoke(() => saveForm(event)));
    document.addEventListener('click', event => {
      const downloadButton = event.target.closest('[data-uc07-download]');
      if (downloadButton) {
        const item = state.assignments.find(a => a.id === downloadButton.dataset.uc07Download);
        if (item) invoke(() => AcademicUI.downloadAssignmentAttachment(item.id, item.attachment_file_name));
        return;
      }
      const editButton = event.target.closest('[data-uc07-edit]');
      if (!editButton) return;
      const item = state.assignments.find(a => a.id === editButton.dataset.uc07Edit);
      if (item) openForm(item.assignment_type, item);
    });
    $('uc07-modal').addEventListener('click', e => { if (e.target.id === 'uc07-modal') closeModal(); });
    document.addEventListener('keydown', e => { if (e.key === 'Escape') closeModal(); });
    invoke(init);
  });
})();
