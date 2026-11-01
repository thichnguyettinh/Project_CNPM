/** UC-05 / UC-04: lịch của học sinh lấy từ các lớp ghi danh đang hoạt động và buổi học thật. */
const StudentScheduleModule = {
  getMyClasses() { return AuthService.api('/classes'); },
  getMySchedule(filters = {}) {
    const q = new URLSearchParams(filters).toString();
    return AuthService.api(`/sessions${q ? `?${q}` : ''}`);
  },
  getSessionDetail(sessionId) {
    return AuthService.api(`/sessions/${encodeURIComponent(sessionId)}`);
  }
};
window.StudentScheduleModule = StudentScheduleModule;

const StudentSchedulePage = {
  state: { weekStart: null, classes: [], classId: '', sessions: [], busy: false },
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
    this.state.weekStart = this.weekMonday(new Date());
    this.el('schedulePreviousWeek').addEventListener('click', () => this.moveWeek(-7));
    this.el('scheduleCurrentWeek').addEventListener('click', () => {this.state.weekStart=this.weekMonday(new Date());this.loadWeek();});
    this.el('scheduleNextWeek').addEventListener('click', () => this.moveWeek(7));
    this.el('scheduleStudentClass').addEventListener('change', event => {
      this.state.classId=event.target.value;
      this.loadWeek();
    });
    this.el('studentSessionClose').addEventListener('click', () => {this.el('studentSessionDetail').hidden=true;});
    this.message('Đang tải danh sách lớp học của em…');
    try {
      const classes = await StudentScheduleModule.getMyClasses();
      this.state.classes=classes.filter(c => c.status !== 'archived');
      const select=this.el('scheduleStudentClass');
      select.replaceChildren(new Option('Tất cả lớp đang học',''));
      this.state.classes.forEach(c => select.add(new Option(`${c.name} (${c.code})`,c.id)));
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
    this.el('scheduleWeekLabel').textContent = `Tuần ${this.formatDate(start)} – ${this.formatDate(end)}`;
    this.el('studentSessionDetail').hidden=true;
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
    const grid=this.el('studentScheduleGrid');grid.replaceChildren();
    const today=this.localDate(new Date());
    const days=['Thứ Hai','Thứ Ba','Thứ Tư','Thứ Năm','Thứ Sáu','Thứ Bảy','Chủ Nhật'];
    for(let i=0;i<7;i++){
      const date=this.addDays(this.state.weekStart,i);
      const dayKey=this.localDate(date);
      const card=this.textElement('section','','schedule-day-card'+(dayKey===today?' is-today':''));
      const head=this.textElement('h3',days[i],'schedule-day-heading');
      head.append(this.textElement('span',this.formatDate(date),'schedule-day-date'));
      card.append(head);
      const sessions=this.state.sessions.filter(s=>this.dayForSession(s.starts_at)===dayKey);
      if(!sessions.length){card.append(this.textElement('p','Không có buổi học','schedule-day-empty'));}
      for(const session of sessions){
        const button=this.textElement('button','','schedule-session-button');
        button.type='button';
        button.append(this.textElement('span',`${this.formatTime(session.starts_at)}–${this.formatTime(session.ends_at)}`,'schedule-session-time'));
        button.append(this.textElement('span',session.class_name||session.class_code||'Lớp học','schedule-session-title'));
        button.append(this.textElement('span',session.room||'Chưa có phòng','schedule-session-room'));
        button.addEventListener('click',()=>this.showDetail(session.session_id));
        card.append(button);
      }
      grid.append(card);
    }
  },
  async showDetail(sessionId){
    this.el('studentSessionDetail').hidden=false;
    const body=this.el('studentSessionDetailBody');
    body.replaceChildren(this.textElement('p','Đang tải chi tiết buổi học…'));
    try{
      const session=await StudentScheduleModule.getSessionDetail(sessionId);
      body.replaceChildren();
      const detail=this.textElement('div','','schedule-detail-grid');
      const lines=[
        ['Lớp học',session.class_name||session.class_code||'—'],
        ['Mã lớp',session.class_code||'—'],
        ['Ngày học',this.dayForSession(session.starts_at).split('-').reverse().join('/')],
        ['Giờ học',`${this.formatTime(session.starts_at)}–${this.formatTime(session.ends_at)}`],
        ['Phòng',session.room||'Chưa có phòng'],
        ['Giáo viên',session.teacher_name||'—'],
        ['Nội dung',session.topic||'Chưa cập nhật'],
        ['Trạng thái',session.status==='completed'?'Đã học':session.status==='scheduled'?'Đã lên lịch':session.status]
      ];
      lines.forEach(([label,value])=>{
        const cell=this.textElement('div','');
        cell.append(this.textElement('strong',`${label}: `),this.textElement('p',String(value)));
        detail.append(cell);
      });
      body.append(detail);
    }catch(error){body.replaceChildren(this.textElement('p',`Không tải được chi tiết: ${error.message}`));}
  }
};
window.StudentSchedulePage = StudentSchedulePage;
