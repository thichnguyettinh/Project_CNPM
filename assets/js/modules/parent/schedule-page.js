(() => {
  'use strict';

  const DAY_NAMES = ['Thứ Hai', 'Thứ Ba', 'Thứ Tư', 'Thứ Năm', 'Thứ Sáu', 'Thứ Bảy', 'Chủ Nhật'];
  const $ = id => document.getElementById(id);
  const state = {
    children: [],
    child: null,
    classes: [],
    classId: '',
    sessions: [],
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
    if ($('sidebarParentName')) $('sidebarParentName').textContent = name;
    if ($('headerParentName')) $('headerParentName').textContent = `${name} · Phụ huynh`;
    if ($('sidebarAvatar')) $('sidebarAvatar').textContent = avatar;
    if ($('headerAvatar')) $('headerAvatar').textContent = avatar;
  }

  function renderChild() {
    const child = state.child;
    const display = $('childDisplayName');
    const code = $('childClassCode');
    const avatar = $('childAvatarBadge');
    const subtitle = $('parentSubtitle');
    const selector = $('childSelectDropdown');

    if (!child) {
      if (display) display.textContent = state.children.length ? 'Chọn học sinh' : 'Chưa có học sinh liên kết';
      if (code) code.textContent = '';
      if (avatar) avatar.textContent = 'HS';
      if (subtitle) subtitle.textContent = 'Lịch học sẽ hiển thị sau khi chọn học sinh đã liên kết.';
      if (selector) selector.style.display = 'none';
      return;
    }

    if (display) display.textContent = child.full_name || child.student_code;
    if (code) code.textContent = child.student_code;
    if (avatar) avatar.textContent = initials(child.full_name || child.student_code);
    if (subtitle) subtitle.textContent = `Theo dõi thời khóa biểu của ${child.full_name || child.student_code}.`;
    if (selector) {
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
  }

  async function loadChildClasses() {
    const select = $('scheduleParentClass');
    if (!select) return;
    if (!state.child) {
      state.classes = [];
      state.classId = '';
      select.replaceChildren(new Option('Chưa có học sinh', ''));
      select.disabled = true;
      return;
    }

    select.replaceChildren(new Option('Đang tải lớp học…', ''));
    select.disabled = true;

    try {
      const classes = await ParentScheduleModule.getChildClasses(state.child.student_code);
      state.classes = Array.isArray(classes) ? classes.filter(c => c.status !== 'archived') : [];
      renderClassFilter();
    } catch (error) {
      console.warn('Không thể tải danh sách lớp học của học sinh:', error);
      state.classes = [];
      renderClassFilter();
    }
  }

  function renderClassFilter() {
    const select = $('scheduleParentClass');
    if (!select) return;
    select.replaceChildren(new Option('Tất cả lớp đang học', ''));
    state.classes.forEach(c => {
      const cid = c.id || c.class_id || c.class_code;
      const code = c.code || c.class_code || '';
      const name = c.name || code || 'Lớp học';
      const label = code && name !== code ? `${name} (${code})` : name;
      select.add(new Option(label, cid));
    });

    const stillExists = state.classes.some(c => String(c.id || c.class_id || c.class_code) === String(state.classId));
    if (!stillExists) {
      state.classId = '';
    }
    select.value = state.classId || '';
    select.disabled = state.classes.length === 0;
  }

  function renderFixedSchedules(classes) {
    const list = $('parentFixedSchedules');
    if (!list) return;
    list.replaceChildren();
    const scheduled = (classes || []).filter(item => item.schedule_summary);
    if (!scheduled.length) {
      const empty = document.createElement('p');
      empty.className = 'schedule-fixed-empty';
      empty.textContent = 'Chưa có lịch học cố định được thiết lập cho các lớp của con.';
      list.append(empty);
      return;
    }
    scheduled.forEach(classItem => {
      const card = document.createElement('article');
      card.className = 'schedule-fixed-item';
      const title = document.createElement('h3');
      title.className = 'schedule-fixed-title';
      title.textContent = `${classItem.name || 'Lớp học'} (${classItem.code || classItem.class_code || '—'})`;
      const time = document.createElement('p');
      time.className = 'schedule-fixed-time';
      time.textContent = classItem.schedule_summary;
      const meta = document.createElement('p');
      meta.className = 'schedule-fixed-meta';
      meta.textContent = `${classItem.teacher_name || 'Chưa có giáo viên'} · ${classItem.room ? `Phòng ${classItem.room}` : 'Chưa phân phòng'}`;
      card.append(title, time, meta);
      list.append(card);
    });
  }

  function renderScheduleCount(sessions, classCount) {
    const countEl = $('parentScheduleCount');
    if (!countEl) return;
    countEl.textContent = `${sessions.length} buổi học · ${classCount} lớp${state.classId ? ' · Đang lọc theo lớp' : ''}. Chọn buổi học để xem chi tiết.`;
  }

  function clearSessionPanels(message) {
    if ($('detailSessionDate')) $('detailSessionDate').textContent = message;
    if ($('detailSessionTitle')) $('detailSessionTitle').textContent = 'Chưa có buổi học được chọn';
    if ($('detailSessionTime')) $('detailSessionTime').textContent = '—';
    if ($('detailSessionRoom')) $('detailSessionRoom').textContent = '—';
    if ($('detailSessionTeacher')) $('detailSessionTeacher').textContent = '—';
    if ($('detailSessionStudent')) $('detailSessionStudent').textContent = '—';
    if ($('detailSessionTopicAlert')) $('detailSessionTopicAlert').textContent = 'Nội dung buổi học sẽ hiển thị khi có dữ liệu.';
    if ($('nextSessionDate')) $('nextSessionDate').textContent = 'Chưa có buổi học tiếp theo';
    if ($('nextSessionMeta')) $('nextSessionMeta').textContent = '';
    if ($('nextSessionTopic')) $('nextSessionTopic').textContent = message;
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
    if (!grid) return;
    grid.replaceChildren();
    appendWeekHeaders(grid, weekStart);

    if (!sessions.length) {
      const empty = document.createElement('div');
      empty.className = 'calendar-empty-state';
      empty.textContent = state.child
        ? (state.classId ? 'Không có buổi học nào của lớp này trong tuần.' : 'Tuần này chưa có buổi học nào được lên lịch cho học sinh.')
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
    if ($('detailSessionDate')) $('detailSessionDate').textContent = formatDateLabel(session.starts_at);
    if ($('detailSessionTitle')) $('detailSessionTitle').textContent = `${session.class_name || 'Lớp học'}${session.class_code ? ` (${session.class_code})` : ''}`;
    if ($('detailSessionTime')) $('detailSessionTime').textContent = `${startText}–${endText}${duration}`;
    if ($('detailSessionRoom')) $('detailSessionRoom').textContent = session.room || 'Chưa cập nhật';
    if ($('detailSessionTeacher')) $('detailSessionTeacher').textContent = session.teacher_name || 'Chưa cập nhật';
    if ($('detailSessionStudent')) $('detailSessionStudent').textContent = state.child
      ? `${state.child.full_name || state.child.student_code} (${state.child.student_code})`
      : '—';
    if ($('detailSessionTopicAlert')) $('detailSessionTopicAlert').textContent = session.topic
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
      if ($('nextSessionDate')) $('nextSessionDate').textContent = 'Không có buổi học tiếp theo trong tuần này';
      if ($('nextSessionMeta')) $('nextSessionMeta').textContent = '';
      if ($('nextSessionTopic')) $('nextSessionTopic').textContent = 'Hãy chuyển tuần để xem các lịch học đã được lên kế hoạch.';
      return;
    }

    if ($('nextSessionDate')) $('nextSessionDate').textContent = formatDateLabel(next.starts_at);
    if ($('nextSessionMeta')) $('nextSessionMeta').textContent = `${timePart(next.starts_at)}–${timePart(next.ends_at)} · ${next.class_code || '—'}${next.room ? ` · ${next.room}` : ''}`;
    if ($('nextSessionTopic')) $('nextSessionTopic').textContent = next.topic || 'Buổi học chưa có nội dung được cập nhật.';
  }

  async function loadParentSchedule() {
    const request = ++state.request;
    const start = new Date(state.weekStart);
    const end = new Date(start);
    end.setDate(end.getDate() + 6);
    if ($('parentWeekLabel')) $('parentWeekLabel').textContent = formatWeekLabel(start, end);

    if (!state.child) {
      renderGrid(start, []);
      clearSessionPanels(state.children.length ? 'Chọn học sinh để xem lịch học.' : 'Tài khoản chưa có học sinh liên kết.');
      renderFixedSchedules([]);
      renderScheduleCount([], 0);
      return;
    }

    const grid = $('parentWeekGrid');
    if (grid) grid.innerHTML = '<div class="calendar-empty-state">Đang tải thời khóa biểu…</div>';
    try {
      const filter = {
        date_from: formatDateISO(start),
        date_to: formatDateISO(end),
        student_code: state.child.student_code
      };
      if (state.classId) {
        filter.class_id = state.classId;
      }
      const sessions = await ParentScheduleModule.getChildSchedule(filter);
      if (request !== state.request) return;
      if (!Array.isArray(sessions)) throw new Error('Dữ liệu thời khóa biểu không hợp lệ.');

      // Nếu chưa có danh sách lớp từ API, sinh từ danh sách buổi học
      if (state.classes.length === 0 && sessions.length > 0) {
        const derived = [...new Map(sessions.filter(s => s.class_id || s.class_code).map(s => [
          s.class_id || s.class_code,
          { id: s.class_id || s.class_code, code: s.class_code, name: s.class_name || s.class_code }
        ])).values()];
        if (derived.length > 0) {
          state.classes = derived;
          renderClassFilter();
        }
      }

      const activeSessions = sessions.filter(s => s.status !== 'cancelled');
      const filtered = state.classId
        ? activeSessions.filter(s => String(s.class_id) === String(state.classId) || String(s.class_code) === String(state.classId))
        : activeSessions;

      state.sessions = filtered;
      renderGrid(start, filtered);
      if (filtered.length) {
        selectSession(filtered[0]);
      } else {
        clearSessionPanels(state.classId ? 'Không có buổi học nào của lớp này trong tuần.' : 'Tuần này chưa có buổi học nào được lên lịch.');
      }
      renderNextSession(filtered);

      const selectedClasses = state.classId
        ? state.classes.filter(c => String(c.id || c.class_id || c.class_code) === String(state.classId))
        : state.classes;
      renderFixedSchedules(selectedClasses);
      renderScheduleCount(filtered, selectedClasses.length);
    } catch (error) {
      if (request !== state.request) return;
      console.error('Không thể tải thời khóa biểu của học sinh:', error);
      if (grid) grid.innerHTML = '<div class="calendar-empty-state" role="status">Không thể tải thời khóa biểu. Vui lòng thử lại.</div>';
      clearSessionPanels('Không thể tải dữ liệu thời khóa biểu.');
      renderFixedSchedules([]);
      renderScheduleCount([], 0);
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
      await loadChildClasses();
      await loadParentSchedule();
    } catch (error) {
      console.error('Không thể tải danh sách học sinh đã liên kết:', error);
      state.children = [];
      state.child = null;
      renderChild();
      const grid = $('parentWeekGrid');
      if (grid) grid.innerHTML = '<div class="calendar-empty-state" role="status">Không thể tải danh sách học sinh liên kết.</div>';
      clearSessionPanels('Không thể tải dữ liệu thời khóa biểu.');
      renderFixedSchedules([]);
      renderScheduleCount([], 0);
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
  window.onChildChange = async studentCode => {
    state.child = state.children.find(child => child.student_code === studentCode) || null;
    state.classId = '';
    renderChild();
    await loadChildClasses();
    loadParentSchedule();
  };
  window.onClassChange = classId => {
    state.classId = classId || '';
    loadParentSchedule();
  };

  const ParentSchedulePage = {
    state,
    loadChildren,
    loadChildClasses,
    loadParentSchedule,
    renderGrid,
    selectSession,
    renderFixedSchedules,
    renderClassFilter,
    init: loadChildren
  };
  window.ParentSchedulePage = ParentSchedulePage;

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', loadChildren);
  } else {
    loadChildren();
  }
})();
