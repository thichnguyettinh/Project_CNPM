document.addEventListener('DOMContentLoaded', () => {
  const list = document.querySelector('[data-notification-list]');
  if (!list) return;

  const tabs = Array.from(document.querySelectorAll('[data-notification-filter]'));
  const categoryFilter = document.querySelector('[data-notification-category]');
  const markAllButton = document.querySelector('[data-mark-all-read]');
  const emptyState = document.querySelector('[data-notification-empty]');
  const countSummary = document.querySelector('[data-notification-summary]');
  const errorElement = document.createElement('p');
  errorElement.className = 'notification-error';
  errorElement.setAttribute('role', 'alert');
  errorElement.hidden = true;
  list.insertAdjacentElement('afterend', errorElement);

  const categoryLabels = {
    academic: 'Kết quả học tập',
    assignment: 'Bài tập',
    tuition: 'Học phí',
    system: 'Hệ thống'
  };

  const categoryIcons = {
    academic: '<svg viewBox="0 0 24 24"><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/></svg>',
    assignment: '<svg viewBox="0 0 24 24"><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"/><rect x="8" y="2" width="8" height="4" rx="1" ry="1"/></svg>',
    tuition: '<svg viewBox="0 0 24 24"><rect x="2" y="4" width="20" height="16" rx="2"/><path d="M2 10h20"/><circle cx="12" cy="15" r="2"/></svg>',
    system: '<svg viewBox="0 0 24 24"><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/></svg>'
  };

  let notifications = [];
  // API trả về đơn thực tế. Không cố định lý do hay mã học sinh trong giao diện.
  let teacherAbsenceRequests = null;
  let activeFilter = 'all';
  let loading = true;

  function setError(message = '') {
    errorElement.textContent = message;
    errorElement.hidden = !message;
  }

  function formatDate(value) {
    const date = new Date(value);
    return Number.isNaN(date.getTime())
      ? String(value || '')
      : date.toLocaleString('vi-VN', { dateStyle: 'short', timeStyle: 'short' });
  }

  function isUnread(notification) {
    return !notification.read_at;
  }

  function createTextElement(tagName, className, text) {
    const element = document.createElement(tagName);
    element.className = className;
    element.textContent = text;
    return element;
  }

  // UC-06: Xác định buổi học tương ứng qua dữ liệu API, không cố định mã học sinh/buổi học.
  // Thông báo cũ chưa lưu mã buổi học, nên đối chiếu mã học sinh và thời điểm tạo đơn.
  function findAbsenceRequestForNotification(notification, requests) {
    const found = String(notification.body || '').match(/Học sinh\s+([A-Za-z0-9_-]+)\s+xin vắng/);
    const notifiedAt = Date.parse(notification.created_at);
    if (!found || !Number.isFinite(notifiedAt) || !Array.isArray(requests)) return null;

    const candidates = requests
      .filter(request => request.student_code === found[1] &&
        request.class_id != null && request.session_id != null)
      .map(request => ({
        request,
        distance: Math.abs(Date.parse(request.created_at) - notifiedAt)
      }))
      .filter(item => Number.isFinite(item.distance) && item.distance <= 5 * 60 * 1000)
      .sort((a, b) => a.distance - b.distance);

    // Tránh mở nhầm buổi học khi có nhiều đơn cùng thời điểm.
    if (candidates.length > 1 && candidates[0].distance === candidates[1].distance) return null;
    return candidates[0]?.request || null;
  }

  function createNotificationItem(notification) {
    const category = categoryLabels[notification.category] || 'Thông báo';
    const unread = isUnread(notification);
    const item = document.createElement('article');
    item.className = `notification-item${unread ? ' is-unread' : ''}`;
    item.dataset.category = notification.category;
    item.dataset.read = String(!unread);
    item.dataset.notificationId = String(notification.notification_id);

    const icon = document.createElement('div');
    icon.className = 'notification-icon';
    icon.dataset.category = notification.category || 'system';
    icon.innerHTML = categoryIcons[notification.category] || categoryIcons.system;

    const copy = document.createElement('div');
    copy.className = 'notification-copy';
    const status = createTextElement(
      'span',
      'notification-status',
      unread ? 'Chưa đọc' : 'Đã đọc'
    );
    const meta = createTextElement('div', 'notification-meta', `${category} · `);
    meta.append(status);
    copy.append(
      meta,
      createTextElement('h2', 'notification-title', notification.title),
      createTextElement('p', 'notification-description', notification.body)
    );

    // Giáo viên thấy rõ lý do ngay trong thông báo, nếu xác định được chính xác
    // đơn tương ứng từ API. Không đoán lý do nếu thông báo quá cũ hoặc mơ hồ.
    if (location.pathname.includes('/teacher/') &&
        notification.title === 'Có yêu cầu xin vắng mới' &&
        Array.isArray(teacherAbsenceRequests)) {
      const match = findAbsenceRequestForNotification(notification, teacherAbsenceRequests);
      if (match && match.reason) {
        const detail = createTextElement(
          'p', 'notification-absence-detail', `Lý do xin vắng: ${match.reason}`
        );
        copy.append(detail);
      }
    }
    copy.append(createTextElement('time', 'notification-time', formatDate(notification.created_at)));

    const state = document.createElement('div');
    state.className = 'notification-state';
    if (unread) {
      state.append(
        createTextElement('span', 'notification-new', 'Mới')
      );
      const readButton = createTextElement(
        'button',
        'notification-mark-read',
        'Đánh dấu đã đọc'
      );
      readButton.type = 'button';
      readButton.dataset.markRead = '';
      state.append(readButton);
    }
    // Chỉ hiển thị cho thông báo xin vắng thuộc không gian Giáo viên.
    if (location.pathname.includes('/teacher/') &&
        notification.title === 'Có yêu cầu xin vắng mới') {
      const viewButton = createTextElement('button', 'notification-view-absence', 'Xem lý do');
      viewButton.type = 'button';
      viewButton.dataset.viewAbsence = '';
      state.append(viewButton);
    }
    item.append(icon, copy, state);
    return item;
  }

  function update() {
    const category = categoryFilter ? categoryFilter.value : 'all';
    let visibleCount = 0;
    let unreadCount = 0;
    let readCount = 0;

    list.replaceChildren();
    notifications.forEach(notification => {
      const unread = isUnread(notification);
      if (unread) unreadCount += 1;
      else readCount += 1;

      const matchesFilter = activeFilter === 'all'
        || (activeFilter === 'unread' && unread)
        || (activeFilter === 'read' && !unread);
      const matchesCategory = category === 'all' || notification.category === category;
      const visible = matchesFilter && matchesCategory;
      if (visible) {
        const item = createNotificationItem(notification);
        list.append(item);
        visibleCount += 1;
      }
    });

    if (emptyState) {
      emptyState.textContent = loading
        ? 'Đang tải thông báo...'
        : 'Không có thông báo phù hợp với bộ lọc.';
      emptyState.style.display = visibleCount === 0 ? 'block' : 'none';
      list.append(emptyState);
    }

    tabs.forEach(tab => {
      const filter = tab.dataset.notificationFilter;
      const count = filter === 'all' ? notifications.length
        : filter === 'unread' ? unreadCount : readCount;
      const label = tab.dataset.label || tab.textContent.replace(/\s\(\d+\)$/, '');
      tab.dataset.label = label;
      tab.textContent = `${label} (${count})`;
      tab.classList.toggle('active', filter === activeFilter);
      tab.setAttribute('aria-selected', String(filter === activeFilter));
    });

    if (countSummary) {
      const shown = visibleCount === notifications.length
        ? `Hiển thị ${notifications.length} thông báo`
        : `Hiển thị ${visibleCount}/${notifications.length} thông báo`;
      countSummary.textContent = `${shown} · ${unreadCount} chưa đọc`;
    }

    if (markAllButton) markAllButton.disabled = unreadCount === 0 || loading;
  }

  async function loadNotifications() {
    loading = true;
    update();
    try {
      const result = await AuthService.api('/notifications');
      if (!Array.isArray(result)) {
        throw new Error('Dữ liệu thông báo từ máy chủ không hợp lệ.');
      }
      notifications = result;
      setError();
    } catch (error) {
      notifications = [];
      setError(error.message);
    } finally {
      loading = false;
      update();
    }
  }

  tabs.forEach(tab => {
    tab.dataset.label = tab.dataset.label || tab.textContent.replace(/\s\(\d+\)$/, '');
    tab.addEventListener('click', () => {
      activeFilter = tab.dataset.notificationFilter;
      update();
    });
  });

  if (categoryFilter) categoryFilter.addEventListener('change', update);

  list.addEventListener('click', async event => {
    const button = event.target.closest('button');
    if (!button) return;
    const item = button.closest('[data-notification-id]');
    if (!item) return;
    const notification = notifications.find(
      entry => String(entry.notification_id) === item.dataset.notificationId
    );
    if (!notification) return;

    if (button.hasAttribute('data-view-absence')) {
      button.disabled = true;
      try {
        const requests = await AuthService.api('/absence-requests');
        if (!Array.isArray(requests)) throw new Error('Dữ liệu đơn xin vắng không hợp lệ.');
        const match = findAbsenceRequestForNotification(notification, requests);
        if (!match) {
          setError('Chưa xác định được buổi học từ thông báo này. Hãy mở Điểm danh và chọn buổi học để xem đơn.');
          button.disabled = false;
          return;
        }
        const params = new URLSearchParams({
          class_id: String(match.class_id),
          session_id: String(match.session_id)
        });
        location.assign(`attendance.html?${params}#teacher-absence-requests`);
      } catch (error) {
        setError(`Không tải được chi tiết đơn xin vắng: ${error.message}`);
        button.disabled = false;
      }
      return;
    }

    if (!button.hasAttribute('data-mark-read')) return;
    button.disabled = true;
    try {
      const result = await AuthService.api(
        `/notifications/${encodeURIComponent(notification.notification_id)}/read`,
        { method: 'POST' }
      );
      notification.read_at = result.read_at;
      setError();
      AuthService.updateNotificationIndicators();
      update();
    } catch (error) {
      setError(error.message);
      button.disabled = false;
    }
  });

  if (markAllButton) {
    markAllButton.addEventListener('click', async () => {
      markAllButton.disabled = true;
      try {
        await AuthService.api('/notifications/read-all', { method: 'POST' });
        const readAt = new Date().toISOString();
        notifications.forEach(notification => {
          if (isUnread(notification)) notification.read_at = readAt;
        });
        setError();
        AuthService.updateNotificationIndicators();
        update();
      } catch (error) {
        setError(error.message);
        markAllButton.disabled = false;
      }
    });
  }

  // UC-06: Lấy lý do qua API để hiển thị ngay trong từng thông báo,
  // không cần thêm bảng tổng hợp riêng ở phía trên trang.
  async function loadTeacherAbsenceDetails() {
    if (!location.pathname.includes('/teacher/')) return;
    try {
      const requests = await AuthService.api('/absence-requests');
      if (!Array.isArray(requests)) throw new Error('API không trả về danh sách đơn hợp lệ.');
      teacherAbsenceRequests = requests;
      update();
    } catch (error) {
      teacherAbsenceRequests = null;
      // Thông báo gốc vẫn hiển thị bình thường nếu API đơn xin vắng gặp lỗi.
      console.warn('Không tải được lý do xin vắng:', error);
    }
  }
  void loadTeacherAbsenceDetails();

  const systemNote = document.querySelector('[data-system-note]');
  const dismissedNoteKey = 'lopminh_notification_system_note_dismissed';
  try {
    if (systemNote && sessionStorage.getItem(dismissedNoteKey) === 'true') {
      systemNote.hidden = true;
    }
  } catch (error) {
    console.warn('Không thể đọc trạng thái ẩn ghi chú thông báo:', error);
  }
  document.querySelectorAll('[data-dismiss-note]').forEach(button => {
    button.addEventListener('click', () => {
      const note = button.closest('.notification-system-note');
      if (!note) return;
      note.hidden = true;
      try {
        sessionStorage.setItem(dismissedNoteKey, 'true');
      } catch (error) {
        console.warn('Không thể lưu trạng thái ẩn ghi chú thông báo:', error);
      }
    });
  });

  list.replaceChildren();
  update();
  loadNotifications();
});
