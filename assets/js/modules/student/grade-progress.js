/* UC-11 — điểm thật của chính học sinh; không dùng HTML mockup hay mã HS001 cố định. */
(() => {
 'use strict';
 if (typeof document === 'undefined') return;
 const C=window.UC11Core;
 const $=id=>document.getElementById(id);
 const state={user:null,rows:[],visible:[],req:0,detailReq:0};
 const notice=(msg,error=false)=>{
   const el=$('uc11-student-notice');
   if(!el)return;
   el.textContent=msg||'';
   el.classList.toggle('uc11-error',!!error);
 };
 function render(){
   const classCode=$('uc11-student-class').value;
   const data=state.rows.filter(r=>!classCode || r.class_code===classCode);
   state.visible=data;
   $('uc11-student-stats').innerHTML=C.statsHtml(data);
   $('uc11-student-chart').innerHTML=C.chartHtml(data);
   const last=C.latestComment(data);
   $('uc11-student-comment').textContent=last?`${last.teacher_comment}\n\n${last.title} · ${C.date(last.graded_at||last.assigned_at,true)}`:'Chưa có nhận xét từ giáo viên.';
   const rows=C.sorted(data).reverse();
   $('uc11-student-results').innerHTML=rows.length?rows.map(r=>`<tr>
     <td><strong>${C.safe(r.title)}</strong><div class="text-caption">${C.safe(C.typ(r.assignment_type))}</div></td>
     <td>${C.safe(r.class_name||r.class_code||'—')}</td><td>${C.date(r.assigned_at)}</td>
     <td><strong>${C.score(r.score)}</strong></td><td>${C.safe(r.teacher_comment||'—')}</td>
     <td>${C.valid(r.score)?`<button type="button" class="btn btn-secondary btn-sm" data-uc11-detail="${C.safe(r.assignment_id)}">Chi tiết</button>`:'—'}</td>
     </tr>`).join(''):'<tr><td colspan="6">Chưa có bài tập hoặc bài kiểm tra trong lớp này.</td></tr>';
   $('uc11-student-detail').hidden=true;state.detailReq++;
 }
 async function load(){
   const req=++state.req;notice('Đang tải kết quả học tập...');
   try{
     const me=await AuthService.api('/students/me');
     if(req!==state.req)return;
     if(!me?.student_code)throw new Error('Tài khoản học sinh chưa được cấp mã học sinh.');
     state.user=me;
     $('uc11-student-sidebar-name').textContent=me.full_name || 'Học sinh';
     $('uc11-student-top-name').textContent=`${me.full_name || 'Học sinh'} · Học sinh`;
     const rows=await AuthService.api(`/students/${encodeURIComponent(me.student_code)}/progress`);
     if(req!==state.req)return;
     if(!Array.isArray(rows))throw new Error('API tiến bộ trả về dữ liệu không hợp lệ.');
     state.rows=rows;
     $('uc11-student-identity').textContent=`${me.full_name} · ${me.student_code}`;
     const prev=$('uc11-student-class').value;
     const classes=[...new Map(rows.map(r=>[r.class_code,{code:r.class_code,name:r.class_name}])).values()].filter(c=>c.code);
     $('uc11-student-class').innerHTML='<option value="">Tất cả các lớp</option>'+classes.map(c=>`<option value="${C.safe(c.code)}">${C.safe(c.name||c.code)} (${C.safe(c.code)})</option>`).join('');
     if(classes.some(c=>c.code===prev))$('uc11-student-class').value=prev;
     render();notice(`Đã tải ${rows.length} bài, trong đó có ${C.graded(rows).length} bài đã chấm.`);
   }catch(e){if(req!==state.req)return;console.error('Không thể tải kết quả học tập:',e);
     notice('Chưa thể tải kết quả học tập. Vui lòng thử lại.',true);
     $('uc11-student-stats').innerHTML='';$('uc11-student-chart').textContent='Không có dữ liệu.';
     $('uc11-student-results').innerHTML='<tr><td colspan="6">Chưa thể tải kết quả. Vui lòng thử lại sau.</td></tr>';
   }
 }
 async function detail(id){
   const row=state.visible.find(r=>r.assignment_id===id && C.valid(r.score));if(!row)return;
   const req=++state.detailReq;
   const box=$('uc11-student-detail');box.hidden=false;
   const area=$('uc11-student-detail-content');area.textContent='Đang tải điểm chi tiết...';
   try{
     const parts=await AuthService.api(`/assignments/${encodeURIComponent(id)}/my-question-scores`);
     if(req!==state.detailReq)return;
     if(!Array.isArray(parts))throw new Error('Điểm từng câu không hợp lệ.');
     area.innerHTML=`<p><strong>${C.safe(row.title)}</strong> · ${C.safe(row.class_name)} · ${C.date(row.assigned_at)}</p>
       <div class="uc11-stats"><div class="uc11-stat"><span>Điểm tổng</span><strong>${C.score(row.score)} / 10</strong></div>
       <div class="uc11-stat"><span>Loại bài</span><strong>${C.safe(C.typ(row.assignment_type))}</strong></div></div>
       <p><strong>Nhận xét:</strong> ${C.safe(row.teacher_comment||'Chưa có nhận xét.')}</p>
       <h4 class="uc11-subtitle">Phân tích điểm từng câu</h4>
       ${parts.length?`<div class="table-container"><table class="table-custom uc11-table"><thead><tr><th>Câu</th><th>Điểm đạt</th><th>Điểm tối đa</th></tr></thead>
          <tbody>${parts.map(q=>`<tr><td>Câu ${C.safe(q.question_no)}</td><td>${C.score(q.earned_score)}</td><td>${C.score(q.max_score)}</td></tr>`).join('')}</tbody></table></div>`:
          '<p class="uc11-empty">Giáo viên chưa nhập điểm từng câu cho bài này.</p>'}`;
     box.scrollIntoView({block:'start',behavior:'smooth'});
   }catch(e){if(req!==state.detailReq)return;
     area.textContent=e.message||'Chưa thể tải điểm từng câu. Kiểm tra backend UC-11 đã được cập nhật chưa.';
   }
 }
 function init(){
   $('uc11-current-date').textContent=new Date().toLocaleDateString('vi-VN',{weekday:'long',day:'2-digit',month:'2-digit',year:'numeric'});
   if(!AuthService.getToken()||AuthService.getCurrentUser()?.role!=='student')return;
   $('uc11-student-class').addEventListener('change',render);
   $('uc11-student-refresh').addEventListener('click',load);
   $('uc11-student-results').addEventListener('click',e=>{const b=e.target.closest('[data-uc11-detail]');if(b)detail(b.dataset.uc11Detail);});
   $('uc11-student-detail-close').addEventListener('click',()=>{$('uc11-student-detail').hidden=true;state.detailReq++;});
   load();
 }
 if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init);else init();
})();
