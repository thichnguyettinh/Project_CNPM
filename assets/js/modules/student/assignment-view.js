const StudentAssignmentModule = {
  getAssignments(classId) {
    const query=classId?`?class_id=${encodeURIComponent(classId)}`:'';
    return AuthService.api(`/assignments${query}`);
  },
  submitAssignment(assignmentId,file) {
    const body=new FormData(); body.append('file',file);
    return AuthService.api(`/assignments/${encodeURIComponent(assignmentId)}/submissions`,{method:'POST',body});
  }
};
window.StudentAssignmentModule=StudentAssignmentModule;
(() => {
  'use strict';
  if(!AuthService.requireAuth('student'))return;
  const U=AcademicUI,$=U.$;
  const state={assignments:[],selectedId:null,filter:'all',file:null};
  async function load(){
    state.assignments=await StudentAssignmentModule.getAssignments();
    render();
  }
  function render(){
    const published=state.assignments.filter(a=>a.status==='published'||a.status==='closed');
    const submitted=published.filter(a=>a.my_submission_id);
    const pending=published.filter(a=>!a.my_submission_id);
    $('academic-assignment-stats').innerHTML=`<div class="academic-stat">Bài được giao<strong>${published.length}</strong></div><div class="academic-stat">Đã nộp<strong>${submitted.length}</strong></div><div class="academic-stat">Chưa nộp<strong>${pending.length}</strong></div>`;
    const rows=published.filter(a=>state.filter==='all'||(state.filter==='pending'&&!a.my_submission_id)||(state.filter==='submitted'&&a.my_submission_id));
    $('academic-student-assignments').innerHTML=rows.length?`<div class="academic-table-wrap"><table class="academic-table"><thead><tr><th>Bài tập</th><th>Lớp</th><th>Ngày giao</th><th>Hạn nộp</th><th>Tệp đề</th><th>Trạng thái nộp</th><th>Thao tác</th></tr></thead><tbody>${rows.map(a=>`<tr><td><strong>${U.escape(a.title)}</strong><div class="academic-muted">${U.escape(U.type(a.assignment_type))}</div></td><td>${U.escape(a.class_name)}</td><td>${U.date(a.assigned_at)}</td><td>${U.datetime(a.due_at)}</td><td>${a.attachment_file_name ? `<button class="btn btn-secondary btn-sm" type="button" data-prompt="${U.escape(a.id)}">Tải đề</button>` : '<span class="academic-muted">Chưa có đề</span>'}</td><td>${a.my_submission_id?`<span class="academic-pill">${U.escape(U.status(a.my_submission_status))}</span>`:'Chưa nộp'}</td><td><button class="btn btn-primary btn-sm" type="button" data-submit="${U.escape(a.id)}">${a.status==='closed'?'Xem bài (đã đóng)':(a.my_submission_id?'Xem / Nộp lại':'Xem / Nộp bài')}</button></td></tr>`).join('')}</tbody></table></div>`:U.empty('Không có bài nào phù hợp bộ lọc.');
  }
  function openAssignment(id){
    const a=state.assignments.find(x=>x.id===id);if(!a) return;
    state.selectedId=id;state.file=null;$('academic-file').value='';$('academic-selected-file').textContent='Chưa chọn file';
    $('academic-submit-title').textContent=a.title;
    $('academic-send').disabled=a.status==='closed';
    $('academic-send').textContent=a.status==='closed'?'Bài đã đóng — không thể nộp':'Nộp bài';
    $('academic-submit-description').textContent=a.description||'Giáo viên chưa cung cấp mô tả.';
    $('academic-prompt').innerHTML = a.attachment_file_name
      ? `Tệp đề: <strong>${U.escape(a.attachment_file_name)}</strong> <button class="btn btn-secondary btn-sm" type="button" data-prompt="${U.escape(a.id)}">Tải đề bài</button>`
      : 'Giáo viên chưa đính kèm tệp đề. Hãy xem phần mô tả hoặc hỏi giáo viên.';
    $('academic-submit-deadline').textContent=`Hạn nộp: ${U.datetime(a.due_at)}. ${a.my_submission_id?`Đã nộp: ${U.datetime(a.my_submitted_at)}. Có thể nộp lại.`:'Chưa có bài nộp.'}`;
    $('academic-submit-pane').hidden=false;
    $('academic-submit-pane').scrollIntoView({behavior:'smooth',block:'start'});
  }
  function setFile(file){
    state.file=file||null;
    $('academic-selected-file').textContent=file?`Đã chọn: ${file.name} (${(file.size/1024/1024).toFixed(2)} MB)`:'Chưa chọn file';
  }
  async function submit(){
    const file=state.file;
    if(!file) throw new Error('Hãy chọn file bài làm trước khi nộp.');
    if(!/\.(pdf|png|jpe?g)$/i.test(file.name)) throw new Error('Chỉ nhận PDF, PNG, JPG/JPEG.');
    if(file.size>10*1024*1024) throw new Error('File vượt giới hạn 10 MB.');
    if(file.size===0) throw new Error('Không thể nộp file rỗng.');
    const btn=$('academic-send');btn.disabled=true;
    try {
      await StudentAssignmentModule.submitAssignment(state.selectedId,file);
      await load();
      $('academic-submit-pane').hidden=true;
      U.notice('Nộp bài thành công. Dữ liệu đã được lưu vào hệ thống.');
    } finally {btn.disabled=false;}
  }
  document.addEventListener('DOMContentLoaded',()=>{
    $('academic-filter').addEventListener('change',e=>{state.filter=e.target.value;render();});
    async function handleAttachment(e) {
      const btn=e.target.closest('[data-prompt]');
      if (!btn) return false;
      const a=state.assignments.find(x=>x.id===btn.dataset.prompt);
      if (a) await U.downloadAssignmentAttachment(a.id,a.attachment_file_name);
      return true;
    }
    $('academic-student-assignments').addEventListener('click',e=>{
      if (e.target.closest('[data-prompt]')) {handleAttachment(e).catch(U.error.bind(U));return;}
      const btn=e.target.closest('[data-submit]');if(btn)openAssignment(btn.dataset.submit);
    });
    $('academic-prompt').addEventListener('click',e=>handleAttachment(e).catch(U.error.bind(U)));
    $('academic-file').addEventListener('change',e=>setFile(e.target.files?.[0]));
    const zone=$('academic-drop-zone');
    zone.addEventListener('dragover',e=>{e.preventDefault();zone.classList.add('dragging');});
    zone.addEventListener('dragleave',()=>zone.classList.remove('dragging'));
    zone.addEventListener('drop',e=>{e.preventDefault();zone.classList.remove('dragging');setFile(e.dataTransfer.files?.[0]);});
    $('academic-send').addEventListener('click',()=>submit().catch(U.error.bind(U)));
    $('academic-submit-back').addEventListener('click',()=>{$('academic-submit-pane').hidden=true;});
    load().catch(U.error.bind(U));
  });
})();
