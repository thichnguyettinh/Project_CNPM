(() => {
  'use strict';

  const DAY_NAMES = ['Thứ Hai', 'Thứ Ba', 'Thứ Tư', 'Thứ Năm', 'Thứ Sáu', 'Thứ Bảy', 'Chủ Nhật'];
  const $ = id => document.getElementById(id);
  const state = {
    children: [],
    child: null,
    weekStart: getMonday(new Date()),
    request: 0
  };

  function getMonday(value) {
    const date = new Date(value);
    const day = date.getDay();
    date.setDate(date.getDate() - day + (day === 0 ? -6 : 1));
    date.setHours(0, 0, 0, 0);
    return date;
  }

  function formatDateISO(date) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }

  function timePart(value) {
    return String(value || '').slice(11, 16) || '—';
  }

  function datePart(value) {
    return String(value || '').slice(0, 10);
  }

  function formatDateLabel(value) {
    const parts = datePart(value).split('-').map(Number);
    if (parts.length !== 3 || parts.some(Number.isNaN)) return 'Ngày chưa xác định';
    const date = new Date(parts[0], parts[1] - 1, parts[2]);
    const dayName = DAY_NAMES[(date.getDay() + 6) % 7];
    return `${dayName}, ${String(parts[2]).padStart(2, '0')}/${String(parts[1]).padStart(2, '0')}/${parts[0]}`;
  }

  function formatWeekLabel(start, end) {
    const formatter = new Intl.DateTimeFormat('vi-VN', { day: 'numeric', month: 'short' });
    const sameYear = start.getFullYear() === end.getFullYear();
    return `${formatter.format(start)} – ${formatter.format(end)}${sameYear ? `, ${end.getFullYear()}` : `, ${start.getFullYear()} – ${end.getFullYear()}`}`;
  }

  function initials(name) {
    return String(name || '').trim().split(/\s+/).slice(-2)
      .map(part => part[0] || '').join('').toLocaleUpperCase('vi-VN') || 'PH';
  }

  function renderParent(user) {
    const name = user?.full_name || user?.fullName || 'Phụ huynh';
    const avatar = initials(name);
    $('sidebarParentName').textContent = name;
    $('headerParentName').textContent = `${name} · Phụ huynh`;
    $('sidebarAvatar').textContent = avatar;
    $('headerAvatar').textContent = avatar;
  }

  function renderChild() {
    const child = state.child;
    const display = $('childDisplayName');
    const code = $('childClassCode');
    const avatar = $('childAvatarBadge');
    const subtitle = $('parentSubtitle');
    const selector = $('childSelectDropdown');

    if (!child) {
      display.textContent = state.children.length ? 'Chọn học sinh' : 'Chưa có học sinh liên kết';
      code.textContent = '';
      avatar.textContent = 'HS';
      subtitle.textContent = 'Lịch học sẽ hiển thị sau khi chọn học sinh đã liên kết.';
      selector.style.display = 'none';
      return;
    }

    display.textContent = child.full_name || child.student_code;
    code.textContent = child.student_code;
    avatar.textContent = initials(child.full_name || child.student_code);
    subtitle.textContent = `Theo dõi thời khóa biểu của ${child.full_name || child.student_code}.`;
    selector.style.display = state.children.length > 1 ? 'inline-block' : 'none';
    selector.replaceChildren();
    state.children.forEach(item => {
      const option = document.createElement('option');
      option.value = item.student_code;
      option.textContent = `${item.full_name || item.student_code} (${item.student_code})`;
      option.selected = item.student_code === child.student_code;
      selector.append(option);
    });
  }

  function clearSessionPanels(message) {
    $('detailSessionDate').textContent = message;
    $('detailSessionTitle').textContent = 'Chưa có buổi học được chọn';
    $('detailSessionTime').textContent = '—';
    $('detailSessionRoom').textContent = '—';
    $('detailSessionTeacher').textContent = '—';
    $('detailSessionStudent').textContent = '—';
    $('detailSessionTopicAlert').textContent = 'Nội dung buổi học sẽ hiển thị khi có dữ liệu.';
    $('nextSessionDate').textContent = 'Chưa có buổi học tiếp theo';
    $('nextSessionMeta').textContent = '';
    $('nextSessionTopic').textContent = message;
  }

  function appendWeekHeaders(grid, weekStart) {
    const corner = document.createElement('div');
    corner.className = 'calendar-header-col';
    grid.append(corner);

    const today = formatDateISO(new Date());
    for (let index = 0; index < 7; index += 1) {
      const date = new Date(weekStart);
      date.setDate(date.getDate() + index);
      const isToday = formatDateISO(date) === today;
      const header = document.createElement('div');
      header.className = 'calendar-header-col';
      if (isToday) header.style.background = '#EFF6FF';
      const dayName = document.createElement('div');
      dayName.className = 'cal-day-title';
      dayName.textContent = DAY_NAMES[index];
      if (isToday) {
        dayName.style.color = 'var(--color-primary)';
        dayName.style.fontWeight = '700';
      }
      const dayNumber = document.createElement('div');
      dayNumber.className = `cal-day-num${isToday ? ' today' : ''}`;
      dayNumber.textContent = String(date.getDate());
      header.append(dayName, dayNumber);
      grid.append(header);
    }
  }

  function renderGrid(weekStart, sessions) {
    const grid = $('parentWeekGrid');
    grid.replaceChildren();
    appendWeekHeaders(grid, weekStart);

    if (!sessions.length) {
      const empty = document.createElement('div');
      empty.className = 'calendar-empty-state';
      empty.textContent = state.child
        ? 'Tuần này chưa có buổi học nào được lên lịch cho học sinh.'
        : 'Chọn học sinh đã liên kết để xem lịch học.';
      grid.append(empty);
      return;
    }

    const slots = [...new Set(sessions.map(session => timePart(session.starts_at)).filter(time => time !== '—'))].sort();
    slots.forEach(slotTime => {
      const timeCell = document.createElement('div');
      timeCell.className = 'calendar-time-cell';
      timeCell.textContent = slotTime;
      grid.append(timeCell);

      for (let dayIndex = 0; dayIndex < 7; dayIndex += 1) {
        const date = new Date(weekStart);
        date.setDate(date.getDate() + dayIndex);
        const dateString = formatDateISO(date);
        const cell = document.createElement('div');
        cell.className = 'calendar-slot-cell';
        const matching = sessions.filter(session =>
          datePart(session.starts_at) === dateString && timePart(session.starts_at) === slotTime
        );

        if (!matching.length) {
          const empty = document.createElement('span');
          empty.className = 'text-caption';
          empty.textContent = 'Không có';
          empty.style.cssText = 'display:block;text-align:center;margin-top:20px;color:#CBD5E1;';
          cell.append(empty);
        } else {
          matching.forEach(session => {
            const card = document.createElement('button');
            card.type = 'button';
            card.className = 'cal-class-card';
            card.style.cssText = 'width:100%;border:0;text-align:left;color:inherit;font-family:inherit;cursor:pointer;';
            const start = Date.parse(session.starts_at);
            const end = Date.parse(session.ends_at);
            const isNow = Number.isFinite(start) && Number.isFinite(end) && Date.now() >= start && Date.now() < end;
            if (isNow) card.classList.add('active-now');

            const title = document.createElement('h5');
            title.textContent = session.class_name || session.class_code || 'Buổi học';
            const meta = document.createElement('p');
            meta.textContent = `${timePart(session.starts_at)}–${timePart(session.ends_at)}${session.room ? ` · ${session.room}` : ''}`;
            const badge = document.createElement('span');
            badge.className = `badge ${session.status === 'completed' ? 'badge-neutral' : 'badge-primary'}`;
            badge.style.cssText = 'font-size:10px;padding:2px 6px;';
            badge.textContent = session.status === 'completed' ? 'Đã học' : isNow ? 'Đang diễn ra' : 'Sắp diễn ra';
            card.append(title, meta, badge);
            card.addEventListener('click', () => selectSession(session));
            cell.append(card);
          });
        }
        grid.append(cell);
      }
    });
  }

  function selectSession(session) {
    const startText = timePart(session.starts_at);
    const endText = timePart(session.ends_at);
    const durationMs = Date.parse(session.ends_at) - Date.parse(session.starts_at);
    const duration = Number.isFinite(durationMs) && durationMs > 0
      ? ` (${Math.round(durationMs / 60000)} phút)`
      : '';
    $('detailSessionDate').textContent = formatDateLabel(session.starts_at);
    $('detailSessionTitle').textContent = `${session.class_name || 'Lớp học'}${session.class_code ? ` (${session.class_code})` : ''}`;
    $('detailSessionTime').textContent = `${startText}–${endText}${duration}`;
    $('detailSessionRoom').textContent = session.room || 'Chưa cập nhật';
    $('detailSessionTeacher').textContent = session.teacher_name || 'Chưa cập nhật';
    $('detailSessionStudent').textContent = state.child
      ? `${state.child.full_name || state.child.student_code} (${state.child.student_code})`
      : '—';
    $('detailSessionTopicAlert').textContent = session.topic
      ? `Nội dung buổi học: ${session.topic}`
      : 'Buổi học chưa có nội dung được cập nhật.';
  }

  function renderNextSession(sessions) {
    const now = Date.now();
    const next = sessions.find(session => {
      const end = Date.parse(session.ends_at);
      return session.status !== 'completed' && Number.isFinite(end) && end > now;
    });
    if (!next) {
      $('nextSessionDate').textContent = 'Không có buổi học tiếp theo trong tuần này';
      $('nextSessionMeta').textContent = '';
      $('nextSessionTopic').textContent = 'Hãy chuyển tuần để xem các lịch học đã được lên kế hoạch.';
      return;
    }

    $('nextSessionDate').textContent = formatDateLabel(next.starts_at);
    $('nextSessionMeta').textContent = `${timePart(next.starts_at)}–${timePart(next.ends_at)} · ${next.class_code || '—'}${next.room ? ` · ${next.room}` : ''}`;
    $('nextSessionTopic').textContent = next.topic || 'Buổi học chưa có nội dung được cập nhật.';
  }

  async function loadParentSchedule() {
    const request = ++state.request;
    const start = new Date(state.weekStart);
    const end = new Date(start);
    end.setDate(end.getDate() + 6);
    $('parentWeekLabel').textContent = formatWeekLabel(start, end);

    if (!state.child) {
      renderGrid(start, []);
      clearSessionPanels(state.children.length ? 'Chọn học sinh để xem lịch học.' : 'Tài khoản chưa có học sinh liên kết.');
      return;
    }

    $('parentWeekGrid').innerHTML = '<div class="calendar-empty-state">Đang tải thời khóa biểu…</div>';
    try {
      const sessions = await ParentScheduleModule.getChildSchedule({
        date_from: formatDateISO(start),
        date_to: formatDateISO(end),
        student_code: state.child.student_code
      });
      if (request !== state.request) return;
      if (!Array.isArray(sessions)) throw new Error('Dữ liệu thời khóa biểu không hợp lệ.');
      renderGrid(start, sessions);
      if (sessions.length) selectSession(sessions[0]);
      else clearSessionPanels('Tuần này chưa có buổi học nào được lên lịch.');
      renderNextSession(sessions);
    } catch (error) {
      if (request !== state.request) return;
      console.error('Không thể tải thời khóa biểu của học sinh:', error);
      $('parentWeekGrid').innerHTML = '<div class="calendar-empty-state" role="status">Không thể tải thời khóa biểu. Vui lòng thử lại.</div>';
      clearSessionPanels('Không thể tải dữ liệu thời khóa biểu.');
    }
  }

  async function loadChildren() {
    const user = AuthService.requireAuth('parent');
    if (!user) return;
    renderParent(user);
    try {
      const children = await ParentScheduleModule.getLinkedChildren();
      if (!Array.isArray(children)) throw new Error('Danh sách học sinh liên kết không hợp lệ.');
      state.children = children.filter(child => child.student_code);
      state.child = state.children[0] || null;
      renderChild();
      await loadParentSchedule();
    } catch (error) {
      console.error('Không thể tải danh sách học sinh đã liên kết:', error);
      state.children = [];
      state.child = null;
      renderChild();
      $('parentWeekGrid').innerHTML = '<div class="calendar-empty-state" role="status">Không thể tải danh sách học sinh liên kết.</div>';
      clearSessionPanels('Không thể tải dữ liệu thời khóa biểu.');
    }
  }

  window.prevWeek = () => {
    state.weekStart.setDate(state.weekStart.getDate() - 7);
    loadParentSchedule();
  };
  window.nextWeek = () => {
    state.weekStart.setDate(state.weekStart.getDate() + 7);
    loadParentSchedule();
  };
  window.goToCurrentWeek = () => {
    state.weekStart = getMonday(new Date());
    loadParentSchedule();
  };
  window.onChildChange = studentCode => {
    state.child = state.children.find(child => child.student_code === studentCode) || null;
    renderChild();
    loadParentSchedule();
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', loadChildren);
  } else {
    loadChildren();
  }
})();
