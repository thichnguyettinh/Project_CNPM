const ParentTuitionInvoiceModule = {
  getChildInvoices() {
    return AuthService.api('/tuition/invoices');
  },
  getPaymentInstructions() {
    return {
      bankName: 'Liên hệ giáo viên phụ trách để nhận thông tin thanh toán.',
      accountNumber: null,
      accountHolder: null,
      syntax: 'Ghi mã hóa đơn và mã học sinh trong nội dung chuyển khoản.'
    };
  }
};

window.ParentTuitionInvoiceModule = ParentTuitionInvoiceModule;
