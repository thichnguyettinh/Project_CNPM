document.addEventListener('DOMContentLoaded', () => {
  const list = document.querySelector('[data-notification-list]');
  if (!list) return;

  const items = Array.from(list.querySelectorAll('.notification-item'));
  const tabs = Array.from(document.querySelectorAll('[data-notification-filter]'));
  const categoryFilter = document.querySelector('[data-notification-category]');
  const markAllButton = document.querySelector('[data-mark-all-read]');
  const emptyState = document.querySelector('[data-notification-empty]');
  const countSummary = document.querySelector('[data-notification-summary]');
  let activeFilter = 'all';

  function update() {
    const category = categoryFilter ? categoryFilter.value : 'all';
    let visibleCount = 0;
    let unreadCount = 0;
    let readCount = 0;

    items.forEach(item => {
      const unread = item.dataset.read !== 'true';
      if (unread) unreadCount += 1;
      else readCount += 1;

      const matchesFilter = activeFilter === 'all'
        || (activeFilter === 'unread' && unread)
        || (activeFilter === 'read' && !unread);
      const matchesCategory = category === 'all' || item.dataset.category === category;
      const visible = matchesFilter && matchesCategory;
      item.hidden = !visible;
      if (visible) visibleCount += 1;

      item.classList.toggle('is-unread', unread);
      const status = item.querySelector('[data-notification-status]');
      if (status) {
        status.textContent = unread
          ? (item.dataset.unreadLabel || 'Mới')
          : (item.dataset.readLabel || 'Đã đọc');
        status.classList.toggle('badge-warning', unread);
        status.classList.toggle('badge-success', !unread);
      }
    });

    tabs.forEach(tab => {
      const filter = tab.dataset.notificationFilter;
      const count = filter === 'all' ? items.length : filter === 'unread' ? unreadCount : readCount;
      const label = tab.dataset.label || tab.textContent.replace(/\s\(\d+\)$/, '');
      tab.textContent = `${label} (${count})`;
      tab.classList.toggle('active', filter === activeFilter);
      tab.setAttribute('aria-selected', String(filter === activeFilter));
    });

    if (emptyState) emptyState.style.display = visibleCount === 0 ? 'block' : 'none';
    if (countSummary) {
      const shown = visibleCount === items.length
        ? `Hiển thị ${items.length} thông báo`
        : `Hiển thị ${visibleCount}/${items.length} thông báo`;
      countSummary.textContent = `${shown} · ${unreadCount} chưa đọc`;
    }

    const unreadBadge = document.querySelector('[data-unread-badge]');
    if (unreadBadge) {
      unreadBadge.textContent = String(unreadCount);
      unreadBadge.hidden = unreadCount === 0;
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

  list.addEventListener('click', event => {
    const button = event.target.closest('[data-mark-read]');
    if (!button) return;
    const item = button.closest('.notification-item');
    if (!item) return;
    item.dataset.read = 'true';
    update();
  });

  if (markAllButton) {
    markAllButton.addEventListener('click', () => {
      items.forEach(item => { item.dataset.read = 'true'; });
      update();
    });
  }

  document.querySelectorAll('[data-dismiss-note]').forEach(button => {
    button.addEventListener('click', () => button.closest('.notification-system-note').remove());
  });

  update();
});
