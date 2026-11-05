/* UC-11: các quy tắc thuần và đồ thị SVG. Không phụ thuộc thư viện/CDN. */
(function(root) {
  'use strict';
  const safe = x => String(x ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;'}[c]));
  const num = x => x === null || x === undefined || x === '' ? null : Number(x);
  const valid = x => { const v = num(x); return v !== null && Number.isFinite(v) && v >= 0 && v <= 10; };
  const isTest = r => ['quiz','midterm','final'].includes(r.assignment_type);
  function time(x) { const d=new Date(x || 0); return Number.isFinite(d.getTime()) ? d.getTime() : 0; }
  const dateValue = row => row.graded_at || row.assigned_at;
  const sorted = arr => [...(Array.isArray(arr)?arr:[])].sort((a,b)=>time(dateValue(a))-time(dateValue(b))||String(a.assignment_id||a.id).localeCompare(String(b.assignment_id||b.id)));
  const graded = arr => sorted(arr).filter(a=>valid(a.score));
  const tests = arr => graded(arr).filter(isTest);
  function stats(arr) {
    const values=graded(arr).map(x=>Number(x.score));
    return {count:values.length, mean:values.length?values.reduce((a,b)=>a+b,0)/values.length:null,
      latest:values.length?values[values.length-1]:null,
      change:values.length>=2?values[values.length-1]-values[0]:null};
  }
  const score = x => valid(x) ? Number(x).toLocaleString('vi-VN',{maximumFractionDigits:2}) : 'Chưa chấm';
  const delta = x => x===null?'Chưa đủ dữ liệu':`${x>0?'+':''}${x.toLocaleString('vi-VN',{maximumFractionDigits:2})} điểm`;
  function date(x,includeTime=false) {
    if (!x) return '—'; const d=new Date(x); if (Number.isNaN(d.getTime())) return '—';
    return d.toLocaleString('vi-VN',includeTime?{dateStyle:'short',timeStyle:'short'}:{dateStyle:'short'});
  }
  const typ = x => ({homework:'Bài tập',quiz:'Bài kiểm tra',midterm:'Giữa kỳ',final:'Cuối kỳ'})[x]||'Bài';
  function latestComment(arr) {
    return [...(Array.isArray(arr)?arr:[])].filter(r=>String(r.teacher_comment||'').trim() && valid(r.score))
      .sort((a,b)=>time(b.graded_at || b.assigned_at)-time(a.graded_at || a.assigned_at))[0] || null;
  }
  function chartHtml(arr) {
    const data=graded(arr); if(!data.length) return '<p class="uc11-empty">Chưa có bài tập hoặc bài kiểm tra nào được chấm trong bộ lọc này.</p>';
    const w=Math.max(750,data.length*92),h=240,l=40,r=22,t=22,b=52, inner=w-l-r, innerH=h-t-b;
    const px=i=> l+(data.length===1?inner/2:(i*inner/(data.length-1)));
    const py=v=>t+innerH-Number(v)/10*innerH;
    const grid=[0,2,4,6,8,10].map(v=>`<line x1="${l}" y1="${py(v)}" x2="${w-r}" y2="${py(v)}" stroke="#e2e8f0"/><text x="${l-9}" y="${py(v)+4}" text-anchor="end" font-size="12" fill="#64748b">${v}</text>`).join('');
    const path=data.map((x,i)=>`${i?'L':'M'}${px(i).toFixed(1)} ${py(x.score).toFixed(1)}`).join(' ');
    const line=data.length>1?`<path d="${path}" fill="none" stroke="#1565c0" stroke-width="3" stroke-linejoin="round"/>`:'';
    const dots=data.map((x,i)=>`<circle cx="${px(i)}" cy="${py(x.score)}" r="5" fill="#1565c0"><title>${safe(x.title)}: ${score(x.score)} / 10 – ${date(dateValue(x))}</title></circle><text x="${px(i)}" y="${py(x.score)-12}" text-anchor="middle" font-size="12" font-weight="700" fill="#174a86">${score(x.score)}</text>`).join('');
    const axis=data.map((x,i)=>`<text x="${px(i)}" y="${h-25}" text-anchor="middle" font-size="11" fill="#64748b">${date(dateValue(x))}</text>`).join('');
    return `<div class="uc11-svg-wrap"><svg class="uc11-svg" style="min-width:${w}px" viewBox="0 0 ${w} ${h}" role="img" aria-label="Biểu đồ điểm bài tập và bài kiểm tra theo thời gian">${grid}${line}${dots}${axis}</svg></div>`;
  }
  const statsHtml = arr => {const s=stats(arr);return `<div class="uc11-stat"><span>Số bài đã có điểm</span><strong>${s.count}</strong></div><div class="uc11-stat"><span>Điểm trung bình</span><strong>${s.mean===null?'—':score(s.mean)+' / 10'}</strong></div><div class="uc11-stat"><span>Điểm gần nhất</span><strong>${s.latest===null?'—':score(s.latest)+' / 10'}</strong></div><div class="uc11-stat"><span>Thay đổi từ bài đầu</span><strong>${delta(s.change)}</strong></div>`;};
  function monthKey(value) {
    if (!value) return '';
    const d = new Date(value);
    return Number.isFinite(d.getTime()) ? `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}` : '';
  }
  function monthLabel(key) {
    const [year,month] = String(key).split('-').map(Number);
    return new Intl.DateTimeFormat('vi-VN',{month:'long',year:'numeric'}).format(new Date(year,month-1,1));
  }
  function filterRows(arr,{month='',classCode='',type=''}={}) {
    return (Array.isArray(arr)?arr:[]).filter(r=>
      (!month || monthKey(dateValue(r))===month) &&
      (!classCode || r.class_code===classCode) &&
      (!type || r.assignment_type===type)
    );
  }
  function historyFor(changes,results) {
    const ids = new Set((Array.isArray(results)?results:[]).map(r=>r.assignment_id));
    return (Array.isArray(changes)?changes:[]).filter(h=>ids.has(h.assignment_id));
  }
  function historyHtml(changes,{showTitle=true}={}) {
    const data=Array.isArray(changes)?changes:[];
    if(!data.length) return '<p class="uc11-empty">Chưa có lần điều chỉnh điểm nào cho các bài đang hiển thị.</p>';
    return `<div class="table-container"><table class="table-custom uc11-table uc11-history-table">
      <thead><tr>${showTitle?'<th>Bài đánh giá</th>':''}<th>Điểm trước</th><th>Điểm sau</th><th>Lý do</th><th>Thời gian sửa</th><th>Giáo viên</th></tr></thead>
      <tbody>${data.map(h=>`<tr>${showTitle?`<td><strong>${safe(h.title)}</strong><div class="text-caption">${safe(h.class_name||h.class_code||'')}</div></td>`:''}
        <td>${score(h.old_score)}</td><td><strong>${score(h.new_score)}</strong></td>
        <td>${safe(h.reason||'—')}</td><td>${date(h.changed_at,true)}</td>
        <td>${safe(h.changed_by_name||'Giáo viên')}</td></tr>`).join('')}</tbody></table></div>`;
  }
  const api={safe,valid,score,date,dateValue,monthKey,monthLabel,filterRows,historyFor,historyHtml,sorted,graded,tests,stats,isTest,latestComment,chartHtml,statsHtml,typ};
  if(typeof module!=='undefined' && module.exports) module.exports=api;
  root.UC11Core=api;
})(typeof window!=='undefined'?window:globalThis);
