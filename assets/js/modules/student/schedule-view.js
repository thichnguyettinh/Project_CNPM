/**
 * THỜI KHÓA BIỂU HỌC SINH (STUDENT SCHEDULE MODULE)
 * Phụ trách: Phạm Nguyễn Hoàng Kim & Nhóm Lớp Mình
 */
const StudentScheduleModule = {
  getMyClasses() {
    return AuthService.api('/classes');
  },

  // Lấy danh sách lịch học của học sinh đang đăng nhập
  getMySchedule(filters = {}) {
    const q = new URLSearchParams(filters).toString();
    return AuthService.api(`/sessions${q ? `?${q}` : ''}`);
  },

  // Lấy chi tiết buổi học
  getSessionDetail(sessionId) {
    return AuthService.api(`/sessions/${encodeURIComponent(sessionId)}`);
  },
  getAbsenceRequests(sessionId) {
    return AuthService.api(`/absence-requests?session_id=${encodeURIComponent(sessionId)}`);
  },
  submitAbsenceRequest(sessionId, reason) {
    return AuthService.api(`/sessions/${encodeURIComponent(sessionId)}/absence-requests`, {
      method: 'POST', body: JSON.stringify({ reason })
    });
  }
};
window.StudentScheduleModule = StudentScheduleModule;

