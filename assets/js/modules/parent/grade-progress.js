(() => {
  'use strict';
  if (typeof document === 'undefined') return;

  const Core = window.UC11Core;
  const $ = id => document.getElementById(id);
  const state = { children: [], child: '', rows: [], request: 0 };
  const dateValue = row => row.graded_at || row.assigned_at;
  const timestamp = value => {
    const parsed = new Date(value || 0).getTime();
    return Number.isFinite(parsed) ? parsed : 0;
  };
  const monthKey = value => {
    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) return '';
    return `${parsed.getFullYear()}-${String(parsed.getMonth() + 1).padStart(2, '0')}`;
  };
  const monthLabel = key => {
    const [year, month] = key.split('-').map(Number);
    return new Intl.DateTimeFormat('vi-VN', { month: 'long', year: 'numeric' })
      .format(new Date(year, month - 1, 1));
  };
  const status = (message, isError = false) => {
    const notice = $('parentGradesNotice');
    notice.textContent = message;
    notice.classList.toggle('uc11-error', isError);
  };
  const childName = code => state.children.find(child => child.student_code === code)?.full_name || code;
  const initials = name => String(name || 'PH').trim().split(/\s+/).slice(-2).map(part => part[0]).join('').toLocaleUpperCase('vi-VN');

  function renderParent(user) {
    const name = user?.full_name || 'Phụ huynh';
    $('parentGradesSidebarName').textContent = name;
    $('parentGradesHeaderName').textContent = `${name} · Cổng phụ huynh`;
    $('parentGradesAvatar').textContent = initials(name);
    $('parentGradesHeaderAvatar').textContent = initials(name);
  }

  function renderFilters(rows, preserveMonth = false) {
    const classSelect = $('parentGradesClass');
    const typeSelect = $('parentGradesType');
    const monthSelect = $('parentGradesMonth');
    const previousClass = classSelect.value;
    const previousType = typeSelect.value;
    const previousMonth = preserveMonth ? monthSelect.value : '';
    const classes = [...new Map(rows
      .filter(row => row.class_code)
      .map(row => [row.class_code, { code: row.class_code, name: row.class_name }])).values()];
    const types = [...new Set(rows.map(row => row.assignment_type).filter(Boolean))];
    const months = [...new Set(rows.map(row => monthKey(dateValue(row))).filter(Boolean))].sort().reverse();

    classSelect.innerHTML = '<option value="">Tất cả các lớp</option>' + classes.map(item =>
      `<option value="${Core.safe(item.code)}">${Core.safe(item.name || item.code)} (${Core.safe(item.code)})</option>`
    ).join('');
    typeSelect.innerHTML = '<option value="">Tất cả bài đánh giá</option>' + types.map(type =>
      `<option value="${Core.safe(type)}">${Core.safe(Core.typ(type))}</option>`
    ).join('');
    monthSelect.innerHTML = '<option value="">Tất cả tháng</option>' + months.map(month =>
      `<option value="${month}">${Core.safe(monthLabel(month))}</option>`
    ).join('');

    if (classes.some(item => item.code === previousClass)) classSelect.value = previousClass;
    if (types.includes(previousType)) typeSelect.value = previousType;
    if (months.includes(previousMonth)) monthSelect.value = previousMonth;
    else if (!preserveMonth && months.length) monthSelect.value = months[0];
  }

  function filteredRows() {
    const month = $('parentGradesMonth').value;
    const classCode = $('parentGradesClass').value;
    const type = $('parentGradesType').value;
    return state.rows.filter(row =>
      (!month || monthKey(dateValue(row)) === month) &&
      (!classCode || row.class_code === classCode) &&
      (!type || row.assignment_type === type)
    );
  }

  function renderStats(rows) {
    const graded = Core.graded(rows);
    const ordered = [...graded].sort((a, b) => timestamp(dateValue(a)) - timestamp(dateValue(b)));
    const scores = ordered.map(row => Number(row.score));
    const mean = scores.length ? scores.reduce((total, score) => total + score, 0) / scores.length : null;
    const latest = scores.length ? scores[scores.length - 1] : null;
    const change = scores.length > 1 ? latest - scores[0] : null;
    const formattedChange = change === null
      ? 'Chưa đủ dữ liệu'
      : `${change > 0 ? '+' : ''}${change.toLocaleString('vi-VN', { maximumFractionDigits: 2 })} điểm`;
    $('parentGradesStats').innerHTML = `
      <div class="uc11-stat"><span>Số bài đã có điểm</span><strong>${graded.length}</strong></div>
      <div class="uc11-stat"><span>Điểm trung bình</span><strong>${mean === null ? '—' : `${Core.score(mean)} / 10`}</strong></div>
      <div class="uc11-stat"><span>Thay đổi từ bài đầu</span><strong>${formattedChange}</strong></div>`;
  }

  function chartHtml(rows) {
    const data = Core.graded(rows).sort((a, b) => timestamp(dateValue(a)) - timestamp(dateValue(b)));
    if (!data.length) return '<p class="uc11-empty">Chưa có bài đánh giá đã chấm trong bộ lọc này.</p>';
    const width = Math.max(720, data.length * 92);
    const height = 250;
    const left = 42;
    const right = 20;
    const top = 24;
    const bottom = 54;
    const plotWidth = width - left - right;
    const plotHeight = height - top - bottom;
    const x = index => left + (data.length === 1 ? plotWidth / 2 : index * plotWidth / (data.length - 1));
    const y = score => top + plotHeight - Number(score) / 10 * plotHeight;
    const grid = [0, 2, 4, 6, 8, 10].map(value =>
      `<line x1="${left}" y1="${y(value)}" x2="${width - right}" y2="${y(value)}" stroke="#e2e8f0"/><text x="${left - 9}" y="${y(value) + 4}" text-anchor="end" font-size="12" fill="#64748b">${value}</text>`
    ).join('');
    const line = data.length > 1
      ? `<path d="${data.map((row, index) => `${index ? 'L' : 'M'}${x(index).toFixed(1)} ${y(row.score).toFixed(1)}`).join(' ')}" fill="none" stroke="#1565c0" stroke-width="3" stroke-linejoin="round"/>`
      : '';
    const points = data.map((row, index) =>
      `<circle cx="${x(index)}" cy="${y(row.score)}" r="5" fill="#1565c0"><title>${Core.safe(row.title)}: ${Core.score(row.score)} / 10 · ${Core.date(dateValue(row))}</title></circle><text x="${x(index)}" y="${y(row.score) - 12}" text-anchor="middle" font-size="12" font-weight="700" fill="#174a86">${Core.score(row.score)}</text><text x="${x(index)}" y="${height - 20}" text-anchor="middle" font-size="11" fill="#64748b">${Core.date(dateValue(row))}</text>`
    ).join('');
    return `<div class="uc11-svg-wrap"><svg class="uc11-svg" style="min-width:${width}px" viewBox="0 0 ${width} ${height}" role="img" aria-label="Biểu đồ điểm các bài đánh giá đã chấm">${grid}${line}${points}</svg></div>`;
  }

  function renderComment(rows) {
    const latest = [...rows]
      .filter(row => String(row.teacher_comment || '').trim() && Core.valid(row.score))
      .sort((a, b) => timestamp(dateValue(b)) - timestamp(dateValue(a)))[0];
    const box = $('parentGradesComment');
    if (!latest) {
      box.textContent = 'Chưa có nhận xét từ giáo viên trong bộ lọc này.';
      return;
    }
    box.textContent = `${latest.teacher_comment}\n\n${latest.title} · ${latest.graded_by_name || 'Giáo viên'} · ${Core.date(dateValue(latest), true)}`;
  }

  function renderResults(rows) {
    const ordered = [...rows].sort((a, b) => timestamp(dateValue(b)) - timestamp(dateValue(a)));
    $('parentGradesResults').innerHTML = ordered.length ? ordered.map(row => `
      <tr>
        <td><strong>${Core.safe(row.title || 'Bài đánh giá')}</strong></td>
        <td>${Core.safe(row.class_name || row.class_code || '—')}</td>
        <td>${Core.date(dateValue(row))}</td>
        <td>${Core.safe(Core.typ(row.assignment_type))}</td>
        <td>${Core.score(row.score)}</td>
        <td>${Core.safe(row.teacher_comment || '—')}${row.graded_by_name ? `<div class="text-caption">${Core.safe(row.graded_by_name)}</div>` : ''}</td>
      </tr>`).join('') : '<tr><td class="parent-grades-no-data" colspan="6">Không có kết quả phù hợp với bộ lọc.</td></tr>';
  }

  function render() {
    const rows = filteredRows();
    renderStats(rows);
    $('parentGradesChart').innerHTML = chartHtml(rows);
    renderComment(rows);
    renderResults(rows);
  }

  async function loadProgress(studentCode) {
    const request = ++state.request;
    state.child = studentCode;
    state.rows = [];
    $('parentGradesIdentity').textContent = `${childName(studentCode)} · ${studentCode}`;
    status('Đang tải kết quả học tập…');
    $('parentGradesResults').innerHTML = '<tr><td colspan="6">Đang tải kết quả…</td></tr>';
    try {
      const rows = await AuthService.api(`/students/${encodeURIComponent(studentCode)}/progress`);
      if (request !== state.request) return;
      if (!Array.isArray(rows)) throw new Error('API kết quả học tập trả về dữ liệu không hợp lệ.');
      state.rows = rows;
      renderFilters(rows);
      render();
      status(`Đã tải ${rows.length} bài đánh giá; ${Core.graded(rows).length} bài đã có điểm.`);
    } catch (error) {
      if (request !== state.request) return;
      console.error('Không thể tải kết quả học tập của học sinh liên kết:', error);
      status('Không thể tải kết quả học tập. Vui lòng thử lại.', true);
      $('parentGradesIdentity').textContent = `${childName(studentCode)} · ${studentCode}`;
      $('parentGradesStats').replaceChildren();
      $('parentGradesChart').textContent = 'Không thể tải dữ liệu biểu đồ.';
      $('parentGradesComment').textContent = 'Không thể tải nhận xét giáo viên.';
      $('parentGradesResults').innerHTML = '<tr><td class="parent-grades-no-data" colspan="6">Không thể tải kết quả. Vui lòng thử lại.</td></tr>';
    }
  }

  async function loadChildren() {
    const request = ++state.request;
    state.children = [];
    state.rows = [];
    status('Đang tải danh sách học sinh đã liên kết…');
    $('parentGradesStats').replaceChildren();
    $('parentGradesChart').textContent = 'Đang tải dữ liệu biểu đồ…';
    $('parentGradesComment').textContent = 'Đang tải nhận xét…';
    $('parentGradesResults').innerHTML = '<tr><td colspan="6">Đang tải kết quả…</td></tr>';
    try {
      const children = await AuthService.api('/children');
      if (request !== state.request) return;
      if (!Array.isArray(children)) throw new Error('API học sinh liên kết trả về dữ liệu không hợp lệ.');
      state.children = children.filter(child => child.student_code);
      const select = $('parentGradesChild');
      select.innerHTML = state.children.length ? state.children.map(child =>
        `<option value="${Core.safe(child.student_code)}">${Core.safe(child.full_name || child.student_code)} (${Core.safe(child.student_code)})</option>`
      ).join('') : '<option value="">Chưa có học sinh liên kết</option>';
      if (!state.children.length) {
        state.child = '';
        state.rows = [];
        $('parentGradesIdentity').textContent = 'Tài khoản này chưa liên kết với học sinh nào.';
        $('parentGradesStats').replaceChildren();
        $('parentGradesChart').innerHTML = '<p class="uc11-empty">Liên kết học sinh với tài khoản phụ huynh để xem kết quả.</p>';
        $('parentGradesComment').textContent = 'Chưa có học sinh liên kết.';
        $('parentGradesResults').innerHTML = '<tr><td class="parent-grades-no-data" colspan="6">Chưa có học sinh liên kết với tài khoản phụ huynh.</td></tr>';
        status('Không tìm thấy học sinh liên kết.');
        return;
      }
      const current = state.children.find(child => child.student_code === state.child);
      const selected = current ? current.student_code : state.children[0].student_code;
      select.value = selected;
      await loadProgress(selected);
    } catch (error) {
      if (request !== state.request) return;
      console.error('Không thể tải danh sách học sinh đã liên kết:', error);
      status('Không thể tải danh sách học sinh. Vui lòng thử lại.', true);
      $('parentGradesStats').replaceChildren();
      $('parentGradesChart').textContent = 'Không thể tải dữ liệu biểu đồ.';
      $('parentGradesComment').textContent = 'Không thể tải nhận xét giáo viên.';
      $('parentGradesChild').innerHTML = '<option value="">Không tải được học sinh</option>';
      $('parentGradesResults').innerHTML = '<tr><td class="parent-grades-no-data" colspan="6">Không thể tải dữ liệu. Vui lòng thử lại.</td></tr>';
    }
  }

  function init() {
    const user = AuthService.requireAuth('parent');
    if (!user) return;
    renderParent(user);
    $('parentGradesDate').textContent = new Date().toLocaleDateString('vi-VN', {
      weekday: 'long', day: '2-digit', month: '2-digit', year: 'numeric'
    });
    document.addEventListener('auth:user-updated', event => renderParent(event.detail));
    $('parentGradesChild').addEventListener('change', event => {
      if (event.target.value) loadProgress(event.target.value);
    });
    ['parentGradesMonth', 'parentGradesClass', 'parentGradesType'].forEach(id =>
      $(id).addEventListener('change', render)
    );
    $('parentGradesRefresh').addEventListener('click', loadChildren);
    loadChildren();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
