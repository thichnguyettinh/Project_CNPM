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
test('TC001: tính cả bài tập đã chấm vào trung bình',()=>assert.ok(Math.abs(C.stats(rows).mean-25/3)<1e-9));
test('Không tính điểm chưa chấm bằng 0',()=>assert.equal(C.stats(rows).count,3));
test('Sắp đúng thứ tự thời gian',()=>assert.deepEqual(C.tests(rows).map(x=>x.assignment_id),['a1','a2']));
test('Thay đổi từ bài đã chấm đầu tiên',()=>assert.equal(C.stats(rows).change,-1.5));
test('Bài gần nhất xác định theo ngày',()=>assert.equal(C.stats(rows).latest,8.5));
test('Trống dữ liệu an toàn',()=>assert.equal(C.stats([]).mean,null));
test('Chỉ một bài chưa tính thay đổi',()=>assert.equal(C.stats([rows[0]]).change,null));
test('Chấp nhận điểm 0/10',()=>assert.equal(C.valid(0),true));
test('Phân biệt chưa chấm và điểm 0',()=>{assert.equal(C.valid(null),false);assert.equal(C.score(null),'Chưa chấm');});
test('Không chấp nhận điểm ra ngoài thang',()=>assert.equal(C.valid(10.1),false));
test('Chặn nội dung HTML không an toàn',()=>assert.equal(C.safe('<img src=x onerror="x">'),'&lt;img src=x onerror=&quot;x&quot;&gt;'));
test('TC001: biểu đồ có bài tập và bài kiểm tra từ dữ liệu thật',()=>{const h=C.chartHtml(rows);assert.match(h,/Kiểm tra 1/);assert.match(h,/Bài tập 1/);assert.doesNotMatch(h,/Chưa chấm/);});
test('Không có biểu đồ khi chưa chấm bài nào',()=>assert.match(C.chartHtml([]),/Chưa có bài tập/));
test('Tìm nhận xét mới nhất có chấm',()=>{const t=[{title:'A',teacher_comment:'Cũ',graded_at:'2026-01-02',score:9},{title:'B',teacher_comment:'Mới',graded_at:'2026-05-02',score:6}];assert.equal(C.latestComment(t).teacher_comment,'Mới');});

// TC_UC11_002 + TC_UC11_006 — không kết nối PostgreSQL, kiểm tra quy tắc UI.
const filterData = [
  {assignment_id:'h1', title:'BTVN tháng 11', class_code:'L1', assignment_type:'homework',assigned_at:'2026-10-20',graded_at:'2026-11-02T07:00:00+07:00', score:9},
  {assignment_id:'q1', title:'Kiểm tra tháng 11',class_code:'L1',assignment_type:'quiz',assigned_at:'2026-11-02',graded_at:'2026-11-04T09:00:00+07:00',score:7},
  {assignment_id:'q2', title:'Kiểm tra tháng 10',class_code:'L1',assignment_type:'quiz',assigned_at:'2026-10-01',score:5},
  {assignment_id:'q3', title:'Kiểm tra lớp khác',class_code:'L2',assignment_type:'quiz',assigned_at:'2026-11-03',score:8},
  {assignment_id:'u1', title:'BTVN chưa chấm',class_code:'L1',assignment_type:'homework',assigned_at:'2026-11-04',score:null}
];
test('TC006: lọc theo tháng của ngày cập nhật điểm',()=>{
  assert.equal(C.filterRows(filterData,{month:'2026-11'}).length,4);
  assert.equal(C.monthKey(C.dateValue(filterData[0])),'2026-11');
});
test('TC006: kết hợp tháng + lớp + loại đánh giá',()=>{
  const selected=C.filterRows(filterData,{month:'2026-11',classCode:'L1',type:'quiz'});
  assert.deepEqual(selected.map(r=>r.assignment_id),['q1']);
  assert.equal(C.stats(selected).mean,7);
  const chart=C.chartHtml(selected);assert.match(chart,/Kiểm tra tháng 11/);assert.doesNotMatch(chart,/BTVN tháng 11/);
});
test('TC006: chưa chấm không bị tính vào trung bình và vẫn nằm trong bảng lọc',()=>{
  const selected=C.filterRows(filterData,{month:'2026-11',classCode:'L1',type:'homework'});
  assert.deepEqual(selected.map(r=>r.assignment_id),['h1','u1']);
  assert.equal(C.stats(selected).mean,9);
  assert.equal(C.stats(selected).count,1);
});
const changes=[
  {grade_change_id:1,assignment_id:'q1',title:'Kiểm tra tháng 11',class_name:'Lớp A',old_score:6,new_score:7,reason:'Chấm sót ý <b>x</b>',changed_at:'2026-11-05T10:00:00+07:00',changed_by_name:'Giáo viên An'},
  {grade_change_id:2,assignment_id:'q2',title:'Kiểm tra tháng 10',old_score:4,new_score:5,reason:'Sửa đáp án',changed_at:'2026-10-11T10:00:00+07:00'}
];
test('TC002: hiển thị đủ điểm cũ/mới lý do thời gian trong lịch sử',()=>{
  const h=C.historyHtml(changes);
  assert.match(h,/Điểm trước/);assert.match(h,/Điểm sau/);assert.match(h,/Sửa đáp án/);
  assert.match(h,/Chấm sót ý &lt;b&gt;x&lt;\/b&gt;/);
  assert.doesNotMatch(h,/<b>x<\/b>/);
  assert.match(h,/2026|26/);
  assert.match(h,/Giáo viên An/);
});
test('TC002: chi tiết bài kiểm tra chỉ xem lịch sử của bài đó',()=>{
  const selected=C.historyFor(changes,C.filterRows(filterData,{month:'2026-11',classCode:'L1',type:'quiz'}));
  assert.equal(selected.length,1);assert.equal(selected[0].assignment_id,'q1');
  assert.doesNotMatch(C.historyHtml(selected,{showTitle:false}),/Kiểm tra tháng 10/);
});
test('Lịch sử trống báo rõ, không tự dựng dữ liệu',()=>assert.match(C.historyHtml([]),/Chưa có lần điều chỉnh/));
