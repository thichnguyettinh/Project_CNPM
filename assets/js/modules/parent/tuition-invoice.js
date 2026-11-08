/**
 * MODULE: CỔNG HỌC PHÍ, ĐỐI SOÁT CÔNG NỢ & BÁO PHÍ PHỤ HUYNH (UC-12)
 * Phụ trách:
 *  - pages/parent/tuition.html (Trang 27 PDF: đối soát tiến độ đóng 66,7%, lịch sử đóng phí minh bạch)
 *  - pages/parent/notifications.html (Trang 28 PDF: báo phí & nhắc nhở hạn nộp học phí)
 *  - Thẻ học phí trên pages/parent/dashboard.html (học phí còn phải đóng & hạn thanh toán)
 */

const ParentTuitionInvoiceModule = {
  // =========================================================================
  // 1. CÁC HÀM GỐC (GIỮ NGUYÊN CHỮ KÝ & GIÁ TRỊ TRẢ VỀ HIỆN CÓ)
  // =========================================================================
  getChildInvoices(filter = {}) {
    const cleanFilter = {};
    Object.entries(filter || {}).forEach(([key, val]) => {
      if (val !== undefined && val !== null && val !== '') cleanFilter[key] = val;
    });
    const query = new URLSearchParams(cleanFilter).toString();
    return AuthService.api(`/tuition/invoices${query ? `?${query}` : ''}`);
  },

  getPaymentInstructions() {
    return {
      bankName: 'Liên hệ giáo viên phụ trách để nhận thông tin thanh toán.',
      accountNumber: null,
      accountHolder: null,
      syntax: 'Ghi mã hóa đơn và mã học sinh trong nội dung chuyển khoản.'
    };
  },

  // =========================================================================
  // 2. CÁC HÀM API & ĐỐI SOÁT BỔ SUNG CHO UC-12
  // =========================================================================
  fetchChildInvoices(filter = {}) {
    return this.getChildInvoices(filter);
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

  reconcileFee(invoice = {}) {
    const amountDue = Number(invoice.amount_due || 0);
    const amountPaid = Number(invoice.amount_paid || 0);
    const amountRemaining = Number(
      invoice.amount_remaining !== undefined
        ? invoice.amount_remaining
        : Math.max(amountDue - amountPaid, 0)
    );
    const rawPct = amountDue > 0 ? (amountPaid / amountDue) * 100 : 100;
    const progressPercent = Math.round(rawPct * 10) / 10;
    const status = invoice.payment_status
      || (amountRemaining <= 0 ? 'paid' : amountPaid > 0 ? 'partial' : 'unpaid');

    let statusLabel = 'Chưa đóng';
    let badgeClass = 'badge-danger';
    let verifyLabel = 'Chờ xác nhận';
    let verifyBadgeClass = 'badge-warning';

    if (status === 'paid') {
      statusLabel = 'Đã đóng đủ';
      badgeClass = 'badge-success';
      verifyLabel = 'Hoàn tất đối soát';
      verifyBadgeClass = 'badge-success';
    } else if (status === 'partial') {
      statusLabel = 'Còn thiếu';
      badgeClass = 'badge-warning';
      verifyLabel = 'Đã xác nhận';
      verifyBadgeClass = 'badge-success';
    } else if (status === 'void') {
      statusLabel = 'Đã hủy';
      badgeClass = 'badge-neutral';
      verifyLabel = 'Không áp dụng';
      verifyBadgeClass = 'badge-neutral';
    }

    return {
      amountDue,
      amountPaid,
      amountRemaining,
      progressPercent,
      progressFormatted: this.formatPercent(progressPercent),
      paymentStatus: status,
      statusLabel,
      badgeClass,
      verifyLabel,
      verifyBadgeClass
    };
  },

  // =========================================================================
  // 3. TIỆN ÍCH ĐỊNH DẠNG AN TOÀN
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

  formatPercent(value) {
    const num = Math.round(Number(value || 0) * 10) / 10;
    return `${num.toLocaleString('vi-VN', {
      minimumFractionDigits: num % 1 === 0 ? 0 : 1,
      maximumFractionDigits: 1
    })}%`;
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

  formatPeriodRange(start, end) {
    if (!start && !end) return '—';
    const s = String(start || '');
    const e = String(end || '');
    if (/^\d{4}-\d{2}-\d{2}$/.test(s) && /^\d{4}-\d{2}-\d{2}$/.test(e)) {
      const [sy, sm, sd] = s.split('-');
      const [ey, em, ed] = e.split('-');
      if (sy === ey) {
        return `${sd}/${sm}–${ed}/${em}/${ey}`;
      }
    }
    return `${this.formatDate(start)}–${this.formatDate(end)}`;
  },

  getExternalMethodLabel(method) {
    switch (method) {
      case 'bank_transfer':
        return 'Chuyển khoản cho trung tâm';
      case 'cash':
        return 'Tiền mặt tại trung tâm';
      default:
        return 'Hình thức trực tiếp khác';
    }
  },

  getInitials(fullName) {
    const parts = String(fullName || '').trim().split(/\s+/).filter(Boolean);
    if (!parts.length) return 'HS';
    if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
    return (parts[parts.length - 2][0] + parts[parts.length - 1][0]).toUpperCase();
  },

  syncParentHeaderProfile() {
    const user = AuthService.getCurrentUser();
    if (!user) return;
    if (user.fullName) {
      document.querySelectorAll('[data-parent-name]').forEach(el => {
        el.textContent = user.fullName;
      });
      document.querySelectorAll('[data-parent-header-label]').forEach(el => {
        el.textContent = `${user.fullName} · Phụ huynh`;
      });
    }
    if (user.avatarText) {
      document.querySelectorAll('[data-parent-avatar]').forEach(el => {
        el.textContent = user.avatarText;
      });
    }
  },

  bindContactModalTriggers(getContextFn) {
    document.querySelectorAll('[data-open-parent-contact]').forEach(btn => {
      if (btn.dataset.contactBound === 'true') return;
      btn.dataset.contactBound = 'true';
      btn.addEventListener('click', () => {
        const ctx = typeof getContextFn === 'function' ? getContextFn() : {};
        this.openContactModal(ctx);
      });
    });
    document.querySelectorAll('[data-close-parent-contact]').forEach(btn => {
      if (btn.dataset.contactBound === 'true') return;
      btn.dataset.contactBound = 'true';
      btn.addEventListener('click', () => {
        document.getElementById('modalParentTuitionContact')?.classList.remove('active');
      });
    });
  },

  openContactModal(context = {}) {
    const modal = document.getElementById('modalParentTuitionContact');
    const instructions = this.getPaymentInstructions();
    if (!modal) {
      alert(`${instructions.bankName}\nCú pháp đối chiếu: ${instructions.syntax}`);
      return;
    }
    const setEl = (id, text) => {
      const el = document.getElementById(id);
      if (el) el.textContent = text;
    };
    setEl('parentContactTeacherName', context.teacherName || 'Giáo viên phụ trách lớp');
    setEl('parentContactTeacherPhone', context.teacherPhone || 'Liên hệ trực tiếp tại lớp học');
    setEl('parentContactTeacherEmail', context.teacherEmail || 'giaovien@lopminh.edu.vn');
    const sampleCode = context.invoiceId && context.studentCode
      ? `${context.invoiceId} ${context.studentCode}`
      : instructions.syntax;
    setEl('parentContactSyntaxHint', sampleCode);
    setEl('parentContactBankNote', instructions.bankName);
    modal.classList.add('active');
  },

  // =========================================================================
  // 4. CONTROLLER TRANG CỔNG HỌC PHÍ PHỤ HUYNH: pages/parent/tuition.html
  // =========================================================================
  tuitionPageState: {
    children: [],
    selectedStudentCode: '',
    invoices: [],
    selectedInvoiceId: '',
    currentDetail: null
  },

  setTuitionFeedback(message = '', type = 'info') {
    const box = document.getElementById('parentTuitionFeedback');
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

  renderChildSelector() {
    const children = this.tuitionPageState.children || [];
    const avatarEl = document.getElementById('parentTuitionChildAvatar');
    const labelEl = document.getElementById('parentTuitionChildLabel');
    const selectWrap = document.getElementById('parentTuitionChildSelectWrap');
    const selectEl = document.getElementById('parentTuitionChildSelect');

    if (!children.length) {
      if (avatarEl) avatarEl.textContent = '—';
      if (labelEl) labelEl.textContent = 'Chưa có học sinh liên kết';
      if (selectWrap) selectWrap.hidden = true;
      return;
    }

    if (!this.tuitionPageState.selectedStudentCode || !children.some(c => c.student_code === this.tuitionPageState.selectedStudentCode)) {
      this.tuitionPageState.selectedStudentCode = children[0].student_code;
    }

    const activeChild = children.find(c => c.student_code === this.tuitionPageState.selectedStudentCode) || children[0];
    if (avatarEl) {
      avatarEl.textContent = activeChild.avatar_text || this.getInitials(activeChild.full_name);
    }
    if (labelEl) {
      const classPart = activeChild.class_name
        ? `${activeChild.student_code} · ${activeChild.class_name}`
        : activeChild.student_code;
      labelEl.textContent = `${activeChild.full_name} (${classPart})`;
    }

    if (selectWrap && selectEl) {
      if (children.length > 1) {
        selectWrap.hidden = false;
        selectEl.innerHTML = '';
        children.forEach(child => {
          const opt = document.createElement('option');
          opt.value = child.student_code;
          opt.textContent = `${child.full_name} (${child.student_code}${child.class_code ? ` · ${child.class_code}` : ''})`;
          selectEl.appendChild(opt);
        });
        selectEl.value = activeChild.student_code;
      } else {
        selectWrap.hidden = true;
      }
    }
  },

  renderInvoiceSelector() {
    const selectEl = document.getElementById('parentTuitionInvoiceSelect');
    const invoices = this.tuitionPageState.invoices || [];
    if (!selectEl) return;

    selectEl.innerHTML = '';
    if (!invoices.length) {
      const opt = document.createElement('option');
      opt.value = '';
      opt.textContent = 'Chưa có khoản thu học phí';
      selectEl.appendChild(opt);
      selectEl.disabled = true;
      this.tuitionPageState.selectedInvoiceId = '';
      return;
    }

    selectEl.disabled = false;
    invoices.forEach(inv => {
      const rec = this.reconcileFee(inv);
      const opt = document.createElement('option');
      opt.value = inv.invoice_id;
      opt.textContent = `Tháng ${String(inv.billing_month).padStart(2, '0')}/${inv.billing_year} · ${inv.class_name} (${rec.statusLabel})`;
      selectEl.appendChild(opt);
    });

    if (
      !this.tuitionPageState.selectedInvoiceId
      || !invoices.some(i => i.invoice_id === this.tuitionPageState.selectedInvoiceId)
    ) {
      const firstUnpaid = invoices.find(i => Number(i.amount_remaining || 0) > 0);
      this.tuitionPageState.selectedInvoiceId = (firstUnpaid || invoices[0]).invoice_id;
    }
    selectEl.value = this.tuitionPageState.selectedInvoiceId;
  },

  renderEmptyParentTuitionState(message) {
    const setEl = (id, text) => {
      const el = document.getElementById(id);
      if (el) el.textContent = text;
    };
    setEl('parentTuitionPeriodHeading', '📅 Chưa có kỳ học phí');
    const statusBadge = document.getElementById('parentTuitionStatusBadge');
    if (statusBadge) {
      statusBadge.className = 'badge badge-neutral';
      statusBadge.textContent = 'Chưa phát hành';
    }
    setEl('parentStatTotalDue', '0 ₫');
    setEl('parentStatPeriodDesc', 'Chưa có kỳ thu đang mở');
    setEl('parentStatTotalPaid', '0 ₫');
    setEl('parentStatPaymentCountDesc', '0 lần đóng đã được xác nhận');
    setEl('parentStatRemaining', '0 ₫');
    setEl('parentStatDueDateDesc', 'Không có công nợ tồn đọng');

    const infoRows = document.getElementById('parentInvoiceInfoRows');
    if (infoRows) {
      infoRows.innerHTML = `<p class="text-secondary" style="padding:12px 0;">${this.escapeHtml(message)}</p>`;
    }
    setEl('parentReconcilePercent', '0%');
    setEl('parentReconcileCaption', 'Chưa có khoản thu cần đối soát.');
    const fill = document.getElementById('parentReconcileBarFill');
    if (fill) fill.style.width = '0%';
    const verifyBadge = document.getElementById('parentReconcileVerifyBadge');
    if (verifyBadge) {
      verifyBadge.className = 'badge badge-neutral';
      verifyBadge.textContent = 'Chưa có dữ liệu';
    }
    const tbody = document.getElementById('parentPaymentsTbody');
    if (tbody) {
      tbody.innerHTML = `
        <tr>
          <td colspan="5" style="text-align:center; padding:28px; color:var(--color-text-secondary);">
            ${this.escapeHtml(message)}
          </td>
        </tr>
      `;
    }
  },

  async loadAndRenderSelectedInvoice() {
    const invoiceId = this.tuitionPageState.selectedInvoiceId;
    if (!invoiceId) {
      this.renderEmptyParentTuitionState('Hiện chưa có khoản thu học phí nào được phát hành cho con em.');
      return;
    }

    try {
      const detail = await this.getInvoiceDetail(invoiceId);
      this.tuitionPageState.currentDetail = detail;
      const inv = detail.invoice;
      const payments = Array.isArray(detail.payments) ? detail.payments : [];
      const rec = this.reconcileFee(inv);

      const setEl = (id, text) => {
        const el = document.getElementById(id);
        if (el) el.textContent = text;
      };

      setEl('parentTuitionPeriodHeading', `📅 Tháng ${String(inv.billing_month).padStart(2, '0')}/${inv.billing_year}`);
      const statusBadge = document.getElementById('parentTuitionStatusBadge');
      if (statusBadge) {
        statusBadge.className = `badge ${rec.badgeClass}`;
        statusBadge.textContent = rec.statusLabel;
      }

      // 3 thẻ thống kê tài chính (Trang 27 PDF)
      setEl('parentStatTotalDue', this.formatCurrency(rec.amountDue));
      setEl(
        'parentStatPeriodDesc',
        Number(inv.sessions_count || 0) > 0
          ? `Kỳ học: ${this.formatPeriodRange(inv.period_start, inv.period_end)} · ${Number(inv.sessions_count)} buổi tính phí`
          : `Kỳ học: ${this.formatPeriodRange(inv.period_start, inv.period_end)}`
      );

      setEl('parentStatTotalPaid', this.formatCurrency(rec.amountPaid));
      setEl('parentStatPaymentCountDesc', `${payments.length} lần đóng đã được xác nhận`);

      const remEl = document.getElementById('parentStatRemaining');
      if (remEl) {
        remEl.textContent = this.formatCurrency(rec.amountRemaining);
        remEl.style.color = rec.amountRemaining > 0 ? 'var(--color-danger)' : 'var(--color-success)';
      }
      setEl(
        'parentStatDueDateDesc',
        rec.amountRemaining > 0
          ? `Hạn đóng: ${this.formatDate(inv.period_end)}`
          : 'Đã hoàn tất học phí kỳ này'
      );

      // Khối trái: Thông tin khoản thu
      const infoRows = document.getElementById('parentInvoiceInfoRows');
      if (infoRows) {
        const sessCount = Number(inv.sessions_count || 0);
        const amtDue = Number(inv.amount_due || 0);
        const unitPrice = (inv.charge_per_session != null && Number(inv.charge_per_session) > 0)
          ? Number(inv.charge_per_session)
          : (sessCount > 0 ? Math.round(amtDue / sessCount) : 0);

        let formulaHtml = '';
        if (sessCount > 0) {
          formulaHtml = `
          <div class="tuition-formula-block">
            <div class="tuition-formula-title">Chi tiết công thức tính học phí</div>
            <div class="tuition-formula-row">
              <span class="tuition-formula-label">Số buổi đi học (tính phí):</span>
              <span class="tuition-formula-value"><strong>${sessCount} buổi</strong></span>
            </div>
            <div class="tuition-formula-row">
              <span class="tuition-formula-label">Đơn giá học phí mỗi buổi:</span>
              <span class="tuition-formula-value"><strong>${this.escapeHtml(this.formatCurrency(unitPrice))} / buổi</strong></span>
            </div>
            <div class="tuition-formula-eq">
              Công thức: ${sessCount} buổi &times; ${this.escapeHtml(this.formatCurrency(unitPrice))} = <strong>${this.escapeHtml(this.formatCurrency(amtDue))}</strong>
            </div>
          </div>`;
        } else if (amtDue > 0) {
          formulaHtml = `
          <div class="tuition-formula-block">
            <div class="tuition-formula-title">📐 Chi tiết công thức tính học phí</div>
            <div class="tuition-formula-row">
              <span class="tuition-formula-label">Hình thức tính phí:</span>
              <span class="tuition-formula-value">Trọn gói cố định theo kỳ</span>
            </div>
            <div class="tuition-formula-eq">
              Mức trọn gói kỳ = <strong>${this.escapeHtml(this.formatCurrency(amtDue))}</strong>
            </div>
          </div>`;
        }

        infoRows.innerHTML = `
          <div class="tuition-kv-row"><span>Mã phiếu thu:</span><strong>${this.escapeHtml(inv.invoice_id)}</strong></div>
          <div class="tuition-kv-row"><span>Học sinh:</span><strong>${this.escapeHtml(inv.student_name)} (${this.escapeHtml(inv.student_code)})</strong></div>
          <div class="tuition-kv-row"><span>Lớp học:</span><span>${this.escapeHtml(inv.class_name)} (${this.escapeHtml(inv.class_code)})</span></div>
          <div class="tuition-kv-row"><span>Giáo viên phụ trách:</span><span>${this.escapeHtml(inv.teacher_name || '—')}</span></div>
          <div class="tuition-kv-row"><span>Kỳ học phí:</span><span>${this.escapeHtml(this.formatPeriodRange(inv.period_start, inv.period_end))}</span></div>
          <div class="tuition-kv-row"><span>Số buổi tính phí:</span><strong style="color:var(--color-primary); font-size:13.5px;">${sessCount > 0 ? `${sessCount} buổi` : 'Trọn gói kỳ'}</strong></div>
          ${sessCount > 0 ? `<div class="tuition-kv-row"><span>Đơn giá mỗi buổi:</span><strong style="color:var(--color-primary);">${this.escapeHtml(this.formatCurrency(unitPrice))} / buổi</strong></div>` : ''}
          <div class="tuition-kv-row"><span>Hạn thanh toán:</span><strong>${this.escapeHtml(this.formatDate(inv.period_end))}</strong></div>
          <div class="tuition-kv-row"><span>Ghi chú khoản thu:</span><span>${this.escapeHtml(inv.note || 'Thu theo kỳ học tháng')}</span></div>
          ${formulaHtml}
          <div class="tuition-kv-row is-total"><span>Tổng phải đóng:</span><span>${this.escapeHtml(this.formatCurrency(rec.amountDue))}</span></div>
        `;
      }

      const verifyBadge = document.getElementById('parentReconcileVerifyBadge');
      if (verifyBadge) {
        verifyBadge.className = `badge ${rec.verifyBadgeClass}`;
        verifyBadge.textContent = rec.verifyLabel;
      }

      const pctEl = document.getElementById('parentReconcilePercent');
      if (pctEl) {
        pctEl.textContent = rec.progressFormatted;
        pctEl.style.color = rec.amountPaid > 0 ? '#15803D' : 'var(--color-danger)';
      }

      const barFill = document.getElementById('parentReconcileBarFill');
      if (barFill) {
        barFill.style.width = `${Math.min(rec.progressPercent, 100)}%`;
        barFill.style.background = rec.amountPaid > 0 ? '#15803D' : 'var(--color-danger)';
      }

      const captionEl = document.getElementById('parentReconcileCaption');
      if (captionEl) {
        captionEl.innerHTML = `Đã đóng: <strong>${this.escapeHtml(this.formatCurrency(rec.amountPaid))}</strong> / ${this.escapeHtml(this.formatCurrency(rec.amountDue))} · Còn thiếu: <strong style="color:${rec.amountRemaining > 0 ? 'var(--color-danger)' : 'var(--color-success)'};">${this.escapeHtml(this.formatCurrency(rec.amountRemaining))}</strong>`;
      }

      // Bảng Lịch sử đóng học phí minh bạch
      const tbody = document.getElementById('parentPaymentsTbody');
      if (tbody) {
        tbody.replaceChildren();
        if (payments.length === 0) {
          tbody.innerHTML = `
            <tr>
              <td colspan="5" style="text-align:center; padding:26px; color:var(--color-text-secondary);">
                Chưa có giao dịch đóng học phí nào được trung tâm ghi nhận trong kỳ này.
              </td>
            </tr>
          `;
        } else {
          payments.forEach(p => {
            const receiptCode = p.reference_code
              || `PT-${inv.billing_year}${String(inv.billing_month).padStart(2, '0')}-${String(p.payment_id).padStart(3, '0')}`;
            const tr = document.createElement('tr');
            tr.innerHTML = `
              <td><strong>${this.escapeHtml(this.formatDate(p.paid_at))}</strong></td>
              <td><strong style="color:var(--color-text-main);">${this.escapeHtml(this.formatCurrency(p.amount))}</strong></td>
              <td>
                ${this.escapeHtml(this.getExternalMethodLabel(p.payment_method))}
                ${p.note ? `<br><span class="text-caption">${this.escapeHtml(p.note)}</span>` : ''}
              </td>
              <td><code>${this.escapeHtml(receiptCode)}</code></td>
              <td>
                <span class="badge badge-success">Đã xác nhận</span>
                <div class="text-caption" style="margin-top:2px;">GV: ${this.escapeHtml(p.recorded_by_name || 'Trung tâm')}</div>
              </td>
            `;
            tbody.appendChild(tr);
          });

          const totalRow = document.createElement('tr');
          totalRow.style.background = '#F8FAFC';
          totalRow.style.fontWeight = '700';
          totalRow.innerHTML = `
            <td colspan="4">Tổng đã đóng trong kỳ (${payments.length} lần xác nhận):</td>
            <td style="color:var(--color-success); font-size:15px;">${this.escapeHtml(this.formatCurrency(rec.amountPaid))}</td>
          `;
          tbody.appendChild(totalRow);
        }
      }

      // Bảng đối chiếu buổi học & điểm danh trong kỳ của con
      const sessions = Array.isArray(detail.sessions) ? detail.sessions : [];
      const sessTbody = document.getElementById('parentSessionsTbody');
      const sessSummary = document.getElementById('parentSessionsSummary');
      if (sessTbody) {
        sessTbody.replaceChildren();
        const sessCount = Number(inv.sessions_count || 0);
        const amtDue = Number(inv.amount_due || 0);
        const unitPrice = (inv.charge_per_session != null && Number(inv.charge_per_session) > 0)
          ? Number(inv.charge_per_session)
          : (sessCount > 0 ? Math.round(amtDue / sessCount) : 0);

        if (sessions.length === 0) {
          sessTbody.innerHTML = `
            <tr>
              <td colspan="5" style="text-align:center; padding:24px; color:var(--color-text-secondary);">
                ${sessCount > 0 ? `Kỳ thu ghi nhận ${sessCount} buổi học tính phí (${this.formatCurrency(unitPrice)}/buổi).` : 'Khoản thu áp dụng mức trọn gói cố định theo kỳ.'}
              </td>
            </tr>
          `;
          if (sessSummary) {
            sessSummary.textContent = sessCount > 0
              ? `Tổng ${sessCount} buổi tính phí · Đơn giá: ${this.formatCurrency(unitPrice)}/buổi · Tổng tiền: ${this.formatCurrency(amtDue)}`
              : 'Khoản thu học phí trọn gói cố định';
          }
        } else {
          const attLabel = st => {
            if (st === 'present') return '<span class="badge badge-success">Có mặt</span>';
            if (st === 'late') return '<span class="badge badge-warning">Đi trễ</span>';
            if (st === 'absent') return '<span class="badge badge-danger">Vắng</span>';
            if (st === 'excused') return '<span class="badge badge-info">Có phép</span>';
            return '<span class="badge badge-neutral">Chưa điểm danh</span>';
          };
          const isPerSession = sessCount > 0;

          let countedCount = 0;
          sessions.forEach(s => {
            const st = s.attendance_status;
            let feeCell = '';
            if (isPerSession) {
              if (st === 'present' || st === 'late') {
                countedCount++;
                feeCell = `<strong style="color:var(--color-success);">${this.escapeHtml(this.formatCurrency(unitPrice))}</strong>`;
              } else if (st === 'absent') {
                feeCell = `<span style="color:var(--color-danger); text-decoration:line-through;">${this.escapeHtml(this.formatCurrency(unitPrice))}</span> <span class="badge badge-danger" style="font-size:11px;">Vắng (0 ₫)</span>`;
              } else if (st === 'excused') {
                feeCell = `<span style="color:var(--color-info); text-decoration:line-through;">${this.escapeHtml(this.formatCurrency(unitPrice))}</span> <span class="badge badge-info" style="font-size:11px;">Có phép (0 ₫)</span>`;
              } else {
                feeCell = `<span class="badge badge-neutral" style="font-size:11px;">Chưa học / Chưa tính</span>`;
              }
            } else {
              feeCell = '<span class="badge badge-neutral">Trọn gói tháng</span>';
            }

            const tr = document.createElement('tr');
            tr.innerHTML = `
              <td><strong>${this.escapeHtml(this.formatDateTime(s.starts_at))}</strong></td>
              <td>${this.escapeHtml(s.topic || 'Buổi học định kỳ')}</td>
              <td>${this.escapeHtml(s.room || '—')}</td>
              <td>${attLabel(st)}</td>
              <td style="text-align:right;">${feeCell}</td>
            `;
            sessTbody.appendChild(tr);
          });

          if (sessSummary) {
            sessSummary.textContent = isPerSession
              ? `Đã đi học ${countedCount}/${sessions.length} buổi tính phí · Đơn giá: ${this.formatCurrency(unitPrice)}/buổi · Tổng tiền: ${this.formatCurrency(amtDue)}`
              : `Học phí thu trọn gói theo tháng (tổng ${sessions.length} buổi trong kỳ) · Mức phí: ${this.formatCurrency(amtDue)}`;
          }
        }
      }

      this.setTuitionFeedback('');
    } catch (error) {
      this.setTuitionFeedback(`Không tải được chi tiết khoản thu: ${error.message}`, 'danger');
    }
  },

  async reloadChildInvoices() {
    const studentCode = this.tuitionPageState.selectedStudentCode;
    const invoices = await this.fetchChildInvoices(studentCode ? { student_code: studentCode } : {});
    this.tuitionPageState.invoices = Array.isArray(invoices) ? invoices : [];
    this.renderInvoiceSelector();
    await this.loadAndRenderSelectedInvoice();
  },

  async initParentTuitionPage() {
    if (!AuthService.requireAuth('parent')) return;
    this.syncParentHeaderProfile();

    const params = new URLSearchParams(window.location.search);
    const requestedInvoiceId = params.get('invoice_id');
    const requestedStudentCode = params.get('student_code');

    this.bindContactModalTriggers(() => {
      const inv = this.tuitionPageState.currentDetail?.invoice;
      const child = (this.tuitionPageState.children || []).find(
        c => c.student_code === this.tuitionPageState.selectedStudentCode
      );
      return {
        teacherName: inv?.teacher_name || child?.teacher_name,
        teacherPhone: inv?.teacher_phone || child?.teacher_phone,
        teacherEmail: inv?.teacher_email || child?.teacher_email,
        invoiceId: inv?.invoice_id,
        studentCode: inv?.student_code || child?.student_code
      };
    });

    document.getElementById('parentTuitionChildSelect')?.addEventListener('change', async e => {
      this.tuitionPageState.selectedStudentCode = e.target.value;
      this.tuitionPageState.selectedInvoiceId = '';
      this.renderChildSelector();
      await this.reloadChildInvoices();
    });

    document.getElementById('parentTuitionInvoiceSelect')?.addEventListener('change', async e => {
      this.tuitionPageState.selectedInvoiceId = e.target.value;
      await this.loadAndRenderSelectedInvoice();
    });

    try {
      const [summary, allInvoices] = await Promise.all([
        this.getTuitionSummary(),
        this.fetchChildInvoices()
      ]);

      this.tuitionPageState.children = Array.isArray(summary.children) ? summary.children : [];

      if (requestedInvoiceId && Array.isArray(allInvoices)) {
        const matched = allInvoices.find(i => i.invoice_id === requestedInvoiceId);
        if (matched) {
          this.tuitionPageState.selectedStudentCode = matched.student_code;
          this.tuitionPageState.selectedInvoiceId = matched.invoice_id;
        }
      } else if (requestedStudentCode) {
        this.tuitionPageState.selectedStudentCode = requestedStudentCode;
      }

      this.renderChildSelector();
      await this.reloadChildInvoices();
    } catch (error) {
      this.setTuitionFeedback(`Không tải được dữ liệu cổng học phí phụ huynh: ${error.message}`, 'danger');
      this.renderEmptyParentTuitionState(`Lỗi kết nối dữ liệu: ${error.message}`);
    }
  },

  // =========================================================================
  // 5. CONTROLLER TRANG THÔNG BÁO & BÁO PHÍ PHỤ HUYNH: pages/parent/notifications.html
  //    (Trang 28 PDF — Không sửa đổi assets/js/notifications.js)
  // =========================================================================
  notifPageState: {
    children: [],
    summary: null,
    invoicesById: new Map(),
    notificationsById: new Map(),
    selectedNotificationId: null
  },

  renderParentNotificationsDueBanner() {
    const banner = document.getElementById('parentTuitionDueBanner');
    const titleEl = document.getElementById('parentDueBannerTitle');
    const descEl = document.getElementById('parentDueBannerDesc');
    const linkEl = document.getElementById('parentDueBannerLink');
    const childMetaEl = document.getElementById('parentNotifChildMeta');
    const childAvatarEl = document.getElementById('parentNotifChildAvatar');

    const children = this.notifPageState.children || [];
    if (children.length > 0) {
      const first = children[0];
      if (childAvatarEl) childAvatarEl.textContent = first.avatar_text || this.getInitials(first.full_name);
      if (childMetaEl) {
        childMetaEl.textContent = children.length === 1
          ? `${first.full_name} (${first.student_code}${first.class_name ? ` · ${first.class_name}` : ''})`
          : `${first.full_name} và ${children.length - 1} con em khác`;
      }
    }

    if (!banner) return;
    const unpaidInvoices = Array.from(this.notifPageState.invoicesById.values())
      .filter(inv => Number(inv.amount_remaining || 0) > 0)
      .sort((a, b) => String(a.period_end || '').localeCompare(String(b.period_end || '')));

    if (unpaidInvoices.length === 0) {
      banner.hidden = true;
      return;
    }

    const urgent = unpaidInvoices[0];
    const rec = this.reconcileFee(urgent);
    const totalRemain = unpaidInvoices.reduce((acc, inv) => acc + Number(inv.amount_remaining || 0), 0);

    banner.hidden = false;
    if (titleEl) {
      titleEl.textContent = unpaidInvoices.length === 1
        ? `Nhắc hạn nộp học phí tháng ${String(urgent.billing_month).padStart(2, '0')}/${urgent.billing_year} · Còn thiếu ${this.formatCurrency(rec.amountRemaining)}`
        : `Nhắc hạn nộp học phí (${unpaidInvoices.length} khoản thu) · Tổng còn thiếu ${this.formatCurrency(totalRemain)}`;
    }
    if (descEl) {
      descEl.textContent = `Học sinh ${urgent.student_name} (${urgent.class_name}) · Hạn thanh toán: ${this.formatDate(urgent.period_end)} · Tiến độ đối soát: ${rec.progressFormatted} (${this.formatCurrency(rec.amountPaid)} / ${this.formatCurrency(rec.amountDue)})`;
    }
    if (linkEl) {
      linkEl.href = `tuition.html?invoice_id=${encodeURIComponent(urgent.invoice_id)}`;
    }
  },

  syncNotificationSelectionInList() {
    const list = document.querySelector('[data-notification-list]');
    if (!list) return;

    const items = Array.from(list.querySelectorAll('.notification-item[data-notification-id]'));
    const visibleItems = items.filter(el => !el.hidden);

    // Đồng bộ trạng thái đã đọc từ DOM của notifications.js vào bộ nhớ đệm
    items.forEach(item => {
      const id = item.dataset.notificationId;
      const entry = this.notifPageState.notificationsById.get(id);
      if (entry && item.dataset.read === 'true' && !entry.read_at) {
        entry.read_at = new Date().toISOString();
      }
    });

    if (visibleItems.length === 0) {
      this.renderNotificationDetailPanel(null, null);
      return;
    }

    const currentVisible = visibleItems.find(
      el => el.dataset.notificationId === String(this.notifPageState.selectedNotificationId)
    );
    if (!currentVisible) {
      // Ưu tiên chọn thông báo Học phí chưa đọc đầu tiên (đúng luồng Trang 28 PDF)
      const unreadTuition = visibleItems.find(
        el => el.dataset.category === 'tuition' && el.dataset.read === 'false'
      );
      const anyTuition = visibleItems.find(el => el.dataset.category === 'tuition');
      const chosen = unreadTuition || anyTuition || visibleItems[0];
      this.notifPageState.selectedNotificationId = chosen.dataset.notificationId;
    }

    items.forEach(item => {
      const isSelected = !item.hidden && item.dataset.notificationId === String(this.notifPageState.selectedNotificationId);
      item.classList.toggle('is-selected', isSelected);
      const meta = item.querySelector('.notification-meta');
      if (meta) {
        let tag = meta.querySelector('.notification-viewing-tag');
        if (isSelected) {
          if (!tag) {
            tag = document.createElement('span');
            tag.className = 'notification-viewing-tag';
            tag.textContent = ' · Đang xem';
            meta.appendChild(tag);
          }
        } else if (tag) {
          tag.remove();
        }
      }
    });

    const selectedDomItem = visibleItems.find(
      el => el.dataset.notificationId === String(this.notifPageState.selectedNotificationId)
    );
    const notifData = this.notifPageState.notificationsById.get(
      String(this.notifPageState.selectedNotificationId)
    );
    this.renderNotificationDetailPanel(notifData || null, selectedDomItem || null);
  },

  renderNotificationDetailPanel(notification, domItem) {
    const panel = document.getElementById('parentNotificationDetailPanel');
    if (!panel) return;

    if (!notification && !domItem) {
      panel.innerHTML = `
        <div style="text-align:center; padding:36px 16px; color:var(--color-text-secondary);">
          <div style="font-size:28px; margin-bottom:10px;">🔔</div>
          <h3 style="font-size:15px; font-weight:700; color:var(--color-text-main); margin-bottom:6px;">Chi tiết thông báo</h3>
          <p style="font-size:13px;">Chọn một thông báo ở danh sách bên trái để xem nội dung chi tiết và bảng đối soát học phí.</p>
        </div>
      `;
      return;
    }

    const category = notification?.category || domItem?.dataset?.category || 'system';
    const title = notification?.title || domItem?.querySelector('.notification-title')?.textContent || 'Thông báo';
    const body = notification?.body || domItem?.querySelector('.notification-description')?.textContent || '';
    const isRead = domItem ? domItem.dataset.read === 'true' : Boolean(notification?.read_at);
    const createdText = notification?.created_at
      ? this.formatDateTime(notification.created_at)
      : (domItem?.querySelector('.notification-time')?.textContent || '');

    const categoryMeta = {
      tuition: { label: 'Báo phí & Nhắc hạn', badge: 'badge-warning' },
      academic: { label: 'Kết quả học tập', badge: 'badge-info' },
      assignment: { label: 'Bài tập', badge: 'badge-info' },
      system: { label: 'Hệ thống', badge: 'badge-neutral' }
    }[category] || { label: 'Thông báo', badge: 'badge-neutral' };

    // Tìm hóa đơn liên kết (theo invoice_id hoặc hóa đơn kỳ gần nhất nếu là thông báo học phí)
    let linkedInvoice = null;
    if (notification?.invoice_id && this.notifPageState.invoicesById.has(notification.invoice_id)) {
      linkedInvoice = this.notifPageState.invoicesById.get(notification.invoice_id);
    } else if (category === 'tuition' && this.notifPageState.invoicesById.size > 0) {
      const allInvs = Array.from(this.notifPageState.invoicesById.values());
      linkedInvoice = allInvs.find(i => Number(i.amount_remaining || 0) > 0) || allInvs[0];
    }

    const firstChild = (this.notifPageState.children || [])[0];
    const studentDisplay = linkedInvoice
      ? `${linkedInvoice.student_name} (${linkedInvoice.student_code}) · Lớp ${linkedInvoice.class_name}`
      : firstChild
        ? `${firstChild.full_name} (${firstChild.student_code})${firstChild.class_name ? ` · Lớp ${firstChild.class_name}` : ''}`
        : 'Phụ huynh học sinh Lớp Mình';

    let tuitionBoxHtml = '';
    if (category === 'tuition' && linkedInvoice) {
      const rec = this.reconcileFee(linkedInvoice);
      tuitionBoxHtml = `
        <div class="parent-notif-tuition-box">
          <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:8px;">
            <strong style="font-size:13px; color:var(--color-text-main);">
              Tóm tắt khoản thu · Tháng ${String(linkedInvoice.billing_month).padStart(2, '0')}/${linkedInvoice.billing_year}
            </strong>
            <span class="badge ${rec.badgeClass}">${this.escapeHtml(rec.statusLabel)}</span>
          </div>
          <div class="parent-notif-tuition-row">
            <span>Mã phiếu thu:</span>
            <strong>${this.escapeHtml(linkedInvoice.invoice_id)}</strong>
          </div>
          <div class="parent-notif-tuition-row">
            <span>Học phí trong kỳ:</span>
            <strong>${this.escapeHtml(this.formatCurrency(rec.amountDue))}</strong>
          </div>
          <div class="parent-notif-tuition-row">
            <span>Đã đóng ngoài hệ thống:</span>
            <strong style="color:var(--color-success);">${this.escapeHtml(this.formatCurrency(rec.amountPaid))} (${this.escapeHtml(rec.progressFormatted)})</strong>
          </div>
          <div class="parent-notif-tuition-row is-remaining">
            <span>Số tiền còn thiếu:</span>
            <strong style="color:${rec.amountRemaining > 0 ? 'var(--color-danger)' : 'var(--color-success)'};">${this.escapeHtml(this.formatCurrency(rec.amountRemaining))}</strong>
          </div>
          <div class="parent-notif-tuition-row">
            <span>Hạn thanh toán:</span>
            <strong>${this.escapeHtml(this.formatDate(linkedInvoice.period_end))}</strong>
          </div>
        </div>
        <div class="alert alert-info" style="font-size:12px; margin-bottom:0;">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg>
          <div>
            Thanh toán được thực hiện ngoài hệ thống trực tiếp với giáo viên/trung tâm. Số dư cập nhật ngay sau khi giáo viên xác nhận.
          </div>
        </div>
      `;
    }

    const detailHref = linkedInvoice
      ? `tuition.html?invoice_id=${encodeURIComponent(linkedInvoice.invoice_id)}`
      : 'tuition.html';

    panel.innerHTML = `
      <div style="display:flex; justify-content:space-between; align-items:center; gap:8px; flex-wrap:wrap; margin-bottom:10px;">
        <div style="display:flex; align-items:center; gap:8px;">
          <span class="badge ${categoryMeta.badge}">${this.escapeHtml(categoryMeta.label)}</span>
          <span class="badge ${isRead ? 'badge-neutral' : 'badge-info'}">${isRead ? 'Đã đọc' : 'Chưa đọc'}</span>
        </div>
        <span class="text-caption">${this.escapeHtml(createdText)}</span>
      </div>

      <h3 style="font-size:17px; font-weight:700; color:var(--color-text-main); line-height:1.4;">
        ${this.escapeHtml(title)}
      </h3>

      <div class="parent-notif-detail-recipient">
        <strong>Người nhận:</strong> Phụ huynh em ${this.escapeHtml(studentDisplay)}
      </div>

      <p style="font-size:13.5px; line-height:1.65; color:#334155; white-space:pre-line;">
        ${this.escapeHtml(body)}
      </p>

      ${tuitionBoxHtml}

      <div class="parent-notif-actions">
        ${category === 'tuition' ? `<a href="${detailHref}" class="btn btn-primary btn-sm">Xem chi tiết học phí →</a>` : ''}
        ${!isRead ? `<button type="button" class="btn btn-secondary btn-sm" id="btnDetailPanelMarkRead">✓ Đánh dấu đã đọc</button>` : ''}
        <button type="button" class="btn btn-secondary btn-sm" id="btnDetailPanelContact">📞 Liên hệ trung tâm</button>
      </div>
    `;

    panel.querySelector('#btnDetailPanelMarkRead')?.addEventListener('click', () => {
      const markBtn = domItem?.querySelector('button[data-mark-read]');
      if (markBtn) markBtn.click();
    });

    panel.querySelector('#btnDetailPanelContact')?.addEventListener('click', () => {
      const child = (this.notifPageState.children || [])[0];
      this.openContactModal({
        teacherName: child?.teacher_name,
        teacherPhone: child?.teacher_phone,
        teacherEmail: child?.teacher_email,
        invoiceId: linkedInvoice?.invoice_id,
        studentCode: linkedInvoice?.student_code || child?.student_code
      });
    });
  },

  async initParentNotificationsTuition() {
    if (!AuthService.getToken()) return;
    this.syncParentHeaderProfile();

    this.bindContactModalTriggers(() => {
      const child = (this.notifPageState.children || [])[0];
      return {
        teacherName: child?.teacher_name,
        teacherPhone: child?.teacher_phone,
        teacherEmail: child?.teacher_email,
        studentCode: child?.student_code
      };
    });

    // Nút lọc nhanh "Báo phí & Nhắc hạn" trên trang Thông báo Phụ huynh
    const quickTuitionBtn = document.getElementById('btnQuickFilterTuitionNotif');
    const categorySelect = document.querySelector('[data-notification-category]');
    if (quickTuitionBtn && categorySelect) {
      const syncQuickBtn = () => {
        const isTuition = categorySelect.value === 'tuition';
        quickTuitionBtn.classList.toggle('btn-primary', isTuition);
        quickTuitionBtn.classList.toggle('btn-secondary', !isTuition);
      };
      quickTuitionBtn.addEventListener('click', () => {
        categorySelect.value = categorySelect.value === 'tuition' ? 'all' : 'tuition';
        categorySelect.dispatchEvent(new Event('change'));
        syncQuickBtn();
      });
      categorySelect.addEventListener('change', syncQuickBtn);
    }

    const list = document.querySelector('[data-notification-list]');
    if (list) {
      list.addEventListener('click', event => {
        if (event.target.closest('button[data-mark-read]')) return;
        const item = event.target.closest('.notification-item[data-notification-id]');
        if (!item) return;
        this.notifPageState.selectedNotificationId = item.dataset.notificationId;
        this.syncNotificationSelectionInList();
      });

      const observer = new MutationObserver(() => {
        this.syncNotificationSelectionInList();
      });
      observer.observe(list, { childList: true });
    }

    try {
      const [summary, invoices, notifications] = await Promise.all([
        this.getTuitionSummary(),
        this.fetchChildInvoices(),
        AuthService.api('/notifications')
      ]);

      this.notifPageState.summary = summary;
      this.notifPageState.children = Array.isArray(summary.children) ? summary.children : [];

      this.notifPageState.invoicesById.clear();
      (Array.isArray(invoices) ? invoices : []).forEach(inv => {
        this.notifPageState.invoicesById.set(String(inv.invoice_id), inv);
      });

      this.notifPageState.notificationsById.clear();
      (Array.isArray(notifications) ? notifications : []).forEach(n => {
        this.notifPageState.notificationsById.set(String(n.notification_id), n);
      });

      this.renderParentNotificationsDueBanner();
      this.syncNotificationSelectionInList();
    } catch (error) {
      const banner = document.getElementById('parentTuitionDueBanner');
      if (banner) banner.hidden = true;
      this.syncNotificationSelectionInList();
    }
  },

  // =========================================================================
  // 6. CONTROLLER THẺ HỌC PHÍ TRÊN DASHBOARD PHỤ HUYNH: pages/parent/dashboard.html
  // =========================================================================
  async initParentDashboard(studentCode = '') {
    const requestId = (this.dashboardRequestId || 0) + 1;
    this.dashboardRequestId = requestId;
    const statRemainEl = document.getElementById('parentDashTuitionRemaining');
    const statDueDescEl = document.getElementById('parentDashTuitionDueDesc');
    const cardTitleEl = document.getElementById('parentDashTuitionCardTitle');
    const cardLinkEl = document.getElementById('parentDashTuitionDetailLink');
    const cardTotalEl = document.getElementById('parentDashTuitionTotal');
    const cardPaidEl = document.getElementById('parentDashTuitionPaid');
    const cardRemainEl = document.getElementById('parentDashTuitionRemain');
    const cardAlertEl = document.getElementById('parentDashTuitionAlert');

    if (!statRemainEl && !cardTotalEl) return;
    if (!AuthService.getToken()) return;

    try {
      const filter = studentCode ? { student_code: studentCode } : {};
      const invoices = await this.fetchChildInvoices(filter);
      if (requestId !== this.dashboardRequestId) return;
      const list = Array.isArray(invoices) ? invoices : [];

      if (list.length === 0) {
        if (statRemainEl) {
          statRemainEl.textContent = '0 ₫';
          statRemainEl.style.color = 'var(--color-success)';
        }
        if (statDueDescEl) statDueDescEl.textContent = 'Chưa có khoản thu đang mở';
        if (cardTitleEl) cardTitleEl.textContent = 'Học phí hiện tại';
        if (cardTotalEl) cardTotalEl.textContent = '0 ₫';
        if (cardPaidEl) cardPaidEl.textContent = '0 ₫';
        if (cardRemainEl) {
          cardRemainEl.textContent = '0 ₫';
          cardRemainEl.parentElement.style.color = 'var(--color-success)';
        }
        if (cardAlertEl) {
          cardAlertEl.className = 'alert alert-info';
          cardAlertEl.textContent = 'Hiện chưa phát sinh khoản thu học phí mới cho con em.';
        }
        return;
      }

      // Ưu tiên khoản thu còn thiếu hạn gần nhất, nếu đã đóng hết thì lấy kỳ mới nhất
      const unpaid = list
        .filter(inv => Number(inv.amount_remaining || 0) > 0)
        .sort((a, b) => String(a.period_end || '').localeCompare(String(b.period_end || '')));
      const primary = unpaid[0] || list[0];
      const rec = this.reconcileFee(primary);

      const totalRemainAll = unpaid.reduce((sum, inv) => sum + Number(inv.amount_remaining || 0), 0);

      if (statRemainEl) {
        statRemainEl.textContent = this.formatCurrency(totalRemainAll);
        statRemainEl.style.color = totalRemainAll > 0 ? 'var(--color-danger)' : 'var(--color-success)';
      }
      if (statDueDescEl) {
        statDueDescEl.textContent = totalRemainAll > 0
          ? `Hạn đóng: ${this.formatDate(primary.period_end)}`
          : `Đã đóng đủ · Tháng ${String(primary.billing_month).padStart(2, '0')}/${primary.billing_year}`;
      }

      if (cardTitleEl) {
        cardTitleEl.textContent = `Học phí tháng ${primary.billing_month}/${primary.billing_year}`;
      }
      if (cardLinkEl) {
        cardLinkEl.href = `tuition.html?invoice_id=${encodeURIComponent(primary.invoice_id)}`;
      }
      if (cardTotalEl) {
        cardTotalEl.textContent = this.formatCurrency(rec.amountDue);
      }
      if (cardPaidEl) {
        cardPaidEl.textContent = `${this.formatCurrency(rec.amountPaid)} (${rec.progressFormatted})`;
      }
      if (cardRemainEl) {
        cardRemainEl.textContent = this.formatCurrency(rec.amountRemaining);
        if (cardRemainEl.parentElement) {
          cardRemainEl.parentElement.style.color = rec.amountRemaining > 0
            ? 'var(--color-danger)'
            : 'var(--color-success)';
        }
      }
      if (cardAlertEl) {
        if (rec.amountRemaining > 0) {
          cardAlertEl.className = 'alert alert-warning';
          cardAlertEl.textContent = `Hạn đóng ${this.formatDate(primary.period_end)}. Vui lòng thanh toán trực tiếp với trung tâm.`;
        } else {
          cardAlertEl.className = 'alert alert-success';
          cardAlertEl.textContent = `Đã hoàn tất đối soát học phí tháng ${primary.billing_month}/${primary.billing_year}.`;
        }
      }
    } catch (error) {
      if (requestId !== this.dashboardRequestId) return;
      if (statRemainEl) statRemainEl.textContent = '—';
      if (statDueDescEl) statDueDescEl.textContent = `Không tải được học phí`;
      if (cardTotalEl) cardTotalEl.textContent = '—';
      if (cardPaidEl) cardPaidEl.textContent = '—';
      if (cardRemainEl) cardRemainEl.textContent = '—';
      if (cardAlertEl) {
        cardAlertEl.className = 'alert alert-danger';
        cardAlertEl.textContent = `Không tải được dữ liệu học phí: ${error.message}`;
      }
    }
  }
};

window.ParentTuitionInvoiceModule = ParentTuitionInvoiceModule;

document.addEventListener('DOMContentLoaded', () => {
  if (document.getElementById('parentTuitionPageRoot')) {
    ParentTuitionInvoiceModule.initParentTuitionPage();
  } else if (document.getElementById('parentNotificationsPageRoot')) {
    ParentTuitionInvoiceModule.initParentNotificationsTuition();
  } else if (document.getElementById('parentDashTuitionRemaining') || document.getElementById('parentDashTuitionTotal')) {
    const childSelect = document.getElementById('parentAttendanceChild');
    if (childSelect) {
      window.addEventListener('dashboard:child-selected', event => {
        ParentTuitionInvoiceModule.initParentDashboard(event.detail?.studentCode || '');
      });
      childSelect.addEventListener('change', event => {
        ParentTuitionInvoiceModule.initParentDashboard(event.target.value || '');
      });
      ParentTuitionInvoiceModule.initParentDashboard(childSelect.value || '');
    } else {
      ParentTuitionInvoiceModule.initParentDashboard();
    }
  }
});
