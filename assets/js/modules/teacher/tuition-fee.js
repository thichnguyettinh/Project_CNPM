/**
 * MODULE: QUẢN LÝ HỌC PHÍ & ĐỐI SOÁT CÔNG NỢ GIÁO VIÊN (UC-09)
 * Phụ trách: Trang pages/teacher/tuition.html & Thẻ học phí trên pages/teacher/dashboard.html
 */

const TuitionFeeModule = {
  // =========================================================================
  // 1. CÁC HÀM API GỐC (GIỮ NGUYÊN CHỮ KÝ & HÀNH VI HIỆN CÓ)
  // =========================================================================
  getTuitionInvoices(filter = {}) {
    const cleanFilter = {};
    Object.entries(filter || {}).forEach(([key, val]) => {
      if (val !== undefined && val !== null && val !== '') cleanFilter[key] = val;
    });
    const query = new URLSearchParams(cleanFilter).toString();
    return AuthService.api(`/tuition/invoices${query ? `?${query}` : ''}`);
  },

  generateTuitionBill(classId, billingYear, billingMonth, periodStart, periodEnd, chargePerSession) {
    return AuthService.api('/tuition/invoices/generate', {
      method: 'POST',
      body: JSON.stringify({
        class_id: classId,
        billing_year: billingYear,
        billing_month: billingMonth,
        period_start: periodStart,
        period_end: periodEnd,
        charge_per_session: chargePerSession
      })
    });
  },

  recordPayment(invoiceId, amount, paymentMethod, referenceCode = null) {
    return AuthService.api(`/tuition/invoices/${encodeURIComponent(invoiceId)}/payments`, {
      method: 'POST',
      body: JSON.stringify({
        amount,
        payment_method: paymentMethod,
        paid_at: new Date().toISOString(),
        reference_code: referenceCode
      })
    });
  },

  // =========================================================================
  // 2. CÁC HÀM API & NGHIỆP VỤ BỔ SUNG CHO UC-09
  // =========================================================================
  getClasses() {
    return AuthService.api('/classes');
  },

  getTuitionSummary(filter = {}) {
    const cleanFilter = {};
    Object.entries(filter || {}).forEach(([key, val]) => {
      if (val !== undefined && val !== null && val !== '') cleanFilter[key] = val;
    });
    const query = new URLSearchParams(cleanFilter).toString();
    return AuthService.api(`/tuition/summary${query ? `?${query}` : ''}`);
  },

  getInvoiceDetail(invoiceId) {
    return AuthService.api(`/tuition/invoices/${encodeURIComponent(invoiceId)}`);
  },

  getInvoicePayments(invoiceId) {
    return AuthService.api(`/tuition/invoices/${encodeURIComponent(invoiceId)}/payments`);
  },

  getPaymentHistory(filter = {}) {
    const cleanFilter = {};
    Object.entries(filter || {}).forEach(([key, val]) => {
      if (val !== undefined && val !== null && val !== '') cleanFilter[key] = val;
    });
    const query = new URLSearchParams(cleanFilter).toString();
    return AuthService.api(`/tuition/payments${query ? `?${query}` : ''}`);
  },

  createInvoices(payload) {
    return AuthService.api('/tuition/invoices/generate', {
      method: 'POST',
      body: JSON.stringify(payload)
    });
  },

  recordManualPayment(invoiceId, paymentData) {
    return AuthService.api(`/tuition/invoices/${encodeURIComponent(invoiceId)}/payments`, {
      method: 'POST',
      body: JSON.stringify({
        amount: paymentData.amount,
        payment_method: paymentData.payment_method,
        paid_at: paymentData.paid_at || new Date().toISOString(),
        reference_code: paymentData.reference_code || null,
        note: paymentData.note || null
      })
    });
  },

  sendTuitionReminder(invoiceId, customNote = null, includeStudent = false) {
    return AuthService.api(`/tuition/invoices/${encodeURIComponent(invoiceId)}/remind`, {
      method: 'POST',
      body: JSON.stringify({
        custom_note: customNote || null,
        include_student: Boolean(includeStudent)
      })
    });
  },

  sendBulkReminders(options = {}) {
    const body = {};
    if (options.class_id) body.class_id = options.class_id;
    if (options.billing_year) body.billing_year = Number(options.billing_year);
    if (options.billing_month) body.billing_month = Number(options.billing_month);
    if (options.custom_note) body.custom_note = options.custom_note;
    if (options.include_student !== undefined) body.include_student = Boolean(options.include_student);
    return AuthService.api('/tuition/reminders/send', {
      method: 'POST',
      body: JSON.stringify(body)
    });
  },

  reconcileDebts(invoices = []) {
    const rows = Array.isArray(invoices) ? invoices : [];
    const studentSet = new Set();
    const classSet = new Set();
    let totalDue = 0;
    let totalPaid = 0;
    let totalRemaining = 0;
    let paidCount = 0;
    let partialCount = 0;
    let unpaidCount = 0;

    rows.forEach(inv => {
      const due = Number(inv.amount_due || 0);
      const paid = Number(inv.amount_paid || 0);
      const rem = Number(inv.amount_remaining ?? Math.max(due - paid, 0));
      totalDue += due;
      totalPaid += paid;
      totalRemaining += rem;
      if (inv.student_code || inv.student_id) studentSet.add(inv.student_code || inv.student_id);
      if (inv.class_id || inv.class_code) classSet.add(inv.class_id || inv.class_code);

      const status = inv.payment_status || (rem <= 0 ? 'paid' : paid > 0 ? 'partial' : 'unpaid');
      if (status === 'paid') paidCount += 1;
      else if (status === 'partial') partialCount += 1;
      else if (status === 'unpaid') unpaidCount += 1;
    });

    const progressPercent = totalDue > 0 ? Math.round((totalPaid / totalDue) * 1000) / 10 : 0;
    return {
      totalDue,
      totalPaid,
      totalRemaining,
      invoiceCount: rows.length,
      studentCount: studentSet.size,
      classCount: classSet.size,
      paidCount,
      partialCount,
      unpaidCount,
      debtCount: partialCount + unpaidCount,
      progressPercent
    };
  },

  // =========================================================================
  // 3. TIỆN ÍCH ĐỊNH DẠNG & AN TOÀN DỮ LIỆU GIAO DIỆN
  // =========================================================================
  escapeHtml(value) {
    return String(value ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  },

  formatCurrency(value) {
    const num = Math.round(Number(value || 0));
    return `${num.toLocaleString('vi-VN')} ₫`;
  },

  formatCompactCurrency(value) {
    const num = Number(value || 0);
    if (Math.abs(num) >= 1_000_000) {
      const millions = Math.round((num / 1_000_000) * 10) / 10;
      return `${millions.toLocaleString('vi-VN', { minimumFractionDigits: 1, maximumFractionDigits: 1 })}M ₫`;
    }
    return this.formatCurrency(num);
  },

  formatPercent(value) {
    const num = Math.round(Number(value || 0) * 10) / 10;
    return `${num.toLocaleString('vi-VN', {
      minimumFractionDigits: num % 1 === 0 ? 0 : 1,
      maximumFractionDigits: 1
    })}%`;
  },

  parseMoneyInput(raw) {
    const str = String(raw ?? '').trim();
    if (!str || str.startsWith('-')) return NaN;
    const digits = str.replace(/[^\d]/g, '');
    if (!digits) return NaN;
    return Number(digits);
  },

  formatDate(value) {
    if (!value) return '—';
    const raw = String(value);
    if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) {
      const [y, m, d] = raw.split('-');
      return `${d}/${m}/${y}`;
    }
    const dt = new Date(value);
    if (Number.isNaN(dt.getTime())) return raw;
    return dt.toLocaleDateString('vi-VN');
  },

  formatDateTime(value) {
    if (!value) return '—';
    const dt = new Date(value);
    if (Number.isNaN(dt.getTime())) return String(value);
    return dt.toLocaleString('vi-VN', { dateStyle: 'short', timeStyle: 'short' });
  },

  getPaymentMethodLabel(method) {
    switch (method) {
      case 'bank_transfer':
        return 'Chuyển khoản ngân hàng';
      case 'cash':
        return 'Tiền mặt tại lớp';
      default:
        return 'Hình thức khác';
    }
  },

  getStatusMeta(status) {
    switch (status) {
      case 'paid':
        return {
          label: 'Đã đủ',
          badgeClass: 'badge-success',
          hasDot: true,
          amountColor: 'var(--color-text-secondary)'
        };
      case 'partial':
        return {
          label: 'Còn thiếu',
          badgeClass: 'badge-warning',
          hasDot: false,
          amountColor: 'var(--color-warning)'
        };
      case 'unpaid':
        return {
          label: 'Chưa thu',
          badgeClass: 'badge-danger',
          hasDot: false,
          amountColor: 'var(--color-danger)'
        };
      default:
        return {
          label: 'Đã hủy',
          badgeClass: 'badge-neutral',
          hasDot: false,
          amountColor: 'var(--color-neutral)'
        };
    }
  },

  exportTuitionCsv(invoices = [], periodLabel = 'tat-ca') {
    if (!Array.isArray(invoices) || invoices.length === 0) {
      alert('Không có dữ liệu khoản thu nào để xuất báo cáo.');
      return;
    }
    const headers = [
      'Mã hóa đơn',
      'Mã học sinh',
      'Họ và tên học sinh',
      'Mã lớp',
      'Tên lớp',
      'Kỳ thu',
      'Từ ngày',
      'Hạn đóng',
      'Số buổi tính phí',
      'Phải thu (VND)',
      'Đã nhận (VND)',
      'Còn lại (VND)',
      'Trạng thái'
    ];
    const escapeCsv = val => {
      const text = String(val ?? '');
      return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
    };
    const lines = [headers.map(escapeCsv).join(',')];
    invoices.forEach(inv => {
      const meta = this.getStatusMeta(inv.payment_status);
      lines.push([
        inv.invoice_id,
        inv.student_code,
        inv.student_name,
        inv.class_code,
        inv.class_name,
        `Tháng ${String(inv.billing_month).padStart(2, '0')}/${inv.billing_year}`,
        this.formatDate(inv.period_start),
        this.formatDate(inv.period_end),
        Number(inv.sessions_count || 0),
        Math.round(Number(inv.amount_due || 0)),
        Math.round(Number(inv.amount_paid || 0)),
        Math.round(Number(inv.amount_remaining || 0)),
        meta.label
      ].map(escapeCsv).join(','));
    });

    const csvContent = '\uFEFF' + lines.join('\r\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    const safeSlug = String(periodLabel).replace(/[^a-zA-Z0-9_-]/g, '-');
    link.href = url;
    link.download = `bao-cao-hoc-phi-${safeSlug}.csv`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  },

  syncTeacherHeaderProfile() {
    const user = AuthService.getCurrentUser();
    if (!user) return;
    if (user.fullName) {
      document.querySelectorAll('[data-teacher-name]').forEach(el => {
        el.textContent = user.fullName;
      });
      document.querySelectorAll('[data-teacher-header-label]').forEach(el => {
        el.textContent = `${user.fullName} · Giáo viên`;
      });
    }
    if (user.avatarText) {
      document.querySelectorAll('[data-teacher-avatar]').forEach(el => {
        el.textContent = user.avatarText;
      });
    }
    const todayEl = document.getElementById('teacherCurrentDateLabel');
    if (todayEl) {
      todayEl.textContent = new Date().toLocaleDateString('vi-VN', {
        weekday: 'long',
        day: '2-digit',
        month: '2-digit',
        year: 'numeric'
      });
    }
  },

  // =========================================================================
  // 4. CONTROLLER TRANG GIÁO VIÊN: pages/teacher/tuition.html
  // =========================================================================
  pageState: {
    classes: [],
    periods: [],
    selectedPeriod: '', // "YYYY-MM" hoặc "all"
    selectedClassId: '',
    selectedStatus: '',
    searchKeyword: '',
    paymentMethodFilter: '',
    paymentSearchKeyword: '',
    activeTab: 'invoices',
    invoices: [],
    payments: [],
    summary: null,
    activePaymentInvoice: null,
    activeDetailInvoice: null,
    periodInitialized: false
  },

  setPageFeedback(message = '', type = 'info') {
    const box = document.getElementById('tuitionPageFeedback');
    if (!box) return;
    if (!message) {
      box.hidden = true;
      box.textContent = '';
      return;
    }
    box.className = `alert alert-${type}`;
    box.textContent = message;
    box.hidden = false;
  },

  parseSelectedPeriod() {
    const raw = this.pageState.selectedPeriod;
    if (!raw || raw === 'all') return { billing_year: undefined, billing_month: undefined };
    const [y, m] = raw.split('-').map(Number);
    if (!y || !m) return { billing_year: undefined, billing_month: undefined };
    return { billing_year: y, billing_month: m };
  },

  getSelectedPeriodTitle() {
    const { billing_year: y, billing_month: m } = this.parseSelectedPeriod();
    if (y && m) return `Tháng ${String(m).padStart(2, '0')}/${y}`;
    return 'Tất cả các kỳ';
  },

  getFilteredInvoices() {
    const kw = (this.pageState.searchKeyword || '').trim().toLowerCase();
    const status = this.pageState.selectedStatus;
    return (this.pageState.invoices || []).filter(inv => {
      if (status && inv.payment_status !== status) return false;
      if (kw) {
        const haystack = [
          inv.student_name,
          inv.student_code,
          inv.class_code,
          inv.class_name,
          inv.invoice_id
        ].join(' ').toLowerCase();
        if (!haystack.includes(kw)) return false;
      }
      return true;
    });
  },

  getFilteredPayments() {
    const kw = (this.pageState.paymentSearchKeyword || '').trim().toLowerCase();
    const method = this.pageState.paymentMethodFilter;
    return (this.pageState.payments || []).filter(pay => {
      if (method && pay.payment_method !== method) return false;
      if (kw) {
        const haystack = [
          pay.student_name,
          pay.student_code,
          pay.class_code,
          pay.reference_code,
          pay.invoice_id,
          pay.note
        ].join(' ').toLowerCase();
        if (!haystack.includes(kw)) return false;
      }
      return true;
    });
  },

  renderPeriodOptions() {
    const select = document.getElementById('tuitionPeriodFilter');
    if (!select) return;
    const periods = this.pageState.periods || [];
    if (!this.pageState.periodInitialized) {
      if (periods.length > 0) {
        const latest = periods[0];
        this.pageState.selectedPeriod = `${latest.billing_year}-${String(latest.billing_month).padStart(2, '0')}`;
      } else {
        this.pageState.selectedPeriod = 'all';
      }
      this.pageState.periodInitialized = true;
    }

    select.innerHTML = '';
    const allOpt = document.createElement('option');
    allOpt.value = 'all';
    allOpt.textContent = 'Kỳ: Tất cả các kỳ';
    select.appendChild(allOpt);

    periods.forEach(p => {
      const key = `${p.billing_year}-${String(p.billing_month).padStart(2, '0')}`;
      const opt = document.createElement('option');
      opt.value = key;
      opt.textContent = `Kỳ: Tháng ${String(p.billing_month).padStart(2, '0')}/${p.billing_year}`;
      select.appendChild(opt);
    });

    if ([...select.options].some(o => o.value === this.pageState.selectedPeriod)) {
      select.value = this.pageState.selectedPeriod;
    } else {
      select.value = 'all';
      this.pageState.selectedPeriod = 'all';
    }
  },

  renderClassOptions() {
    const filterSelect = document.getElementById('tuitionClassFilter');
    const genSelect = document.getElementById('genInvoiceClassSelect');
    const classes = this.pageState.classes || [];

    if (filterSelect) {
      const prev = this.pageState.selectedClassId;
      filterSelect.innerHTML = '<option value="">Tất cả lớp học</option>';
      classes.forEach(cls => {
        const opt = document.createElement('option');
        opt.value = cls.id;
        opt.textContent = `${cls.code} · ${cls.name}`;
        filterSelect.appendChild(opt);
      });
      filterSelect.value = prev;
    }

    if (genSelect) {
      const activeClasses = classes.filter(c => c.status === 'active' || c.status === 'planned');
      const prevGen = genSelect.value;
      genSelect.innerHTML = '';
      if (!activeClasses.length) {
        genSelect.innerHTML = '<option value="">Chưa có lớp học hoạt động</option>';
      } else {
        activeClasses.forEach(cls => {
          const opt = document.createElement('option');
          opt.value = cls.id;
          opt.dataset.monthlyFee = String(Math.round(Number(cls.monthly_fee || 0)));
          opt.textContent = `${cls.code} · ${cls.name} (${Number(cls.student_count || 0)} HS)`;
          genSelect.appendChild(opt);
        });
        if (prevGen && [...genSelect.options].some(o => o.value === prevGen)) {
          genSelect.value = prevGen;
        }
        this.syncGenerateFeeDefault();
      }
    }
  },

  renderStats() {
    const { billing_year: y, billing_month: m } = this.parseSelectedPeriod();
    const shortPeriod = y && m ? `Tháng ${m}` : 'Tất cả kỳ';
    const fullPeriod = this.getSelectedPeriodTitle();

    const totals = this.pageState.summary?.totals;
    const stats = totals
      ? {
          totalDue: Number(totals.total_amount_due || 0),
          totalPaid: Number(totals.total_amount_paid || 0),
          totalRemaining: Number(totals.total_amount_remaining || 0),
          studentCount: Number(totals.student_count || 0),
          classCount: Number(totals.class_count || 0),
          paidCount: Number(totals.paid_count || 0),
          debtCount: Number(totals.debt_count || 0),
          progressPercent: Number(totals.progress_percent || 0),
          nearestDueDate: totals.nearest_due_date || totals.latest_period_end
        }
      : this.reconcileDebts(this.pageState.invoices);

    const setEl = (id, text) => {
      const node = document.getElementById(id);
      if (node) node.textContent = text;
    };

    setEl('statTotalDueLabel', `Tổng phải thu · ${shortPeriod}`);
    setEl('statTotalDueValue', this.formatCurrency(stats.totalDue));
    setEl(
      'statTotalDueDesc',
      `${stats.studentCount} học sinh · ${stats.classCount} lớp (${this.formatCompactCurrency(stats.totalDue)})`
    );

    setEl('statTotalPaidValue', this.formatCurrency(stats.totalPaid));
    setEl(
      'statTotalPaidDesc',
      `${stats.paidCount} học sinh đã đóng học phí (${this.formatCompactCurrency(stats.totalPaid)} · ${this.formatPercent(stats.progressPercent)})`
    );

    setEl('statTotalRemainingValue', this.formatCurrency(stats.totalRemaining));
    setEl(
      'statTotalRemainingDesc',
      `${stats.debtCount} học sinh còn công nợ (${this.formatCompactCurrency(stats.totalRemaining)})`
    );

    setEl('tuitionTableTitle', y && m ? `Học phí tháng ${String(m).padStart(2, '0')}/${y}` : `Danh sách khoản thu (${fullPeriod})`);
    const dueHint = stats.nearestDueDate ? `Hạn thu: ${this.formatDate(stats.nearestDueDate)} · ` : '';
    setEl(
      'tuitionTableSubtitle',
      `${dueHint}Số tiền được tính theo mức phí lớp hoặc số buổi học thực tế`
    );
  },

  renderInvoicesTable() {
    const tbody = document.getElementById('tuitionInvoicesTbody');
    const summaryText = document.getElementById('tuitionInvoicesFooterSummary');
    if (!tbody) return;

    const filtered = this.getFilteredInvoices();
    tbody.replaceChildren();

    if (filtered.length === 0) {
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td colspan="6" style="text-align:center; padding:32px 16px; color:var(--color-text-secondary);">
          Không có khoản thu học phí nào phù hợp với bộ lọc hiện tại.
        </td>
      `;
      tbody.appendChild(tr);
      if (summaryText) summaryText.textContent = 'Hiển thị 0 khoản thu';
      return;
    }

    filtered.forEach(inv => {
      const meta = this.getStatusMeta(inv.payment_status);
      const due = Number(inv.amount_due || 0);
      const paid = Number(inv.amount_paid || 0);
      const remain = Number(inv.amount_remaining || 0);
      const tr = document.createElement('tr');

      const remainHtml = remain > 0
        ? `<strong style="color:${meta.amountColor};">${this.escapeHtml(this.formatCurrency(remain))}</strong>`
        : '0 ₫';

      const badgeDot = meta.hasDot ? '<span class="badge-dot"></span>' : '';
      const canCollect = remain > 0;

      tr.innerHTML = `
        <td>
          <strong>${this.escapeHtml(inv.student_name)}</strong><br>
          <span class="text-caption">${this.escapeHtml(inv.student_code)} · ${this.escapeHtml(inv.class_code)} · T${String(inv.billing_month).padStart(2, '0')}/${inv.billing_year}</span>
        </td>
        <td>${this.escapeHtml(this.formatCurrency(due))}</td>
        <td>${this.escapeHtml(this.formatCurrency(paid))}</td>
        <td>${remainHtml}</td>
        <td><span class="badge ${meta.badgeClass}">${badgeDot}${this.escapeHtml(meta.label)}</span></td>
        <td style="text-align:right;">
          <div class="tuition-action-group">
            ${canCollect ? `<button type="button" class="btn btn-primary btn-sm" data-action="pay" data-invoice-id="${this.escapeHtml(inv.invoice_id)}">Thu tiền</button>` : ''}
            ${canCollect ? `<button type="button" class="btn btn-secondary btn-sm" data-action="remind" data-invoice-id="${this.escapeHtml(inv.invoice_id)}" title="Gửi thông báo nhắc hạn nộp cho phụ huynh">Nhắc phí</button>` : ''}
            <button type="button" class="btn btn-link btn-sm" data-action="detail" data-invoice-id="${this.escapeHtml(inv.invoice_id)}">Chi tiết →</button>
          </div>
        </td>
      `;
      tbody.appendChild(tr);
    });

    if (summaryText) {
      const rec = this.reconcileDebts(filtered);
      summaryText.textContent = `Hiển thị ${filtered.length}/${this.pageState.invoices.length} khoản thu · Còn phải thu trên danh sách lọc: ${this.formatCurrency(rec.totalRemaining)}`;
    }
  },

  renderPaymentsTable() {
    const tbody = document.getElementById('tuitionPaymentsHistoryTbody');
    const summaryEl = document.getElementById('tuitionPaymentsFooterSummary');
    if (!tbody) return;

    const filtered = this.getFilteredPayments();
    tbody.replaceChildren();

    if (filtered.length === 0) {
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td colspan="7" style="text-align:center; padding:32px 16px; color:var(--color-text-secondary);">
          Chưa có lịch sử ghi nhận thanh toán nào trong bộ lọc này.
        </td>
      `;
      tbody.appendChild(tr);
      if (summaryEl) summaryEl.textContent = 'Hiển thị 0 giao dịch';
      return;
    }

    let sumAmount = 0;
    filtered.forEach(pay => {
      const amt = Number(pay.amount || 0);
      sumAmount += amt;
      const refCode = pay.reference_code || `TT-${pay.billing_year}${String(pay.billing_month).padStart(2, '0')}-${String(pay.payment_id).padStart(3, '0')}`;
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td>
          <strong>${this.escapeHtml(this.formatDateTime(pay.paid_at))}</strong><br>
          <span class="text-caption">${this.escapeHtml(refCode)}</span>
        </td>
        <td>
          <strong>${this.escapeHtml(pay.student_name)}</strong><br>
          <span class="text-caption">${this.escapeHtml(pay.student_code)} · ${this.escapeHtml(pay.class_code)}</span>
        </td>
        <td>Tháng ${String(pay.billing_month).padStart(2, '0')}/${pay.billing_year}</td>
        <td><strong style="color:var(--color-success);">${this.escapeHtml(this.formatCurrency(amt))}</strong></td>
        <td>${this.escapeHtml(this.getPaymentMethodLabel(pay.payment_method))}</td>
        <td>${this.escapeHtml(pay.note || '—')}</td>
        <td style="text-align:right;">
          <span class="text-caption" style="display:block;">${this.escapeHtml(pay.recorded_by_name || 'Giáo viên')}</span>
          <button type="button" class="btn btn-link btn-sm" data-action="detail" data-invoice-id="${this.escapeHtml(pay.invoice_id)}">Hóa đơn →</button>
        </td>
      `;
      tbody.appendChild(tr);
    });

    if (summaryEl) {
      summaryEl.textContent = `Hiển thị ${filtered.length} lần ghi nhận · Tổng số tiền đã xác nhận: ${this.formatCurrency(sumAmount)}`;
    }
  },

  renderClassBreakdownTable() {
    const tbody = document.getElementById('tuitionClassSummaryTbody');
    if (!tbody) return;
    tbody.replaceChildren();

    const rows = this.pageState.summary?.class_breakdown || [];
    if (rows.length === 0) {
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td colspan="7" style="text-align:center; padding:32px 16px; color:var(--color-text-secondary);">
          Chưa có lớp học nào để tổng hợp công nợ.
        </td>
      `;
      tbody.appendChild(tr);
      return;
    }

    rows.forEach(cls => {
      const due = Number(cls.total_amount_due || 0);
      const paid = Number(cls.total_amount_paid || 0);
      const remain = Number(cls.total_amount_remaining || 0);
      const pct = due > 0 ? Math.round((paid / due) * 1000) / 10 : 0;
      const fillClass = pct >= 100 ? '' : pct > 0 ? 'is-partial' : 'is-unpaid';

      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td>
          <strong>${this.escapeHtml(cls.class_name)}</strong><br>
          <span class="text-caption">${this.escapeHtml(cls.class_code)} · ${this.escapeHtml(cls.subject)}</span>
        </td>
        <td>${Number(cls.enrolled_count || 0)} HS<br><span class="text-caption">${Number(cls.invoice_count || 0)} hóa đơn</span></td>
        <td>${this.escapeHtml(this.formatCurrency(due))}</td>
        <td style="color:var(--color-success); font-weight:600;">${this.escapeHtml(this.formatCurrency(paid))}</td>
        <td>
          <strong style="color:${remain > 0 ? 'var(--color-danger)' : 'var(--color-text-secondary)'};">
            ${this.escapeHtml(this.formatCurrency(remain))}
          </strong>
          <div class="text-caption">${Number(cls.debt_count || 0)} HS còn nợ</div>
        </td>
        <td style="min-width:140px;">
          <div style="display:flex; justify-content:space-between; font-size:12px; font-weight:600; margin-bottom:4px;">
            <span>${this.escapeHtml(this.formatPercent(pct))}</span>
            <span class="text-caption">${Number(cls.paid_count || 0)}/${Number(cls.invoice_count || 0)} đủ</span>
          </div>
          <div class="tuition-progress-track">
            <div class="tuition-progress-fill ${fillClass}" style="width:${Math.min(pct, 100)}%;"></div>
          </div>
        </td>
        <td style="text-align:right;">
          <button type="button" class="btn btn-secondary btn-sm" data-action="filter-class" data-class-id="${this.escapeHtml(cls.class_id)}">Xem lớp</button>
        </td>
      `;
      tbody.appendChild(tr);
    });
  },

  switchSubTab(tabName) {
    this.pageState.activeTab = tabName;
    document.querySelectorAll('[data-tuition-tab]').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.tuitionTab === tabName);
    });
    document.querySelectorAll('[data-tuition-panel]').forEach(panel => {
      panel.classList.toggle('active', panel.dataset.tuitionPanel === tabName);
    });
  },

  async reloadPageData() {
    const { billing_year, billing_month } = this.parseSelectedPeriod();
    const filter = {
      class_id: this.pageState.selectedClassId || undefined,
      billing_year,
      billing_month
    };

    try {
      const [summary, invoices, payments] = await Promise.all([
        this.getTuitionSummary(filter),
        this.getTuitionInvoices(filter),
        this.getPaymentHistory(filter)
      ]);

      this.pageState.summary = summary;
      this.pageState.periods = summary.available_periods || [];
      this.pageState.invoices = Array.isArray(invoices) ? invoices : [];
      this.pageState.payments = Array.isArray(payments) ? payments : [];

      this.renderPeriodOptions();
      // Nếu lần đầu vừa chọn kỳ mới nhất từ available_periods thì nạp lại đúng kỳ đó
      const afterParse = this.parseSelectedPeriod();
      if (afterParse.billing_year !== billing_year || afterParse.billing_month !== billing_month) {
        return this.reloadPageData();
      }

      this.renderStats();
      this.renderInvoicesTable();
      this.renderPaymentsTable();
      this.renderClassBreakdownTable();
      this.setPageFeedback('');
    } catch (error) {
      this.setPageFeedback(`Không tải được dữ liệu học phí: ${error.message}`, 'danger');
      const setDash = id => {
        const node = document.getElementById(id);
        if (node) node.textContent = '—';
      };
      setDash('statTotalDueValue');
      setDash('statTotalPaidValue');
      setDash('statTotalRemainingValue');
      const tbody = document.getElementById('tuitionInvoicesTbody');
      if (tbody) {
        tbody.innerHTML = `<tr><td colspan="6" style="text-align:center; padding:28px; color:var(--color-danger);">${this.escapeHtml(error.message)}</td></tr>`;
      }
    }
  },

  // =========================================================================
  // 5. MODAL GHI NHẬN ĐÃ NHẬN TIỀN (TRANG 11 PDF)
  // =========================================================================
  openPaymentModalByInvoice(invoiceId = null) {
    const unpaidList = (this.pageState.invoices || []).filter(inv => Number(inv.amount_remaining || 0) > 0);
    let target = invoiceId
      ? (this.pageState.invoices || []).find(inv => inv.invoice_id === invoiceId)
      : unpaidList[0] || null;

    const selectWrap = document.getElementById('payModalInvoiceSelectGroup');
    const selectEl = document.getElementById('payModalInvoiceSelect');

    if (!invoiceId) {
      if (!unpaidList.length) {
        this.setPageFeedback('Tất cả khoản thu trong bộ lọc hiện tại đã đóng đủ hoặc chưa có khoản thu.', 'info');
        return;
      }
      if (selectWrap && selectEl) {
        selectWrap.hidden = false;
        selectEl.innerHTML = '';
        unpaidList.forEach(inv => {
          const opt = document.createElement('option');
          opt.value = inv.invoice_id;
          opt.textContent = `${inv.student_name} (${inv.student_code} · ${inv.class_code}) — Còn thiếu ${this.formatCurrency(inv.amount_remaining)}`;
          selectEl.appendChild(opt);
        });
        selectEl.value = target.invoice_id;
      }
    } else if (selectWrap) {
      selectWrap.hidden = true;
    }

    if (!target) {
      alert('Không tìm thấy khoản thu cần ghi nhận.');
      return;
    }

    this.populatePaymentModalFields(target);
    const modal = document.getElementById('modalRecordPayment');
    if (modal) modal.classList.add('active');
  },

  populatePaymentModalFields(inv) {
    this.pageState.activePaymentInvoice = inv;
    const due = Number(inv.amount_due || 0);
    const paid = Number(inv.amount_paid || 0);
    const remain = Number(inv.amount_remaining || 0);

    const setEl = (id, text) => {
      const node = document.getElementById(id);
      if (node) node.textContent = text;
    };

    setEl(
      'payModalStudentMeta',
      `${inv.student_name} · ${inv.student_code} · ${inv.class_code} · Tháng ${String(inv.billing_month).padStart(2, '0')}/${inv.billing_year}`
    );
    setEl('payModalTotalDueText', this.formatCurrency(due));
    setEl('payModalTotalPaidText', this.formatCurrency(paid));
    setEl('payModalDueText', this.formatCurrency(remain));

    const amountInput = document.getElementById('payModalAmountInput');
    if (amountInput) amountInput.value = Math.round(remain).toLocaleString('vi-VN');

    const dateInput = document.getElementById('payModalDateInput');
    if (dateInput) dateInput.value = new Date().toISOString().slice(0, 10);

    const methodSelect = document.getElementById('payModalMethodSelect');
    if (methodSelect) methodSelect.value = 'bank_transfer';

    const refInput = document.getElementById('payModalRefInput');
    if (refInput) refInput.value = '';

    const noteInput = document.getElementById('payModalNoteInput');
    if (noteInput) noteInput.value = '';

    const confirmCheck = document.getElementById('payModalConfirmCheck');
    if (confirmCheck) confirmCheck.checked = true;

    const errBox = document.getElementById('payModalErrorMsg');
    if (errBox) {
      errBox.hidden = true;
      errBox.textContent = '';
    }

    this.updatePaymentModalPreview();
  },

  updatePaymentModalPreview() {
    const inv = this.pageState.activePaymentInvoice;
    const box = document.getElementById('payModalPreviewBox');
    const title = document.getElementById('payModalPreviewTitle');
    const submitBtn = document.getElementById('payModalSubmitBtn');
    const confirmCheck = document.getElementById('payModalConfirmCheck');
    const amountInput = document.getElementById('payModalAmountInput');
    if (!inv || !box || !title || !amountInput) return;

    const remain = Math.round(Number(inv.amount_remaining || 0));
    const entered = this.parseMoneyInput(amountInput.value);

    box.classList.remove('is-partial', 'is-invalid');
    if (!Number.isFinite(entered) || entered <= 0) {
      box.classList.add('is-invalid');
      title.textContent = 'Vui lòng nhập số tiền thực nhận lớn hơn 0 ₫.';
      if (submitBtn) submitBtn.disabled = true;
      return;
    }

    if (entered > remain) {
      box.classList.add('is-invalid');
      title.textContent = `Số tiền nhập (${this.formatCurrency(entered)}) vượt quá số dư còn phải đóng (${this.formatCurrency(remain)}).`;
      if (submitBtn) submitBtn.disabled = true;
      return;
    }

    const afterRemain = remain - entered;
    if (afterRemain === 0) {
      title.textContent = 'Sau khi ghi nhận: Còn lại 0 ₫ · Trạng thái chuyển sang Đã đủ';
    } else {
      box.classList.add('is-partial');
      title.textContent = `Sau khi ghi nhận: Còn lại ${this.formatCurrency(afterRemain)} · Trạng thái: Còn thiếu`;
    }

    if (submitBtn) {
      submitBtn.disabled = confirmCheck ? !confirmCheck.checked : false;
    }
  },

  async submitRecordPayment() {
    const inv = this.pageState.activePaymentInvoice;
    if (!inv) return;

    const amountInput = document.getElementById('payModalAmountInput');
    const dateInput = document.getElementById('payModalDateInput');
    const methodSelect = document.getElementById('payModalMethodSelect');
    const refInput = document.getElementById('payModalRefInput');
    const noteInput = document.getElementById('payModalNoteInput');
    const confirmCheck = document.getElementById('payModalConfirmCheck');
    const errBox = document.getElementById('payModalErrorMsg');
    const submitBtn = document.getElementById('payModalSubmitBtn');

    const showErr = msg => {
      if (errBox) {
        errBox.textContent = msg;
        errBox.hidden = false;
      } else {
        alert(msg);
      }
    };

    const amount = this.parseMoneyInput(amountInput?.value);
    const remain = Math.round(Number(inv.amount_remaining || 0));

    if (!Number.isFinite(amount) || amount <= 0) {
      showErr('Số tiền nhận phải lớn hơn 0 ₫.');
      return;
    }
    if (amount > remain) {
      showErr('Số tiền nhận không được vượt quá số dư còn phải thu.');
      return;
    }
    if (!dateInput?.value) {
      showErr('Vui lòng chọn ngày nhận tiền.');
      return;
    }
    if (confirmCheck && !confirmCheck.checked) {
      showErr('Vui lòng đánh dấu xác nhận đã thực nhận tiền ngoài hệ thống.');
      return;
    }

    const paidDateIso = new Date(`${dateInput.value}T12:00:00`).toISOString();
    if (submitBtn) submitBtn.disabled = true;

    try {
      await this.recordManualPayment(inv.invoice_id, {
        amount,
        payment_method: methodSelect?.value || 'bank_transfer',
        paid_at: paidDateIso,
        reference_code: refInput?.value?.trim() || null,
        note: noteInput?.value?.trim() || null
      });

      document.getElementById('modalRecordPayment')?.classList.remove('active');
      await this.reloadPageData();
      AuthService.updateNotificationIndicators();
      this.setPageFeedback(
        `Đã ghi nhận thanh toán ${this.formatCurrency(amount)} cho học sinh ${inv.student_name} (${inv.student_code}) và gửi thông báo xác nhận.`,
        'success'
      );
    } catch (error) {
      showErr(error.message);
      if (submitBtn) submitBtn.disabled = false;
    }
  },

  // =========================================================================
  // 6. MODAL CHI TIẾT HỌC PHÍ HỌC SINH & LỊCH SỬ CÁC LẦN NỘP (TRANG 17, 18 PDF)
  // =========================================================================
  async openInvoiceDetailModal(invoiceId) {
    const modal = document.getElementById('modalInvoiceDetail');
    const loadingBox = document.getElementById('detailModalLoading');
    const contentBox = document.getElementById('detailModalContent');
    if (!modal) return;

    modal.classList.add('active');
    if (loadingBox) {
      loadingBox.hidden = false;
      loadingBox.textContent = 'Đang tải chi tiết khoản thu và lịch sử nộp phí...';
    }
    if (contentBox) contentBox.hidden = true;

    try {
      const data = await this.getInvoiceDetail(invoiceId);
      const inv = data.invoice;
      const payments = Array.isArray(data.payments) ? data.payments : [];
      const sessions = Array.isArray(data.sessions) ? data.sessions : [];
      this.pageState.activeDetailInvoice = inv;

      const meta = this.getStatusMeta(inv.payment_status);
      const setEl = (id, text) => {
        const node = document.getElementById(id);
        if (node) node.textContent = text;
      };

      setEl('detailModalTitle', `Học phí · ${inv.student_name}`);
      setEl(
        'detailModalSubtitle',
        `${inv.student_code} · Lớp ${inv.class_name} (${inv.class_code}) · Tháng ${String(inv.billing_month).padStart(2, '0')}/${inv.billing_year}`
      );

      const statusBadge = document.getElementById('detailModalStatusBadge');
      if (statusBadge) {
        statusBadge.className = `badge ${meta.badgeClass}`;
        statusBadge.textContent = meta.label;
      }

      setEl('detailStatDueLabel', `Phải thu · Tháng ${inv.billing_month}`);
      setEl('detailStatDueValue', this.formatCurrency(inv.amount_due));
      setEl('detailStatPaidValue', this.formatCurrency(inv.amount_paid));
      setEl('detailStatRemainingValue', this.formatCurrency(inv.amount_remaining));

      const pct = Number(inv.progress_percent || 0);
      setEl('detailProgressPercent', this.formatPercent(pct));
      setEl('detailProgressCaption', `${this.formatCurrency(inv.amount_paid)} / ${this.formatCurrency(inv.amount_due)} (${payments.length} lần nộp)`);
      const fill = document.getElementById('detailProgressBarFill');
      if (fill) {
        fill.style.width = `${Math.min(pct, 100)}%`;
        fill.className = `tuition-progress-fill ${pct >= 100 ? '' : pct > 0 ? 'is-partial' : 'is-unpaid'}`;
      }

      // Cột trái: Thông tin khoản thu
      const infoBox = document.getElementById('detailInvoiceInfoRows');
      if (infoBox) {
        const sessCount = Number(inv.sessions_count || 0);
        const amtDue = Number(inv.amount_due || 0);
        const chargePerSession = inv.charge_per_session != null ? Number(inv.charge_per_session) : null;
        // Xây dựng block công thức tính học phí
        let formulaHtml = '';
        if (sessCount > 0 && chargePerSession != null) {
          // Tính theo buổi: N buổi x đơn giá
          formulaHtml = `
          <div class="tuition-formula-block">
            <div class="tuition-formula-title">Công thức tính học phí</div>
            <div class="tuition-formula-row">
              <span class="tuition-formula-label">Số buổi đi học (tính phí):</span>
              <span class="tuition-formula-value">${sessCount} buổi</span>
            </div>
            <div class="tuition-formula-row">
              <span class="tuition-formula-label">Đơn giá mỗi buổi:</span>
              <span class="tuition-formula-value">${this.escapeHtml(this.formatCurrency(chargePerSession))} / buổi</span>
            </div>
            <div class="tuition-formula-eq">
              ${sessCount} buổi &times; ${this.escapeHtml(this.formatCurrency(chargePerSession))} = <strong>${this.escapeHtml(this.formatCurrency(amtDue))}</strong>
            </div>
          </div>`;
        } else if (sessCount === 0 && amtDue > 0) {
          // Trọn gói cố định
          formulaHtml = `
          <div class="tuition-formula-block">
            <div class="tuition-formula-title">📐 Công thức tính học phí</div>
            <div class="tuition-formula-row">
              <span class="tuition-formula-label">Loại học phí:</span>
              <span class="tuition-formula-value">Trọn gói cố định theo kỳ</span>
            </div>
            <div class="tuition-formula-eq">
              Mức cố định = <strong>${this.escapeHtml(this.formatCurrency(amtDue))}</strong>
            </div>
          </div>`;
        } else if (sessCount > 0 && amtDue > 0) {
          // Trọn gói nhưng có đếm danh
          formulaHtml = `
          <div class="tuition-formula-block">
            <div class="tuition-formula-title">📐 Công thức tính học phí</div>
            <div class="tuition-formula-row">
              <span class="tuition-formula-label">Loại học phí:</span>
              <span class="tuition-formula-value">Trọn gói cố định</span>
            </div>
            <div class="tuition-formula-row">
              <span class="tuition-formula-label">Số buổi đi học trong kỳ:</span>
              <span class="tuition-formula-value">${sessCount} buổi (thông tin tham khảo)</span>
            </div>
            <div class="tuition-formula-eq">
              Mức cố định = <strong>${this.escapeHtml(this.formatCurrency(amtDue))}</strong>
            </div>
          </div>`;
        }
        infoBox.innerHTML = `
          <div class="tuition-kv-row"><span>Mã phiếu thu:</span><strong>${this.escapeHtml(inv.invoice_id)}</strong></div>
          <div class="tuition-kv-row"><span>Kỳ học phí:</span><span>${this.escapeHtml(this.formatDate(inv.period_start))} – ${this.escapeHtml(this.formatDate(inv.period_end))}</span></div>
          <div class="tuition-kv-row"><span>Hạn thanh toán:</span><strong>${this.escapeHtml(this.formatDate(inv.period_end))}</strong></div>
          <div class="tuition-kv-row"><span>Người lập phiếu:</span><span>${this.escapeHtml(inv.issued_by_name || 'Giáo viên')} (${this.escapeHtml(this.formatDate(inv.issued_at))})</span></div>
          <div class="tuition-kv-row"><span>Ghi chú phiếu:</span><span>${this.escapeHtml(inv.note || 'Không có')}</span></div>
          ${formulaHtml}
          <div class="tuition-kv-row is-total"><span>Tổng phải thu:</span><span>${this.escapeHtml(this.formatCurrency(inv.amount_due))}</span></div>
        `;
      }

      // Cột phải: Học sinh & Phụ huynh liên kết
      const studentBox = document.getElementById('detailStudentParentRows');
      if (studentBox) {
        studentBox.innerHTML = `
          <div class="tuition-kv-row"><span>Học sinh:</span><strong>${this.escapeHtml(inv.student_name)} (${this.escapeHtml(inv.student_code)})</strong></div>
          <div class="tuition-kv-row"><span>Lớp theo học:</span><span>${this.escapeHtml(inv.class_name)} (${this.escapeHtml(inv.class_code)})</span></div>
          <div class="tuition-kv-row"><span>Liên hệ học sinh:</span><span>${this.escapeHtml(inv.student_phone || inv.student_email || 'Chưa cập nhật')}</span></div>
          <div class="tuition-kv-row"><span>Phụ huynh liên kết:</span><strong>${this.escapeHtml(inv.parent_name || 'Chưa liên kết')}</strong></div>
          <div class="tuition-kv-row"><span>Quan hệ:</span><span>${this.escapeHtml(inv.relationship || '—')}</span></div>
          <div class="tuition-kv-row"><span>Liên hệ phụ huynh:</span><span>${this.escapeHtml(inv.parent_phone || inv.parent_email || 'Chưa cập nhật')}</span></div>
        `;
      }

      // Bảng lịch sử nhận tiền
      const payTbody = document.getElementById('detailPaymentsTbody');
      if (payTbody) {
        payTbody.replaceChildren();
        if (payments.length === 0) {
          payTbody.innerHTML = `
            <tr>
              <td colspan="5" style="text-align:center; padding:24px; color:var(--color-text-secondary);">
                Chưa có giao dịch thanh toán nào được ghi nhận cho khoản thu này.
              </td>
            </tr>
          `;
        } else {
          payments.forEach(p => {
            const ref = p.reference_code || `TT-${inv.billing_year}${String(inv.billing_month).padStart(2, '0')}-${String(p.payment_id).padStart(3, '0')}`;
            const tr = document.createElement('tr');
            tr.innerHTML = `
              <td><strong>${this.escapeHtml(this.formatDate(p.paid_at))}</strong><br><span class="text-caption">${this.escapeHtml(ref)}</span></td>
              <td><strong style="color:var(--color-success);">${this.escapeHtml(this.formatCurrency(p.amount))}</strong></td>
              <td>${this.escapeHtml(this.getPaymentMethodLabel(p.payment_method))}</td>
              <td>${this.escapeHtml(p.note || '—')}</td>
              <td>${this.escapeHtml(p.recorded_by_name || 'Giáo viên')}</td>
            `;
            payTbody.appendChild(tr);
          });
          const totalTr = document.createElement('tr');
          totalTr.style.background = '#F8FAFC';
          totalTr.style.fontWeight = '700';
          totalTr.innerHTML = `
            <td>Tổng đã nhận (${payments.length} lần):</td>
            <td style="color:var(--color-success);">${this.escapeHtml(this.formatCurrency(inv.amount_paid))}</td>
            <td colspan="3" style="text-align:right; color:${Number(inv.amount_remaining) > 0 ? 'var(--color-warning)' : 'var(--color-success)'};">
              Còn lại: ${this.escapeHtml(this.formatCurrency(inv.amount_remaining))}
            </td>
          `;
          payTbody.appendChild(totalTr);
        }
      }

      // Bảng đối chiếu buổi học trong kỳ (nếu có)
      const sessionsWrap = document.getElementById('detailSessionsSection');
      const sessionsTbody = document.getElementById('detailSessionsTbody');
      if (sessionsWrap && sessionsTbody) {
        if (sessions.length === 0) {
          sessionsWrap.hidden = true;
        } else {
          sessionsWrap.hidden = false;
          const attLabel = st => {
            if (st === 'present') return '<span class="badge badge-success">Có mặt</span>';
            if (st === 'late') return '<span class="badge badge-warning">Đi trễ</span>';
            if (st === 'absent') return '<span class="badge badge-danger">Vắng</span>';
            if (st === 'excused') return '<span class="badge badge-info">Có phép</span>';
            return '<span class="badge badge-neutral">Chưa điểm danh</span>';
          };
          const chargePs = inv.charge_per_session != null ? Number(inv.charge_per_session) : null;
          const isBilled = st => st === 'present' || st === 'late' || st == null;
          sessionsTbody.innerHTML = sessions.map(s => {
            const counted = isBilled(s.attendance_status);
            const feeCell = chargePs != null
              ? (counted
                  ? `<span style="color:var(--color-success); font-weight:600;">${this.escapeHtml(this.formatCurrency(chargePs))}</span>`
                  : `<span style="color:var(--color-text-secondary); text-decoration:line-through;">${this.escapeHtml(this.formatCurrency(chargePs))}</span><br><span class="text-caption" style="color:var(--color-text-secondary);">Không tính</span>`)
              : '<span class="text-caption">Trọn gói</span>';
            return `
            <tr>
              <td>${this.escapeHtml(this.formatDateTime(s.starts_at))}</td>
              <td>${this.escapeHtml(s.topic || 'Buổi học định kỳ')}</td>
              <td>${this.escapeHtml(s.room || '—')}</td>
              <td>${attLabel(s.attendance_status)}</td>
              <td style="text-align:center;">${feeCell}</td>
            </tr>`;
          }).join('');
        }
      }

      // Nút hành động dưới footer modal
      const collectBtn = document.getElementById('detailModalCollectBtn');
      const remindBtn = document.getElementById('detailModalRemindBtn');
      const hasRemain = Number(inv.amount_remaining || 0) > 0;
      if (collectBtn) collectBtn.hidden = !hasRemain;
      if (remindBtn) remindBtn.hidden = !hasRemain;

      if (loadingBox) loadingBox.hidden = true;
      if (contentBox) contentBox.hidden = false;
    } catch (error) {
      if (loadingBox) {
        loadingBox.hidden = false;
        loadingBox.textContent = `Không tải được chi tiết học phí: ${error.message}`;
      }
    }
  },

  // =========================================================================
  // 7. MODAL LẬP KHOẢN THU MỚI (UC-09 BƯỚC 1-3)
  // =========================================================================
  openGenerateInvoiceModal() {
    const modal = document.getElementById('modalGenerateInvoice');
    if (!modal) return;
    const now = new Date();
    const { billing_year, billing_month } = this.parseSelectedPeriod();
    const year = billing_year || now.getFullYear();
    const month = billing_month || (now.getMonth() + 1);

    const yearInput = document.getElementById('genInvoiceYearInput');
    const monthSelect = document.getElementById('genInvoiceMonthSelect');
    if (yearInput) yearInput.value = String(year);
    if (monthSelect) monthSelect.value = String(month);

    this.syncGeneratePeriodDates();
    this.syncGenerateFeeDefault();

    const errBox = document.getElementById('genInvoiceErrorMsg');
    if (errBox) {
      errBox.hidden = true;
      errBox.textContent = '';
    }
    modal.classList.add('active');
  },

  syncGeneratePeriodDates() {
    const year = Number(document.getElementById('genInvoiceYearInput')?.value || 2026);
    const month = Number(document.getElementById('genInvoiceMonthSelect')?.value || 10);
    const startInput = document.getElementById('genInvoiceStartInput');
    const endInput = document.getElementById('genInvoiceEndInput');
    if (!startInput || !endInput || !year || !month) return;

    const lastDay = new Date(year, month, 0).getDate();
    const mm = String(month).padStart(2, '0');
    startInput.value = `${year}-${mm}-01`;
    endInput.value = `${year}-${mm}-${String(lastDay).padStart(2, '0')}`;
  },

  syncGenerateFeeDefault() {
    const modeSelect = document.getElementById('genInvoiceModeSelect');
    const classSelect = document.getElementById('genInvoiceClassSelect');
    const amountLabel = document.getElementById('genInvoiceAmountLabel');
    const amountInput = document.getElementById('genInvoiceAmountInput');
    if (!modeSelect || !classSelect || !amountInput) return;

    const selectedOpt = classSelect.selectedOptions[0];
    const monthlyFee = Number(selectedOpt?.dataset?.monthlyFee || 0);
    if (modeSelect.value === 'fixed') {
      if (amountLabel) amountLabel.innerHTML = 'Mức học phí cả kỳ / học sinh (VNĐ) <span class="required">*</span>';
      if (monthlyFee > 0) amountInput.value = monthlyFee.toLocaleString('vi-VN');
    } else {
      if (amountLabel) amountLabel.innerHTML = 'Đơn giá mỗi buổi học (VNĐ/buổi) <span class="required">*</span>';
      if (monthlyFee > 0) amountInput.value = Math.round(monthlyFee / 8).toLocaleString('vi-VN');
    }
  },

  async submitGenerateInvoice() {
    const classId = document.getElementById('genInvoiceClassSelect')?.value;
    const billingYear = Number(document.getElementById('genInvoiceYearInput')?.value);
    const billingMonth = Number(document.getElementById('genInvoiceMonthSelect')?.value);
    const periodStart = document.getElementById('genInvoiceStartInput')?.value;
    const periodEnd = document.getElementById('genInvoiceEndInput')?.value;
    const mode = document.getElementById('genInvoiceModeSelect')?.value || 'fixed';
    const rawAmount = document.getElementById('genInvoiceAmountInput')?.value;
    const note = document.getElementById('genInvoiceNoteInput')?.value?.trim() || null;
    const errBox = document.getElementById('genInvoiceErrorMsg');
    const submitBtn = document.getElementById('genInvoiceSubmitBtn');

    const showErr = msg => {
      if (errBox) {
        errBox.textContent = msg;
        errBox.hidden = false;
      } else {
        alert(msg);
      }
    };

    if (!classId) {
      showErr('Vui lòng chọn lớp học cần lập khoản thu.');
      return;
    }
    if (!periodStart || !periodEnd || periodEnd < periodStart) {
      showErr('Ngày kết thúc / hạn thu phải sau hoặc bằng ngày bắt đầu kỳ thu.');
      return;
    }
    const parsedMoney = this.parseMoneyInput(rawAmount);
    if (!Number.isFinite(parsedMoney) || parsedMoney < 0) {
      showErr('Vui lòng nhập đơn giá / mức học phí hợp lệ.');
      return;
    }

    const payload = {
      class_id: classId,
      billing_year: billingYear,
      billing_month: billingMonth,
      period_start: periodStart,
      period_end: periodEnd,
      note
    };
    if (mode === 'fixed') {
      payload.amount_due = parsedMoney;
    } else {
      payload.charge_per_session = parsedMoney;
    }

    if (submitBtn) submitBtn.disabled = true;
    try {
      const res = await this.createInvoices(payload);
      document.getElementById('modalGenerateInvoice')?.classList.remove('active');
      this.pageState.selectedPeriod = `${billingYear}-${String(billingMonth).padStart(2, '0')}`;
      this.pageState.periodInitialized = true;
      await this.reloadPageData();
      this.setPageFeedback(
        res.created > 0
          ? `Đã phát hành ${res.created} khoản thu học phí tháng ${String(billingMonth).padStart(2, '0')}/${billingYear} và gửi thông báo tới phụ huynh/học sinh.`
          : `Các học sinh đang học trong lớp đã có khoản thu tháng ${String(billingMonth).padStart(2, '0')}/${billingYear} (không tạo trùng).`,
        res.created > 0 ? 'success' : 'info'
      );
    } catch (error) {
      showErr(error.message);
    } finally {
      if (submitBtn) submitBtn.disabled = false;
    }
  },

  async handleSingleReminder(invoiceId) {
    const inv = (this.pageState.invoices || []).find(i => i.invoice_id === invoiceId) || this.pageState.activeDetailInvoice;
    const label = inv ? `${inv.student_name} (${inv.student_code})` : invoiceId;
    try {
      const res = await this.sendTuitionReminder(invoiceId);
      this.setPageFeedback(
        `Đã gửi thông báo nhắc học phí (${res.sent_count} người nhận) cho phụ huynh học sinh ${label}.`,
        'success'
      );
    } catch (error) {
      this.setPageFeedback(`Không gửi được nhắc phí: ${error.message}`, 'danger');
    }
  },

  async handleBulkReminders() {
    const { billing_year, billing_month } = this.parseSelectedPeriod();
    const debtRows = this.getFilteredInvoices().filter(i => Number(i.amount_remaining || 0) > 0);
    if (!debtRows.length) {
      this.setPageFeedback('Không có học sinh nào còn công nợ trong bộ lọc hiện tại để nhắc phí.', 'info');
      return;
    }
    if (!confirm(`Gửi thông báo nhắc hạn nộp học phí tới phụ huynh của các học sinh còn công nợ (${this.getSelectedPeriodTitle()})?`)) {
      return;
    }
    try {
      const res = await this.sendBulkReminders({
        class_id: this.pageState.selectedClassId || undefined,
        billing_year,
        billing_month
      });
      this.setPageFeedback(
        `Đã phát hành nhắc nhở học phí cho ${res.invoices_reminded} khoản thu (${res.sent_count} thông báo gửi tới phụ huynh).`,
        'success'
      );
    } catch (error) {
      this.setPageFeedback(`Không thể gửi nhắc phí hàng loạt: ${error.message}`, 'danger');
    }
  },

  async initTeacherTuitionPage() {
    if (!AuthService.requireAuth('teacher')) return;
    this.syncTeacherHeaderProfile();

    // Tải danh sách lớp học trước
    try {
      this.pageState.classes = await this.getClasses();
      this.renderClassOptions();
    } catch (error) {
      console.error('Không tải được danh sách lớp:', error);
    }

    // Gắn sự kiện Sub-tabs
    document.querySelectorAll('[data-tuition-tab]').forEach(btn => {
      btn.addEventListener('click', () => this.switchSubTab(btn.dataset.tuitionTab));
    });

    // Gắn sự kiện bộ lọc
    document.getElementById('tuitionSearchInput')?.addEventListener('input', e => {
      this.pageState.searchKeyword = e.target.value;
      this.renderInvoicesTable();
    });
    document.getElementById('tuitionStatusFilter')?.addEventListener('change', e => {
      this.pageState.selectedStatus = e.target.value;
      this.renderInvoicesTable();
    });
    document.getElementById('tuitionPeriodFilter')?.addEventListener('change', async e => {
      this.pageState.selectedPeriod = e.target.value;
      await this.reloadPageData();
    });
    document.getElementById('tuitionClassFilter')?.addEventListener('change', async e => {
      this.pageState.selectedClassId = e.target.value;
      await this.reloadPageData();
    });

    // Bộ lọc tab Lịch sử ghi nhận
    document.getElementById('paymentHistorySearchInput')?.addEventListener('input', e => {
      this.pageState.paymentSearchKeyword = e.target.value;
      this.renderPaymentsTable();
    });
    document.getElementById('paymentHistoryMethodFilter')?.addEventListener('change', e => {
      this.pageState.paymentMethodFilter = e.target.value;
      this.renderPaymentsTable();
    });

    // Sự kiện click ủy quyền cho các bảng
    document.getElementById('teacherTuitionPageRoot')?.addEventListener('click', e => {
      const btn = e.target.closest('button[data-action]');
      if (!btn) return;
      const action = btn.dataset.action;
      const invoiceId = btn.dataset.invoiceId;
      if (action === 'pay' && invoiceId) {
        this.openPaymentModalByInvoice(invoiceId);
      } else if (action === 'detail' && invoiceId) {
        this.openInvoiceDetailModal(invoiceId);
      } else if (action === 'remind' && invoiceId) {
        this.handleSingleReminder(invoiceId);
      } else if (action === 'filter-class' && btn.dataset.classId) {
        this.pageState.selectedClassId = btn.dataset.classId;
        const clsFilter = document.getElementById('tuitionClassFilter');
        if (clsFilter) clsFilter.value = btn.dataset.classId;
        this.switchSubTab('invoices');
        this.reloadPageData();
      }
    });

    // Sự kiện trong Modal Ghi nhận thanh toán
    document.getElementById('payModalInvoiceSelect')?.addEventListener('change', e => {
      const inv = (this.pageState.invoices || []).find(i => i.invoice_id === e.target.value);
      if (inv) this.populatePaymentModalFields(inv);
    });
    document.getElementById('payModalAmountInput')?.addEventListener('input', () => {
      this.updatePaymentModalPreview();
    });
    document.getElementById('payModalConfirmCheck')?.addEventListener('change', () => {
      this.updatePaymentModalPreview();
    });
    document.getElementById('payModalFillFullBtn')?.addEventListener('click', () => {
      const inv = this.pageState.activePaymentInvoice;
      const amountInput = document.getElementById('payModalAmountInput');
      if (inv && amountInput) {
        amountInput.value = Math.round(Number(inv.amount_remaining || 0)).toLocaleString('vi-VN');
        this.updatePaymentModalPreview();
      }
    });
    document.getElementById('payModalSubmitBtn')?.addEventListener('click', () => {
      this.submitRecordPayment();
    });

    // Sự kiện trong Modal Chi tiết học phí
    document.getElementById('detailModalCollectBtn')?.addEventListener('click', () => {
      const inv = this.pageState.activeDetailInvoice;
      if (!inv) return;
      document.getElementById('modalInvoiceDetail')?.classList.remove('active');
      this.openPaymentModalByInvoice(inv.invoice_id);
    });
    document.getElementById('detailModalRemindBtn')?.addEventListener('click', () => {
      const inv = this.pageState.activeDetailInvoice;
      if (inv) this.handleSingleReminder(inv.invoice_id);
    });

    // Sự kiện trong Modal Lập khoản thu mới
    document.getElementById('genInvoiceClassSelect')?.addEventListener('change', () => {
      this.syncGenerateFeeDefault();
    });
    document.getElementById('genInvoiceModeSelect')?.addEventListener('change', () => {
      this.syncGenerateFeeDefault();
    });
    document.getElementById('genInvoiceYearInput')?.addEventListener('change', () => {
      this.syncGeneratePeriodDates();
    });
    document.getElementById('genInvoiceMonthSelect')?.addEventListener('change', () => {
      this.syncGeneratePeriodDates();
    });
    document.getElementById('genInvoiceSubmitBtn')?.addEventListener('click', () => {
      this.submitGenerateInvoice();
    });

    // Nút Header: Xuất báo cáo, Nhắc phí, Lập khoản thu, Ghi nhận nhanh
    document.getElementById('btnExportTuitionCsv')?.addEventListener('click', () => {
      this.exportTuitionCsv(this.getFilteredInvoices(), this.pageState.selectedPeriod || 'tat-ca');
    });
    document.getElementById('btnOpenGenerateInvoice')?.addEventListener('click', () => {
      this.openGenerateInvoiceModal();
    });
    document.getElementById('btnBulkRemindTuition')?.addEventListener('click', () => {
      this.handleBulkReminders();
    });
    document.getElementById('btnQuickRecordPayment')?.addEventListener('click', () => {
      this.openPaymentModalByInvoice(null);
    });

    await this.reloadPageData();

    // Hỗ trợ mở nhanh từ Dashboard (tuition.html#record hoặc ?invoice_id=...)
    const params = new URLSearchParams(window.location.search);
    const targetInvoiceId = params.get('invoice_id');
    if (targetInvoiceId) {
      this.openInvoiceDetailModal(targetInvoiceId);
    } else if (window.location.hash === '#record') {
      this.openPaymentModalByInvoice(null);
    }
  },

  // =========================================================================
  // 8. CONTROLLER THẺ HỌC PHÍ TRÊN DASHBOARD GIÁO VIÊN: pages/teacher/dashboard.html
  // =========================================================================
  async initTeacherDashboard() {
    const remainValueEl = document.getElementById('teacherDashTuitionRemaining');
    const remainDescEl = document.getElementById('teacherDashTuitionDesc');
    const subtitleEl = document.getElementById('teacherDashTuitionSubtitle');
    const tbody = document.getElementById('teacherDashTuitionWatchlistRows');
    if (!remainValueEl && !tbody) return;
    if (!AuthService.getToken()) return;

    try {
      let summary = await this.getTuitionSummary();
      let periodText = 'Tất cả kỳ';
      if (summary.available_periods && summary.available_periods.length > 0) {
        const latest = summary.available_periods[0];
        summary = await this.getTuitionSummary({
          billing_year: latest.billing_year,
          billing_month: latest.billing_month
        });
        periodText = `Tháng ${String(latest.billing_month).padStart(2, '0')}/${latest.billing_year}`;
      }

      const totals = summary.totals || {};
      const rem = Number(totals.total_amount_remaining || 0);
      const debtCount = Number(totals.debt_count || 0);

      if (remainValueEl) {
        remainValueEl.textContent = this.formatCurrency(rem);
      }
      if (remainDescEl) {
        remainDescEl.textContent = `${debtCount} HS · ${periodText}`;
        remainDescEl.title = `${debtCount} học sinh còn nợ học phí trong ${periodText}`;
      }
      if (subtitleEl) {
        subtitleEl.textContent = `${periodText} · Các học sinh có số dư chưa thanh toán`;
      }

      if (tbody) {
        tbody.replaceChildren();
        const watchlist = Array.isArray(summary.watchlist) ? summary.watchlist : [];
        if (watchlist.length === 0) {
          const tr = document.createElement('tr');
          tr.innerHTML = `
            <td colspan="6" style="text-align:center; padding:18px; color:var(--color-text-secondary);">
              ${Number(totals.invoice_count || 0) === 0 ? 'Chưa phát hành khoản thu học phí nào.' : 'Tất cả học sinh đã hoàn tất học phí trong kỳ.'}
            </td>
          `;
          tbody.appendChild(tr);
        } else {
          watchlist.slice(0, 2).forEach(item => {
            const meta = this.getStatusMeta(item.payment_status);
            const tr = document.createElement('tr');
            tr.innerHTML = `
              <td>
                <a href="tuition.html?invoice_id=${encodeURIComponent(item.invoice_id)}" style="color:inherit; text-decoration:none;">
                  <strong>${this.escapeHtml(item.student_name)}</strong>
                </a><br>
                <span class="text-caption">${this.escapeHtml(item.student_code)}</span>
              </td>
              <td>${this.escapeHtml(item.class_name)}</td>
              <td>${this.escapeHtml(this.formatCurrency(item.amount_due))}</td>
              <td>${this.escapeHtml(this.formatCurrency(item.amount_paid))}</td>
              <td><strong style="color:${meta.amountColor};">${this.escapeHtml(this.formatCurrency(item.amount_remaining))}</strong></td>
              <td><span class="badge ${meta.badgeClass}">${this.escapeHtml(meta.label)}</span></td>
            `;
            tbody.appendChild(tr);
          });
        }
      }
    } catch (error) {
      if (remainValueEl) remainValueEl.textContent = '—';
      if (remainDescEl) remainDescEl.title = `Không tải được học phí: ${error.message}`;
      if (subtitleEl) subtitleEl.title = `Không tải được dữ liệu học phí: ${error.message}`;
      if (tbody) {
        tbody.innerHTML = `<tr><td colspan="6" style="color:var(--color-danger); text-align:center;">${this.escapeHtml(error.message)}</td></tr>`;
      }
    }
  }
};

window.TuitionFeeModule = TuitionFeeModule;

document.addEventListener('DOMContentLoaded', () => {
  if (document.getElementById('teacherTuitionPageRoot')) {
    TuitionFeeModule.initTeacherTuitionPage();
  } else if (document.getElementById('teacherDashTuitionRemaining') || document.getElementById('teacherDashTuitionWatchlistRows')) {
    TuitionFeeModule.initTeacherDashboard();
  }
});
