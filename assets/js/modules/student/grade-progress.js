/* UC-11 hotfix TC002+TC006 - 2026-11-06
 * TÆ°Æ¡ng thÃ­ch HTML cÅ© chá»‰ cÃ³ lá»c lá»›p; luÃ´n kiá»ƒm soÃ¡t quyá»n qua backend.
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
    select.setAttribute('aria-label', `Lá»c theo ${labelText.toLowerCase()}`);
    select.add(new Option(defaultText, ''));
    label.appendChild(select);
    return label;
  }

  // Tá»± nÃ¢ng cáº¥p HTML cÅ©: báº£n gá»‘c cá»§a nhÃ³m chá»‰ cÃ³ select chá»n lá»›p.
  function ensureMarkup() {
    if (!C || typeof AuthService === 'undefined') {
      notice('KhÃ´ng táº£i Ä‘Æ°á»£c module UC-11 hoáº·c xÃ¡c thá»±c. Kiá»ƒm tra thá»© tá»± script á»Ÿ cuá»‘i trang.', true);
      return false;
    }
    // Node unit-test mocks may expose only getElementById; the real browser always has querySelector.
    if (typeof document.querySelector !== 'function') return true;
    const toolbar = document.querySelector('.uc11-toolbar');
    const classInput = $('uc11-student-class');
    if (!toolbar || !classInput) {
      notice('KhÃ´ng tÃ¬m tháº¥y khung káº¿t quáº£ UC-11. Kiá»ƒm tra Ä‘Ãºng trang pages/student/grades.html.', true);
      return false;
    }
    // HTML gá»‘c chá»©a label vÃ  select Ä‘á»™c láº­p; Ä‘Æ°a chÃºng vÃ o má»™t nhÃ£n duy nháº¥t.
    const classLabel = document.querySelector('label[for="uc11-student-class"]');
    if (classLabel && !classLabel.contains(classInput)) classLabel.appendChild(classInput);
    if (!$('uc11-student-month')) {
      toolbar.insertBefore(makeFilter('uc11-student-month', 'ThÃ¡ng', 'Táº¥t cáº£ thÃ¡ng'), toolbar.firstChild);
    }
    if (!$('uc11-student-type')) {
      toolbar.appendChild(makeFilter('uc11-student-type', 'Loáº¡i Ä‘Ã¡nh giÃ¡', 'Táº¥t cáº£ bÃ i Ä‘Ã¡nh giÃ¡'));
    }
    toolbar.classList.add('uc11-filters');
    // CSS dá»± phÃ²ng khi ngÆ°á»i dÃ¹ng váº«n sá»­ dá»¥ng assets/css/uc11.css cÅ©.
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
      reset.textContent = 'XÃ³a bá»™ lá»c';
      toolbar.after(reset);
    }
    if (!$('uc11-student-history')) {
      const section = document.createElement('section');
      section.className = 'card uc11-panel';
      section.id = 'uc11-student-history-section';
      section.innerHTML = '<h3 class="title-card">Lá»‹ch sá»­ chá»‰nh sá»­a Ä‘iá»ƒm</h3>' +
        '<p class="text-caption">Hiá»ƒn thá»‹ Ä‘iá»ƒm trÆ°á»›c, Ä‘iá»ƒm sau, lÃ½ do vÃ  thá»i gian giÃ¡o viÃªn thay Ä‘á»•i Ä‘iá»ƒm.</p>' +
        '<div id="uc11-student-history" aria-live="polite">Äang táº£i lá»‹ch sá»­...</div>';
      const detailBox = $('uc11-student-detail');
      if (detailBox && detailBox.parentElement) detailBox.before(section);
      else toolbar.parentElement.appendChild(section);
    }
    if (!$('uc11-student-retry-history')) {
      const actions = document.createElement('div');
      actions.className = 'uc11-history-actions';
      actions.innerHTML = '<span id="uc11-student-history-status" role="status"></span>' +
        '<button id="uc11-student-retry-history" type="button" class="btn btn-secondary btn-sm">Táº£i láº¡i lá»‹ch sá»­</button>';
      $('uc11-student-history').before(actions);
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
      container.innerHTML = '<p class="uc11-empty">Äang táº£i lá»‹ch sá»­ sá»­a Ä‘iá»ƒm tá»« mÃ¡y chá»§...</p>';
      if (status) status.textContent = 'Äang káº¿t ná»‘i API lá»‹ch sá»­...';
    } else if (state.historyError) {
      container.innerHTML = '<p class="uc11-empty">ChÆ°a thá»ƒ hiá»ƒn thá»‹ lá»‹ch sá»­ chá»‰nh sá»­a Ä‘iá»ƒm. DÃ¹ng nÃºt â€œTáº£i láº¡i lá»‹ch sá»­â€ sau khi kiá»ƒm tra backend.</p>';
      if (status) {
        status.textContent = `Lá»—i API lá»‹ch sá»­: ${state.historyError}. Kiá»ƒm tra backend Ä‘Ã£ cáº­p nháº­t vÃ  báº£ng grade_change_logs.`;
        status.style.color = '#b91c1c';
      }
    } else {
      container.innerHTML = C.historyHtml(related);
      if (status) {
        status.style.color = '#475569';
        status.textContent = related.length
          ? `${related.length} láº§n Ä‘iá»u chá»‰nh Ä‘iá»ƒm khá»›p vá»›i bá»™ lá»c hiá»‡n táº¡i.`
          : 'KhÃ´ng cÃ³ lá»‹ch sá»­ trong bá»™ lá»c. LÆ°u Ã½: nháº­p Ä‘iá»ƒm láº§n Ä‘áº§u khÃ´ng pháº£i chá»‰nh sá»­a Ä‘iá»ƒm.';
      }
    }
    const details = $('uc11-student-detail-history');
    if (details && state.selectedId !== null) {
      if (state.historyLoading) {
        details.textContent = 'Äang táº£i lá»‹ch sá»­...';
      } else if (state.historyError) {
        details.textContent = `KhÃ´ng táº£i Ä‘Æ°á»£c lá»‹ch sá»­: ${state.historyError}`;
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
      ? `${last.teacher_comment}\n\n${last.title} Â· ${C.date(last.graded_at || last.assigned_at, true)}`
      : 'ChÆ°a cÃ³ nháº­n xÃ©t giÃ¡o viÃªn trong bá»™ lá»c nÃ y.';
    const ordered = C.sorted(rows).reverse();
    $('uc11-student-results').innerHTML = ordered.length ? ordered.map(r => `<tr>
      <td><strong>${C.safe(r.title)}</strong><div class="text-caption">${C.safe(C.typ(r.assignment_type))}</div></td>
      <td>${C.safe(r.class_name || r.class_code || 'â€”')}</td>
      <td>${C.date(r.assigned_at)}</td>
      <td><strong>${C.score(r.score)}</strong></td>
      <td>${C.safe(r.teacher_comment || 'â€”')}</td>
      <td>${C.valid(r.score)
        ? `<button type="button" class="btn btn-secondary btn-sm" data-uc11-detail="${C.safe(r.assignment_id)}">Chi tiáº¿t & lá»‹ch sá»­</button>`
        : 'â€”'}</td></tr>`).join('')
      : '<tr><td colspan="6">KhÃ´ng cÃ³ káº¿t quáº£ phÃ¹ há»£p. Thá»­ chá»n â€œXÃ³a bá»™ lá»câ€.</td></tr>';
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
      if (!Array.isArray(response)) throw new Error('API khÃ´ng tráº£ vá» danh sÃ¡ch JSON');
      state.history = response;
    } catch (error) {
      if (req !== state.historyReq || currentLoad !== state.req) return;
      state.history = [];
      state.historyError = error?.message || 'Lá»—i káº¿t ná»‘i khÃ´ng xÃ¡c Ä‘á»‹nh';
      console.error('[UC11] KhÃ´ng thá»ƒ táº£i lá»‹ch sá»­ sá»­a Ä‘iá»ƒm:', error);
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
    notice('Äang táº£i káº¿t quáº£ há»c táº­p...');
    try {
      const me = await AuthService.api('/students/me');
      if (req !== state.req) return;
      if (!me?.student_code) throw new Error('TÃ i khoáº£n chÆ°a cÃ³ mÃ£ há»c sinh.');
      state.user = me;
      $('uc11-student-sidebar-name').textContent = me.full_name || 'Há»c sinh';
      $('uc11-student-top-name').textContent = `${me.full_name || 'Há»c sinh'} Â· Há»c sinh`;
      const rows = await AuthService.api(`/students/${encodeURIComponent(me.student_code)}/progress`);
      if (req !== state.req) return;
      if (!Array.isArray(rows)) throw new Error('API káº¿t quáº£ há»c táº­p tráº£ vá» dá»¯ liá»‡u khÃ´ng há»£p lá»‡.');
      state.rows = rows;
      $('uc11-student-identity').textContent = `${me.full_name || 'Há»c sinh'} Â· ${me.student_code}`;
      const classes = [...new Map(rows.filter(r => r.class_code).map(r => [r.class_code, {code:r.class_code, name:r.class_name}])).values()];
      populate($('uc11-student-class'), classes.map(c => c.code), 'Táº¥t cáº£ cÃ¡c lá»›p', code => {
        const found = classes.find(c => c.code === code);
        return `${found?.name || code} (${code})`;
      });
      const months = [...new Set(rows.map(r => C.monthKey(C.dateValue(r))).filter(Boolean))].sort().reverse();
      populate($('uc11-student-month'), months, 'Táº¥t cáº£ thÃ¡ng', C.monthLabel);
      const types = [...new Set(rows.map(r => r.assignment_type).filter(Boolean))];
      populate($('uc11-student-type'), types, 'Táº¥t cáº£ bÃ i Ä‘Ã¡nh giÃ¡', C.typ);
      render();
      notice(`ÄÃ£ táº£i ${rows.length} bÃ i, trong Ä‘Ã³ ${C.graded(rows).length} bÃ i Ä‘Ã£ cháº¥m. DÃ¹ng bá»™ lá»c thÃ¡ng, lá»›p, loáº¡i bÃ i Ä‘á»ƒ thu háº¹p káº¿t quáº£.`);
      // Dá»¯ liá»‡u Ä‘iá»ƒm vÃ  lá»‹ch sá»­ lÃ  hai request Ä‘á»™c láº­p: lá»—i lá»‹ch sá»­ khÃ´ng lÃ m máº¥t Ä‘iá»ƒm/bá»™ lá»c.
      await loadHistory(me.student_code, req);
      if (req === state.req && state.historyError) notice(`ÄÃ£ táº£i báº£ng Ä‘iá»ƒm nhÆ°ng khÃ´ng táº£i Ä‘Æ°á»£c lá»‹ch sá»­ sá»­a Ä‘iá»ƒm: ${state.historyError}`, true);
    } catch (error) {
      if (req !== state.req) return;
      console.error('[UC11] KhÃ´ng táº£i Ä‘Æ°á»£c káº¿t quáº£ há»c táº­p:', error);
      notice(`KhÃ´ng thá»ƒ táº£i káº¿t quáº£ há»c táº­p: ${error?.message || 'Lá»—i khÃ´ng xÃ¡c Ä‘á»‹nh'}`, true);
      $('uc11-student-results').innerHTML = '<tr><td colspan="6">KhÃ´ng táº£i Ä‘Æ°á»£c dá»¯ liá»‡u. Kiá»ƒm tra backend rá»“i thá»­ â€œTáº£i láº¡i káº¿t quáº£â€.</td></tr>';
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
    area.innerHTML = `<p><strong>${C.safe(row.title)}</strong> Â· ${C.safe(row.class_name || row.class_code || '')} Â· ${C.date(row.assigned_at)}</p>
      <div class="uc11-stats"><div class="uc11-stat"><span>Äiá»ƒm tá»•ng</span><strong>${C.score(row.score)} / 10</strong></div>
      <div class="uc11-stat"><span>Loáº¡i bÃ i</span><strong>${C.safe(C.typ(row.assignment_type))}</strong></div></div>
      <p><strong>Nháº­n xÃ©t cá»§a giÃ¡o viÃªn:</strong> ${C.safe(row.teacher_comment || 'ChÆ°a cÃ³ nháº­n xÃ©t.')}</p>
      <h4 class="uc11-subtitle">Lá»‹ch sá»­ Ä‘iá»u chá»‰nh Ä‘iá»ƒm: trÆ°á»›c / sau / lÃ½ do / thá»i gian</h4>
      <div id="uc11-student-detail-history"></div>
      <h4 class="uc11-subtitle">PhÃ¢n tÃ­ch Ä‘iá»ƒm tá»«ng cÃ¢u</h4>
      <div id="uc11-student-question-scores">Äang táº£i Ä‘iá»ƒm tá»«ng cÃ¢u...</div>`;
    renderHistory();
    // ÄÆ°a ngÆ°á»i dÃ¹ng Ä‘áº¿n khu vá»±c chi tiáº¿t, trÃ¡nh bá» sÃ³t lá»‹ch sá»­ á»Ÿ cuá»‘i trang.
    pane.scrollIntoView?.({block:'start', behavior:'smooth'});
    try {
      const parts = await AuthService.api(`/assignments/${encodeURIComponent(id)}/my-question-scores`);
      if (req !== state.detailReq) return;
      if (!Array.isArray(parts)) throw new Error('Dá»¯ liá»‡u Ä‘iá»ƒm tá»«ng cÃ¢u khÃ´ng há»£p lá»‡.');
      const target = $('uc11-student-question-scores');
      if (target) target.innerHTML = parts.length
        ? `<div class="table-container"><table class="table-custom uc11-table"><thead><tr><th>CÃ¢u</th><th>Äiá»ƒm Ä‘áº¡t</th><th>Äiá»ƒm tá»‘i Ä‘a</th></tr></thead><tbody>${parts.map(q => `<tr><td>CÃ¢u ${C.safe(q.question_no)}</td><td>${C.score(q.earned_score)}</td><td>${C.score(q.max_score)}</td></tr>`).join('')}</tbody></table></div>`
        : '<p class="uc11-empty">GiÃ¡o viÃªn chÆ°a nháº­p Ä‘iá»ƒm tá»«ng cÃ¢u cho bÃ i nÃ y.</p>';
    } catch (error) {
      if (req !== state.detailReq) return;
      const target = $('uc11-student-question-scores');
      if (target) target.textContent = `KhÃ´ng táº£i Ä‘Æ°á»£c Ä‘iá»ƒm tá»«ng cÃ¢u: ${error?.message || 'Lá»—i khÃ´ng xÃ¡c Ä‘á»‹nh'}. Lá»‹ch sá»­ sá»­a Ä‘iá»ƒm váº«n xem Ä‘Æ°á»£c á»Ÿ phÃ­a trÃªn.`;
    }
  }

  function init() {
    if (!ensureMarkup()) return;
    const date = $('uc11-current-date');
    if (date) date.textContent = new Date().toLocaleDateString('vi-VN', {
      weekday:'long', day:'2-digit', month:'2-digit', year:'numeric'
    });
    if (!AuthService.getToken() || AuthService.getCurrentUser()?.role !== 'student') {
      notice('Vui lÃ²ng Ä‘Äƒng nháº­p báº±ng tÃ i khoáº£n há»c sinh Ä‘á»ƒ xem káº¿t quáº£ há»c táº­p.', true);
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
      else notice('HÃ£y táº£i káº¿t quáº£ há»c táº­p trÆ°á»›c khi xem lá»‹ch sá»­.', true);
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
