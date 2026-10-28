const TuitionFeeModule = {
  getTuitionInvoices(filter = {}) {
    const query = new URLSearchParams(filter).toString();
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
  }
};

window.TuitionFeeModule = TuitionFeeModule;
