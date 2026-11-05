/* UC-11 hotfix TC002+TC006 - 2026-11-06
 * Tương thích HTML cũ chỉ có lọc lớp; luôn kiểm soát quyền qua backend.
 */
(() => {
  'use strict';
  if (typeof document === 'undefined') return;
  const C = window.UC11Core;
  const BUILD = '2026.11.06-TC002-TC006';
  const $ = id => document.getElementById(id);
  const state = {
    user: null, rows: [], visible: [], history: [],
    historyError: '', historyLoading: false,
    req: 0, historyReq: 0, detailReq: 0, selectedId: null,
  };
  const notice = (message, error = false) => {
    const el = $('uc11-student-notice');
    if (!el) return;
    el.textContent = message || '';
    el.classList.toggle('uc11-error', !!error);
  };

  function makeFilter(id, labelText, defaultText) {
    const label = document.createElement('label');
    label.setAttribute('for', id);
    label.appendChild(document.createTextNode(labelText));
    const select = document.createElement('select');
    select.className = 'form-control';
    select.id = id;
    select.setAttribute('aria-label', `Lọc theo ${labelText.toLowerCase()}`);
    select.add(new Option(defaultText, ''));
    label.appendChild(select);
    return label;
  }

  // Tự nâng cấp HTML cũ: bản gốc của nhóm chỉ có select chọn lớp.
  function ensureMarkup() {
    if (!C || typeof AuthService === 'undefined') {
      notice('Không tải được module UC-11 hoặc xác thực. Kiểm tra thứ tự script ở cuối trang.', true);
      return false;
    }
    // Node unit-test mocks may expose only getElementById; the real browser always has querySelector.
    if (typeof document.querySelector !== 'function') return true;
    const toolbar = document.querySelector('.uc11-toolbar');
    const classInput = $('uc11-student-class');
    if (!toolbar || !classInput) {
      notice('Không tìm thấy khung kết quả UC-11. Kiểm tra đúng trang pages/student/grades.html.', true);
      return false;
    }
    // HTML gốc chứa label và select độc lập; đưa chúng vào một nhãn duy nhất.
    const classLabel = document.querySelector('label[for="uc11-student-class"]');
    if (classLabel && !classLabel.contains(classInput)) classLabel.appendChild(classInput);
    if (!$('uc11-student-month')) {
      toolbar.insertBefore(makeFilter('uc11-student-month', 'Tháng', 'Tất cả tháng'), toolbar.firstChild);
    }
    if (!$('uc11-student-type')) {
      toolbar.appendChild(makeFilter('uc11-student-type', 'Loại đánh giá', 'Tất cả bài đánh giá'));
    }
    toolbar.classList.add('uc11-filters');
    // CSS dự phòng khi người dùng vẫn sử dụng assets/css/uc11.css cũ.
    toolbar.style.display = 'grid';
    toolbar.style.gridTemplateColumns = 'repeat(auto-fit, minmax(175px, 1fr))';
    toolbar.style.gap = '14px';
    toolbar.querySelectorAll('label').forEach(label => {
      label.style.display = 'flex';
      label.style.flexDirection = 'column';
      label.style.gap = '6px';
      const sel = label.querySelector('select');
      if (sel) sel.style.width = '100%';
    });
    if (!$('uc11-student-reset-filters')) {
      const reset = document.createElement('button');
      reset.id = 'uc11-student-reset-filters';
      reset.type = 'button';
      reset.className = 'btn btn-secondary btn-sm';
      reset.textContent = 'Xóa bộ lọc';
      toolbar.after(reset);
    }
    if (!$('uc11-student-history')) {
      const section = document.createElement('section');
      section.className = 'card uc11-panel';
      section.id = 'uc11-student-history-section';
      section.innerHTML = '<h3 class="title-card">Lịch sử chỉnh sửa điểm</h3>' +
        '<p class="text-caption">Hiển thị điểm trước, điểm sau, lý do và thời gian giáo viên thay đổi điểm.</p>' +
        '<div id="uc11-student-history" aria-live="polite">Đang tải lịch sử...</div>';
      const detailBox = $('uc11-student-detail');
      if (detailBox && detailBox.parentElement) detailBox.before(section);
      else toolbar.parentElement.appendChild(section);
    }
    if (!$('uc11-student-retry-history')) {
      const actions = document.createElement('div');
      actions.className = 'uc11-history-actions';
      actions.innerHTML = '<span id="uc11-student-history-status" role="status"></span>' +
        '<button id="uc11-student-retry-history" type="button" class="btn btn-secondary btn-sm">Tải lại lịch sử</button>';
      $('uc11-student-history').before(actions);
    }
    if (!$('uc11-student-build')) {
      const marker = document.createElement('small');
      marker.id = 'uc11-student-build';
      marker.className = 'uc11-build-marker';
      marker.textContent = `UC-11 ${BUILD} · Lọc tháng / lớp / loại bài · Lịch sử sửa điểm`;
      marker.style.cssText = 'display:block;margin:6px 0 10px;color:#64748b;font-size:12px';
      const identity = $('uc11-student-identity');
      if (identity) identity.after(marker);
      else toolbar.before(marker);
    }
    return true;
  }

  function filterValue(id) { return $(id)?.value || ''; }

  function renderHistory() {
    const container = $('uc11-student-history');
    if (!container) return;
    const status = $('uc11-student-history-status');
    const related = C.historyFor(state.history, state.visible);
    if (state.historyLoading) {
      container.innerHTML = '<p class="uc11-empty">Đang tải lịch sử sửa điểm từ máy chủ...</p>';
      if (status) status.textContent = 'Đang kết nối API lịch sử...';
    } else if (state.historyError) {
      container.innerHTML = '<p class="uc11-empty">Chưa thể hiển thị lịch sử chỉnh sửa điểm. Dùng nút “Tải lại lịch sử” sau khi kiểm tra backend.</p>';
      if (status) {
        status.textContent = `Lỗi API lịch sử: ${state.historyError}. Kiểm tra backend đã cập nhật và bảng grade_change_logs.`;
        status.style.color = '#b91c1c';
      }
    } else {
      container.innerHTML = C.historyHtml(related);
      if (status) {
        status.style.color = '#475569';
        status.textContent = related.length
          ? `${related.length} lần điều chỉnh điểm khớp với bộ lọc hiện tại.`
          : 'Không có lịch sử trong bộ lọc. Lưu ý: nhập điểm lần đầu không phải chỉnh sửa điểm.';
      }
    }
    const details = $('uc11-student-detail-history');
    if (details && state.selectedId !== null) {
      if (state.historyLoading) {
        details.textContent = 'Đang tải lịch sử...';
      } else if (state.historyError) {
        details.textContent = `Không tải được lịch sử: ${state.historyError}`;
      } else {
        details.innerHTML = C.historyHtml(
          state.history.filter(item => String(item.assignment_id) === String(state.selectedId)),
          {showTitle: false}
        );
      }
    }
  }

  function render() {
    const rows = C.filterRows(state.rows, {
      month: filterValue('uc11-student-month'),
      classCode: filterValue('uc11-student-class'),
      type: filterValue('uc11-student-type'),
    });
    state.visible = rows;
    $('uc11-student-stats').innerHTML = C.statsHtml(rows);
    $('uc11-student-chart').innerHTML = C.chartHtml(rows);
    const last = C.latestComment(rows);
    $('uc11-student-comment').textContent = last
      ? `${last.teacher_comment}\n\n${last.title} · ${C.date(last.graded_at || last.assigned_at, true)}`
      : 'Chưa có nhận xét giáo viên trong bộ lọc này.';
    const ordered = C.sorted(rows).reverse();
    $('uc11-student-results').innerHTML = ordered.length ? ordered.map(r => `<tr>
      <td><strong>${C.safe(r.title)}</strong><div class="text-caption">${C.safe(C.typ(r.assignment_type))}</div></td>
      <td>${C.safe(r.class_name || r.class_code || '—')}</td>
      <td>${C.date(r.assigned_at)}</td>
      <td><strong>${C.score(r.score)}</strong></td>
      <td>${C.safe(r.teacher_comment || '—')}</td>
      <td>${C.valid(r.score)
        ? `<button type="button" class="btn btn-secondary btn-sm" data-uc11-detail="${C.safe(r.assignment_id)}">Chi tiết & lịch sử</button>`
        : '—'}</td></tr>`).join('')
      : '<tr><td colspan="6">Không có kết quả phù hợp. Thử chọn “Xóa bộ lọc”.</td></tr>';
    const detail = $('uc11-student-detail');
    if (detail) detail.hidden = true;
    state.selectedId = null;
    state.detailReq++;
    renderHistory();
  }

  function populate(select, items, placeholder, label) {
    const previous = select.value;
    select.replaceChildren(new Option(placeholder, ''));
    items.forEach(value => select.add(new Option(label(value), value)));
    if (items.includes(previous)) select.value = previous;
  }

  async function loadHistory(code, currentLoad = state.req) {
    const req = ++state.historyReq;
    state.historyLoading = true;
    state.historyError = '';
    renderHistory();
    try {
      const response = await AuthService.api(`/students/${encodeURIComponent(code)}/grade-changes`);
      if (req !== state.historyReq || currentLoad !== state.req) return;
      if (!Array.isArray(response)) throw new Error('API không trả về danh sách JSON');
      state.history = response;
    } catch (error) {
      if (req !== state.historyReq || currentLoad !== state.req) return;
      state.history = [];
      state.historyError = error?.message || 'Lỗi kết nối không xác định';
      console.error('[UC11] Không thể tải lịch sử sửa điểm:', error);
    } finally {
      if (req === state.historyReq && currentLoad === state.req) {
        state.historyLoading = false;
        renderHistory();
      }
    }
  }

  async function load() {
    const req = ++state.req;
    ++state.historyReq;
    state.history = [];
    state.historyLoading = false;
    state.historyError = '';
    notice('Đang tải kết quả học tập...');
    try {
      const me = await AuthService.api('/students/me');
      if (req !== state.req) return;
      if (!me?.student_code) throw new Error('Tài khoản chưa có mã học sinh.');
      state.user = me;
      $('uc11-student-sidebar-name').textContent = me.full_name || 'Học sinh';
      $('uc11-student-top-name').textContent = `${me.full_name || 'Học sinh'} · Học sinh`;
      const rows = await AuthService.api(`/students/${encodeURIComponent(me.student_code)}/progress`);
      if (req !== state.req) return;
      if (!Array.isArray(rows)) throw new Error('API kết quả học tập trả về dữ liệu không hợp lệ.');
      state.rows = rows;
      $('uc11-student-identity').textContent = `${me.full_name || 'Học sinh'} · ${me.student_code}`;
      const classes = [...new Map(rows.filter(r => r.class_code).map(r => [r.class_code, {code:r.class_code, name:r.class_name}])).values()];
      populate($('uc11-student-class'), classes.map(c => c.code), 'Tất cả các lớp', code => {
        const found = classes.find(c => c.code === code);
        return `${found?.name || code} (${code})`;
      });
      const months = [...new Set(rows.map(r => C.monthKey(C.dateValue(r))).filter(Boolean))].sort().reverse();
      populate($('uc11-student-month'), months, 'Tất cả tháng', C.monthLabel);
      const types = [...new Set(rows.map(r => r.assignment_type).filter(Boolean))];
      populate($('uc11-student-type'), types, 'Tất cả bài đánh giá', C.typ);
      render();
      notice(`Đã tải ${rows.length} bài, trong đó ${C.graded(rows).length} bài đã chấm. Dùng bộ lọc tháng, lớp, loại bài để thu hẹp kết quả.`);
      // Dữ liệu điểm và lịch sử là hai request độc lập: lỗi lịch sử không làm mất điểm/bộ lọc.
      await loadHistory(me.student_code, req);
      if (req === state.req && state.historyError) notice(`Đã tải bảng điểm nhưng không tải được lịch sử sửa điểm: ${state.historyError}`, true);
    } catch (error) {
      if (req !== state.req) return;
      console.error('[UC11] Không tải được kết quả học tập:', error);
      notice(`Không thể tải kết quả học tập: ${error?.message || 'Lỗi không xác định'}`, true);
      $('uc11-student-results').innerHTML = '<tr><td colspan="6">Không tải được dữ liệu. Kiểm tra backend rồi thử “Tải lại kết quả”.</td></tr>';
    }
  }

  async function detail(id) {
    const row = state.visible.find(r => String(r.assignment_id) === String(id) && C.valid(r.score));
    if (!row) return;
    const req = ++state.detailReq;
    state.selectedId = id;
    const pane = $('uc11-student-detail');
    if (!pane) return;
    pane.hidden = false;
    const area = $('uc11-student-detail-content');
    area.innerHTML = `<p><strong>${C.safe(row.title)}</strong> · ${C.safe(row.class_name || row.class_code || '')} · ${C.date(row.assigned_at)}</p>
      <div class="uc11-stats"><div class="uc11-stat"><span>Điểm tổng</span><strong>${C.score(row.score)} / 10</strong></div>
      <div class="uc11-stat"><span>Loại bài</span><strong>${C.safe(C.typ(row.assignment_type))}</strong></div></div>
      <p><strong>Nhận xét của giáo viên:</strong> ${C.safe(row.teacher_comment || 'Chưa có nhận xét.')}</p>
      <h4 class="uc11-subtitle">Lịch sử điều chỉnh điểm: trước / sau / lý do / thời gian</h4>
      <div id="uc11-student-detail-history"></div>
      <h4 class="uc11-subtitle">Phân tích điểm từng câu</h4>
      <div id="uc11-student-question-scores">Đang tải điểm từng câu...</div>`;
    renderHistory();
    // Đưa người dùng đến khu vực chi tiết, tránh bỏ sót lịch sử ở cuối trang.
    pane.scrollIntoView?.({block:'start', behavior:'smooth'});
    try {
      const parts = await AuthService.api(`/assignments/${encodeURIComponent(id)}/my-question-scores`);
      if (req !== state.detailReq) return;
      if (!Array.isArray(parts)) throw new Error('Dữ liệu điểm từng câu không hợp lệ.');
      const target = $('uc11-student-question-scores');
      if (target) target.innerHTML = parts.length
        ? `<div class="table-container"><table class="table-custom uc11-table"><thead><tr><th>Câu</th><th>Điểm đạt</th><th>Điểm tối đa</th></tr></thead><tbody>${parts.map(q => `<tr><td>Câu ${C.safe(q.question_no)}</td><td>${C.score(q.earned_score)}</td><td>${C.score(q.max_score)}</td></tr>`).join('')}</tbody></table></div>`
        : '<p class="uc11-empty">Giáo viên chưa nhập điểm từng câu cho bài này.</p>';
    } catch (error) {
      if (req !== state.detailReq) return;
      const target = $('uc11-student-question-scores');
      if (target) target.textContent = `Không tải được điểm từng câu: ${error?.message || 'Lỗi không xác định'}. Lịch sử sửa điểm vẫn xem được ở phía trên.`;
    }
  }

  function init() {
    if (!ensureMarkup()) return;
    const date = $('uc11-current-date');
    if (date) date.textContent = new Date().toLocaleDateString('vi-VN', {
      weekday:'long', day:'2-digit', month:'2-digit', year:'numeric'
    });
    if (!AuthService.getToken() || AuthService.getCurrentUser()?.role !== 'student') {
      notice('Vui lòng đăng nhập bằng tài khoản học sinh để xem kết quả học tập.', true);
      return;
    }
    ['uc11-student-month', 'uc11-student-class', 'uc11-student-type'].forEach(id => $(id)?.addEventListener('change', render));
    $('uc11-student-reset-filters')?.addEventListener('click', () => {
      ['uc11-student-month', 'uc11-student-class', 'uc11-student-type'].forEach(id => { if ($(id)) $(id).value = ''; });
      render();
    });
    $('uc11-student-refresh')?.addEventListener('click', load);
    $('uc11-student-retry-history')?.addEventListener('click', () => {
      if (state.user?.student_code) loadHistory(state.user.student_code);
      else notice('Hãy tải kết quả học tập trước khi xem lịch sử.', true);
    });
    $('uc11-student-results')?.addEventListener('click', e => {
      const button = e.target.closest('[data-uc11-detail]');
      if (button) detail(button.dataset.uc11Detail);
    });
    $('uc11-student-detail-close')?.addEventListener('click', () => {
      $('uc11-student-detail').hidden = true;
      state.selectedId = null;
      state.detailReq++;
    });
    load();
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
