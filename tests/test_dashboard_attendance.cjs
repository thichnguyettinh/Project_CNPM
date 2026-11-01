/** Kiểm thử bảng số liệu chuyên cần trên ba trang Tổng quan. Chạy node --test tests/test_dashboard_attendance.cjs */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const script = fs.readFileSync(path.join(__dirname, '../assets/js/dashboard-attendance.js'), 'utf8');
const statsScript = fs.readFileSync(path.join(__dirname, '../assets/js/dashboard-stats.js'), 'utf8');
function mockElement() {
  return {
    textContent: '', value: '', disabled: false, options: [], children: [], listeners: {},
    replaceChildren(...args) { this.options = []; this.children = [...args]; },
    add(option) { this.options.push(option); if (this.options.length === 1) this.value = option.value; },
    addEventListener(event, handler) { this.listeners[event] = handler; },
    insertRow() {
      const row = { cells: [], insertCell() { const cell = {textContent:'', children: [], append(child) {this.children.push(child);}}; this.cells.push(cell);return cell; }};
      this.children.push(row);return row;
    }
  };
}
function setup(handler = async () => []) {
  const elements = new Map();
  const requests = [];
  const ctx = {
    window: {}, console, Map, Date, Option: class { constructor(label,value) {this.label=label; this.value=value;} },
    document: { getElementById(id) { if (!elements.has(id)) elements.set(id, mockElement());return elements.get(id);},
      createElement() {return mockElement();} },
    AuthService: { requireAuth: role => ({role}), async api(url) {requests.push(url);return handler(url);} }
  };
  vm.createContext(ctx);vm.runInContext(script, ctx);
  return {m:ctx.window.DashboardAttendance, el:id=>ctx.document.getElementById(id), requests};
}
const records = [
  {session_id:1,student_code:'HS001',status:'present',starts_at:'2026-10-29T10:00:00+07:00',class_name:'Toán 10'},
  {session_id:1,student_code:'HS002',status:'late',starts_at:'2026-10-29T10:00:00+07:00',class_name:'Toán 10'},
  {session_id:1,student_code:'HS003',status:'absent',starts_at:'2026-10-29T10:00:00+07:00',class_name:'Toán 10'},
  {session_id:2,student_code:'HS001',status:'excused',starts_at:'2026-10-25T10:00:00+07:00',class_name:'Lý 10'}
];
test('Tỷ lệ tham gia = Có mặt + Trễ, không tính Có phép hoặc Vắng',()=>{
  const {m}=setup();const c=m.count(records);
  assert.equal(c.total,4); assert.equal(c.attended,2); assert.equal(c.present,1);
  assert.equal(c.late,1); assert.equal(c.absent,1); assert.equal(c.excused,1); assert.equal(c.rate,50);
});
test('Giáo viên thấy sĩ số /dashboard và điểm danh gần đây gom theo buổi, không đếm trùng buổi',async()=>{
  const {m,el,requests}=setup(url=>url==='/dashboard'?{students:{student_count:3}}:records);
  await m.init('teacher');
  assert.equal(el('teacherStudentCount').textContent,'3');
  assert.equal(el('teacherRecentAttendanceRows').children.length,2);
  assert.equal(el('teacherRecentAttendanceRows').children[0].cells[2].textContent,'2 / 3');
  assert.deepEqual(requests,['/dashboard','/attendance']);
});
test('Học sinh nhận tỷ lệ từ API, không dùng số mẫu',async()=>{
  const {m,el}=setup(()=>records.filter(r=>r.student_code==='HS001'));
  await m.init('student');
  assert.equal(el('studentAttendanceCount').textContent,'1 / 2 buổi');
  assert.match(el('studentRecentAttendanceText').textContent,/50%/);
});
test('Phụ huynh chọn học sinh khác thì số liệu đổi, không trộn lịch sử hai con',async()=>{
  const children=[{student_code:'HS001',full_name:'Trần Minh Anh'},{student_code:'HS002',full_name:'Nguyễn Đức Bảo'}];
  const {m,el}=setup(url=>url==='/children'?children:records);
  await m.init('parent');
  assert.equal(el('parentAttendanceCount').textContent,'1/2 buổi');
  assert.equal(el('parentDashboardChildName').textContent,'Trần Minh Anh');
  el('parentAttendanceChild').value='HS002';el('parentAttendanceChild').listeners.change();
  assert.equal(el('parentAttendanceCount').textContent,'1/1 buổi');
  assert.equal(el('parentDashboardChildName').textContent,'Nguyễn Đức Bảo');
});
test('Không có lịch sử hoặc học sinh liên kết thì giao diện hiển thị rỗng, không giả số',async()=>{
  const {m,el}=setup(()=>[]);
  await m.init('parent');
  assert.equal(el('parentAttendanceCount').textContent,'—');
  assert.equal(el('parentAttendanceChild').disabled,true);
  const r=setup(()=>[]);
  await r.m.init('student');
  assert.equal(r.el('studentAttendanceCount').textContent,'0 / 0 buổi');
});
test('Lỗi API không hiển thị số điểm danh demo',async()=>{
  const {m,el}=setup(()=>{throw new Error('API lỗi');});
  await m.init('student');
  assert.equal(el('studentAttendanceCount').textContent,'—');
  assert.match(el('studentAttendanceDesc').textContent,/API lỗi/);
});

