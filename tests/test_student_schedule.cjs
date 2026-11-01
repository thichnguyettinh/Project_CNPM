const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const file = path.join(__dirname, '../assets/js/modules/student/schedule-view.js');
function setup(handler = async () => []) {
 const requests=[];
 const ctx={window:{},Date,Intl,URLSearchParams,console,document:{},AuthService:{api: async (url)=>{requests.push(url);return handler(url);}}};
 vm.createContext(ctx);
 vm.runInContext(fs.readFileSync(file,'utf8'),ctx);
 return {page:ctx.window.StudentSchedulePage,module:ctx.window.StudentScheduleModule,requests};
}
test('Lịch học sinh lấy lớp và buổi học thật qua API có lọc tuần',async()=>{
 const {module, requests}=setup();
 await module.getMyClasses();
 await module.getMySchedule({date_from:'2026-10-26',date_to:'2026-11-01',class_id:'abc'});
 assert.equal(requests[0],'/classes');
 assert.equal(requests[1],'/sessions?date_from=2026-10-26&date_to=2026-11-01&class_id=abc');
});
test('Thay đổi ghi danh sẽ được phản ánh khi học sinh gọi lại /classes và /sessions',async()=>{
 let enrolled=true;
 const {module}=setup(async(url)=>{
   if(url==='/classes') return enrolled?[{id:'class1',code:'TO10A'}]:[];
   if(url==='/sessions') return enrolled?[{session_id:5,class_id:'class1'}]:[];
   return [];
 });
 assert.equal((await module.getMyClasses()).length,1);
 assert.equal((await module.getMySchedule()).length,1);
 enrolled=false;
 assert.equal((await module.getMyClasses()).length,0);
 assert.equal((await module.getMySchedule()).length,0);
});
test('Nhóm buổi theo ngày Việt Nam và xác định thứ Hai đầu tuần',()=>{
 const {page}=setup();
 assert.equal(page.dayForSession('2026-10-26T17:30:00+07:00'),'2026-10-26');
 assert.equal(page.dayForSession('2026-10-25T18:00:00Z'),'2026-10-26');
 assert.equal(page.localDate(page.weekMonday(new Date(2026,9,30))),'2026-10-26');
});
test('Xem chi tiết buổi học qua API kiểm tra quyền /sessions/{id}',async()=>{
 const {module,requests}=setup();
 await module.getSessionDetail('8');
 assert.equal(requests[0],'/sessions/8');
});
