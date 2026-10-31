/* UC-11 — giáo viên xem tiến bộ / lịch sử, nhập điểm từng câu.
 * Dùng API thực tế; độc lập với luồng tạo bài UC-07 và nhập điểm UC-08.
 */
(() => {
  'use strict';
  if (typeof document === 'undefined') return;
  const C = window.UC11Core;
  const $ = id => document.getElementById(id);
  const state = {classId:'', students:[], studentCode:'', progress:[], history:[],
    request:0, questionTarget:null};
  function note(msg, error=false, id='uc11-notice') {
    const el=$(id); if(!el) return;
    el.textContent=msg || ''; el.classList.toggle('uc11-error',!!error);
  }
  function blank(msg='Chưa có dữ liệu.') {
    $('uc11-stats').innerHTML=''; $('uc11-chart').innerHTML=`<p class="uc11-empty">${C.safe(msg)}</p>`;
    $('uc11-comment').textContent=msg;
    $('uc11-results').innerHTML=`<tr><td colspan="6">${C.safe(msg)}</td></tr>`;
    $('uc11-history').innerHTML=`<tr><td colspan="5">${C.safe(msg)}</td></tr>`;
  }
  function currentClass() { return $('uc07-class')?.value || ''; }
  async function loadStudents(preferred='') {
    const req=++state.request; const id=currentClass(); state.classId=id;
    state.studentCode=''; state.progress=[];state.history=[];
    $('uc11-questions-panel').hidden=true;state.questionTarget=null;
    blank('Đang tải danh sách học sinh...');
    const select=$('uc11-student'); select.innerHTML='<option value="">Đang tải học sinh...</option>';
    if(!id){note('Hãy chọn lớp ở phía trên trước.');blank('Chưa chọn lớp.');return;}
    note('Đang tải danh sách học sinh từ lớp đã chọn...');
    try {
      const students=await AuthService.api(`/classes/${encodeURIComponent(id)}/students`);
      if (req!==state.request) return;
      if(!Array.isArray(students)) throw new Error('Danh sách học sinh không hợp lệ.');
      state.students=students.filter(s=>s.status==='active');
      select.innerHTML=state.students.length?state.students.map(s=>`<option value="${C.safe(s.student_code)}">${C.safe(s.full_name)} (${C.safe(s.student_code)})</option>`).join(''):
        '<option value="">Lớp chưa có học sinh đang học</option>';
      if(!state.students.length){note('Chưa có học sinh được ghi danh ở lớp này.');blank('Lớp chưa có học sinh.');return;}
      const code=state.students.some(s=>s.student_code===preferred)?preferred:state.students[0].student_code;
      select.value=code;
      await loadProgress(code,req);
    } catch(e){if(req!==state.request)return;note(e.message||'Không thể tải danh sách học sinh.',true);blank('Không tải được dữ liệu.');}
  }
  async function loadProgress(code,requestToken=null) {
    const req=requestToken ?? ++state.request;state.studentCode=code;
    $('uc11-questions-panel').hidden=true;state.questionTarget=null;
    blank('Đang tải dữ liệu điểm từ PostgreSQL...');
    if(!code){note('Vui lòng chọn học sinh.');return;}
    note(`Đang tải điểm và lịch sử của ${code}...`);
    try {
      const [progress,history,classes]=await Promise.all([
        AuthService.api(`/students/${encodeURIComponent(code)}/progress`),
        AuthService.api(`/grade-history/${encodeURIComponent(code)}`),
        AuthService.api('/classes')
      ]);
      if(req!==state.request||code!==state.studentCode)return;
      if(!Array.isArray(progress)||!Array.isArray(history))throw new Error('API trả về định dạng không hợp lệ.');
      const klass=Array.isArray(classes)?classes.find(c=>c.id===state.classId):null;
      const sameClass=progress.filter(row=>klass && row.class_code===klass.code);
      state.progress=sameClass;
      const ids=new Set(sameClass.map(row=>row.assignment_id));
      state.history=history.filter(log=>ids.has(log.assignment_id));
      render();
      note(`Đã tải ${sameClass.length} bài và ${state.history.length} bản ghi sửa điểm của học sinh đang chọn.`);
    } catch(e){if(req!==state.request)return;note(e.message||'Không tải được tiến bộ.',true);blank('Không tải được dữ liệu học tập.');}
  }
  function render() {
    const p=state.progress;const scored=C.graded(p);const t=C.tests(p);
    $('uc11-stats').innerHTML=C.statsHtml(p);
    $('uc11-chart').innerHTML=C.chartHtml(p);
    const last=C.latestComment(p);
    $('uc11-comment').textContent=last?`${last.teacher_comment}\n\n${last.title} · ${C.date(last.graded_at||last.assigned_at,true)}`:'Giáo viên chưa có nhận xét cho học sinh này.';
    $('uc11-results').innerHTML=scored.length ? C.sorted(scored).reverse().map(row=>`<tr>
       <td><strong>${C.safe(row.title)}</strong></td><td>${C.safe(C.typ(row.assignment_type))}</td>
       <td>${C.date(row.assigned_at)}</td><td><strong>${C.score(row.score)}</strong></td>
       <td>${C.safe(row.teacher_comment||'—')}</td><td>${C.isTest(row)?`<button type="button" class="btn btn-secondary btn-sm" data-uc11-questions="${C.safe(row.assignment_id)}">Điểm từng câu</button>`:'—'}</td></tr>`).join(''):
       '<tr><td colspan="6">Chưa có bài nào được chấm. Hãy nhập điểm ở UC-08.</td></tr>';
    $('uc11-history').innerHTML=state.history.length ? state.history.map(h=>`<tr><td>${C.date(h.changed_at,true)}</td>
      <td>${C.safe(h.changed_by_name||'—')}</td><td>${C.safe(h.title||'—')}</td><td>${C.score(h.old_score)} → <strong>${C.score(h.new_score)}</strong></td>
      <td>${C.safe(h.reason||'—')}</td></tr>`).join(''):
      '<tr><td colspan="5">Chưa có lịch sử sửa điểm. Bản backend gốc chỉ ghi khi sửa điểm đã lưu.</td></tr>';
  }
  function insertQuestion(q={}) {
    const tbody=$('uc11-questions-rows');
    const tr=document.createElement('tr');
    tr.innerHTML=`<td><input class="form-control uc11-number" type="number" min="1" max="100" step="1" data-q-no required value="${q.question_no??''}" aria-label="Số câu"></td>
      <td><input class="form-control uc11-number" type="number" min="0.5" max="10" step="0.5" data-q-max required value="${q.max_score??''}" aria-label="Điểm tối đa"></td>
      <td><input class="form-control uc11-number" type="number" min="0" max="10" step="0.5" data-q-earned required value="${q.earned_score??''}" aria-label="Điểm đạt"></td>
      <td><button type="button" class="btn btn-secondary btn-sm" data-q-remove>Xóa</button></td>`;
    tbody.appendChild(tr);
    return tr;
  }
  async function showQuestions(assignmentId) {
    const row=state.progress.find(p=>p.assignment_id===assignmentId);
    if(!row || !C.valid(row.score) || !C.isTest(row))return;
    const target={studentCode:state.studentCode,assignmentId,score:Number(row.score)};
    state.questionTarget=target;
    $('uc11-questions-panel').hidden=false;
    $('uc11-question-title').textContent=`${row.title} · ${target.studentCode} · Điểm tổng ${C.score(row.score)} / 10`;
    $('uc11-questions-rows').replaceChildren();note('Đang tải điểm từng câu...',false,'uc11-questions-notice');
    try {
      const records=await AuthService.api(`/assignments/${encodeURIComponent(assignmentId)}/question-scores/${encodeURIComponent(target.studentCode)}`);
      if(state.questionTarget!==target)return;
      if(!Array.isArray(records))throw new Error('Dữ liệu chi tiết không đúng định dạng.');
      if(records.length)records.forEach(insertQuestion);else insertQuestion({question_no:1});
      note(records.length?'Đã tải điểm từng câu.':'Chưa có điểm từng câu; hãy bổ sung số câu, điểm tối đa và điểm đạt.',false,'uc11-questions-notice');
      $('uc11-questions-panel').scrollIntoView({block:'start',behavior:'smooth'});
    }catch(e){if(state.questionTarget!==target)return;note(e.message||'Không tải được điểm từng câu.',true,'uc11-questions-notice');}
  }
  function parseHalf(raw,name,allowZero=true) {
    const text=String(raw).trim();const v=Number(text);
    if(!text||!Number.isFinite(v)||v>10||(allowZero?v<0:v<=0)||!Number.isInteger(v*2))throw new Error(`${name} phải từ ${allowZero?'0':'0,5'} đến 10, bước 0,5.`);
    return v;
  }
  function readQuestions(rows){
    if(!rows.length)throw new Error('Cần nhập ít nhất một câu.');
    if(rows.length>100)throw new Error('Tối đa 100 câu.');
    const ids=new Set();const questions=rows.map(tr=>{
      const raw=tr.querySelector('[data-q-no]').value.trim();const no=Number(raw);
      if(!/^\d+$/.test(raw)||no<1||no>100||ids.has(no))throw new Error('Số câu từ 1–100 và không được trùng.');
      ids.add(no);
      const max_score=parseHalf(tr.querySelector('[data-q-max]').value,`Điểm tối đa câu ${no}`,false);
      const earned_score=parseHalf(tr.querySelector('[data-q-earned]').value,`Điểm đạt câu ${no}`);
      if(earned_score>max_score)throw new Error(`Câu ${no}: điểm đạt không vượt điểm tối đa.`);
      return {question_no:no,max_score,earned_score};
    });
    if(questions.reduce((sum,q)=>sum+q.max_score,0)>10)throw new Error('Tổng điểm tối đa không được vượt 10.');
    return questions;
  }
  async function saveQuestions(evt){
    evt.preventDefault();const target=state.questionTarget;if(!target)return;
    let questions;
    try{
      questions=readQuestions([...$('uc11-questions-rows').querySelectorAll('tr')]);
      const total=questions.reduce((sum,q)=>sum+q.earned_score,0);
      if(Math.abs(total-target.score)>0.001)throw new Error(`Tổng điểm từng câu ${total} phải bằng điểm tổng ${target.score} của UC-08.`);
    }catch(e){note(e.message,true,'uc11-questions-notice');return;}
    const btn=$('uc11-save-questions');btn.disabled=true;
    try{
      await AuthService.api(`/assignments/${encodeURIComponent(target.assignmentId)}/question-scores/${encodeURIComponent(target.studentCode)}`,{method:'PUT',body:JSON.stringify({questions})});
      if(state.questionTarget===target)note('Đã lưu điểm từng câu. Học sinh có thể mở Chi tiết để xem.',false,'uc11-questions-notice');
    }catch(e){note(e.message||'Lưu điểm từng câu thất bại.',true,'uc11-questions-notice');}
    finally{btn.disabled=false;}
  }
  function init(){
    const dateEl=$('uc11-teacher-current-date');
    if(dateEl)dateEl.textContent=new Date().toLocaleDateString('vi-VN',{weekday:'long',day:'2-digit',month:'2-digit',year:'numeric'});
    if(!AuthService.getToken()||AuthService.getCurrentUser()?.role!=='teacher')return;
    $('tabBtn4')?.addEventListener('click',()=>loadStudents(state.studentCode));
    $('uc07-class')?.addEventListener('change',()=>{
      if($('viewStudentProgress')?.style.display!=='none')loadStudents();
      else state.request++; // bỏ response quá hạn của lớp cũ
    });
    $('uc11-student').addEventListener('change',e=>loadProgress(e.target.value));
    $('uc11-refresh').addEventListener('click',()=>loadStudents(state.studentCode));
    $('uc11-results').addEventListener('click',e=>{const btn=e.target.closest('[data-uc11-questions]');if(btn)showQuestions(btn.dataset.uc11Questions);});
    $('uc11-add-question').addEventListener('click',()=>insertQuestion());
    $('uc11-questions-rows').addEventListener('click',e=>{const btn=e.target.closest('[data-q-remove]');if(btn)btn.closest('tr').remove();});
    $('uc11-questions-form').addEventListener('submit',saveQuestions);
    $('uc11-questions-close').addEventListener('click',()=>{$('uc11-questions-panel').hidden=true;state.questionTarget=null;});
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init);else init();
  window.UC11Teacher={loadStudents,loadProgress};
})();
