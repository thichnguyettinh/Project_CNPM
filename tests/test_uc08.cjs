const assert = require('node:assert/strict');
const r = require('../assets/js/modules/teacher/uc08.js');
let count = 0;
function test(name, fn) {fn();count++;console.log('PASS:',name);}
const old = (score, teacher_comment = '', graded_at=null) => ({score,teacher_comment,graded_at});
const current = (score,comment='',reason='') => ({score,comment,reason});
test('điểm 0, 0.5, 8.5, 10 hợp lệ', () => {
  [0,0.5,8.5,10].forEach(n=>assert.equal(r.parseScore(String(n)),n));
});
test('điểm trống coi là chưa chấm', () => assert.equal(r.parseScore(''),null));
test('từ chối điểm ngoài thang', () => {['-1','11'].forEach(s=>assert.throws(()=>r.parseScore(s)));});
test('từ chối điểm không đúng bước 0.5', () => assert.throws(()=>r.parseScore('8.3')));
test('từ chối cú pháp chữ và Infinity', () => {['abc','Infinity','1e1'].forEach(s=>assert.throws(()=>r.parseScore(s)));});
test('không gửi dòng chưa thay đổi', () => assert.equal(r.compareRow('HS001',old(8.5,'Tốt'),current('8.5','Tốt')),null));
test('nhập điểm lần đầu không yêu cầu lý do', () => assert.deepEqual(r.compareRow('HS001',old(null),current('8.5','Tốt')), {student_code:'HS001',score:8.5,teacher_comment:'Tốt',change_reason:null}));
test('sửa điểm đã có thiếu lý do bị chặn', () => assert.throws(()=>r.compareRow('HS001',old(7),current('8')),/lý do/));
test('sửa điểm có lý do sẽ gửi đúng dữ liệu', () => assert.deepEqual(r.compareRow('HS001',old(7,'Cũ'),current('8.5','Mới','Chấm lại câu 2')),{student_code:'HS001',score:8.5,teacher_comment:'Mới',change_reason:'Chấm lại câu 2'}));
test('sửa nhận xét không cần lý do', () => assert.equal(r.compareRow('HS001',old(7,'Cũ'),current('7','Nhận xét mới')).teacher_comment,'Nhận xét mới'));
test('xóa điểm đã lưu phải ghi lý do', () => assert.throws(()=>r.compareRow('HS001',old(7),current('')),/lý do/));
test('đã có bản ghi điểm null cần lý do khi gán điểm', () => assert.throws(()=>r.compareRow('HS001',old(null,'', '2026-10-01'),current('7')),/lý do/));
console.log(`ĐẠT ${count}/${count} kiểm thử đơn vị UC-08`);
