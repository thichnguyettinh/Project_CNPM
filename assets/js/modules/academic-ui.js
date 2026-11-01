/* Tiện ích giao diện chung cho UC-07, UC-08, UC-11. Không chứa dữ liệu giả. */
const AcademicUI = {
  $: (id) => document.getElementById(id),
  escape(value) {
    return String(value ?? '').replace(/[&<>"']/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
  },
  date(value) {
    if (!value) return '—';
    const d = new Date(value);
    return Number.isNaN(d.getTime()) ? String(value) : new Intl.DateTimeFormat('vi-VN', {dateStyle:'short'}).format(d);
  },
  datetime(value) {
    if (!value) return '—';
    const d = new Date(value);
    return Number.isNaN(d.getTime()) ? String(value) : new Intl.DateTimeFormat('vi-VN', {dateStyle:'short', timeStyle:'short'}).format(d);
  },
  score(value) {
    return value === null || value === undefined ? 'Chưa chấm' : Number(value).toLocaleString('vi-VN', {maximumFractionDigits:2});
  },
  type(type) {
    return ({homework:'Bài tập',quiz:'Bài kiểm tra',midterm:'Giữa kỳ',final:'Cuối kỳ'})[type] || type || 'Bài tập';
  },
  status(status) {
    return ({draft:'Bản nháp',published:'Đã công bố',closed:'Đã đóng',submitted:'Đã nộp',late:'Nộp muộn',returned:'Đã trả'})[status] || status || '—';
  },
  notice(message, kind='ok') {
    const el = this.$('academic-notice');
    if (!el) return;
    el.textContent = message;
    el.className = message ? `academic-alert ${kind}` : '';
  },
  error(error) {
    this.notice(typeof error === 'string' ? error : (error?.message || 'Có lỗi xảy ra.'), 'error');
  },
  empty(message) { return `<div class="academic-empty">${this.escape(message)}</div>`; },
  canvasChart(canvas, entries) {
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const w = canvas.width, h = canvas.height;
    ctx.clearRect(0, 0, w, h);
    ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, w, h);
    ctx.font = '13px Inter, sans-serif';
    const scores = entries.filter(x => x.score !== null && x.score !== undefined)
      .map(x => ({...x, score: Number(x.score)})).filter(x => Number.isFinite(x.score))
      .sort((a,b) => new Date(a.assigned_at) - new Date(b.assigned_at));
    if (!scores.length) {
      ctx.fillStyle='#64748b'; ctx.textAlign='center';
      ctx.fillText('Chưa có điểm để vẽ biểu đồ.', w/2, h/2);
      return;
    }
    const pad={l:46,r:22,t:22,b:58}, pw=w-pad.l-pad.r, ph=h-pad.t-pad.b;
    ctx.lineWidth=1;ctx.strokeStyle='#e2e8f0';ctx.fillStyle='#475569';
    for (let y=0;y<=10;y+=2) {
      const py=pad.t+ph-y/10*ph;
      ctx.beginPath();ctx.moveTo(pad.l,py);ctx.lineTo(w-pad.r,py);ctx.stroke();
      ctx.textAlign='right';ctx.fillText(String(y),pad.l-10,py+4);
    }
    const xAt=i=>pad.l+(scores.length===1?pw/2:i*pw/(scores.length-1));
    const yAt=s=>pad.t+ph-s/10*ph;
    ctx.strokeStyle='#1565c0';ctx.lineWidth=3;ctx.beginPath();
    scores.forEach((point,i)=> i?ctx.lineTo(xAt(i),yAt(point.score)):ctx.moveTo(xAt(i),yAt(point.score)));
    ctx.stroke();
    const every=Math.max(1,Math.ceil(scores.length/7));
    scores.forEach((point,i)=>{
      ctx.beginPath();ctx.fillStyle='#1565c0';ctx.arc(xAt(i),yAt(point.score),4,0,2*Math.PI);ctx.fill();
      if (i%every===0 || i===scores.length-1) {
        ctx.fillStyle='#475569';ctx.textAlign='center';ctx.font='12px Inter, sans-serif';
        ctx.fillText(this.date(point.assigned_at),xAt(i),h-28);
      }
    });
  },
  async downloadAssignmentAttachment(id, filename) {
    const response = await fetch(`${AuthService.API_BASE_URL}/assignments/${encodeURIComponent(id)}/attachment`, {
      headers: {Authorization: `Bearer ${AuthService.getToken()}`}
    });
    if (!response.ok) {
      const data = await response.json().catch(() => ({}));
      throw new Error(data.detail || 'Không thể tải tệp đề.');
    }
    const blob = await response.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = filename || 'de-bai';
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 30000);
  },
  async downloadSubmission(id, filename) {
    const response=await fetch(`${AuthService.API_BASE_URL}/submissions/${encodeURIComponent(id)}/file`,{
      headers:{Authorization:`Bearer ${AuthService.getToken()}`}
    });
    if (!response.ok) throw new Error('Không thể tải bài nộp.');
    const blob=await response.blob();
    const url=URL.createObjectURL(blob);
    const a=document.createElement('a'); a.href=url;a.download=filename||'bai-nop';
    document.body.appendChild(a);a.click();a.remove();
    setTimeout(()=>URL.revokeObjectURL(url),1000);
  }
};
window.AcademicUI=AcademicUI;
