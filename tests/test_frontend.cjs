/** Chạy: node --test tests/test_frontend.cjs  (không cần npm) */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const root = path.join(__dirname, '..');

function load(relative, handler) {
  const requests = [];
  const context = {
    window: {}, location: { search: '' }, URLSearchParams, Date,
    document: {querySelector:()=>null}, console,
    Option: class {constructor(label,value) { this.label=label; this.value=value; }},
    confirm: () => true,
    AuthService: {
      api: async (url, options) => {
        requests.push({url, options});
        return handler ? handler(url, options) : {};
      },
      requireAuth: () => ({role:'teacher'}),
      getCurrentUser: () => ({fullName:'Giáo viên kiểm thử'})
    }
  };
  vm.createContext(context);
  vm.runInContext(fs.readFileSync(path.join(root, relative), 'utf8'), context);
  return {w:context.window, requests, ctx:context};
}

test('UC05 gọi API ghi danh và bớt học sinh đúng đường dẫn, đúng payload', async () => {
  const {w, requests} = load('assets/js/modules/teacher/student-list.js');
  await w.StudentListModule.getClasses();
  await w.StudentListModule.getAvailableStudents();
  await w.StudentListModule.getStudentsByClass('class A');
  await w.StudentListModule.addStudentToClass('class A','HS001');
  await w.StudentListModule.removeStudentFromClass('class A', 'HS001');
  assert.deepEqual(requests.map(r=>r.url), [
    '/classes','/users?role=student','/classes/class%20A/students',
    '/classes/class%20A/students','/classes/class%20A/students/HS001'
  ]);
  assert.equal(requests[3].options.method,'POST');
  assert.deepEqual(JSON.parse(requests[3].options.body), {student_code:'HS001'});
  assert.equal(requests[4].options.method,'DELETE');
});

test('UC06 gửi trạng thái và ghi chú đúng schema', async () => {
  const {w, requests} = load('assets/js/modules/teacher/attendance.js');
  await w.AttendanceModule.saveAttendanceSheet(17,[
    {student_code:'HS001', status:'late', note:' Đến trễ 5 phút  '},
    {student_code:'HS002',status:'excused',note:''}
  ]);
  const r = requests[0];
  assert.equal(r.url,'/sessions/17/attendance');
  assert.equal(r.options.method,'PUT');
  assert.deepEqual(JSON.parse(r.options.body),{
    records:[{student_code:'HS001', status:'late',note:'Đến trễ 5 phút'},
      {student_code:'HS002',status:'excused',note:null}]
  });
});

test('UC06 không lưu khi học sinh thiếu trạng thái', async () => {
  const {w, requests} = load('assets/js/modules/teacher/attendance.js');
  const page=w.TeacherAttendancePage;
  page.state={classId:'A',sessionId:'99',busy:false,rows:[
    {student_code:'HS001',full_name:'A',status:'',note:''}
  ],saved:[{student_code:'HS001',full_name:'A',status:'present',note:''}]};
  let message=''; page.message=s=>{message=s;}; page.render=()=>{};
  await page.save();
  assert.match(message,/chọn trạng thái/);
  assert.equal(requests.length,0);
});

test('UC06 chỉ thông báo thành công khi PUT API thực sự thành công', async () => {
  const {w, requests} = load('assets/js/modules/teacher/attendance.js');
  const page=w.TeacherAttendancePage;
  const row={student_code:'HS001',full_name:'A',status:'present',note:'tốt'};
  page.state={sessionId:'99',busy:false,rows:[row],saved:[{...row,status:''}]};
  let message=''; page.message=s=>{message=s;}; page.render=()=>{};
  await page.save();
  assert.equal(requests.length,1);
  assert.match(message,/Đã lưu điểm danh/);
  assert.equal(page.isDirty(),false);
});

test('UC06 khi backend lỗi thì không báo đã lưu, giữ thay đổi', async () => {
  const {w} = load('assets/js/modules/teacher/attendance.js',()=>{throw Error('server down')});
  const page=w.TeacherAttendancePage;
  page.state={sessionId:'99',busy:false,rows:[{student_code:'HS001',status:'absent',note:'tạm'}],
    saved:[{student_code:'HS001',status:'present',note:''}]};
  let message='';page.message=s=>{message=s;};page.render=()=>{};
  await page.save();
  assert.match(message,/Lưu thất bại/);
  assert.equal(page.isDirty(),true);
});

test('UC06 lịch sử của phụ huynh gọi API có xác thực theo vai trò',async()=>{
  const urls=[];
  const {w} = load('assets/js/attendance-history.js', url => {
    urls.push(url);
    if (url === '/attendance') return [];
    if (url === '/children') return [{student_code:'HS001',full_name:'Học sinh kiểm thử'}];
    return null;
  });
  const page=w.AttendanceHistoryPage;
  const ids={};
  page.el=id=>ids[id] ||= {textContent:'',hidden:false,className:'',disabled:false,
    options:[],addEventListener(){},replaceChildren(){this.options=[];},add(o){this.options.push(o);}};
  page.render=()=>{};
  await page.init('parent');
  assert.deepEqual(urls,['/attendance','/children']);
  assert.equal(page.state.children[0].student_code,'HS001');
});

test('UC05 tạo tài khoản học sinh sử dụng API /users với role student',async()=>{
  const {w, requests}=load('assets/js/modules/teacher/student-list.js');
  await w.StudentListModule.createStudentAccount({
    username:'emthu02',full_name:'Học sinh thử',student_code:'HS002',password:'StrongPass1!'
  });
  assert.equal(requests.length,1);
  assert.equal(requests[0].url,'/users');
  assert.equal(requests[0].options.method,'POST');
  const payload=JSON.parse(requests[0].options.body);
  assert.equal(payload.role,'student');
  assert.equal(payload.student_code,'HS002');
});

test('UC02 gửi đúng API và payload cho tạo, liên kết phụ huynh, đặt lại mật khẩu', async () => {
  const {w, requests} = load('assets/js/modules/teacher/user-management.js');
  await w.UserManagementModule.createUser({
    username:'parent01', full_name:'Phụ huynh thử', role:'parent',
    linked_student_code:'HS001', password:'StrongPass1!'
  });
  await w.UserManagementModule.linkParentToStudent('parent id', 'HS001', 'Mẹ');
  await w.UserManagementModule.resetPassword('student id', 'StrongPass2!');
  assert.deepEqual(requests.map(request => request.url), [
    '/users',
    '/users/parent%20id/parent-link',
    '/users/student%20id/reset-password'
  ]);
  assert.equal(requests[0].options.method, 'POST');
  assert.equal(JSON.parse(requests[1].options.body).student_code, 'HS001');
  assert.equal(JSON.parse(requests[1].options.body).relationship, 'Mẹ');
  assert.deepEqual(JSON.parse(requests[2].options.body), {
    new_password: 'StrongPass2!'
  });
});
