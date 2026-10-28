document.addEventListener('DOMContentLoaded', () => {
  const list = document.querySelector('[data-notification-list]');
  if (!list) return;

  const tabs = Array.from(document.querySelectorAll('[data-notification-filter]'));
  const categoryFilter = document.querySelector('[data-notification-category]');
  const markAllButton = document.querySelector('[data-mark-all-read]');
  const emptyState = document.querySelector('[data-notification-empty]');
  const countSummary = document.querySelector('[data-notification-summary]');
  const isParentLayout = list.dataset.notificationVariant === 'parent';
  const detailPanel = isParentLayout
    ? document.querySelector('.parent-notification-layout > .card')
    : null;
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
  let notifications = [];
  let activeFilter = 'all';
  let selectedNotificationId = null;
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

  function createNotificationItem(notification) {
    const category = categoryLabels[notification.category] || 'Thông báo';
    const unread = isUnread(notification);
    const item = document.createElement(isParentLayout ? 'div' : 'article');
    item.className = `notification-item${unread ? ' is-unread' : ''}`;
    item.dataset.category = notification.category;
    item.dataset.read = String(!unread);
    item.dataset.notificationId = String(notification.notification_id);

    if (isParentLayout) {
      const meta = document.createElement('div');
      meta.className = 'parent-notification-meta';
      meta.append(
        createTextElement('span', 'parent-notification-category', category.toUpperCase()),
        createTextElement(
          'span',
          `badge ${unread ? 'badge-warning' : 'badge-success'}`,
          unread ? 'Chưa đọc' : 'Đã đọc'
        )
      );
      item.append(
        meta,
        createTextElement('h4', 'parent-notification-title', notification.title),
        createTextElement('p', 'text-caption', notification.body),
        createTextElement('time', 'notification-time', formatDate(notification.created_at))
      );

      const actions = document.createElement('div');
      actions.className = 'parent-notification-actions';
      const selectButton = createTextElement('button', 'notification-select', 'Xem chi tiết');
      selectButton.type = 'button';
      selectButton.dataset.selectNotification = '';
      selectButton.setAttribute('aria-pressed', String(
        String(notification.notification_id) === String(selectedNotificationId)
      ));
      actions.append(selectButton);
      if (unread) {
        const readButton = createTextElement(
          'button',
          'notification-mark-read',
          'Đánh dấu đã đọc'
        );
        readButton.type = 'button';
        readButton.dataset.markRead = '';
        actions.append(readButton);
      }
      item.append(actions);
      return item;
    }

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
      createTextElement('p', 'notification-description', notification.body),
      createTextElement('time', 'notification-time', formatDate(notification.created_at))
    );

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
    item.append(copy, state);
    return item;
  }

  function renderParentDetail() {
    if (!detailPanel) return;
    const selected = notifications.find(
      item => String(item.notification_id) === String(selectedNotificationId)
    );
    detailPanel.replaceChildren();
    if (!selected) {
      detailPanel.append(createTextElement(
        'p',
        'text-caption',
        loading ? 'Đang tải thông báo...' : 'Chọn một thông báo để xem chi tiết.'
      ));
      return;
    }

    const meta = document.createElement('div');
    meta.className = 'notification-detail-meta';
    meta.append(
      createTextElement(
        'span',
        'text-caption',
        `${categoryLabels[selected.category] || 'Thông báo'} · ${isUnread(selected) ? 'Chưa đọc' : 'Đã đọc'}`
      ),
      createTextElement('time', 'text-caption', formatDate(selected.created_at))
    );
    detailPanel.append(
      meta,
      createTextElement('h3', 'notification-detail-title', selected.title),
      createTextElement('p', 'notification-detail-body', selected.body)
    );
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
      const item = createNotificationItem(notification);
      item.hidden = !visible;
      list.append(item);
      if (visible) visibleCount += 1;
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
    renderParentDetail();
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
      if (notifications.length) {
        selectedNotificationId = String(notifications[0].notification_id);
      }
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

    if (button.hasAttribute('data-select-notification')) {
      selectedNotificationId = String(notification.notification_id);
      update();
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

  document.querySelectorAll('[data-dismiss-note]').forEach(button => {
    button.addEventListener('click', () => button.closest('.notification-system-note').remove());
  });

  list.replaceChildren();
  if (detailPanel) detailPanel.replaceChildren();
  update();
  loadNotifications();
});