function setupStats(role, summary) {
  const elements = new Map();
  const listeners = {};
  const ctx = {
    window: { addEventListener: (event, handler) => { listeners[event] = handler; } },
    document: {
      getElementById(id) {
        if (!elements.has(id)) elements.set(id, {textContent: ''});
        return elements.get(id);
      },
      querySelector: selector => selector === '.teacher-dashboard' && role === 'teacher' ? {} : null,
      addEventListener() {}
    },
    AuthService: {
      requireAuth: requestedRole => requestedRole === role,
      getCurrentUser: () => ({fullName:'Nguyễn Hà Linh'}),
      api: async () => summary
    },
    Number, Date, Intl
  };
  vm.createContext(ctx);
  vm.runInContext(statsScript, ctx);
  return {module:ctx.window.DashboardStats, el:id=>ctx.document.getElementById(id), listeners};
}

test('Lời chào và ngày tổng quan dùng tên tài khoản và ngày hiện tại', () => {
  const {module, el} = setupStats('teacher', {});
  module.renderTeacherGreeting(
    {fullName:'Trần Minh Anh'},
    new Date(2026, 10, 2, 9, 0)
  );
  assert.equal(el('teacherGreeting').textContent, 'Chào buổi sáng, Trần Minh Anh!');
  assert.match(el('teacherGreetingDate').textContent, /02\/11\/2026/);
  assert.equal(el('dashboardCurrentDate').textContent, el('teacherGreetingDate').textContent);
  assert.equal(el('teacherSidebarName').textContent, 'Trần Minh Anh');
  assert.equal(el('teacherHeaderName').textContent, 'Trần Minh Anh · Giáo viên');
  assert.equal(el('teacherSidebarAvatar').textContent, 'MA');
});

test('Thẻ tổng quan giáo viên nhận số lớp, học sinh và buổi học từ dashboard API', async () => {
  const {module, el} = setupStats('teacher', {
    classes:{active_classes:4},
    students:{student_count:11},
    today_sessions:{session_count:2,first_starts_at:'2026-11-02T10:00:00+07:00',last_ends_at:'2026-11-02T13:00:00+07:00'}
  });
  el('teacherClassCountHint').textContent = 'Năm học 2026-2027';
  el('teacherStudentCountHint').textContent = 'Trong các lớp học';
  el('teacherTodaySessionHint').textContent = 'Lịch học trong ngày';
  await module.init('teacher');
  assert.equal(el('teacherClassCount').textContent, '4');
  assert.equal(el('teacherStudentCount').textContent, '11');
  assert.equal(el('teacherTodaySessionCount').textContent, '2');
  assert.equal(el('teacherClassCountHint').textContent, 'Năm học 2026-2027');
  assert.equal(el('teacherStudentCountHint').textContent, 'Trong 4 lớp học');
  assert.equal(el('teacherTodaySessionHint').textContent, 'Lịch học trong ngày');
});

test('Thẻ tổng quan học sinh hiển thị điểm, lớp và bài chưa nộp từ API', async () => {
  const {module, el} = setupStats('student', {students:[{
    student_code:'HS001',class_count:2,average_score:8.25,graded_count:4,
    pending_assignment_count:1,nearest_pending_due_at:'2026-11-10T10:00:00+07:00'
  }]});
  await module.init('student');
  assert.equal(el('studentClassCount').textContent, '2');
  assert.equal(el('studentAverageScore').textContent, '8,25 / 10');
  assert.equal(el('studentPendingAssignmentCount').textContent, '1');
});

test('Thẻ điểm phụ huynh đổi theo học sinh đang chọn', async () => {
  const {module, el} = setupStats('parent', {students:[{
    student_code:'HS001',full_name:'Minh Anh',average_score:7.5,graded_count:2,
    latest_score:9,latest_assignment_title:'Bài kiểm tra'
  }]});
  await module.init('parent');
  module.renderChild('HS001');
  assert.equal(el('parentAverageScore').textContent, '7,5 / 10');
  assert.equal(el('parentLatestScore').textContent, '9 / 10');
  assert.match(el('parentLatestScoreHint').textContent, /Bài kiểm tra/);
});