const StudentSchedulePage = {
  state: { weekStart: null, classes: [], classId: '', sessions: [], busy: false, absenceBusy: false, selectedSession: null, detailSerial: 0 },
  el(id) { return document.getElementById(id); },
  localDate(date) { return `${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,'0')}-${String(date.getDate()).padStart(2,'0')}`; },
  weekMonday(date) {
    const result = new Date(date.getFullYear(), date.getMonth(), date.getDate());
    const day = (result.getDay() + 6) % 7;
    result.setDate(result.getDate() - day);
    return result;
  },
  addDays(date, count) {
    const result = new Date(date.getFullYear(),date.getMonth(),date.getDate());
    result.setDate(result.getDate()+count);
    return result;
  },
  dayForSession(iso) {
    // Session timestamps are timestamptz in PostgreSQL; show calendar in Viet Nam timezone.
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone: 'Asia/Ho_Chi_Minh', year: 'numeric', month: '2-digit', day: '2-digit'
    }).formatToParts(new Date(iso));
    const get = key => parts.find(x => x.type === key)?.value;
    return `${get('year')}-${get('month')}-${get('day')}`;
  },
  formatDate(date) {
    return new Intl.DateTimeFormat('vi-VN', {day:'2-digit',month:'2-digit',year:'numeric'}).format(date);
  },
  formatTime(iso) {
    return new Intl.DateTimeFormat('vi-VN', {
      timeZone: 'Asia/Ho_Chi_Minh',hour:'2-digit',minute:'2-digit',hourCycle:'h23'
    }).format(new Date(iso));
  },
  formatWeekRange(start, end) {
    const first = new Intl.DateTimeFormat('vi-VN', { day: 'numeric', month: 'long' });
    const last = new Intl.DateTimeFormat('vi-VN', {
      day: 'numeric', month: 'long', year: 'numeric'
    });
    return `${first.format(start)} – ${last.format(end)}`;
  },
  selectedClasses() {
    return this.state.classId
      ? this.state.classes.filter(item => String(item.id) === String(this.state.classId))
      : this.state.classes;
  },
  timeSlots() {
    const slots = new Set(['08:00', '12:00', '17:30', '20:00']);
    this.state.sessions.forEach(session => slots.add(this.formatTime(session.starts_at)));
    this.selectedClasses().forEach(classItem => {
      for (const match of (classItem.schedule_summary || '').matchAll(/\b([01]\d|2[0-3]):[0-5]\d\b/g)) {
        slots.add(match[0]);
      }
    });
    return [...slots].sort();
  },
  textElement(tag, text, className='') {
    const element = document.createElement(tag);
    element.textContent = text;
    if (className) element.className = className;
    return element;
  },
  message(text, type='info') {
    const alert = this.el('studentScheduleMessage');
    alert.textContent = text;
    alert.className = `alert alert-${type}`;
    alert.hidden = !text;
  },
  async init() {
    if (!AuthService.requireAuth('student')) return;
    const current = AuthService.getCurrentUser();
    const name = current?.fullName || current?.full_name || 'Học sinh';
    this.el('studentScheduleUser').textContent = `${name} · Học sinh`;
    this.el('studentScheduleToday').textContent = `Hôm nay: ${this.formatDate(new Date())}`;
    this.el('studentScheduleSubtitle').textContent =
      `Lịch học của ${name} · Năm học ${AuthService.getAcademicYear()}`;
    this.state.weekStart = this.weekMonday(new Date());
    this.el('schedulePreviousWeek').addEventListener('click', () => this.moveWeek(-7));
    this.el('scheduleCurrentWeek').addEventListener('click', () => {this.state.weekStart=this.weekMonday(new Date());this.loadWeek();});
    this.el('scheduleNextWeek').addEventListener('click', () => this.moveWeek(7));
    this.el('scheduleStudentClass').addEventListener('change', event => {
      this.state.classId=event.target.value;
      this.loadWeek();
    });
    this.el('studentSessionClose').addEventListener('click', () => {
      this.state.detailSerial++;
      this.state.selectedSession = null;
      this.el('studentSessionDetail').hidden = true;
    });
    this.el('studentAbsenceForm').addEventListener('submit', event => {
      event.preventDefault();
      this.submitAbsence();
    });
    this.el('studentAbsenceSessionSelect').addEventListener('change', event => {
      this.el('studentAbsenceOpen').disabled = !event.target.value;
    });
    this.el('studentAbsenceOpen').addEventListener('click', () => {
      const sessionId = this.el('studentAbsenceSessionSelect').value;
      if (sessionId) this.showDetail(sessionId, { focusAbsence: true });
    });
    this.message('Đang tải danh sách lớp học của em…');
    try {
      const classes = await StudentScheduleModule.getMyClasses();
      this.state.classes=classes.filter(c => c.status !== 'archived');
      const select=this.el('scheduleStudentClass');
      select.replaceChildren(new Option('Tất cả lớp đang học',''));
      this.state.classes.forEach(c => select.add(new Option(`${c.name} (${c.code})`,c.id)));
      select.disabled = this.state.classes.length === 0;
      await this.loadWeek();
    } catch(error) {
      this.message(`Không thể tải lịch học: ${error.message}`,'danger');
      this.el('scheduleStudentClass').replaceChildren(new Option('Không tải được lớp',''));
    }
  },
  moveWeek(days) {
    this.state.weekStart=this.addDays(this.state.weekStart,days);
    this.loadWeek();
  },
  async loadWeek() {
    const start=this.state.weekStart;
    const end=this.addDays(start,6);
    this.el('scheduleWeekLabel').textContent = this.formatWeekRange(start, end);
    this.el('studentSessionDetail').hidden=true;
    this.state.selectedSession = null;
    this.state.detailSerial++;
    this.message('Đang tải buổi học trong tuần…');
    const classId=this.state.classId;
    const weekKey=this.localDate(start);
    try {
      const filter={date_from:weekKey,date_to:this.localDate(end)};
      if(classId) filter.class_id=classId;
      const sessions=await StudentScheduleModule.getMySchedule(filter);
      if (this.localDate(this.state.weekStart)!==weekKey || this.state.classId!==classId) return;
      this.state.sessions=sessions.filter(s=>s.status!=='cancelled');
      this.message(this.state.classes.length ? '' : 'Em chưa được ghi danh vào lớp học nào. Giáo viên cần thêm em vào lớp trước.', 'info');
      this.render();
    }catch(error){
      if (this.localDate(this.state.weekStart)!==weekKey || this.state.classId!==classId) return;
      this.state.sessions=[];
      this.render();
      this.message(`Không tải được thời khóa biểu: ${error.message}`,'danger');
    }
  },
  render() {
    const grid=this.el('studentScheduleGrid');
    grid.replaceChildren();
    const sessions = this.state.sessions;
    const classes = this.selectedClasses();
    const today=this.localDate(new Date());
    const days=['Thứ Hai','Thứ Ba','Thứ Tư','Thứ Năm','Thứ Sáu','Thứ Bảy','Chủ Nhật'];
    const dates=days.map((_,index)=>this.addDays(this.state.weekStart,index));
    grid.style.setProperty('--schedule-day-count', String(days.length));
    grid.append(this.textElement('div','Thời gian','student-calendar-corner'));
    dates.forEach((date,index)=>{
      const dayKey=this.localDate(date);
      const heading=this.textElement('div','',`student-calendar-day-heading${dayKey===today?' is-today':''}`);
      heading.append(
        this.textElement('span',days[index],'student-calendar-day-name'),
        this.textElement('strong',String(date.getDate()),'student-calendar-day-number')
      );
      heading.setAttribute('aria-label',`${days[index]} ${this.formatDate(date)}`);
      grid.append(heading);
    });

    this.timeSlots().forEach(time=>{
      grid.append(this.textElement('div',time,'student-calendar-time'));
      dates.forEach(date=>{
        const dayKey=this.localDate(date);
        const cell=this.textElement('div','',`student-calendar-cell${dayKey===today?' is-today':''}`);
        sessions.filter(session=>
          this.dayForSession(session.starts_at)===dayKey &&
          this.formatTime(session.starts_at)===time
        ).forEach(session=>{
          const card=this.textElement('article','','student-calendar-session');
          card.append(
            this.textElement('strong',`${this.formatTime(session.starts_at)}–${this.formatTime(session.ends_at)}`,'student-calendar-session-time'),
            this.textElement('strong',session.class_name||session.class_code||'Lớp học','student-calendar-session-title'),
            this.textElement('span',`${session.class_code||''}${session.class_code?' · ':''}${session.room||'Chưa có phòng'}`,'student-calendar-session-meta'),
            this.textElement('span',session.teacher_name||'Giáo viên phụ trách','student-calendar-session-meta')
          );
          if(session.topic) card.append(this.textElement('span',session.topic,'student-calendar-session-topic'));
          const detail=this.textElement('button','Chi tiết →','student-calendar-session-link');
          detail.type='button';
          detail.addEventListener('click',()=>this.showDetail(session.session_id));
          card.append(detail);
          if (session.status === 'scheduled' && Date.parse(session.starts_at) > Date.now()) {
            const request = this.textElement('button','Xin vắng','student-calendar-session-link student-calendar-absence-link');
            request.type = 'button';
            request.addEventListener('click', () => this.showDetail(session.session_id, { focusAbsence: true }));
            card.append(request);
          }
          cell.append(card);
        });
        grid.append(cell);
      });
    });

    this.el('studentScheduleCount').textContent =
      `${sessions.length} buổi học · ${classes.length} lớp${this.state.classId?' · Đang lọc theo lớp':''}. Chọn buổi học để xem nội dung và tài liệu.`;
    this.renderFixedSchedules(classes);
    this.renderAbsenceShortcut();
  },
  renderAbsenceShortcut() {
    const select = this.el('studentAbsenceSessionSelect');
    const button = this.el('studentAbsenceOpen');
    const hint = this.el('studentAbsenceQuickHint');
    const selected = select.value;
    const upcoming = this.state.sessions
      .filter(session => session.status === 'scheduled' &&
        Number.isFinite(Date.parse(session.starts_at)) &&
        Date.parse(session.starts_at) > Date.now())
      .sort((a, b) => Date.parse(a.starts_at) - Date.parse(b.starts_at));
    select.replaceChildren(new Option('— Chọn buổi học sắp tới —', ''));
    upcoming.forEach(session => {
      const localDay = this.dayForSession(session.starts_at).split('-').reverse().join('/');
      const label = `${localDay} · ${this.formatTime(session.starts_at)} · ${session.class_name || session.class_code || 'Lớp học'}`;
      select.add(new Option(label, String(session.session_id)));
    });
    select.value = upcoming.some(session => String(session.session_id) === selected)
      ? selected : (upcoming[0] ? String(upcoming[0].session_id) : '');
    button.disabled = !select.value;
    hint.textContent = upcoming.length
      ? `${upcoming.length} buổi sắp diễn ra trong tuần đang xem. Chọn một buổi và nhấn “Mở đơn xin vắng”.`
      : 'Tuần đang xem chưa có buổi học sắp diễn ra. Hãy chọn “Tuần sau” để tìm buổi học mới.';
  },
  renderFixedSchedules(classes) {
    const list=this.el('studentFixedSchedules');
    list.replaceChildren();
    const scheduled=classes.filter(item=>item.schedule_summary);
    if(!scheduled.length){
      list.append(this.textElement('p','Chưa có lịch học cố định được thiết lập cho các lớp của em.','schedule-fixed-empty'));
      return;
    }
    scheduled.forEach(classItem=>{
      const card=this.textElement('article','','schedule-fixed-item');
      card.append(
        this.textElement('h3',`${classItem.name} (${classItem.code})`,'schedule-fixed-title'),
        this.textElement('p',classItem.schedule_summary,'schedule-fixed-time'),
        this.textElement(
          'p',
          `${classItem.teacher_name||'Chưa có giáo viên'} · ${classItem.room?`Phòng ${classItem.room}`:'Chưa phân phòng'}`,
          'schedule-fixed-meta'
        )
      );
      list.append(card);
    });
  },
  async showDetail(sessionId, { focusAbsence = false } = {}){
    const serial = ++this.state.detailSerial;
    this.state.selectedSession = null;
    const panel = this.el('studentSessionDetail');
    panel.hidden = false;
    panel.scrollIntoView({ behavior: 'smooth', block: 'start' });
    this.el('studentAbsenceForm').hidden = true;
    this.el('studentAbsenceInfo').textContent = '';
    const body = this.el('studentSessionDetailBody');
    body.replaceChildren(this.textElement('p', 'Đang tải chi tiết buổi học…'));
    try {
      const session = await StudentScheduleModule.getSessionDetail(sessionId);
      if (serial !== this.state.detailSerial) return;
      this.state.selectedSession = session;
      body.replaceChildren();
      const detail = this.textElement('div', '', 'schedule-detail-grid');
      const lines = [
        ['Lớp học', session.class_name || session.class_code || '—'],
        ['Mã lớp', session.class_code || '—'],
        ['Ngày học', this.dayForSession(session.starts_at).split('-').reverse().join('/')],
        ['Giờ học', `${this.formatTime(session.starts_at)}–${this.formatTime(session.ends_at)}`],
        ['Phòng', session.room || 'Chưa có phòng'],
        ['Giáo viên', session.teacher_name || '—'],
        ['Nội dung', session.topic || 'Chưa cập nhật'],
        ['Trạng thái', session.status === 'completed' ? 'Đã học' : session.status === 'scheduled' ? 'Đã lên lịch' : session.status]
      ];
      lines.forEach(([label, value]) => {
        const cell = this.textElement('div', '');
        cell.append(this.textElement('strong', `${label}: `), this.textElement('p', String(value)));
        detail.append(cell);
      });
      body.append(detail);
      await this.loadAbsenceState(session, serial);
      if (serial === this.state.detailSerial && focusAbsence) {
        panel.scrollIntoView({ behavior: 'smooth', block: 'start' });
        if (!this.el('studentAbsenceForm').hidden) {
          this.el('studentAbsenceReason').focus({ preventScroll: true });
        }
      }
    } catch (error) {
      if (serial === this.state.detailSerial) {
        body.replaceChildren(this.textElement('p', `Không tải được chi tiết: ${error.message}`));
        this.el('studentAbsenceForm').hidden = true;
      }
    }
  },
  async loadAbsenceState(session, serial) {
    const info = this.el('studentAbsenceInfo');
    info.textContent = 'Đang kiểm tra yêu cầu xin vắng…';
    this.el('studentAbsenceForm').hidden = true;
    try {
      const requests = await StudentScheduleModule.getAbsenceRequests(session.session_id);
      if (serial !== this.state.detailSerial) return;
      if (!Array.isArray(requests)) throw new Error('Dữ liệu yêu cầu không hợp lệ.');
      const existing = requests[0];
      if (existing) {
        info.textContent = `Đã gửi yêu cầu xin vắng. Lý do: ${existing.reason}. Giáo viên đã được thông báo.`;
      } else if (session.status === 'scheduled' && new Date(session.starts_at).getTime() > Date.now()) {
        info.textContent = 'Nếu không thể tham gia buổi học, em có thể gửi lý do xin vắng trước giờ học.';
        this.el('studentAbsenceForm').hidden = false;
      } else {
        info.textContent = 'Chỉ có thể gửi yêu cầu xin vắng trước khi buổi học đã lên lịch bắt đầu.';
      }
    } catch (error) {
      if (serial === this.state.detailSerial) {
        info.textContent = `Chưa kiểm tra được yêu cầu xin vắng: ${error.message}`;
      }
    }
  },
  async submitAbsence() {
    const session = this.state.selectedSession;
    const reason = this.el('studentAbsenceReason').value.trim();
    if (!session || this.state.absenceBusy) return;
    if (!reason) {
      this.el('studentAbsenceInfo').textContent = 'Vui lòng nhập lý do xin vắng.';
      return;
    }
    this.state.absenceBusy = true;
    this.el('studentAbsenceSubmit').disabled = true;
    const serial = this.state.detailSerial;
    try {
      await StudentScheduleModule.submitAbsenceRequest(session.session_id, reason);
      if (serial !== this.state.detailSerial) return;
      this.el('studentAbsenceForm').hidden = true;
      this.el('studentAbsenceForm').reset();
      this.el('studentAbsenceInfo').textContent = 'Đã gửi yêu cầu xin vắng. Giáo viên có thể xem trong mục Điểm danh.';
    } catch (error) {
      if (serial === this.state.detailSerial) {
        this.el('studentAbsenceInfo').textContent = `Không gửi được yêu cầu: ${error.message}`;
      }
    } finally {
      this.state.absenceBusy = false;
      this.el('studentAbsenceSubmit').disabled = false;
    }
  }
};
window.StudentSchedulePage = StudentSchedulePage;
