const test = require('node:test');
const assert = require('node:assert/strict');
const C = require('../assets/js/modules/uc11-core.js');
const rows = [
  {assignment_id:'a2',assignment_type:'quiz',title:'Kiểm tra 2',assigned_at:'2026-10-15',score:8.5},
  {assignment_id:'a0',assignment_type:'homework',title:'Bài tập 1',assigned_at:'2026-09-01',score:10},
  {assignment_id:'a1',assignment_type:'quiz',title:'Kiểm tra 1',assigned_at:'2026-09-10',score:6.5},
  {assignment_id:'a4',assignment_type:'final',title:'Chưa chấm',assigned_at:'2026-12-01',score:null}
];
test('Phân loại bài kiểm tra đúng',()=>assert.equal(C.tests(rows).length,2));
test('Không tính bài tập vào điểm trung bình bài kiểm tra',()=>assert.equal(C.stats(rows).mean,7.5));
test('Không tính điểm chưa chấm bằng 0',()=>assert.equal(C.stats(rows).count,2));
test('Sắp đúng thứ tự thời gian',()=>assert.deepEqual(C.tests(rows).map(x=>x.assignment_id),['a1','a2']));
test('Thay đổi từ bài kiểm tra đầu tiên',()=>assert.equal(C.stats(rows).change,2));
test('Bài gần nhất xác định theo ngày',()=>assert.equal(C.stats(rows).latest,8.5));
test('Trống dữ liệu an toàn',()=>assert.equal(C.stats([]).mean,null));
test('Chỉ một bài chưa tính thay đổi',()=>assert.equal(C.stats([rows[0]]).change,null));
test('Chấp nhận điểm 0/10',()=>assert.equal(C.valid(0),true));
test('Phân biệt chưa chấm và điểm 0',()=>{assert.equal(C.valid(null),false);assert.equal(C.score(null),'Chưa chấm');});
test('Không chấp nhận điểm ra ngoài thang',()=>assert.equal(C.valid(10.1),false));
test('Chặn nội dung HTML không an toàn',()=>assert.equal(C.safe('<img src=x onerror="x">'),'&lt;img src=x onerror=&quot;x&quot;&gt;'));
test('Biểu đồ không được dùng số liệu mẫu',()=>{const h=C.chartHtml(rows);assert.match(h,/Kiểm tra 1/);assert.doesNotMatch(h,/Bài tập 1/);});
test('Không có biểu đồ khi chưa có điểm bài kiểm tra',()=>assert.match(C.chartHtml([]),/Chưa có điểm/));
test('Tìm nhận xét mới nhất có chấm',()=>{const t=[{title:'A',teacher_comment:'Cũ',graded_at:'2026-01-02',score:9},{title:'B',teacher_comment:'Mới',graded_at:'2026-05-02',score:6}];assert.equal(C.latestComment(t).teacher_comment,'Mới');});
