
const cfg=window.APP_CONFIG||{},sb=window.supabase?.createClient(cfg.SUPABASE_URL,cfg.SUPABASE_PUBLISHABLE_KEY);
const el=id=>document.getElementById(id);
const text=(id,m)=>{const e=el(id);if(e)e.textContent=m};
const esc=v=>String(v??'').replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[m]));
const TAIPEI_TZ='Asia/Taipei';
function taipeiYmd(date=new Date()){
  const p=Object.fromEntries(new Intl.DateTimeFormat('en-CA',{timeZone:TAIPEI_TZ,year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(date).filter(x=>x.type!=='literal').map(x=>[x.type,x.value]));
  return `${p.year}-${p.month}-${p.day}`;
}
const isoDay=(n=0)=>{
  const [y,m,d]=taipeiYmd().split('-').map(Number);
  return new Date(Date.UTC(y,m-1,d+n)).toISOString().slice(0,10);
};
const twDate=s=>new Date(s+'T12:00:00+08:00').toLocaleDateString('zh-TW',{timeZone:TAIPEI_TZ,month:'numeric',day:'numeric',weekday:'short'});

function nextMondayIso(){
  const d=new Date();
  d.setHours(12,0,0,0);
  const day=d.getDay(); // 0=Sun, 1=Mon ...
  const add=((8-day)%7)||7; // strictly next Monday; Monday itself -> +7 days
  d.setDate(d.getDate()+add);
  return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0');
}

const statusText={pending:'待確認',confirmed:'已確認',rejected:'未安排',cancelled:'已取消',leave:'請假'};

// ---------- Public homepage / application ----------
async function loadPublic(){
  // 公告改為公關內部公告，不再提供首頁／未登入訪客讀取。
}
loadPublic();

el('applyForm')?.addEventListener('submit',async e=>{
  e.preventDefault();const f=e.currentTarget,b=f.querySelector('button[type=submit]');b.disabled=true;text('applyStatus','送出中…');
  const x=Object.fromEntries(new FormData(f));
  const computedAge=ageFromBirthday(x.birthday);
  if(!computedAge||computedAge<18){text('applyStatus','❌ 請確認生日，申請者需符合適用工作的法定年齡。');b.disabled=false;return}
  const {error}=await sb.from('applications').insert({
    name:'匿名諮詢',nickname:x.nickname,birthday:x.birthday,age:computedAge,area:x.area,contact:x.contact,
    instagram:x.instagram||null,experience:x.experience,
    availability:x.availability||null,note:x.note||null
  });
  text('applyStatus',error?'❌ 送出失敗，請稍後再試。':'✅ 申請成功！經紀端已收到資料。');
  if(!error)f.reset();b.disabled=false;
});

// ---------- Talent portal ----------
async function talentPortalInit(){
  if(!el('talentPortal'))return;
  const {data:{session}}=await sb.auth.getSession();
  if(!session){renderTalentAuth();return}
  const {data:admin}=await sb.from('admin_users').select('user_id').eq('user_id',session.user.id).maybeSingle();
  if(admin){await renderAdminPreviewEntry();return}
  let {data:profile,error}=await sb.from('talents').select('*').eq('user_id',session.user.id).maybeSingle();
  if(error||!profile){renderNoProfile(session.user.email);return}
  if(profile.status==='paused'&&profile.paused_until&&profile.paused_until<=isoDay()){
    const {data:resumed,error:resumeError}=await sb.from('talents').update({status:'active',paused_until:null}).eq('id',profile.id).select('*').maybeSingle();
    if(!resumeError&&resumed)profile=resumed;
  }
  await renderTalentDashboard(profile,session.user.email);
}
talentPortalInit();

// ---------- 經紀預覽公關專區（不用切換帳號） ----------
let TALENT_PREVIEW=false;
async function renderAdminPreviewEntry(){
  const {data:talents,error}=await sb.from('talents').select('*').neq('status','left').order('nickname');
  if(error){el('talentPortal').innerHTML='<div class="portal-shell"><h1>無法讀取公關名單</h1><p>請重新整理再試一次。</p><a class="btn btn-primary" href="admin.html">回經紀後台</a></div>';return}
  const list=talents||[];
  const wanted=new URLSearchParams(location.search).get('preview');
  const target=list.find(t=>t.id===wanted);
  if(target){await openTalentPreview(target,list);return}
  const statusName={active:'上卡中',paused:'休檔中',new:'待審核'};
  el('talentPortal').innerHTML=`<div class="portal-shell preview-picker">
    <div class="preview-picker-head">
      <div><p class="eyebrow">AGENT PREVIEW</p><h1>用公關的角度看專區</h1><p>你登入的是經紀帳號，不用切換帳號。點一位公關，就能看到她登入後看到的畫面（只能看、不會改到資料）。</p></div>
      <a class="btn btn-outline" href="admin.html">← 回經紀後台</a>
    </div>
    <input class="preview-search" type="search" placeholder="搜尋公關暱稱…" autocomplete="off">
    <div class="preview-picker-grid">${list.map(t=>`<button class="preview-pick" data-id="${t.id}" data-name="${esc((t.nickname||'').toLowerCase())}">${talentAvatarMarkup(t,'preview-pick-avatar',true)}<span><b>${esc(t.nickname||'未設定暱稱')}</b><small>${esc(statusName[t.status]||t.status||'')}</small></span></button>`).join('')||'<p class="empty">目前沒有公關資料。</p>'}</div>
  </div>`;
  document.querySelectorAll('.preview-pick').forEach(b=>b.onclick=()=>{const t=list.find(x=>x.id===b.dataset.id);if(t)openTalentPreview(t,list)});
  const q=document.querySelector('.preview-search');
  if(q)q.oninput=()=>{const v=q.value.trim().toLowerCase();document.querySelectorAll('.preview-pick').forEach(b=>b.style.display=!v||b.dataset.name.includes(v)?'':'none')};
}
async function openTalentPreview(t,list){
  TALENT_PREVIEW=true;
  try{history.replaceState(null,'',`booking.html?preview=${encodeURIComponent(t.id)}`)}catch(e){}
  await renderTalentDashboard(t,t.email||'');
  const root=el('talentPortal');
  root.classList.add('is-preview');
  const bar=document.createElement('div');
  bar.className='preview-bar';
  bar.innerHTML=`<span>👀 經紀預覽中：<b>${esc(t.nickname||'')}</b>｜只能看、不會改到資料</span><select class="preview-switch" aria-label="切換公關">${list.map(x=>`<option value="${x.id}" ${x.id===t.id?'selected':''}>${esc(x.nickname||'未設定暱稱')}</option>`).join('')}</select><a href="admin.html">回經紀後台</a>`;
  root.prepend(bar);
  bar.querySelector('.preview-switch').onchange=e=>{const n=list.find(x=>x.id===e.target.value);if(n)openTalentPreview(n,list)};
  root.querySelectorAll('.portal-shell input,.portal-shell select,.portal-shell textarea').forEach(i=>{if(!i.closest('.preview-bar'))i.disabled=true});
}
// 預覽模式：擋掉所有會寫入資料的操作，只保留切換分頁與預覽列
['click','submit','change'].forEach(type=>document.addEventListener(type,e=>{
  if(!TALENT_PREVIEW)return;
  const t=e.target;
  if(!t.closest||!t.closest('#talentPortal'))return;
  if(t.closest('.preview-bar')||t.closest('.profile-tab')||t.closest('.payroll-slip-top')||t.closest('.payroll-history-toggle'))return;
  if(type==='click'&&!t.closest('button,input,label,select,textarea,[role=button]'))return;
  if(type==='click'&&t.closest('a[href]'))return;
  e.preventDefault();e.stopImmediatePropagation();
  if(type!=='change'){const tip=document.querySelector('.preview-bar');if(tip){tip.classList.remove('flash');void tip.offsetWidth;tip.classList.add('flash')}}
},true));


async function talentAuthRequest(payload){
  const res=await fetch(`${cfg.SUPABASE_URL}/functions/v1/talent-auth`,{
    method:'POST',
    headers:{
      'Content-Type':'application/json',
      'apikey':cfg.SUPABASE_PUBLISHABLE_KEY
    },
    body:JSON.stringify(payload)
  });
  const data=await res.json().catch(()=>({}));
  if(!res.ok)throw new Error(data?.error||'登入失敗');
  return data;
}

async function talentLoginWithIdentifier(identifier,password){
  const data=await talentAuthRequest({action:'login',identifier,password});
  if(!data?.session?.access_token||!data?.session?.refresh_token)throw new Error('登入失敗');
  const {error}=await sb.auth.setSession({
    access_token:data.session.access_token,
    refresh_token:data.session.refresh_token
  });
  if(error)throw error;
}

function validTalentUsername(v){
  return /^[a-z0-9._]{3,20}$/.test(String(v||'').trim().toLowerCase());
}

function renderTalentAuth(msg=''){
  document.body.classList.add('auth-daylight');
  const h=Number(new Intl.DateTimeFormat('en-GB',{timeZone:'Asia/Taipei',hour:'2-digit',hour12:false}).format(new Date()));
  const hello=h>=5&&h<11?'早安':h>=11&&h<18?'午安':'晚安';
  el('talentPortal').innerHTML=`
  <div class="daylight-auth">
    <div class="dl-brand"><span class="dl-mark"><img src="assets/lindao-emblem-transparent.png" alt=""></span><span><strong>林刀娛樂</strong><small>TALENT PORTAL</small></span></div>
    <div class="dl-intro"><p class="dl-hello">${hello}，歡迎回來</p><h1>登入公關專區</h1><p>一個帳號，處理報班、班表與公告。</p></div>
    <div class="dl-tabs" role="tablist"><button class="auth-tab active" data-mode="login" type="button">登入</button><button class="auth-tab" data-mode="signup" type="button">第一次使用</button></div>
    <div id="authBox"></div>
    <p class="dl-help">忘記密碼，請直接聯絡經紀</p>
    <p class="dl-foot">資料僅供班務使用．不對外公開</p>
  </div>`;
  const show=mode=>{
    document.querySelectorAll('.auth-tab').forEach(b=>b.classList.toggle('active',b.dataset.mode===mode));
    el('authBox').innerHTML=mode==='login'
    ? `<form id="talentLoginForm" class="dl-card"><label>帳號<input name="identifier" required autocomplete="username" placeholder="使用者帳號或 Email"></label><label>密碼<input type="password" name="password" required autocomplete="current-password" placeholder="輸入密碼"></label><button class="dl-submit">登入</button><p id="talentAuthStatus" class="form-status">${esc(msg)}</p></form>`
    : `<form id="talentSignupForm" class="dl-card"><label>藝名／暱稱<input name="nickname" maxlength="40" required></label><label>使用者帳號<input name="username" minlength="3" maxlength="20" required autocomplete="username" placeholder="3–20 位英文小寫、數字、. 或 _"></label><small class="login-helper">之後可直接用這個短帳號登入，也可以繼續用 Email。</small><label>LINE／手機<input name="contact" maxlength="80" required></label><label>居住地區<input name="area" maxlength="40" placeholder="例如：台北／新北"></label><label>Email<input type="email" name="email" required autocomplete="email"></label><label>設定密碼<input type="password" name="password" minlength="8" required autocomplete="new-password"></label><label class="check"><input type="checkbox" required> 我確認已達適用工作的法定年齡，並同意將帳號資料用於班務管理。</label><button class="dl-submit">建立公關帳號</button><p id="talentAuthStatus" class="form-status"></p></form>`;
    if(mode==='login'){
      el('talentLoginForm').onsubmit=async e=>{e.preventDefault();const f=e.currentTarget,b=f.querySelector('button');const x=Object.fromEntries(new FormData(f));b.disabled=true;text('talentAuthStatus','登入中…');try{await talentLoginWithIdentifier(x.identifier,x.password);location.reload()}catch(err){console.error(err);text('talentAuthStatus','❌ 登入失敗，請確認使用者帳號／Email 與密碼。');b.disabled=false}};
    }else{
      el('talentSignupForm').onsubmit=async e=>{e.preventDefault();const f=e.currentTarget,b=f.querySelector('button');b.disabled=true;text('talentAuthStatus','建立帳號中…');const x=Object.fromEntries(new FormData(f));x.username=String(x.username||'').trim().toLowerCase();if(!validTalentUsername(x.username)){text('talentAuthStatus','❌ 使用者帳號需為 3–20 位英文小寫、數字、. 或 _');b.disabled=false;return}try{const chk=await talentAuthRequest({action:'check_username',username:x.username});if(!chk.available){text('talentAuthStatus','❌ 這個使用者帳號已有人使用，請換一個。');b.disabled=false;return}}catch(err){text('talentAuthStatus','❌ 暫時無法確認使用者帳號，請稍後再試。');b.disabled=false;return}const {data,error}=await sb.auth.signUp({email:x.email,password:x.password,options:{data:{nickname:x.nickname,username:x.username,contact:x.contact,area:x.area||''}}});if(error){text('talentAuthStatus','❌ 註冊失敗：'+error.message);b.disabled=false;return}if(data.session){text('talentAuthStatus','✅ 帳號建立成功，正在進入公關專區…');setTimeout(()=>location.reload(),700)}else{text('talentAuthStatus','✅ 帳號已建立。請到 Email 信箱完成驗證，再用使用者帳號或 Email 登入。');f.reset()}b.disabled=false};
    }
  };
  document.querySelectorAll('.auth-tab').forEach(b=>b.onclick=()=>show(b.dataset.mode));
  show('login');
}
function renderNoProfile(email){
  el('talentPortal').innerHTML=`<div class="portal-shell"><h1>帳號初始化中</h1><p>${esc(email)}</p><p>目前尚未建立公關資料，請重新登入一次；若仍顯示此畫面，請聯絡經紀。</p><button class="btn btn-outline" id="talentLogout">登出</button></div>`;
  el('talentLogout').onclick=async()=>{await sb.auth.signOut();location.reload()};
}
async function renderTalentDashboard(p,email){
  const {data:venues}=await sb.from('venues').select('name').eq('is_active',true).order('name');
  const bookingQuery=sb.from('bookings').select('*');
  const {data:myBookings}=await (p.user_id?bookingQuery.eq('user_id',p.user_id):bookingQuery.eq('talent_id',p.id)).order('booking_date',{ascending:true}).order('created_at');
  const normalizedStatus={active:'active',paused:'paused',new:'new',left:'left','合作中':'active','上卡中':'active','暫停':'paused','休檔中':'paused','待審核':'new','待經紀審核':'new','已離開':'left','已下卡':'left'}[p.status]||p.status;
  const approved=normalizedStatus==='active';
  const profileStatus={new:'待經紀審核',active:'上卡中',paused:'休檔中',left:'已下卡'}[normalizedStatus]||normalizedStatus;
  const rows=myBookings||[];
  const today=isoDay();
  const monday=mondayOf(today);
  const sunday=addDaysIso(monday,6);
  const nextMonday=addDaysIso(monday,7);
  const nextSunday=addDaysIso(monday,13);
  const weekRows=rows.filter(x=>x.booking_date>=monday&&x.booking_date<=sunday&&!['cancelled','rejected'].includes(x.status));
  const nextWeekRows=rows.filter(x=>x.booking_date>=nextMonday&&x.booking_date<=nextSunday);
  const currentWeekDisplayRows=rows.filter(x=>x.booking_date>=monday&&x.booking_date<=sunday);
  const confirmedCount=weekRows.filter(x=>x.status==='confirmed').length;
  const pendingCount=weekRows.filter(x=>x.status==='pending').length;
  const nextBooking=rows.find(x=>x.booking_date>=today&&!['cancelled','rejected','leave'].includes(x.status));
  const nextText=nextBooking?`${twDate(nextBooking.booking_date)} · ${esc(nextBooking.venue||'')}`:'尚無班表';
  const taipeiHour=Number(new Intl.DateTimeFormat('en-GB',{timeZone:'Asia/Taipei',hour:'2-digit',hour12:false}).format(new Date()));
  const timeGreeting=taipeiHour>=5&&taipeiHour<11?'早安':taipeiHour>=11&&taipeiHour<18?'午安':'晚安';
  const todayRows=rows.filter(x=>x.booking_date===today&&!['cancelled','rejected'].includes(x.status));
  const todayConfirmed=todayRows.filter(x=>x.status==='confirmed');
  const todayLeave=todayRows.filter(x=>x.status==='leave');
  const todayPending=todayRows.filter(x=>x.status==='pending');
  const todayStatusText=todayConfirmed.length?`今天在 ${esc(todayConfirmed[0].venue||'店家')} 上班`:todayLeave.length?'今天已請假':todayPending.length?'今天有班，等經紀確認':'今天沒有排班';
  const memberPortrait=p.avatar_portrait_url||p.avatar_url||'';
  const memberCode=String(p.id||'').replace(/-/g,'').slice(0,8).toUpperCase()||'PRIVATE';
  const memberPortraitMarkup=memberPortrait
    ? `<img src="${esc(memberPortrait)}" alt="${esc(p.nickname||'公關')} 會員形象照">`
    : `<div class="vip-portrait-fallback"><span>✦</span><b>${esc((p.nickname||'?').slice(0,1))}</b><small>PRIVATE MEMBER</small></div>`;

  document.body.classList.remove('auth-daylight');
  el('talentPortal').innerHTML=`
  <div class="portal-shell portal-v79">
    <section class="member-command-card">
      <div class="lux-motion-layer" aria-hidden="true">
        <span class="lux-orb orb-a"></span>
        <span class="lux-orb orb-b"></span>
        <span class="lux-orb orb-c"></span>
        <span class="lux-star star-a">✦</span>
        <span class="lux-star star-b">✧</span>
        <span class="lux-star star-c">◇</span>
        <span class="lux-ring ring-a"></span>
        <span class="lux-ring ring-b"></span>
        <span class="lux-petal petal-a">♡</span>
        <span class="lux-petal petal-b">✦</span>
        <span class="lux-petal petal-c">◇</span>
        <span class="lux-petal petal-d">✧</span>
        <span class="lux-shine-line"></span>
      </div>
      <div class="member-command-main">
        <div class="member-command-brand">
          <span class="member-command-line"></span>
          <p>PRIVATE MEMBER</p>
          <span class="member-command-sparkle">✦</span>
        </div>
        <div class="member-soft-orbit orbit-one"></div>
        <div class="member-soft-orbit orbit-two"></div>
        <p class="eyebrow">TALENT PORTAL</p>
        <div class="member-name-row">
          <div>
            <span class="member-welcome">PRIVATE MEMBER · ${timeGreeting} ✦</span>
            <h1>${esc(p.nickname||'未設定暱稱')}<span class="fairy-name-suffix">${timeGreeting}</span></h1>
            <p class="member-soft-caption">今天也辛苦了。班表、公告與個人資料，都已經為妳整理好。</p>
            <div class="member-glance">
              <div><small>TODAY</small><strong>${todayStatusText}</strong></div>
              <span></span>
              <div><small>NEXT SCHEDULE</small><strong>${nextText}</strong></div>
            </div>
          </div>
        </div>

        ${['active','paused'].includes(normalizedStatus)?`
        <div class="talent-self-status member-status-lux" data-current="${esc(normalizedStatus)}">
          <button type="button" class="talent-self-status-btn status-live ${normalizedStatus==='active'?'is-current':''}" data-status="active" aria-pressed="${normalizedStatus==='active'}">
            <span class="talent-status-dot"></span><span>上卡中</span>
          </button>
          <span class="talent-status-slash">/</span>
          <button type="button" class="talent-self-status-btn status-pause ${normalizedStatus==='paused'?'is-current':''}" data-status="paused" aria-pressed="${normalizedStatus==='paused'}">
            <span class="talent-status-dot"></span><span>休檔中</span>
          </button>
        </div>
        <p class="talent-self-status-note">${normalizedStatus==='paused'&&p.paused_until?`休檔至下週一 ${esc(p.paused_until)}｜當天自動恢復上卡中`:'目前可正常報班｜休檔會持續到下週一'}</p>
        `:`<div class="talent-profile-status status-${esc(normalizedStatus)}">${esc(profileStatus)}</div>`}
      </div>

      <aside class="member-vip-portrait" aria-label="尊榮會員識別卡">
        <div class="vip-portrait-frame">
          <div class="vip-portrait-shine"></div>
          <div class="vip-portrait-image">${memberPortraitMarkup}</div>
          <div class="vip-portrait-status ${normalizedStatus==='active'?'is-live':normalizedStatus==='paused'?'is-paused':''}">
            <span></span>${normalizedStatus==='active'?'上卡中':normalizedStatus==='paused'?'休檔中':esc(profileStatus)}
          </div>
        </div>
        <div class="vip-member-plaque">
          <p>PRIVATE MEMBER</p>
          <strong>${esc(p.nickname||'未設定暱稱')}</strong>
          <div><span>MEMBER NO.</span><b>${memberCode}</b></div>
        </div>
      </aside>

      <button class="member-logout" id="talentLogout" type="button">登出 ↗</button>
    </section>

    <nav class="member-nav" aria-label="公關專區導覽">
      <button class="profile-tab active" data-section="schedule">
        <span>01</span><div><strong>班務中心 <i>✦</i></strong><small>報班 · 我的班表 · 公告</small></div>
      </button>
      <button class="profile-tab" data-section="profile">
        <span>02</span><div><strong>個人資料 <i>◇</i></strong><small>聯絡方式 · 基本資料</small></div>
      </button>
      <button class="profile-tab" data-section="hotelcards">
        <span>03</span><div><strong>酒店上下卡紀錄 <i>⌁</i></strong><small>曾上卡店家 · 日期選填</small></div>
      </button>
    </nav>

    ${approved?`<a class="member-announcement-ticker" id="memberAnnouncementTicker" href="announcements.html">
      <span class="ticker-label"><b>✦</b> 公告</span>
      <span class="ticker-viewport"><span class="ticker-track" id="tickerTrack">公告讀取中…</span></span>
      <span class="ticker-more">查看全部 ↗</span>
    </a>`:''}

    <div id="talentScheduleSection" class="member-section">
      ${approved?`
      <div class="member-dashboard-grid member-booking-only">
        <div class="member-booking-column">${bookingComposer(p,venues||[],rows)}</div>
      </div>`:`<div class="approval-box member-pause-box"><strong>${normalizedStatus==='paused'?'目前休檔中':'帳號目前尚未開放報班'}</strong><p>${normalizedStatus==='paused'?'休檔期間暫停報班；切回「上卡中」後即可恢復。':'等待經紀審核通過後，就可以開始報班與查看公告。'}</p></div>`}

      <section class="my-schedule member-schedule-panel">
        <div class="member-section-heading">
          <div><p class="eyebrow">MY SCHEDULE ♡</p><h2>我的班表 <span class="soft-heading-mark">✦</span></h2></div>
          <span class="member-count">${currentWeekDisplayRows.length+nextWeekRows.length} 筆顯示中</span>
        </div>
        <div class="schedule-week-summary">
          <div><span>本週已報班</span><strong>${weekRows.length}</strong><small>天</small></div>
          <i></i>
          <div><span>已確認</span><strong>${confirmedCount}</strong><small>天</small></div>
          <i></i>
          <div><span>待確認</span><strong>${pendingCount}</strong><small>天</small></div>
        </div>
        <div class="schedule-refresh-note">
          <span>✦</span>
          <div><strong>每週一自動更新班表</strong><small>上週班表會自動隱藏；下週已報的班仍可提前查看。</small></div>
        </div>

        <div id="myBookingList" class="member-booking-list member-booking-week-groups">
          <section class="booking-week-group">
            <div class="booking-week-head">
              <div><small>THIS WEEK</small><strong>本週班表</strong></div>
              <span>${esc(monday)} ～ ${esc(sunday)}</span>
            </div>
            ${renderMyBookings(currentWeekDisplayRows)}
          </section>

          <section class="booking-week-group next-week">
            <div class="booking-week-head">
              <div><small>NEXT WEEK</small><strong>下週班表</strong></div>
              <span>${esc(nextMonday)} ～ ${esc(nextSunday)}</span>
            </div>
            ${renderMyBookings(nextWeekRows)}
          </section>
        </div>
      </section>

    </div>

    <div id="talentProfileSection" class="member-section" style="display:none">
      ${profileEditor(p,email)}
    </div>
    <div id="talentHotelCardsSection" class="member-section" style="display:none">
      <div class="member-loading-card">酒店上下卡紀錄讀取中…</div>
    </div>
  </div>`;

  el('talentLogout').onclick=async()=>{await sb.auth.signOut();location.reload()};
  document.querySelectorAll('.profile-tab').forEach(btn=>btn.onclick=async()=>{
    document.querySelectorAll('.profile-tab').forEach(x=>x.classList.remove('active'));
    btn.classList.add('active');
    const section=btn.dataset.section;
    ['Schedule','Profile','HotelCards'].forEach(k=>{const node=el('talent'+k+'Section');if(node)node.style.display='none'});
    const map={schedule:'talentScheduleSection',profile:'talentProfileSection',hotelcards:'talentHotelCardsSection'};
    if(el(map[section]))el(map[section]).style.display='block';
    if(section==='hotelcards')await renderTalentHotelCards(p);
    if(window.matchMedia('(max-width: 760px)').matches){const target=el(map[section]);if(target)window.scrollTo({top:target.getBoundingClientRect().top+scrollY-80,behavior:'smooth'})}
    if(TALENT_PREVIEW)el('talentPortal').querySelectorAll('.portal-shell input,.portal-shell select,.portal-shell textarea').forEach(i=>{if(!i.closest('.preview-bar'))i.disabled=true});
  });
  if(approved){
    bindBookingComposer(p);
    loadTalentAnnouncementTicker();
  }
  bindCancelButtons();
  bindProfileEditor(p);
  bindTalentSelfStatus(p,email);
}




const money=v=>'$'+Number(v||0).toLocaleString('zh-TW',{maximumFractionDigits:0});
const payrollDays=[['mon_sections','一'],['tue_sections','二'],['wed_sections','三'],['thu_sections','四'],['fri_sections','五'],['sat_sections','六'],['sun_sections','日']];
function payrollCalc(x){
  const total=payrollDays.reduce((s,[k])=>s+Number(x[k]||0),0),rate=Number(x.section_rate||0),gross=total*rate;
  const deductionKeys=['tax_amount','cleaning_fee','laundry_fee','misc_fee','makeup_fee','advance_amount'];
  const deductions=deductionKeys.reduce((s,k)=>s+Number(x[k]||0),0);
  return {total,rate,gross,deductions,net:gross-deductions};
}
async function renderTalentPayroll(p){
  const host=el('talentPayrollSection');if(!host)return;
  host.innerHTML='<div class="member-loading-card">薪資單讀取中…</div>';
  const {data,error}=await sb.from('payrolls').select('*').eq('talent_id',p.id).eq('is_published',true).order('week_start',{ascending:false});
  if(error){host.innerHTML='<div class="member-setup-card"><strong>薪資單功能尚未啟用</strong><p>請由管理員確認 Supabase 薪資資料表與權限設定。</p></div>';return}
  const rows=data||[];
  host.innerHTML=`<section class="payroll-page"><div class="member-section-heading"><div><p class="eyebrow">WEEKLY PAYROLL ✦</p><h2>我的薪資單</h2><p class="panel-note">每週結算｜點選任一筆查看完整明細</p></div><span class="member-count">${rows.length} 份</span></div><div class="payroll-compact-list">${rows.length?rows.map((x)=>renderPayrollSlip(x,false)).join(''):'<div class="member-empty-lux"><strong>目前還沒有已發布的薪資單</strong><p>經紀確認並發布後，會顯示在這裡。</p></div>'}</div></section>`;
  host.querySelectorAll('.payroll-slip-top,.payroll-history-toggle').forEach(b=>b.onclick=()=>{const slip=b.closest('.payroll-slip'),d=slip.querySelector('.payroll-slip-body'),t=slip.querySelector('.payroll-history-toggle');d.hidden=!d.hidden;slip.classList.toggle('is-open',!d.hidden);if(t)t.textContent=d.hidden?'查看明細 ＋':'收起明細 －'});
}
function renderPayrollSlip(x,open=false){
  const c=payrollCalc(x),start=x.week_start,end=addDaysIso(start,6),ded=[['稅金',x.tax_amount],['清潔費',x.cleaning_fee],['洗衣費',x.laundry_fee],['雜支',x.misc_fee],['妝髮',x.makeup_fee],['預支',x.advance_amount]];
  return `<article class="payroll-slip"><div class="payroll-slip-top" role="button" tabindex="0"><div class="payroll-summary-main"><small>PAYROLL · ${esc(x.venue||'未填店名')}</small><h3>${esc(start)} — ${esc(end)}</h3><span>${c.total} 節 · ${x.is_published?'已結算':'待結算'}</span></div><div class="payroll-net"><span>實領</span><strong>${money(c.net)}</strong><em>⌄</em></div></div><div class="payroll-slip-body" hidden><div class="payroll-core"><div><span>店名</span><b>${esc(x.venue||'—')}</b></div><div><span>藝名</span><b>${esc(x.nickname||'—')}</b></div><div><span>總節數</span><b>${c.total} 節</b></div><div><span>節薪</span><b>${money(c.rate)} / 節</b></div></div><div class="payroll-days">${payrollDays.map(([k,l],idx)=>`<div><small>週${l}</small><span>${twDate(addDaysIso(start,idx)).replace(/週./,'')}</span><strong>${Number(x[k]||0)}<i>節</i></strong></div>`).join('')}</div><div class="payroll-math"><div><span>節數薪資</span><b>${c.total} × ${money(c.rate)}</b><strong>${money(c.gross)}</strong></div><div class="payroll-deductions"><p>扣款明細</p>${ded.map(([l,v])=>`<div><span>${l}</span><b>− ${money(v)}</b></div>`).join('')}<div class="deduction-total"><span>扣款合計</span><b>− ${money(c.deductions)}</b></div></div><div class="payroll-final"><span>實際薪資</span><strong>${money(c.net)}</strong></div></div>${x.note?`<p class="payroll-note">備註｜${esc(x.note)}</p>`:''}</div><button class="payroll-history-toggle" type="button">查看明細 ＋</button></article>`;
}
async function renderTalentHotelCards(p){
  const host=el('talentHotelCardsSection');if(!host)return;
  host.innerHTML='<div class="member-loading-card">酒店上下卡紀錄讀取中…</div>';
  const {data,error}=await sb.from('hotel_card_records').select('*').eq('talent_id',p.id).order('created_at',{ascending:false});
  if(error){host.innerHTML='<div class="member-setup-card"><strong>酒店紀錄功能尚未啟用</strong><p>請由管理員確認 Supabase 薪資資料表與權限設定。</p></div>';return}
  const rows=(data||[]).slice().sort((a,b)=>{
    const activeA=a.status==='上卡中'?0:1;
    const activeB=b.status==='上卡中'?0:1;
    if(activeA!==activeB)return activeA-activeB;
    const dateA=String(a.card_on_date||a.created_at||'');
    const dateB=String(b.card_on_date||b.created_at||'');
    return dateB.localeCompare(dateA);
  });
  host.innerHTML=`<section class="hotel-record-page"><div class="member-section-heading"><div><p class="eyebrow">PRIVATE CAREER ARCHIVE</p><h2>酒店上下卡紀錄</h2><p class="panel-note">上卡中的合作會優先置頂，歷史紀錄依日期排序。</p></div><span class="member-count">${rows.length} 筆</span></div><div class="hotel-record-grid">${rows.map((x,i)=>`<article class="hotel-record-card hotel-status-${esc((x.status||'record').replace(/\s+/g,'-'))}"><div class="hotel-card-index">${String(i+1).padStart(2,'0')}</div><div class="hotel-card-top"><div class="hotel-record-mark"><span>✦</span></div><div class="hotel-card-title"><small>PRIVATE RECORD</small><h3>${esc(x.venue)}</h3></div><span class="hotel-record-status">${esc(x.status||'曾上卡')}</span></div><div class="hotel-record-meta"><div><span>上卡日期</span><strong>${esc(x.card_on_date||'未紀錄')}</strong></div><i></i><div><span>下卡日期</span><strong>${esc(x.card_off_date||'未紀錄')}</strong></div></div>${x.note?`<div class="hotel-record-note"><span>PRIVATE NOTE</span><p>${esc(x.note)}</p></div>`:''}<div class="hotel-card-signature"><span>林刀娛樂</span><b>PRIVATE ARCHIVE</b></div></article>`).join('')||'<div class="member-empty-lux"><strong>目前沒有酒店上下卡紀錄</strong><p>經紀新增曾上卡店家後會顯示在這裡。</p></div>'}</div></section>`;
}

async function bindTalentSelfStatus(p,email){
  const root=document.querySelector('.talent-self-status');
  if(!root)return;
  root.querySelectorAll('.talent-self-status-btn').forEach(btn=>btn.onclick=async()=>{
    const next=btn.dataset.status;
    const current={active:'active',paused:'paused','合作中':'active','上卡中':'active','暫停':'paused','休檔中':'paused'}[p.status]||p.status;
    if(next===current)return;

    let payload;
    if(next==='paused'){
      const pausedUntil=nextMondayIso();
      if(!confirm(`確定切換為「休檔中」嗎？\n\n本次休檔至下週一 ${pausedUntil}，當天會自動恢復「上卡中」。`))return;
      payload={status:'paused',paused_until:pausedUntil};
    }else{
      if(!confirm('確定恢復為「上卡中」嗎？'))return;
      payload={status:'active',paused_until:null};
    }

    root.classList.add('is-saving');
    const {data:updated,error}=await sb.from('talents').update(payload).eq('id',p.id).select('*').maybeSingle();
    root.classList.remove('is-saving');

    if(error||!updated){
      console.error(error);
      alert('狀態修改失敗，請稍後再試。');
      return;
    }
    await renderTalentDashboard(updated,email);
  });
}

async function announcementsPageInit(){
  const root=el('announcementsPage');if(!root)return;
  const {data:{session}}=await sb.auth.getSession();
  if(!session){
    root.innerHTML=`<div class="announcement-page-state"><strong>請先登入公關專區</strong><p>公告內容僅提供已登入的合作公關查看。</p><a class="btn btn-primary" href="booking.html">前往登入</a></div>`;
    return;
  }
  const {data:profile,error:profileError}=await sb.from('talents').select('*').eq('user_id',session.user.id).maybeSingle();
  if(profileError||!profile){
    root.innerHTML=`<div class="announcement-page-state"><strong>找不到公關資料</strong><p>請返回公關專區或聯絡經紀。</p><a class="btn btn-outline" href="booking.html">返回公關專區</a></div>`;
    return;
  }
  const normalized={active:'active',paused:'paused','合作中':'active','上卡中':'active','暫停':'paused','休檔中':'paused'}[profile.status]||profile.status;
  if(!['active','paused'].includes(normalized)){
    root.innerHTML=`<div class="announcement-page-state"><strong>公告尚未開放</strong><p>帳號通過經紀審核後即可查看公告。</p><a class="btn btn-outline" href="booking.html">返回公關專區</a></div>`;
    return;
  }
  const {data,error}=await sb.from('announcements').select('*').eq('is_active',true).order('created_at',{ascending:false});
  root.innerHTML=`<section class="announcement-page-shell">
    <div class="announcement-page-head">
      <div><p class="eyebrow">MEMBER ANNOUNCEMENTS ✦</p><h1>公關公告</h1><p>重要規章、班務提醒與最新通知都會整理在這裡。</p></div>
      <a class="btn btn-outline" href="booking.html">← 返回公關專區</a>
    </div>
    <div class="announcement-page-list">${error||!data?.length?'<div class="announcement-page-empty">目前沒有公告。</div>':data.map((x,i)=>`<article class="announcement-page-card">
      <div class="announcement-page-number">${String(i+1).padStart(2,'0')}</div>
      <div class="announcement-page-content"><span>${new Date(x.created_at).toLocaleDateString('zh-TW')}</span><h2>${esc(x.title)}</h2><p>${esc(x.content)}</p></div>
      <div class="announcement-page-sparkle">✦</div>
    </article>`).join('')}</div>
  </section>`;
}
announcementsPageInit();

function renderTalentAnnouncements(rows){
  return `<section class="talent-announcements">
    <div class="admin-section-title"><div><p class="eyebrow">ANNOUNCEMENTS ✦</p><h2>公關公告</h2></div></div>
    <div class="talent-announcement-list">${rows.length
      ? rows.map(x=>`<article class="talent-notice"><div><span>${new Date(x.created_at).toLocaleDateString('zh-TW')}</span><strong>${esc(x.title)}</strong></div><p>${esc(x.content)}</p></article>`).join('')
      : '<div class="talent-notice empty-notice"><p>目前沒有公告。</p></div>'}</div>
  </section>`;
}
async function loadTalentAnnouncementTicker(){
  const track=el('tickerTrack');if(!track)return;
  const {data,error}=await sb.from('announcements').select('*').eq('is_active',true).order('created_at',{ascending:false}).limit(10);
  if(error||!data?.length){
    const ticker=el('memberAnnouncementTicker');
    if(ticker)ticker.style.display='none';
    return;
  }
  track.innerHTML=(data||[]).map((x,i)=>`<span class="ticker-item"><b>${esc(x.title)}</b>${x.content?`<em>${esc(x.content)}</em>`:''}</span>${i<data.length-1?'<i>◇</i>':''}`).join('');
}


function talentAvatarMarkup(t,cls='',portrait=false){
  const name=esc(t?.nickname||'?');
  const initial=esc((t?.nickname||'?').slice(0,1));
  const src=portrait?(t?.avatar_portrait_url||t?.avatar_url):t?.avatar_url;
  return src
    ? `<span class="talent-avatar ${cls}"><img src="${esc(src)}" alt="${name} 大頭貼" loading="lazy"></span>`
    : `<span class="talent-avatar talent-avatar-fallback ${cls}"><b>${initial}</b></span>`;
}


let pendingAvatarCrops=null;

function loadImageFile(file){
  return new Promise((resolve,reject)=>{
    const url=URL.createObjectURL(file),img=new Image();
    img.onload=()=>{URL.revokeObjectURL(url);resolve(img)};
    img.onerror=()=>{URL.revokeObjectURL(url);reject(new Error('圖片讀取失敗。'))};
    img.src=url;
  });
}

function cropSourceRect(img,aspect,zoom,cx,cy){
  let sw=img.naturalWidth,sh=sw/aspect;
  if(sh>img.naturalHeight){sh=img.naturalHeight;sw=sh*aspect}
  sw/=zoom;sh/=zoom;
  const maxX=Math.max(0,img.naturalWidth-sw),maxY=Math.max(0,img.naturalHeight-sh);
  const sx=Math.max(0,Math.min(maxX,(cx+1)/2*maxX));
  const sy=Math.max(0,Math.min(maxY,(cy+1)/2*maxY));
  return {sx,sy,sw,sh};
}

function drawAvatarCrop(canvas,img,aspect,state){
  const r=cropSourceRect(img,aspect,state.zoom,state.cx,state.cy);
  const ctx=canvas.getContext('2d');
  ctx.clearRect(0,0,canvas.width,canvas.height);
  ctx.drawImage(img,r.sx,r.sy,r.sw,r.sh,0,0,canvas.width,canvas.height);
}

function canvasBlob(canvas){
  return new Promise((resolve,reject)=>canvas.toBlob(b=>b?resolve(b):reject(new Error('圖片處理失敗。')),'image/webp',.9));
}

async function openAvatarCropper(file){
  if(!file)return null;
  if(!['image/jpeg','image/png','image/webp'].includes(file.type))throw new Error('只支援 JPG、PNG、WEBP 圖片。');
  if(file.size>10*1024*1024)throw new Error('圖片請勿超過 10MB。');
  const img=await loadImageFile(file);
  const state={zoom:1,cx:0,cy:0};
  const modal=document.createElement('div');
  modal.className='avatar-crop-modal';
  modal.innerHTML=`
    <div class="avatar-crop-dialog">
      <div class="avatar-crop-head"><div><p class="eyebrow">PHOTO CROP ✦</p><h3>調整大頭貼</h3><p>拖曳照片調整位置，縮放到自己喜歡的構圖。</p></div><button type="button" class="crop-close">×</button></div>
      <div class="avatar-crop-stage">
        <div class="crop-main"><span>主要照片 · 3:4</span><canvas width="600" height="800"></canvas><small>公關專區／公關管理／履歷</small></div>
        <div class="crop-side"><span>穩定度預覽 · 3:4</span><canvas width="600" height="800"></canvas><small>需要留意的報班穩定度</small></div>
      </div>
      <div class="avatar-crop-controls">
        <label>縮放 <input class="crop-zoom" type="range" min="1" max="3" step=".02" value="1"></label>
        <div class="crop-hint">直接在左邊照片上拖曳位置</div>
      </div>
      <div class="avatar-crop-actions"><button type="button" class="btn btn-outline crop-cancel">取消</button><button type="button" class="btn btn-primary crop-apply">使用這個裁切</button></div>
    </div>`;
  document.body.appendChild(modal);
  const main=modal.querySelector('.crop-main canvas'),side=modal.querySelector('.crop-side canvas');
  const redraw=()=>{drawAvatarCrop(main,img,3/4,state);drawAvatarCrop(side,img,3/4,state)};
  redraw();
  modal.querySelector('.crop-zoom').oninput=e=>{state.zoom=Number(e.target.value);redraw()};

  let dragging=false,lastX=0,lastY=0;
  const move=e=>{
    if(!dragging)return;
    const rect=main.getBoundingClientRect();
    const dx=(e.clientX-lastX)/rect.width*2,dy=(e.clientY-lastY)/rect.height*2;
    state.cx=Math.max(-1,Math.min(1,state.cx-dx));
    state.cy=Math.max(-1,Math.min(1,state.cy-dy));
    lastX=e.clientX;lastY=e.clientY;redraw();
  };
  main.onpointerdown=e=>{dragging=true;lastX=e.clientX;lastY=e.clientY;main.setPointerCapture(e.pointerId)};
  main.onpointermove=move;
  main.onpointerup=()=>dragging=false;
  main.onpointercancel=()=>dragging=false;

  return await new Promise(resolve=>{
    const close=()=>{modal.remove();resolve(null)};
    modal.querySelector('.crop-close').onclick=close;
    modal.querySelector('.crop-cancel').onclick=close;
    modal.querySelector('.crop-apply').onclick=async()=>{
      const mainBlob=await canvasBlob(main),portraitBlob=await canvasBlob(side);
      const result={
        main:new File([mainBlob],'avatar.webp',{type:'image/webp'}),
        portrait:new File([portraitBlob],'avatar-portrait.webp',{type:'image/webp'}),
        preview:URL.createObjectURL(mainBlob)
      };
      modal.remove();resolve(result);
    };
  });
}

async function uploadTalentAvatarCrops(p,crops){
  const stamp=Date.now();
  const mainPath=`${p.user_id}/avatar.webp`;
  const portraitPath=`${p.user_id}/avatar-portrait.webp`;
  const [mainUp,portraitUp]=await Promise.all([
    sb.storage.from('talent-avatars').upload(mainPath,crops.main,{cacheControl:'3600',upsert:true,contentType:'image/webp'}),
    sb.storage.from('talent-avatars').upload(portraitPath,crops.portrait,{cacheControl:'3600',upsert:true,contentType:'image/webp'})
  ]);
  if(mainUp.error)throw mainUp.error;
  if(portraitUp.error)throw portraitUp.error;
  const mainUrl=sb.storage.from('talent-avatars').getPublicUrl(mainPath).data.publicUrl;
  const portraitUrl=sb.storage.from('talent-avatars').getPublicUrl(portraitPath).data.publicUrl;
  return {avatar_url:`${mainUrl}?v=${stamp}`,avatar_portrait_url:`${portraitUrl}?v=${stamp}`};
}

function ageFromBirthday(birthday){
  if(!birthday)return '—';
  const b=new Date(birthday+'T12:00:00'),n=new Date();
  let age=n.getFullYear()-b.getFullYear();
  const m=n.getMonth()-b.getMonth();
  if(m<0||(m===0&&n.getDate()<b.getDate()))age--;
  return age>=0?age:'—';
}
function profileEditor(p,email){
  return `<section class="profile-editor">
    <div class="profile-header">
      <div>
        <p class="eyebrow">MY PROFILE</p>
        <h2>我的資料</h2>
        <p>把自己的基本資料整理好，之後報班與經紀聯絡會更方便。</p>
      </div>
    </div>

    <form id="profileForm" class="profile-form">
      <div class="profile-section profile-avatar-section">
        <div class="profile-avatar-copy">
          <p class="eyebrow">PROFILE PHOTO ✦</p>
          <h3>我的大頭貼</h3>
          <p>建議使用清楚、正面、光線自然的照片。經紀後台會以履歷卡片方式顯示。</p>
        </div>
        <div class="profile-avatar-editor">
          <div class="profile-avatar-main">
            <span class="profile-avatar-ratio">3:4</span>
            <span class="profile-avatar-preview" id="profileAvatarPreview">${p.avatar_url?`<img src="${esc(p.avatar_url)}" alt="我的大頭貼">`:`<span>${esc((p.nickname||'?').slice(0,1))}</span>`}</span>
          </div>
          <div class="profile-avatar-tools">
            <strong>上傳與裁切照片</strong>
            <ul><li>建議使用正面、清楚、光線自然的直式照片</li><li>支援 JPG / PNG / WEBP</li><li>選擇後可拖曳位置與縮放</li></ul>
            <label class="profile-avatar-upload">選擇照片<input id="profileAvatarInput" type="file" accept="image/jpeg,image/png,image/webp" hidden></label>
            <small>裁切完成後，按下方「儲存修改」才會正式更新。</small>
          </div>
          <div class="profile-avatar-mini-preview">
            <div class="profile-preview-label"><b>預覽效果</b><small>系統內顯示</small></div>
            <span class="profile-preview-frame">${p.avatar_url?`<img src="${esc(p.avatar_url)}" alt="我的大頭貼">`:`<span>${esc((p.nickname||'?').slice(0,1))}</span>`}</span>
          </div>
        </div>
      </div>
      <div class="profile-section">
        <div class="profile-photo-quicksave"><div><small>PROFILE PHOTO</small><strong>照片調整好了嗎？</strong><span>直接在這裡儲存，不用再滑到最下面。</span></div><button type="button" id="profilePhotoQuickSave">儲存照片 <i>✓</i></button></div><h3>基本資料</h3>
        <div class="profile-grid">
          <label>姓名<input name="name" maxlength="40" value="${esc(p.name||'')}" placeholder="請輸入姓名"></label>
          <label>暱稱<input name="nickname" maxlength="40" required value="${esc(p.nickname||'')}" placeholder="平常使用的暱稱"></label>
          <label class="profile-birthday-field">
            <span class="profile-field-title">生日</span>
            <div class="profile-date-shell">
              <input type="date" name="birthday" value="${esc(p.birthday||'')}" aria-label="生日">
            </div>
            <small class="profile-date-hint">點擊可選擇日期</small>
          </label>
          <label>年齡<input value="${esc(ageFromBirthday(p.birthday))}" readonly class="readonly"></label>
          <label>性別<select name="gender"><option value="">請選擇</option>${['女性','男性','其他','不透露'].map(v=>`<option ${p.gender===v?'selected':''}>${v}</option>`).join('')}</select></label>
          <label>居住地區<input name="area" maxlength="40" value="${esc(p.area||'')}" placeholder="例如：台北、新北"></label>
        </div>
      </div>

      <div class="profile-section">
        <h3>聯絡方式</h3>
        <div class="profile-grid">
          <label>手機／LINE<input name="contact" maxlength="80" value="${esc(p.contact||'')}" placeholder="手機號碼或 LINE ID"></label>
          <label>Instagram<input name="instagram" maxlength="100" value="${esc(p.instagram||'')}" placeholder="例如：@yourname"></label>
          <label>使用者帳號<input name="username" maxlength="20" value="${esc(p.username||'')}" placeholder="例如：nana88"></label>
          <label class="profile-wide">Email<input value="${esc(email)}" readonly class="readonly"></label>
          <small class="profile-wide username-note">使用者帳號可用來登入，3–20 位英文小寫、數字、. 或 _；Email 仍然可以登入。</small>
        </div>
      </div>

      <div class="profile-section profile-bank-section">
        <div class="profile-bank-heading">
          <div><p class="eyebrow">PAYMENT ACCOUNT ◇</p><h3>薪資匯款帳號</h3></div>
          <small>請確認資料正確，避免薪資匯款錯誤。</small>
        </div>
        <div class="bank-account-fields">
          <label class="bank-code-field">
            <span>銀行代碼（三碼）</span>
            <input name="bank_code" inputmode="numeric" pattern="[0-9]{3}" maxlength="3" value="${esc(p.bank_code||'')}" placeholder="例如 822" autocomplete="off">
          </label>
          <span class="bank-account-divider">—</span>
          <label class="bank-number-field">
            <span>銀行帳號</span>
            <input name="bank_account" inputmode="numeric" pattern="[0-9]*" maxlength="30" value="${esc(p.bank_account||'')}" placeholder="請輸入銀行帳號" autocomplete="off">
          </label>
        </div>
        <p class="bank-account-hint">銀行代碼請填 3 位數字；帳號請依存摺／銀行 APP 顯示完整輸入。</p>
      </div>

      <div class="profile-section">
        <h3>個人資訊</h3>
        <div class="profile-grid">
          <label>身高（cm）<input type="number" name="height_cm" min="120" max="220" value="${esc(p.height_cm||'')}" placeholder="例如：165"></label>
          <label>體重（kg）<input type="number" step="0.1" name="weight_kg" min="30" max="200" value="${esc(p.weight_kg||'')}" placeholder="例如：48"></label>
          <label>血型<select name="blood_type"><option value="">請選擇</option>${['A','B','AB','O','不清楚','不透露'].map(v=>`<option ${p.blood_type===v?'selected':''}>${v}</option>`).join('')}</select></label>
        </div>
      </div>

      <div class="profile-section">
        <h3>緊急聯絡</h3>
        <div class="profile-grid">
          <label>緊急聯絡人<input name="emergency_contact" maxlength="80" value="${esc(p.emergency_contact||'')}" placeholder="姓名或稱呼"></label>
          <label>緊急聯絡電話<input name="emergency_phone" maxlength="40" value="${esc(p.emergency_phone||'')}" placeholder="電話號碼"></label>
        </div>
      </div>

      <div class="profile-save-area">
        <button class="btn btn-primary" id="prepareSaveProfile" type="button">儲存修改</button>
        <button class="btn btn-confirm" id="confirmSaveProfile" type="submit" style="display:none">確認修改</button>
        <button class="btn btn-outline" id="cancelSaveProfile" type="button" style="display:none">取消</button>
        <p id="profileStatus" class="form-status"></p>
      </div>
    </form>
  </section>`;
}
function bindProfileEditor(p){
  const form=el('profileForm');if(!form)return;
  const prepare=el('prepareSaveProfile'),confirmBtn=el('confirmSaveProfile'),cancelBtn=el('cancelSaveProfile');
  const avatarInput=el('profileAvatarInput'),avatarPreview=el('profileAvatarPreview');
  if(avatarInput&&avatarPreview){
    avatarInput.onchange=async()=>{
      const f=avatarInput.files?.[0];if(!f)return;
      try{
        const crops=await openAvatarCropper(f);
        if(!crops){avatarInput.value='';return}
        if(pendingAvatarCrops?.preview)URL.revokeObjectURL(pendingAvatarCrops.preview);
        pendingAvatarCrops=crops;
        avatarPreview.innerHTML=`<img src="${crops.preview}" alt="裁切後大頭貼預覽">`;
        const miniPreview=document.querySelector('.profile-preview-frame');
        if(miniPreview)miniPreview.innerHTML=`<img src="${crops.preview}" alt="裁切後預覽">`;
        text('profileStatus','照片已裁切完成，按「儲存修改」後才會正式更新。');
      }catch(err){
        console.error(err);avatarInput.value='';
        text('profileStatus','❌ '+(err?.message||'照片處理失敗'));
      }
    };
  }

  prepare.onclick=()=>{
    text('profileStatus','請確認資料內容，確定後按「確認修改」。');
    prepare.style.display='none';
    confirmBtn.style.display='inline-flex';
    cancelBtn.style.display='inline-flex';
  };

  cancelBtn.onclick=()=>{
    text('profileStatus','');
    prepare.style.display='inline-flex';
    confirmBtn.style.display='none';
    cancelBtn.style.display='none';
  };

  form.onsubmit=async e=>{
    e.preventDefault();
    confirmBtn.disabled=true;
    cancelBtn.disabled=true;
    text('profileStatus','儲存中…');

    const x=Object.fromEntries(new FormData(form));
    const payload={
      name:x.name||null,
      nickname:x.nickname,
      birthday:x.birthday||null,
      gender:x.gender||null,
      area:x.area||null,
      contact:x.contact||null,
      instagram:x.instagram||null,
      username:x.username?String(x.username).trim().toLowerCase():null,
      bank_code:x.bank_code?String(x.bank_code).replace(/\D/g,'').slice(0,3):null,
      bank_account:x.bank_account?String(x.bank_account).replace(/\D/g,''):null,
      height_cm:x.height_cm?Number(x.height_cm):null,
      weight_kg:x.weight_kg?Number(x.weight_kg):null,
      blood_type:x.blood_type||null,
      emergency_contact:x.emergency_contact||null,
      emergency_phone:x.emergency_phone||null,
      profile_updated_at:new Date().toISOString()
    };

    try{
      if(payload.username&&!validTalentUsername(payload.username))throw new Error('使用者帳號需為 3–20 位英文小寫、數字、. 或 _');
      if(payload.bank_code&&!/^\d{3}$/.test(payload.bank_code))throw new Error('銀行代碼請輸入完整 3 碼數字');
      if(payload.bank_account&&!/^\d+$/.test(payload.bank_account))throw new Error('銀行帳號只能輸入數字');
      if(pendingAvatarCrops){
        text('profileStatus','正在上傳裁切後的大頭貼…');
        Object.assign(payload,await uploadTalentAvatarCrops(p,pendingAvatarCrops));
      }
    }catch(err){
      console.error(err);
      text('profileStatus','❌ 大頭貼上傳失敗：'+(err?.message||'請稍後再試'));
      confirmBtn.disabled=false;
      cancelBtn.disabled=false;
      return;
    }

    const {error}=await sb.from('talents').update(payload).eq('id',p.id);
    if(error){
      console.error(error);
      text('profileStatus',error.code==='23505'?'❌ 這個使用者帳號已有人使用，請換一個。':'❌ 儲存失敗，請稍後再試。');
      confirmBtn.disabled=false;
      cancelBtn.disabled=false;
      return;
    }

    text('profileStatus','✅ 個人資料已更新。');
    setTimeout(()=>location.reload(),800);
  };
}

function bookingComposer(p,venues,pastRows=[]){
  const lastVenue=pastRows.slice().reverse().find(x=>x.venue&&!['cancelled','rejected'].includes(x.status))?.venue||'';
  const venueNames=venues.map(v=>v.name);
  const alreadyBooked=new Set(pastRows.filter(x=>['pending','confirmed','leave'].includes(x.status)).map(x=>x.booking_date));
  const now=new Date();
  now.setHours(12,0,0,0);
  const day=now.getDay(); // 0日 1一 ... 5五 6六

  // 週一～週四：整個「本週一～週日」都可選，包含已經過去的日期。
  // 這是為了新加入／新上線的公關可以補登本週較早日期的班。
  // 週五～週日：維持原規則，自動切換成「下週一～週日」。
  let monday=new Date(now);
  const diffToThisMonday=(day===0?-6:1-day);
  monday.setDate(now.getDate()+diffToThisMonday);

  const showingNextWeek=day>=5 || day===0;
  if(showingNextWeek) monday.setDate(monday.getDate()+7);

  const dates=Array.from({length:7},(_,i)=>{
    const d=new Date(monday); d.setDate(monday.getDate()+i);
    return {
      iso:d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0'),
      date:d
    };
  });

  const weekNames=['週日','週一','週二','週三','週四','週五','週六'];
  const title=showingNextWeek?'下週報班':'本週報班';
  const range=showingNextWeek?'下週一 ～ 下週日':'本週一 ～ 本週日';

  return `<section class="booking-composer">
    <div class="admin-section-title">
      <div><p class="eyebrow">WEEKLY BOOKING ✦</p><h2>${title}</h2></div>
      <span>${range}</span>
    </div>
    <div class="weekly-booking-notice is-open">
      ① 點選要上班的日子　② 確認店家　③ 送出，就完成了 ♡
    </div>
    <form id="multiBookingForm">
      <div class="date-grid weekly-date-grid">${dates.map(x=>{const done=alreadyBooked.has(x.iso);return `<label class="date-chip ${done?'disabled is-booked':''}">
        <input type="checkbox" name="dates" value="${x.iso}" ${done?'disabled':''}>
        <span><b>${weekNames[x.date.getDay()]}</b><small>${done?'已報班 ✓':`${x.date.getMonth()+1}/${x.date.getDate()}`}</small></span>
      </label>`}).join('')}</div>
      <div class="booking-quick-row"><button type="button" class="mini-btn pick-all-days">全選可報的日子</button><button type="button" class="mini-btn clear-days">清除</button></div>
      <div class="booking-fields booking-fields-simple">
        <label>店家<select name="venue" required><option value="">請選擇</option>${venueNames.map(n=>`<option ${n===lastVenue?'selected':''}>${esc(n)}</option>`).join('')}<option ${lastVenue&&!venueNames.includes(lastVenue)?'selected':''}>其他</option></select></label>
      </div>
      <label>備註<textarea name="note" maxlength="500" placeholder="選填，例如：會晚一點到"></textarea></label>
      <button class="btn btn-primary" type="submit">送出${showingNextWeek?'下週':'本週'}班表</button>
      <p id="multiBookingStatus" class="form-status"></p>
    </form>
  </section>`;
}
function bindBookingComposer(p){
  const form=el('multiBookingForm');if(!form)return;
  const boxes=()=>[...form.querySelectorAll('input[name=dates]:not(:disabled)')];
  const updateBtn=()=>{const n=boxes().filter(x=>x.checked).length,b=form.querySelector('button[type=submit]');if(b)b.textContent=n?`送出 ${n} 天班表`:'請先點選日子'};
  form.querySelector('.pick-all-days')?.addEventListener('click',()=>{boxes().forEach(x=>x.checked=true);updateBtn()});
  form.querySelector('.clear-days')?.addEventListener('click',()=>{boxes().forEach(x=>x.checked=false);updateBtn()});
  form.addEventListener('change',e=>{if(e.target.name==='dates')updateBtn()});
  updateBtn();
  form.onsubmit=async e=>{
    e.preventDefault();const f=e.currentTarget,b=f.querySelector('button[type=submit]');const dates=[...f.querySelectorAll('input[name=dates]:checked')].map(x=>x.value);
    if(!dates.length){text('multiBookingStatus','⚠️ 請至少選擇一天。');return}
    b.disabled=true;text('multiBookingStatus',`檢查 ${dates.length} 天班表中…`);
    const x=Object.fromEntries(new FormData(f));
    const {data:existing,error:checkError}=await sb.from('bookings').select('booking_date,status').eq('talent_id',p.id).in('booking_date',dates).in('status',['pending','confirmed','leave']);
    if(checkError){console.error(checkError);text('multiBookingStatus','❌ 無法檢查既有班表，請重新整理後再試。');b.disabled=false;return}
    const existed=new Set((existing||[]).map(v=>v.booking_date));
    const newDates=dates.filter(d=>!existed.has(d));
    if(!newDates.length){text('multiBookingStatus','⚠️ 選擇的日期都已經有班表或請假紀錄，沒有重複送出。');b.disabled=false;return}
    const rows=newDates.map(d=>({user_id:p.user_id,talent_id:p.id,nickname:p.nickname,contact:p.contact||'',booking_date:d,venue:x.venue,start_time:'22:00',note:x.note||null,status:'pending'}));
    const {error}=await sb.from('bookings').insert(rows);
    if(error){console.error(error);text('multiBookingStatus','❌ 送出失敗，請重新整理後再試。');b.disabled=false;return}
    const skipped=dates.length-newDates.length;
    text('multiBookingStatus',`✅ 已送出 ${newDates.length} 天班表${skipped?`，另有 ${skipped} 天已有紀錄所以未重複送出`:''}，等待經紀確認。`);setTimeout(()=>location.reload(),1000);
  };
}
function renderMyBookings(rows){
  if(!rows.length)return '<div class="member-empty-state"><span>◇</span><strong>目前沒有班表</strong><p>完成報班後，班表與經紀確認狀態會顯示在這裡。</p></div>';
  const weekday=['日','一','二','三','四','五','六'];
  return rows.map(x=>{
    const d=new Date(x.booking_date+'T12:00:00');
    const md=`${d.getMonth()+1}/${d.getDate()}`;
    const wd=`週${weekday[d.getDay()]}`;
    return `<article class="my-booking-row member-shift-card">
      <div class="member-shift-date"><strong>${md}</strong><small>${wd}</small></div>
      <div class="member-shift-info">
        <strong class="member-shift-venue">${esc(x.venue)}</strong>
        ${x.note?`<small>${esc(x.note)}</small>`:''}
        ${x.status==='leave'&&x.leave_type?`<small>請假：${esc(x.leave_type)}</small>`:''}
      </div>
      <div class="my-booking-side">
        <span class="booking-badge ${esc(x.status)}">${esc(statusText[x.status]||x.status)}</span>
        ${['pending','confirmed'].includes(x.status)?`<button class="cancel-booking" data-id="${x.id}">取消</button>`:''}
      </div>
    </article>`;
  }).join('');
}
function bindCancelButtons(){
  document.querySelectorAll('.cancel-booking').forEach(b=>b.onclick=async()=>{
    if(!confirm('確定要取消這一天的報班嗎？'))return;
    b.disabled=true;const {error}=await sb.from('bookings').update({status:'cancelled'}).eq('id',b.dataset.id);
    if(error){alert('取消失敗');b.disabled=false}else location.reload();
  });
}

// ---------- Admin ----------
let S={bookings:[],applications:[],talents:[],venues:[],announcements:[],weeklySections:[]};
async function adminInit(){
 if(!el('adminApp'))return;
 const {data:{session}}=await sb.auth.getSession();
 if(!session){renderAdminLogin();return}
 const {data:m}=await sb.from('admin_users').select('user_id').eq('user_id',session.user.id).maybeSingle();
 if(!m){await sb.auth.signOut();renderAdminLogin('這個帳號沒有管理員權限。');return}
 renderAdminShell(session.user.email);await refreshAdmin();
}
adminInit();
function renderAdminLogin(msg=''){
 document.body.classList.add('admin-login-mode','auth-daylight');
 el('adminApp').classList.add('admin-login-root');
 el('adminApp').innerHTML=`
 <div class="daylight-auth is-admin">
   <div class="dl-brand"><span class="dl-mark"><img src="assets/lindao-emblem-transparent.png" alt=""></span><span><strong>林刀娛樂</strong><small>MANAGEMENT CONSOLE</small></span></div>
   <div class="dl-intro"><p class="dl-hello">經紀專用</p><h1>登入經紀管理中心</h1><p>班務、公關資料與營運資訊，都受權限保護。</p></div>
   <form id="loginForm" class="dl-card">
     <label>Email<input type="email" name="email" required autocomplete="username" placeholder="管理員 Email"></label>
     <label>密碼<input type="password" name="password" required autocomplete="current-password" placeholder="輸入密碼"></label>
     <button class="dl-submit" type="submit">登入</button>
     <p id="loginStatus" class="form-status">${esc(msg)}</p>
   </form>
   <p class="dl-foot">專業．誠信．安全．隱私</p>
 </div>`;
 el('loginForm').onsubmit=async e=>{
   e.preventDefault();
   const x=Object.fromEntries(new FormData(e.currentTarget));
   text('loginStatus','登入中…');
   const {error}=await sb.auth.signInWithPassword({email:x.email,password:x.password});
   error?text('loginStatus','❌ 登入失敗，請確認帳號密碼。'):location.reload();
 };
}
function renderAdminShell(email){
 document.body.classList.remove('admin-login-mode','auth-daylight');
 el('adminApp')?.classList.remove('admin-login-root');
 const nav=[
   ['dashboard','總覽','OVERVIEW','⌂'],
   ['schedule','班務中心','SCHEDULE CENTER','▦'],
   ['talents','公關管理','TALENT MANAGEMENT','♢'],
   ['applications','新人申請','APPLICATIONS','✦'],
   ['operations','綜合管理','OPERATIONS','◇']
 ];
 el('adminApp').innerHTML=`
 <div class="admin96-console">
   <aside class="admin96-sidebar">
     <div class="admin96-logo">
       <img src="assets/lindao-emblem-transparent.png" alt="">
       <div><strong>林刀娛樂</strong><small>ENTERTAINMENT</small></div>
     </div>
     <nav class="admin96-nav">
       ${nav.map((x,i)=>`<button data-tab="${x[0]}" class="tab ${i?'':'active'}"><i>${x[3]}</i><span><strong>${x[1]}</strong><small>${x[2]}</small></span><b>›</b></button>`).join('')}
     </nav>
     <div class="admin96-brand-card"><div>◆</div><strong>專業 · 誠信 · 安全 · 隱私</strong><small>PROFESSIONAL / TRUST / SAFETY<br>PRIVACY PROTECTION</small></div>
   </aside>

   <main class="admin96-main">
     <header class="admin96-topbar">
       <div class="admin96-title"><span class="admin96-menu">☰</span><div><h1>經紀管理中心</h1><small>MANAGEMENT CONSOLE</small></div></div>
       <div class="admin96-tools">
         <div class="admin96-date"><span>◷</span><b>${new Date().toLocaleDateString('zh-TW')}</b><small>${new Date().toLocaleDateString('zh-TW',{weekday:'short'})}</small></div>
         <a class="admin-preview-link" href="booking.html">👀 <span>看公關專區</span></a>
         <button id="refreshAll">⟳ <span>重新整理</span></button>
         <button id="logoutBtn">♙ <span>小刀 / 經紀</span></button>
       </div>
     </header>
     <div class="admin96-content">
       <section id="stats" class="admin96-stats"></section>
       <section id="panel" class="admin96-workspace"></section>
     </div>
   </main>
 </div>`;
 el('logoutBtn').onclick=async()=>{await sb.auth.signOut();location.reload()};
 el('refreshAll').onclick=refreshAdmin;
 document.querySelectorAll('.admin96-nav .tab').forEach(b=>b.onclick=()=>{
   document.querySelectorAll('.admin96-nav .tab').forEach(x=>x.classList.remove('active'));
   b.classList.add('active');
   renderAdminTab(b.dataset.tab);
 });
}
async function restoreExpiredPauses(){
 const today=isoDay();
 const expired=S.talents.filter(x=>x.status==='paused'&&x.paused_until&&x.paused_until<today);
 if(!expired.length)return false;
 for(const x of expired){
   await sb.from('talents').update({status:'active',paused_until:null}).eq('id',x.id);
 }
 return true;
}
async function refreshAdmin(){
 const [b,a,t,v,n,w]=await Promise.all([sb.from('bookings').select('*').order('booking_date'),sb.from('applications').select('*').order('created_at',{ascending:false}),sb.from('talents').select('*').order('created_at',{ascending:false}),sb.from('venues').select('*').order('name'),sb.from('announcements').select('*').order('created_at',{ascending:false}),sb.from('weekly_sections').select('*').order('week_start',{ascending:false})]);
 S={bookings:b.data||[],applications:a.data||[],talents:t.data||[],venues:v.data||[],announcements:n.data||[],weeklySections:w.data||[]};
 el('stats').innerHTML=`
 <div class="admin96-stat gold"><div><span>今日已確認</span><small>TODAY CONFIRMED</small><strong>${S.bookings.filter(x=>x.booking_date===isoDay()&&x.status==='confirmed').length}</strong></div><i>▣</i></div>
 <div class="admin96-stat rose"><div><span>待確認報班</span><small>PENDING SCHEDULE</small><strong>${S.bookings.filter(x=>x.status==='pending').length}</strong></div><i>⌛</i></div>
 <div class="admin96-stat violet"><div><span>待審核帳號</span><small>PENDING APPROVAL</small><strong>${S.talents.filter(x=>x.status==='new'&&x.user_id).length}</strong></div><i>♟</i></div>
 <div class="admin96-stat blue"><div><span>上卡中公關</span><small>ACTIVE TALENTS</small><strong>${S.talents.filter(x=>x.status==='active').length}</strong></div><i>✪</i></div>`;
 renderAdminTab(document.querySelector('.tab.active')?.dataset.tab||'dashboard');
}
function renderAdminTab(tab){
 const stats=el('stats'); if(stats)stats.style.display=tab==='dashboard'?'grid':'none';
 if(tab==='dashboard')return adminDashboard();
 if(tab==='schedule')return adminBookings('today');
 if(['today','week','nextweek','pendingall'].includes(tab))return adminBookings(tab);
 if(tab==='applications')return adminApplications();
 if(tab==='talents')return adminTalents();
 if(tab==='sections'||tab==='payroll')return adminDashboard();
 if(tab==='operations')return adminOperations();
 if(tab==='hotelcards')return adminHotelCards();
 if(tab==='venues')return adminVenues();
 if(tab==='announcements')return adminAnnouncements();
}

function openLeaveModal(bookingId){
  const row=S.bookings.find(x=>x.id===bookingId);if(!row)return;
  const host=el('leaveModalHost')||document.body;
  const types=['病假','事假','生理假','喪假','家庭因素','其他'];
  const modal=document.createElement('div');
  modal.className='leave-modal-backdrop';
  modal.innerHTML=`<div class="leave-modal">
    <div class="leave-modal-head"><div><p class="eyebrow">LEAVE</p><h3>${esc(row.nickname)}｜${esc(row.booking_date)}</h3></div><button class="leave-close" type="button">×</button></div>
    <form id="leaveForm">
      <label>假別<select name="leave_type" required><option value="">請選擇假別</option>${types.map(v=>`<option value="${v}" ${row.leave_type===v?'selected':''}>${v}</option>`).join('')}</select></label>
      <label>請假原因／備註<textarea name="leave_note" maxlength="300" placeholder="例如：發燒、家中臨時有事">${esc(row.leave_note||'')}</textarea></label>
      <div class="leave-modal-actions"><button class="btn btn-primary" type="submit">確認請假</button><button class="btn btn-outline leave-cancel" type="button">取消</button></div>
      <p id="leaveStatus" class="form-status"></p>
    </form>
  </div>`;
  host.appendChild(modal);
  const close=()=>modal.remove();
  modal.querySelector('.leave-close').onclick=close;
  modal.querySelector('.leave-cancel').onclick=close;
  modal.onclick=e=>{if(e.target===modal)close()};
  modal.querySelector('#leaveForm').onsubmit=async e=>{
    e.preventDefault();
    const f=e.currentTarget,b=f.querySelector('button[type=submit]');
    const x=Object.fromEntries(new FormData(f));
    b.disabled=true;
    text('leaveStatus','儲存中…');
    const {error}=await sb.from('bookings').update({
      status:'leave',
      leave_type:x.leave_type,
      leave_note:x.leave_note||null,
      leave_at:new Date().toISOString(),
      leave_timing:(()=>{
        const shiftAt=new Date(row.booking_date+'T'+(row.start_time||'00:00:00')+'+08:00');
        const diff=shiftAt.getTime()-Date.now();
        return diff<=24*60*60*1000?'臨時請假':'一般請假';
      })()
    }).eq('id',bookingId);
    if(error){console.error(error);text('leaveStatus','❌ 請假登記失敗');b.disabled=false;return}
    close();
    await refreshAdmin();
    if(window.__afterLeave){const f=window.__afterLeave;window.__afterLeave=null;f()}
    else if(window.__adminBookingsTab)adminBookings(window.__adminBookingsTab);
  };
}
function talentBookingRows(talent){
  return S.bookings.filter(x=>x.talent_id===talent.id || (talent.user_id&&x.user_id===talent.user_id));
}
function monthKey(dateStr){return String(dateStr||'').slice(0,7)}
function monthLabel(key){const [y,m]=key.split('-');return `${y}/${Number(m)}月`}
function calcTalentMonthlyAttendance(talent, key){
  const today=isoDay();
  const rows=talentBookingRows(talent).filter(x=>monthKey(x.booking_date)===key && x.booking_date<=today && ['confirmed','leave'].includes(x.status));
  const leaveRows=rows.filter(x=>x.status==='leave');
  const byDay=new Map();
  rows.forEach(x=>{const day=byDay.get(x.booking_date)||{confirmed:false,leave:false};day.confirmed ||= x.status==='confirmed';day.leave ||= x.status==='leave';byDay.set(x.booking_date,day)});
  const days=[...byDay.values()];
  const absent=days.filter(x=>x.leave).length;
  const attended=days.filter(x=>!x.leave&&x.confirmed).length;
  const scheduled=attended+absent;
  const rate=scheduled?Math.round(attended/scheduled*1000)/10:0;
  const counts={}; leaveRows.forEach(x=>{const k=x.leave_type||'未分類';counts[k]=(counts[k]||0)+1});
  const sorted=Object.entries(counts).sort((a,b)=>b[1]-a[1]);
  return {key,rows,attended,leaveRows,scheduled,absent,rate,counts,top:sorted[0]||null};
}
function recentMonthKeys(count=12){
  const now=new Date(); const out=[];
  for(let i=count-1;i>=0;i--){const d=new Date(now.getFullYear(),now.getMonth()-i,1);out.push(`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`)}
  return out;
}
const ATTENDANCE_START_YEAR=2026;
function calcTalentYearlyAttendance(talent, year){
  const today=isoDay();
  const prefix=String(year)+'-';
  const rows=talentBookingRows(talent).filter(x=>String(x.booking_date||'').startsWith(prefix) && x.booking_date<=today && ['confirmed','leave'].includes(x.status));
  const leaveRows=rows.filter(x=>x.status==='leave');
  const byDay=new Map();
  rows.forEach(x=>{const day=byDay.get(x.booking_date)||{confirmed:false,leave:false};day.confirmed ||= x.status==='confirmed';day.leave ||= x.status==='leave';byDay.set(x.booking_date,day)});
  const days=[...byDay.values()];
  const absent=days.filter(x=>x.leave).length;
  const attended=days.filter(x=>!x.leave&&x.confirmed).length;
  const scheduled=attended+absent;
  const rate=scheduled?Math.round(attended/scheduled*1000)/10:0;
  return {year,rows,attended,leaveRows,scheduled,absent,rate};
}
function attendanceYearKeys(){
  const current=new Date().getFullYear();
  const out=[];
  for(let y=ATTENDANCE_START_YEAR;y<=current;y++)out.push(y);
  return out;
}
function attendanceYearTrendSvg(years){
  const valid=years.filter(x=>x.scheduled>0); if(!valid.length)return '<p class="empty">目前沒有年度出勤資料。</p>';
  const W=760,H=235,L=42,R=18,T=18,B=42,iw=W-L-R,ih=H-T-B;
  const pts=years.map((x,i)=>({x:L+(years.length===1?iw/2:i*iw/(years.length-1)),y:T+(100-x.rate)*ih/100,...x}));
  const path=pts.map((p,i)=>`${i?'L':'M'} ${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join(' ');
  const grids=[0,25,50,75,100].map(v=>{const y=T+(100-v)*ih/100;return `<line x1="${L}" y1="${y}" x2="${W-R}" y2="${y}"/><text x="${L-8}" y="${y+4}" text-anchor="end">${v}%</text>`}).join('');
  const dots=pts.map(p=>`<circle cx="${p.x}" cy="${p.y}" r="5"><title>${p.year} 年 ${p.scheduled?p.rate+'%':'無資料'}</title></circle><text class="month" x="${p.x}" y="${H-15}" text-anchor="middle">${p.year}</text>`).join('');
  return `<div class="attendance-chart-wrap"><svg class="attendance-chart" viewBox="0 0 ${W} ${H}" role="img" aria-label="年度出勤率趨勢圖"><g class="grid">${grids}</g><path class="trend" d="${path}"/>${dots}</svg></div>`;
}
function calcTalentAttendance(talent){
  const key=isoDay().slice(0,7), m=calcTalentMonthlyAttendance(talent,key);
  return {...m,rate:Math.round(m.rate)};
}
function attendanceTrendSvg(months){
  const valid=months.filter(x=>x.scheduled>0); if(!valid.length)return '<p class="empty">目前沒有足夠的月出勤資料。</p>';
  const W=760,H=250,L=42,R=18,T=18,B=42,iw=W-L-R,ih=H-T-B;
  const pts=months.map((x,i)=>({x:L+(months.length===1?iw/2:i*iw/(months.length-1)),y:T+(100-x.rate)*ih/100,...x}));
  const path=pts.map((p,i)=>`${i?'L':'M'} ${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join(' ');
  const grids=[0,25,50,75,100].map(v=>{const y=T+(100-v)*ih/100;return `<line x1="${L}" y1="${y}" x2="${W-R}" y2="${y}"/><text x="${L-8}" y="${y+4}" text-anchor="end">${v}%</text>`}).join('');
  const dots=pts.map((p,i)=>`<circle cx="${p.x}" cy="${p.y}" r="4"><title>${monthLabel(p.key)} ${p.scheduled?p.rate+'%':'無資料'}</title></circle>${(i%2===0||months.length<=6)?`<text class="month" x="${p.x}" y="${H-15}" text-anchor="middle">${monthLabel(p.key).replace(/^\d{4}\//,'')}</text>`:''}`).join('');
  return `<div class="attendance-chart-wrap"><svg class="attendance-chart" viewBox="0 0 ${W} ${H}" role="img" aria-label="每月出勤率趨勢圖"><g class="grid">${grids}</g><path class="trend" d="${path}"/>${dots}</svg></div>`;
}
function renderTalentAttendance(talentId, selectedYear){
  const t=S.talents.find(x=>x.id===talentId);if(!t)return;
  const currentYear=new Date().getFullYear();
  const year=Math.min(currentYear,Math.max(ATTENDANCE_START_YEAR,Number(selectedYear)||currentYear));
  const today=isoDay();
  const currentKey=today.slice(0,7);
  const yearMonths=[];
  for(let m=1;m<=12;m++){
    const key=`${year}-${String(m).padStart(2,'0')}`;
    const stat=calcTalentMonthlyAttendance(t,key);
    const monthEnd=new Date(year,m,0);
    const monthStart=new Date(year,m-1,1);
    const now=new Date();
    stat.isFuture=monthStart>new Date(now.getFullYear(),now.getMonth(),1);
    stat.isCurrent=key===currentKey;
    yearMonths.push(stat);
  }
  const yearStat=calcTalentYearlyAttendance(t,year);
  const leaveRows=yearStat.leaveRows.slice().sort((a,b)=>String(b.booking_date).localeCompare(String(a.booking_date)));
  const yearButtons=attendanceYearKeys().map(y=>`<button type="button" class="attendance-year-btn ${y===year?'active':''}" data-year="${y}">${y}</button>`).join('');
  const monthRows=yearMonths.map(m=>`<div class="${m.isFuture?'future':''}"><span>${monthLabel(m.key)}${m.isCurrent?'（進行中）':''}</span><span>${m.isFuture?'—':m.scheduled}</span><span>${m.isFuture?'—':m.attended}</span><span>${m.isFuture?'—':m.absent}</span><strong>${m.isFuture?'尚未到':m.scheduled?m.rate+'%':'—'}</strong></div>`).join('');
  el('panel').innerHTML=`<div class="admin-section-title"><div><button class="back-attendance">← 返回完整出勤分析</button><h2>${esc(t.nickname)}｜出勤／請假分析</h2><p class="panel-note">出勤率以自然月結算；所有請假一律計入缺勤。出勤率＝實際出勤 ÷ 應出勤 × 100%。</p></div></div>
  <section class="attendance-year-picker"><span>查看年度</span><div>${yearButtons}</div></section>
  <div class="attendance-stats">
    <div><span>${year} 年應出勤</span><strong>${yearStat.scheduled}</strong></div><div><span>${year} 年實際出勤</span><strong>${yearStat.attended}</strong></div><div><span>${year} 年缺勤／請假</span><strong>${yearStat.absent}</strong></div><div><span>${year} 年${year===currentYear?'目前':'結算'}出勤率</span><strong>${yearStat.scheduled?yearStat.rate+'%':'—'}</strong></div>
  </div>
  <section class="attendance-card"><h3>${year} 年每月出勤率</h3><p class="panel-note">直接查看 1～12 月每個月的出勤率；尚未到的月份不列入計算。</p><div class="attendance-month-table"><div class="head"><span>月份</span><span>應出勤</span><span>實際</span><span>缺勤</span><span>出勤率</span></div>${monthRows}</div></section>
  <section class="attendance-card"><h3>${year} 年請假紀錄與備註</h3>${leaveRows.length?`<div class="attendance-leave-table"><div class="head"><span>日期</span><span>假別</span><span>類型</span><span>請假備註</span></div>${leaveRows.map(x=>`<div><span>${esc(x.booking_date||'—')}</span><span>${esc(x.leave_type||'未分類')}</span><span>${esc(x.leave_timing||'未分類')}</span><span class="leave-note-cell">${esc(x.leave_note||'無備註')}</span></div>`).join('')}</div>`:'<p class="empty">這個年度沒有請假紀錄。</p>'}</section>`;
  document.querySelector('.back-attendance').onclick=()=>renderAllAttendanceAnalysis();
  document.querySelectorAll('.attendance-year-btn').forEach(b=>b.onclick=()=>renderTalentAttendance(talentId,Number(b.dataset.year)));
}
function renderAllAttendanceAnalysis(){
  const key=isoDay().slice(0,7);
  const rows=S.talents.filter(t=>['active','paused'].includes(t.status)).map(t=>({t,a:calcTalentMonthlyAttendance(t,key)})).sort((x,y)=>(x.a.scheduled?x.a.rate:101)-(y.a.scheduled?y.a.rate:101));
  const withData=rows.filter(x=>x.a.scheduled>0), avg=withData.length?Math.round(withData.reduce((n,x)=>n+x.a.rate,0)/withData.length*10)/10:0;
  el('panel').innerHTML=`<div class="admin-section-title"><div><button class="back-dashboard">← 返回總覽</button><h2>全體公關｜每月出勤分析</h2><p class="panel-note">正式出勤率以自然月結算；所有請假一律算缺勤。點選公關後可切換年度，直接查看該年 1～12 月出勤率、請假紀錄與備註；2026 年起的歷史年度會持續保留。</p></div></div>
  <div class="attendance-stats"><div><span>統計月份</span><strong>${monthLabel(key)}</strong></div><div><span>有出勤資料</span><strong>${withData.length}</strong></div><div><span>全體目前平均</span><strong>${withData.length?avg+'%':'—'}</strong></div><div><span>需留意（＜80%）</span><strong>${withData.filter(x=>x.a.rate<80).length}</strong></div></div>
  <section class="attendance-card"><h3>${monthLabel(key)} 全體出勤率</h3><div class="all-attendance-list">${rows.map(x=>`<button class="all-attendance-person" data-id="${x.t.id}">${talentAvatarMarkup(x.t,'stability-avatar',true)}<span class="copy"><b>${esc(x.t.nickname)}</b><small>應出勤 ${x.a.scheduled}｜實際 ${x.a.attended}｜缺勤 ${x.a.absent}</small></span><span class="bar"><i><em style="width:${x.a.scheduled?x.a.rate:0}%"></em></i></span><strong class="${x.a.scheduled?(x.a.rate<50?'bad':x.a.rate<80?'mid':'good'):''}">${x.a.scheduled?x.a.rate+'%':'—'}</strong></button>`).join('')||'<p class="empty">目前沒有公關資料。</p>'}</div></section>`;
  document.querySelector('.back-dashboard').onclick=()=>renderAdminTab('dashboard');
  document.querySelectorAll('.all-attendance-person').forEach(b=>b.onclick=()=>renderTalentAttendance(b.dataset.id));
}


function activateAdminGroup(group){
 document.querySelectorAll('.admin96-nav .tab').forEach(x=>x.classList.toggle('active',x.dataset.tab===group));
}
function scheduleCenterBar(active){
 return `<div class="admin-unified-head"><div><p class="eyebrow">SCHEDULE CENTER</p><h2>班務中心</h2><p>今日、本週、待確認與補登班表集中在同一個地方。</p></div><button class="btn btn-primary unified-manual-booking">＋ 補登班表</button></div>
 <div class="admin-segmented" role="tablist">
   <button data-schedule-view="today" class="${active==='today'?'active':''}">今日班表</button>
   <button data-schedule-view="week" class="${active==='week'?'active':''}">本週班表</button>
   <button data-schedule-view="nextweek" class="${active==='nextweek'?'active':''}">下週班表</button>
   <button data-schedule-view="pendingall" class="${active==='pendingall'?'active':''}">待確認</button>
 </div>`;
}
function bindScheduleCenterBar(){
 document.querySelectorAll('[data-schedule-view]').forEach(b=>b.onclick=()=>{activateAdminGroup('schedule');adminBookings(b.dataset.scheduleView)});
 document.querySelector('.unified-manual-booking')?.addEventListener('click',openManualBookingModal);
}
function adminOperations(){
 activateAdminGroup('operations');
 el('panel').innerHTML=`<div class="admin-unified-head"><div><p class="eyebrow">OPERATIONS</p><h2>綜合管理</h2><p>低頻率設定集中在這裡，讓左側選單只保留每天真正會用到的功能。</p></div></div>
 <div class="operations-hub">
  <button data-op="hotelcards"><i>⌁</i><span><strong>上下卡紀錄</strong><small>管理公關曾上卡店家與日期</small></span><b>進入 →</b></button>
  <button data-op="venues"><i>⌖</i><span><strong>店家管理</strong><small>管理可選擇的店家資料</small></span><b>進入 →</b></button>
  <button data-op="announcements"><i>◫</i><span><strong>公告管理</strong><small>發布與管理公關公告</small></span><b>進入 →</b></button>
  <button data-op="attendance"><i>◎</i><span><strong>出勤／請假分析</strong><small>查看全體公關每月出勤率、請假與歷史年度資料</small></span><b>進入 →</b></button>
 </div>`;
 document.querySelectorAll('[data-op]').forEach(b=>b.onclick=()=>{ if(b.dataset.op==='attendance') return renderAllAttendanceAnalysis(); renderAdminTab(b.dataset.op); });
}
function adminDashboard(){
 const today=isoDay();
 const todayRows=S.bookings.filter(x=>x.booking_date===today&&!['cancelled','rejected'].includes(x.status));
 const confirmed=todayRows.filter(x=>x.status==='confirmed');
 const leave=todayRows.filter(x=>x.status==='leave');
 const pending=S.bookings.filter(x=>x.status==='pending');
 const newApps=S.applications.filter(x=>x.status!=='contacted');
 const newTalents=S.talents.filter(x=>x.status==='new'&&x.user_id);
 const weekStart=mondayOf(today),weekEnd=addDaysIso(weekStart,6);
 const weekRows=S.bookings.filter(x=>x.booking_date>=weekStart&&x.booking_date<=weekEnd&&!['cancelled','rejected'].includes(x.status));
 const weekLeave=weekRows.filter(x=>x.status==='leave');
 const weekPending=weekRows.filter(x=>x.status==='pending');
 const weekManual=weekRows.filter(x=>String(x.note||'').includes('經紀補登'));
 const nextRows=confirmed.slice().sort((a,b)=>String(a.venue||'').localeCompare(String(b.venue||'')) || String(a.nickname||'').localeCompare(String(b.nickname||''))); 
 const todoCount=pending.length+newApps.length+newTalents.length;
 activateAdminGroup('dashboard');
 el('panel').innerHTML=`
 <div class="admin-home-head"><div><p class="eyebrow">TODAY AT A GLANCE</p><h2>今天需要處理的事</h2><p>首頁只保留今天與本週真正需要掌握的資訊；完整功能都集中到對應管理中心。</p></div></div>
 <div class="admin-clean-grid">
   <section class="admin96-card admin96-action-card admin-clean-priority">
    <div class="admin96-card-head"><h2>待辦事項</h2><small>${todoCount?'只顯示需要你處理的項目':'目前沒有待處理事項'}</small></div>
    ${todoCount?`<div class="admin96-action-items">
      ${pending.length?`<div class="dash-pending-row"><button class="dash-go" data-tab="pendingall"><i class="gold">▣</i><span><b>待確認班表</b><small>${pending.length} 筆待確認</small></span><strong>${pending.length}</strong><em>查看 →</em></button><button class="btn btn-primary confirm-every-pending" type="button">✓ 全部公關確認</button></div>`:''}
      ${newApps.length?`<button class="dash-go" data-tab="applications"><i class="rose">✦</i><span><b>新人申請</b><small>${newApps.length} 筆待處理</small></span><strong>${newApps.length}</strong><em>處理 →</em></button>`:''}
      ${newTalents.length?`<button class="dash-go" data-tab="talents"><i class="violet">♢</i><span><b>待經紀審核</b><small>${newTalents.length} 個帳號</small></span><strong>${newTalents.length}</strong><em>處理 →</em></button>`:''}
    </div>`:`<div class="dashboard-all-clear"><strong>✓ 今日待辦已清空</strong><span>目前沒有需要立即處理的項目。</span></div>`}
   </section>
   <section class="admin96-card admin-clean-today">
    <div class="admin96-card-head"><h2>今日班務</h2><button class="text-btn dash-go" data-tab="today">查看班務中心 →</button></div>
    <div class="admin96-ops">
      <div><span>今日班表</span><strong>${todayRows.length}</strong></div>
      <div><span>已確認</span><strong class="green">${confirmed.length}</strong></div>
      <div><span>待確認</span><strong class="amber">${todayRows.filter(x=>x.status==='pending').length}</strong></div>
      <div><span>請假</span><strong class="red">${leave.length}</strong></div>
    </div>
    ${nextRows.length?`<div class="dashboard-next"><small>今日上班</small>${nextRows.map(x=>`<span><strong>${esc(x.nickname)}</strong><em>${esc(x.venue||'未填店家')}</em></span>`).join('')}</div>`:'<div class="dashboard-next empty"><span>今天目前沒有已確認班表</span></div>'}
    ${leave.length?`<div class="admin-clean-leaves"><small>今日請假</small>${leave.map(x=>`<span><b>${esc(x.nickname)}</b> · ${esc(x.leave_type||'未分類')}${x.leave_note?` · ${esc(x.leave_note)}`:''}</span>`).join('')}</div>`:''}
   </section>
 </div>
 <section class="dashboard-week-strip">
   <div><small>本週概況</small><strong>${twDate(weekStart)} ～ ${twDate(weekEnd)}</strong></div>
   <span><b>${weekRows.length}</b> 報班人次</span><span><b>${weekLeave.length}</b> 請假</span><span><b>${weekPending.length}</b> 待確認</span><span><b>${weekManual.length}</b> 補登</span>
 </section>
 <section class="dashboard-quick-actions">
   <div><small>QUICK ACTIONS</small><h3>快速操作</h3></div>
   <button data-quick="manual">＋ 補登班表</button>
   <button data-quick="talent">＋ 新增公關</button>
   <a class="dash-quick-link" href="booking.html">👀 看公關專區</a>
 </section>`;
 document.querySelectorAll('.dash-go').forEach(b=>b.onclick=()=>{
   const tab=b.dataset.tab;
   if(['today','week','nextweek','pendingall'].includes(tab)){activateAdminGroup('schedule');adminBookings(tab);return;}
   const target=document.querySelector(`.admin96-nav .tab[data-tab="${tab}"]`);
   if(target)target.click(); else renderAdminTab(tab);
 });
 document.querySelector('[data-quick="manual"]')?.addEventListener('click',openManualBookingModal);
 document.querySelector('.confirm-every-pending')?.addEventListener('click',e=>confirmAllPending(e.currentTarget,()=>adminDashboard()));
 document.querySelector('[data-quick="talent"]')?.addEventListener('click',()=>{activateAdminGroup('talents');adminTalents();setTimeout(()=>el('addTalent')?.click(),0)});
}

function openManualBookingModal(){
  const host=document.body;
  const activeTalents=S.talents.filter(x=>x.status==='active');
  if(!activeTalents.length){
    alert('目前沒有「上卡中」的公關可以補登班表。');
    return;
  }
  const activeVenues=S.venues.filter(x=>x.is_active);
  const today=isoDay();
  const [ty,tm,td]=today.split('-').map(Number);
  const todayDate=new Date(Date.UTC(ty,tm-1,td));
  const dow=todayDate.getUTCDay();
  const mondayOffset=dow===0?-6:1-dow;
  const thisMonday=new Date(todayDate); thisMonday.setUTCDate(todayDate.getUTCDate()+mondayOffset);
  let weekOffset=0;
  const weekNames=['週一','週二','週三','週四','週五','週六','週日'];
  const isoUTC=d=>d.toISOString().slice(0,10);

  const modal=document.createElement('div');
  modal.className='leave-modal-backdrop';
  modal.innerHTML=`<div class="leave-modal manual-booking-modal">
    <div class="leave-modal-head">
      <div><p class="eyebrow">MANUAL BOOKING</p><h3>幫公關補登班表</h3><p class="panel-note">可一次複選星期一到星期日；選到的日期會使用相同店家與備註，並直接列為「已確認」。</p></div>
      <button class="leave-close" type="button">×</button>
    </div>
    <form id="manualBookingForm" novalidate>
      <label>公關
        <select name="talent_id" required>
          <option value="">請選擇公關</option>
          ${activeTalents.map(t=>`<option value="${t.id}">${esc(t.nickname)}</option>`).join('')}
        </select>
      </label>

      <div class="manual-week-picker">
        <div class="manual-week-toolbar">
          <button type="button" class="mini-btn manual-prev-week">← 上一週</button>
          <div class="manual-week-title"><strong>本週補登</strong><small id="manualWeekRange"></small></div>
          <div class="manual-week-actions">
            <button type="button" class="mini-btn manual-this-week">本週</button>
            <button type="button" class="mini-btn manual-next-week">下週 →</button>
          </div>
        </div>
        <div id="manualDateGrid" class="date-grid weekly-date-grid manual-date-grid" aria-label="複選補登日期"></div>
        <small class="panel-note">可複選多天。可切換上一週、本週或下週；下週日期也可以直接補登，方便提前安排。</small>
      </div>

      <label>店家
        <select name="venue" required>
          <option value="">請選擇店家</option>
          ${activeVenues.map(v=>`<option value="${esc(v.name)}">${esc(v.name)}</option>`).join('')}
          <option value="其他">其他</option>
        </select>
      </label>
      <label>備註
        <textarea name="note" maxlength="500" placeholder="例如：經紀補登｜實際有上班">經紀補登</textarea>
      </label>
      <div class="leave-modal-actions">
        <button class="btn btn-primary" type="submit">確認補登所選日期</button>
        <button class="btn btn-outline manual-booking-cancel" type="button">取消</button>
      </div>
      <p id="manualBookingStatus" class="form-status"></p>
    </form>
  </div>`;
  host.appendChild(modal);

  const close=()=>modal.remove();
  modal.querySelector('.leave-close').onclick=close;
  modal.querySelector('.manual-booking-cancel').onclick=close;
  modal.onclick=e=>{if(e.target===modal)close()};

  const renderWeek=()=>{
    const monday=new Date(thisMonday); monday.setUTCDate(thisMonday.getUTCDate()+weekOffset*7);
    const sunday=new Date(monday); sunday.setUTCDate(monday.getUTCDate()+6);
    const grid=modal.querySelector('#manualDateGrid');
    grid.innerHTML=Array.from({length:7},(_,i)=>{
      const d=new Date(monday); d.setUTCDate(monday.getUTCDate()+i);
      const date=isoUTC(d);
      const beyondNextWeek=weekOffset>1;
      return `<label class="date-chip ${beyondNextWeek?'disabled':''}">
        <input type="checkbox" name="manual_dates" value="${date}" ${beyondNextWeek?'disabled':''}>
        <span><b>${weekNames[i]}</b><small>${Number(date.slice(5,7))}/${Number(date.slice(8,10))}</small></span>
      </label>`;
    }).join('');
    const range=modal.querySelector('#manualWeekRange');
    if(range)range.textContent=`${twDate(isoUTC(monday))} ～ ${twDate(isoUTC(sunday))}`;
    const title=modal.querySelector('.manual-week-title strong');
    if(title)title.textContent=weekOffset===0?'本週補登':weekOffset===1?'下週補登':weekOffset===-1?'上週補登':weekOffset<0?`${Math.abs(weekOffset)} 週前補登`:`${weekOffset} 週後補登`;
  };
  modal.querySelector('.manual-prev-week').onclick=()=>{weekOffset-=1;renderWeek()};
  modal.querySelector('.manual-this-week').onclick=()=>{weekOffset=0;renderWeek()};
  modal.querySelector('.manual-next-week').onclick=()=>{weekOffset=1;renderWeek()};
  renderWeek();

  const manualForm=modal.querySelector('#manualBookingForm');
  const submitManualBooking=async e=>{
    if(e) e.preventDefault();
    const form=manualForm;
    const btn=form.querySelector('button[type=submit]');
    const fd=new FormData(form);
    const x={
      talent_id:String(fd.get('talent_id')||'').trim(),
      venue:String(fd.get('venue')||'').trim(),
      note:String(fd.get('note')||'').trim()
    };
    const dates=[...form.querySelectorAll('input[name="manual_dates"]:checked')].map(i=>i.value);
    const t=S.talents.find(v=>v.id===x.talent_id);
    if(!t){text('manualBookingStatus','⚠️ 請先選擇公關。'); form.querySelector('[name="talent_id"]')?.focus(); return}
    if(!dates.length){text('manualBookingStatus','⚠️ 請至少選擇一天。');return}
    if(!x.venue){text('manualBookingStatus','⚠️ 請選擇店家。'); form.querySelector('[name="venue"]')?.focus(); return}

    const existing=S.bookings.filter(b=>
      b.talent_id===t.id &&
      dates.includes(b.booking_date) &&
      !['cancelled','rejected'].includes(b.status)
    );
    const existingDates=new Set(existing.map(b=>b.booking_date));
    const newDates=dates.filter(d=>!existingDates.has(d));

    if(existingDates.size){
      const details=[...existingDates].sort().map(d=>{
        const rows=existing.filter(b=>b.booking_date===d);
        return `${twDate(d)}：${rows.map(b=>`${b.venue||''}（${b.status==='leave'?'請假':b.status==='confirmed'?'已確認':'待確認'}）`).join('、')}`;
      }).join('\n');
      if(!newDates.length){
        text('manualBookingStatus','⚠️ 所選日期都已經有班表或請假紀錄，沒有重複補登。');
        return;
      }
      if(!confirm(`${t.nickname} 有 ${existingDates.size} 天已經存在班表／請假：\n\n${details}\n\n這些日期會跳過，其餘 ${newDates.length} 天繼續補登，確定嗎？`))return;
    }

    btn.disabled=true;
    text('manualBookingStatus',`補登 ${newDates.length} 天中…`);
    const rows=newDates.map(date=>({
      nickname:t.nickname,
      contact:t.contact||'-',
      booking_date:date,
      venue:x.venue,
      start_time:'22:00',
      shift:'自訂',
      note:x.note||'經紀補登',
      status:'confirmed',
      user_id:t.user_id||null,
      talent_id:t.id
    }));
    const {error}=await sb.from('bookings').insert(rows);
    if(error){
      console.error(error);
      text('manualBookingStatus','❌ 補登失敗：'+(error.message||'請稍後再試'));
      btn.disabled=false;
      return;
    }
    const skipped=dates.length-newDates.length;
    alert(`✅ 已替 ${t.nickname} 補登 ${newDates.length} 天${skipped?`，另有 ${skipped} 天已有紀錄所以跳過`:''}。`);
    close();
    await refreshAdmin();
    activateAdminGroup('schedule');
    adminBookings('week');
  };
  manualForm.addEventListener('submit', submitManualBooking);
  modal.querySelector('button[type=submit]')?.addEventListener('click', e=>{
    e.preventDefault();
    submitManualBooking(e);
  });
}

function adminBookings(tab){
 window.__adminBookingsTab=tab;window.__afterLeave=null;
 const today=isoDay(),
 currentWeekStart=mondayOf(today),
 currentWeekEnd=addDaysIso(currentWeekStart,6),
 nextWeekStart=addDaysIso(currentWeekStart,7),
 nextWeekEnd=addDaysIso(nextWeekStart,6),
 isWeekView=tab==='week'||tab==='nextweek',
 weekStart=tab==='nextweek'?nextWeekStart:currentWeekStart,
 weekEnd=tab==='nextweek'?nextWeekEnd:currentWeekEnd,
 f=isWeekView?weekStart:today,
 to=isWeekView?weekEnd:f,
 title=tab==='today'?'今日班表':tab==='week'?'本週班表':tab==='nextweek'?'下週班表':'所有待確認',
 rows=tab==='pendingall'
   ? S.bookings.filter(x=>x.status==='pending')
   : S.bookings.filter(x=>x.booking_date>=f&&x.booking_date<=to&&!['cancelled','rejected'].includes(x.status)),
 L={pending:'待確認',confirmed:'已確認',leave:'請假',rejected:'未安排',cancelled:'已取消'};

 let html='',groups={};

 if(isWeekView){
   const weekdays=['星期日','星期一','星期二','星期三','星期四','星期五','星期六'];
   const byDate={};
   rows.forEach(x=>{
     if(!byDate[x.booking_date])byDate[x.booking_date]=[];
     byDate[x.booking_date].push(x);
   });
   const allDates=Array.from({length:7},(_,i)=>addDaysIso(weekStart,i));
   html=allDates.map(date=>{
     const dayRows=(byDate[date]||[]).sort((a,b)=>
       String(a.venue||'').localeCompare(String(b.venue||'')) ||
       String(a.nickname||'').localeCompare(String(b.nickname||''))
     );
     const d=new Date(date+'T12:00:00');
     const md=`${d.getMonth()+1}月${d.getDate()}日`;
     const isToday=date===isoDay();
     const confirmed=dayRows.filter(x=>x.status==='confirmed').length;
     const pending=dayRows.filter(x=>x.status==='pending').length;
     const leave=dayRows.filter(x=>x.status==='leave').length;

     return `<section class="week-date-card ${isToday?'is-today':''}">
       <div class="week-date-head">
         <div class="week-date-title">
           <small>${isToday?'TODAY':tab==='nextweek'?'NEXT WEEK':'WEEKLY SCHEDULE'}</small>
           <h3>${md} <span>${weekdays[d.getDay()]}</span></h3>
         </div>
         <div class="week-date-summary">
           <strong>${dayRows.length}</strong><span>位公關</span>
           ${dayRows.length?`<small>已確認 ${confirmed}${pending?` · 待確認 ${pending}`:''}${leave?` · 請假 ${leave}`:''}</small>`:''}
         </div>
       </div>
       <div class="week-date-talents">
         ${dayRows.length?dayRows.map(x=>`
           <article class="week-talent-row ${x.status==='leave'?'leave-record':''}">
             ${talentAvatarMarkup(S.talents.find(t=>t.id===x.talent_id)||{nickname:x.nickname},'week-talent-avatar',true)}
             <div class="week-talent-main">
               <div class="week-talent-name"><strong>${esc(x.nickname)}</strong><span class="booking-badge ${esc(x.status)}">${esc(L[x.status]||x.status)}</span></div>
               <p>${esc(x.venue||'未填店家')}</p>
               ${x.note?`<small>${esc(x.note)}</small>`:''}
               ${x.status==='leave'?`<small class="leave-summary">請假：${esc(x.leave_type||'未分類')}｜${esc(x.leave_timing||'未分類')}${x.leave_note?`｜${esc(x.leave_note)}`:''}</small>`:''}
             </div>
             <div class="week-talent-actions">
               <select class="status-select bs" data-id="${x.id}">${Object.entries(L).map(([v,l])=>`<option value="${v}" ${x.status===v?'selected':''}>${l}</option>`).join('')}</select>
               <button class="delete-booking" data-id="${x.id}" data-name="${esc(x.nickname)}" data-date="${esc(x.booking_date)}">刪除</button>
             </div>
           </article>`).join(''):`<div class="week-date-empty"><span>◇</span><p>這天目前沒有公關上班</p></div>`}
       </div>
     </section>`;
   }).join('');
 }else{
   rows.forEach(x=>{
     const key=x.user_id||`${x.nickname}__${x.contact||''}`;
     if(!groups[key]) groups[key]={key,nickname:x.nickname,contact:x.contact||'',user_id:x.user_id||null,rows:[]};
     groups[key].rows.push(x);
   });

   html=Object.values(groups).map(g=>{
     const pendingCount=g.rows.filter(x=>x.status==='pending').length;
     const confirmedCount=g.rows.filter(x=>x.status==='confirmed').length;
     const leaveCount=g.rows.filter(x=>x.status==='leave').length;
     return `<div class="talent-booking-group">
       <div class="talent-booking-head">
         <div>
           <strong>${esc(g.nickname)}</strong>
           <small>${esc(g.contact||'未填聯絡方式')}｜${g.rows.length} 天｜已確認 ${confirmedCount}｜請假 ${leaveCount}｜待確認 ${pendingCount}</small>
         </div>
       </div>
       <div class="talent-booking-days">
         ${g.rows.map(x=>`<div class="record compact-record ${x.status==='leave'?'leave-record':''}">
           <div class="record-main">
             <strong>${twDate(x.booking_date)}｜${esc(x.venue)}</strong>
             ${x.note?`<small>${esc(x.note)}</small>`:''}
             ${x.status==='leave'?`<small class="leave-summary">請假：${esc(x.leave_type||'未分類')}｜${esc(x.leave_timing||'未分類')}${x.leave_note?`｜${esc(x.leave_note)}`:''}</small>`:''}
           </div>
           <div class="booking-row-actions">
             <select class="status-select bs" data-id="${x.id}">${Object.entries(L).map(([v,l])=>`<option value="${v}" ${x.status===v?'selected':''}>${l}</option>`).join('')}</select>
             ${tab==='today'?`<button class="mini-btn leave-booking" data-id="${x.id}" data-name="${esc(x.nickname)}" data-date="${esc(x.booking_date)}">請假</button>`:''}
             <button class="delete-booking" data-id="${x.id}" data-name="${esc(x.nickname)}" data-date="${esc(x.booking_date)}">刪除</button>
           </div>
         </div>`).join('')}
       </div>
     </div>`;
   }).join('');
 }

 activateAdminGroup('schedule');
 const pendingHere=rows.filter(x=>x.status==='pending').length;
 el('panel').innerHTML=`${scheduleCenterBar(tab)}<div class="admin-section-title compact-title"><div><h2>${title}</h2><span>${rows.length} 筆</span></div>${tab==='pendingall'&&pendingHere?`<button class="btn btn-primary confirm-every-pending" type="button">✓ 全部公關確認（${pendingHere} 筆）</button>`:''}</div>${isWeekView?`<div class="week-schedule-note"><span>✦</span><p>${tab==='nextweek'?'提前查看公關已報的下週班表，方便安排人力與提早確認。':'依日期整理本週班表，直接看每天有哪些公關上班；漏登歷史班表可直接用上方「補登班表」。'}</p></div>${html}`:(rows.length?html:'<p class="empty">目前沒有班表。</p>')}
 <div id="leaveModalHost"></div>
 <div id="manualBookingHost"></div>`;
 bindScheduleCenterBar();
 document.querySelectorAll('.bs').forEach(sel=>sel.onchange=async()=>{
   if(sel.value==='leave'){
     openLeaveModal(sel.dataset.id);
     const row=S.bookings.find(x=>x.id===sel.dataset.id);
     sel.value=row?.status||'pending';
     return;
   }
   sel.disabled=true;
   const {error}=await sb.from('bookings').update({status:sel.value,leave_type:null,leave_note:null,leave_at:null,leave_timing:null}).eq('id',sel.dataset.id);
   sel.disabled=false;
   if(error){console.error(error);alert('狀態更新失敗，請稍後再試。');const row=S.bookings.find(x=>x.id===sel.dataset.id);if(row)sel.value=row.status;return}
   await refreshAdmin();
   adminBookings(window.__adminBookingsTab||tab||'today');
 });

 document.querySelectorAll('.leave-booking').forEach(btn=>btn.onclick=()=>openLeaveModal(btn.dataset.id));

 document.querySelectorAll('.delete-booking').forEach(btn=>btn.onclick=async()=>{
   if(!confirm(`確定永久刪除 ${btn.dataset.name} ${btn.dataset.date} 這筆班表嗎？`))return;
   btn.disabled=true;
   const {error}=await sb.from('bookings').delete().eq('id',btn.dataset.id);
   if(error){alert('刪除失敗：目前帳號沒有刪除權限，請聯絡管理員設定。');btn.disabled=false;return}
   await refreshAdmin();
   adminBookings(window.__adminBookingsTab||tab||'today');
 });

 document.querySelector('.confirm-every-pending')?.addEventListener('click',e=>confirmAllPending(e.currentTarget,()=>adminBookings(window.__adminBookingsTab||tab||'pendingall')));
}
async function confirmAllPending(btn,after){
 const ids=S.bookings.filter(x=>x.status==='pending').map(x=>x.id);
 if(!ids.length)return;
 const people=new Set(S.bookings.filter(x=>x.status==='pending').map(x=>x.talent_id||x.nickname)).size;
 if(!confirm(`確定一次確認全部 ${people} 位公關、共 ${ids.length} 筆待確認班表嗎？`))return;
 if(btn){btn.disabled=true;btn.textContent='確認中…'}
 const {error}=await sb.from('bookings').update({status:'confirmed'}).in('id',ids).eq('status','pending');
 if(error){console.error(error);alert('確認失敗，請稍後再試。');if(btn){btn.disabled=false;btn.textContent='✓ 全部公關確認'}return}
 await refreshAdmin();
 if(after)after();
}
function adminApplications(){
 const L={new:'待聯絡',contacted:'已聯絡',declined:'不聯絡'};

 const cards=S.applications.map(x=>`
   <div class="application-card">
     <div class="application-head">
       <div>
         <strong>${esc(x.nickname)}｜${esc(x.age)} 歲</strong>
         <small>${esc(x.area)}｜申請時間：${x.created_at?new Date(x.created_at).toLocaleString('zh-TW',{timeZone:TAIPEI_TZ}):'—'}</small>
       </div>
       <select class="status-select aps" data-id="${x.id}">
         <option value="new" ${x.status==='new'?'selected':''}>待聯絡</option>
         <option value="contacted" ${x.status==='contacted'?'selected':''}>已聯絡</option>
         <option value="declined">不聯絡（刪除）</option>
       </select>
     </div>
     <div class="application-grid">
       <div class="application-field"><span>姓名</span><b>${esc(x.name||'未填')}</b></div>
       <div class="application-field"><span>暱稱</span><b>${esc(x.nickname||'未填')}</b></div>
       <div class="application-field"><span>生日</span><b>${esc(x.birthday||'未填')}</b></div>
       <div class="application-field"><span>年齡</span><b>${esc(x.age||'未填')}</b></div>
       <div class="application-field"><span>居住地區</span><b>${esc(x.area||'未填')}</b></div>
       <div class="application-field"><span>手機／LINE</span><b>${esc(x.contact||'未填')}</b></div>
       <div class="application-field"><span>Instagram</span><b>${esc(x.instagram||'未提供')}</b></div>
       <div class="application-field"><span>有沒有相關工作經驗</span><b>${esc(x.experience||'未填')}</b></div>
       <div class="application-field application-wide"><span>可工作時間</span><b>${esc(x.availability||'未填')}</b></div>
       <div class="application-field application-wide"><span>想了解的內容／補充說明</span><b class="application-note">${esc(x.note||'未填')}</b></div>
       <div class="application-field application-wide"><span>申請時間</span><b>${x.created_at?new Date(x.created_at).toLocaleString('zh-TW',{timeZone:TAIPEI_TZ}):'—'}</b></div>
       <div class="application-field application-wide"><span>目前處理狀態</span><b>${esc(x.status==='contacted'?'已聯絡':'待聯絡')}</b></div>
     </div>
   </div>`).join('');

 el('panel').innerHTML=`<div class="admin-section-title"><div><h2>新人申請</h2><p class="panel-note">選擇「不聯絡」會永久刪除這筆新人申請。</p></div><span>${S.applications.length} 筆</span></div>${cards||'<p class="empty">目前沒有新人申請。</p>'}`;

 document.querySelectorAll('.aps').forEach(s=>s.onchange=async()=>{
   const id=s.dataset.id;
   if(s.value==='declined'){
     const person=S.applications.find(x=>x.id===id);
     if(!confirm(`確定「不聯絡」${person?.nickname||'這位新人'}嗎？

確認後會永久刪除這筆申請資料。`)){
       s.value=person?.status==='contacted'?'contacted':'new';
       return;
     }
     s.disabled=true;
     const {error}=await sb.from('applications').delete().eq('id',id);
     if(error){alert('刪除失敗，請稍後再試。');s.disabled=false;return}
     await refreshAdmin();
     return;
   }
   s.disabled=true;
   await sb.from('applications').update({status:s.value}).eq('id',id);
   s.disabled=false;
   await refreshAdmin();
 });
}

async function updateTalentStatus(talentId,nextStatus){
  const talent=S.talents.find(x=>String(x.id)===String(talentId));
  if(!talent){ alert('找不到這位公關資料，請重新整理後再試。'); return false; }

  const normalized={
    active:'active', paused:'paused', new:'new', left:'left',
    '合作中':'active','上卡中':'active','暫停':'paused','休檔中':'paused',
    '待審核':'new','待經紀審核':'new','已離開':'left','已下卡':'left'
  }[nextStatus]||nextStatus;

  if(!['active','paused','new','left'].includes(normalized)){
    alert('無法辨識這個公關狀態。');
    return false;
  }

  let payload={status:normalized};
  if(normalized==='paused'){
    const pausedUntil=nextMondayIso();
    if(!confirm(`確定將 ${talent.nickname||'這位公關'} 設為「休檔中」嗎？\n\n休檔至下週一 ${pausedUntil}，當天系統會自動恢復「上卡中」。`)) return false;
    payload.paused_until=pausedUntil;
  }else{
    if(normalized==='active' && !confirm(`確定將 ${talent.nickname||'這位公關'} 設為「上卡中」嗎？`)) return false;
    if(normalized==='left' && !confirm(`確定將 ${talent.nickname||'這位公關'} 設為「已下卡」嗎？\n\n下卡後會從主要公關名單移到「已下卡公關」，之後可選擇永久刪除資料或恢復上卡。`)) return false;
    payload.paused_until=null;
  }

  const select=document.querySelector(`.ts[data-id="${CSS.escape(String(talentId))}"]`);
  if(select) select.disabled=true;

  const {data:updated,error}=await sb.from('talents')
    .update(payload)
    .eq('id',talentId)
    .select('*')
    .maybeSingle();

  if(error || !updated){
    console.error('updateTalentStatus failed',error);
    alert('公關狀態更新失敗，請稍後再試。');
    if(select){
      select.disabled=false;
      select.value=talent.status||'new';
    }
    return false;
  }

  const idx=S.talents.findIndex(x=>String(x.id)===String(talentId));
  if(idx>=0) S.talents[idx]=updated;

  await refreshAdmin();
  renderAdminTab('talents');
  return true;
}

function adminTalents(){
 const activeTalents=S.talents.filter(x=>x.status!=='left');
 const leftTalents=S.talents.filter(x=>x.status==='left');

 const card=x=>`
   <article class="talent-person-card is-clickable" data-open-profile="${x.id}" tabindex="0" title="點一下看完整履歷">
     <div class="talent-person-photo">
       ${talentAvatarMarkup(x,'talent-card-avatar')}
       <span class="talent-card-status status-${esc(x.status||'')}">${esc(({active:'上卡中',new:'待審核',paused:'休檔中',left:'已下卡'})[x.status]||x.status||'未設定')}</span>
     </div>
     <div class="talent-person-info">
       <div class="talent-person-name">
         <h3>${esc(x.nickname)}</h3>
         ${x.user_id?'<span class="account-tag">帳號</span>':'<span class="legacy-tag">未綁定</span>'}
       </div>
       <p>${esc(x.area||'未填地區')}</p>
       <small>${esc(x.contact||x.email||'未填聯絡方式')}</small>
       ${x.status==='paused'&&x.paused_until?`<small class="pause-until">休檔至 ${esc(x.paused_until)}</small>`:''}
     </div>
     ${(()=>{const a=calcTalentAttendance(x);return `<div class="talent-card-glance"><span>本月出勤 <b class="${a.scheduled?(a.rate<50?'bad':a.rate<80?'mid':'good'):''}">${a.scheduled?a.rate+'%':'—'}</b></span><span>查看履歷 →</span></div>`})()}
     <select class="status-select ts talent-card-select" data-id="${x.id}">
       ${[['active','上卡中'],['new','待經紀審核'],['paused','休檔中'],['left','已下卡']].map(([v,l])=>`<option value="${v}" ${x.status===v?'selected':''}>${l}</option>`).join('')}
     </select>
   </article>`;

 const leftCard=x=>`
   <article class="talent-left-card">
     ${talentAvatarMarkup(x,'talent-left-avatar')}
     <div class="talent-left-info">
       <small>OFF CARD</small>
       <h3>${esc(x.nickname)}</h3>
       <p>${esc(x.area||'未填地區')} · ${esc(x.contact||x.email||'未填聯絡方式')}</p>
     </div>
     <div class="talent-left-actions">
       <button class="mini-btn restore-talent" data-id="${x.id}">恢復上卡</button>
       <button class="mini-btn danger permanent-delete-talent" data-id="${x.id}" data-name="${esc(x.nickname)}">永久刪除資料</button>
     </div>
   </article>`;

 el('panel').innerHTML=`
 <div class="admin-section-title talent-grid-title">
   <div><h2>公關管理</h2><p class="panel-note">點公關卡片就能看完整履歷、近期班表和出勤；右下角可以直接改狀態。</p></div>
   <div class="talent-grid-tools"><input type="search" id="talentSearch" placeholder="搜尋暱稱…" autocomplete="off"><button class="mini-btn" id="addTalent">＋ 新增公關</button></div>
 </div>

 <div class="talent-card-grid">
   ${activeTalents.map(card).join('')||'<p class="empty">目前沒有上卡中的公關。</p>'}
 </div>

 ${leftTalents.length?`
 <section class="left-talent-section">
   <div class="left-talent-section-head">
     <div><p class="eyebrow">OFF CARD TALENTS</p><h3>已下卡公關</h3><small>這裡不會出現在主要公關名單。確認不再需要後可永久刪除。</small></div>
     <span>${leftTalents.length} 位</span>
   </div>
   <div class="left-talent-list">${leftTalents.map(leftCard).join('')}</div>
 </section>`:''}

 <div id="inlineForm"></div>`;

 document.querySelectorAll('[data-open-profile]').forEach(card=>{
   const open=e=>{if(e.target.closest('select,option'))return;renderTalentProfileAdmin(card.dataset.openProfile)};
   card.addEventListener('click',open);
   card.addEventListener('keydown',e=>{if(e.key==='Enter')open(e)});
 });
 const ts=el('talentSearch');
 if(ts)ts.oninput=()=>{const v=ts.value.trim().toLowerCase();document.querySelectorAll('.talent-person-card').forEach(c=>{const n=c.querySelector('h3')?.textContent.toLowerCase()||'';c.style.display=!v||n.includes(v)?'':'none'})};
 document.querySelectorAll('.ts').forEach(s=>s.onchange=async()=>{
   const prev=S.talents.find(x=>String(x.id)===String(s.dataset.id))?.status;
   const ok=await updateTalentStatus(s.dataset.id,s.value);
   if(!ok&&prev)s.value=prev;
 });
 document.querySelectorAll('.restore-talent').forEach(b=>b.onclick=()=>updateTalentStatus(b.dataset.id,'active'));
 document.querySelectorAll('.permanent-delete-talent').forEach(b=>b.onclick=()=>permanentDeleteTalent(b.dataset.id,b.dataset.name));
 el('addTalent').onclick=renderAddTalentForm;
}

async function permanentDeleteTalent(talentId,nickname='這位公關'){
  const talent=S.talents.find(x=>String(x.id)===String(talentId));
  if(!talent)return;

  const first=confirm(`確定永久刪除「${nickname}」的公關資料嗎？\\n\\n此操作無法復原。`);
  if(!first)return;
  const second=confirm(`最後確認：真的要永久刪除「${nickname}」？\\n\\n薪資單、酒店上下卡紀錄等與此公關直接關聯的資料可能會一起刪除。`);
  if(!second)return;

  const {error}=await sb.from('talents').delete().eq('id',talentId);
  if(error){
    console.error('permanentDeleteTalent failed',error);
    alert('刪除失敗：'+(error.message||'請稍後再試'));
    return;
  }

  // Best-effort cleanup of avatar files; DB deletion is already complete even if storage cleanup fails.
  if(talent.user_id){
    try{
      await sb.storage.from('talent-avatars').remove([
        `${talent.user_id}/avatar.webp`,
        `${talent.user_id}/avatar-portrait.webp`
      ]);
    }catch(err){console.warn('avatar cleanup skipped',err)}
  }

  await refreshAdmin();
  renderAdminTab('talents');
}


function renderAddTalentForm(){
  const host=el('inlineForm');
  if(!host)return;

  host.innerHTML=`
    <div class="unbound-talent-backdrop">
      <section class="unbound-talent-modal">
        <div class="unbound-talent-head">
          <div>
            <p class="eyebrow">QUICK TALENT CREATE ✦</p>
            <h3>新增未綁定公關</h3>
            <p>先建立公關資料，之後再讓本人註冊／綁定帳號也可以。</p>
          </div>
          <button type="button" class="unbound-close" aria-label="關閉">×</button>
        </div>

        <form id="unboundTalentForm" class="unbound-talent-form">
          <div class="unbound-grid">
            <label>
              <span>藝名／暱稱 <b>*</b></span>
              <input name="nickname" maxlength="40" required placeholder="例如：娜米">
            </label>
            <label>
              <span>姓名</span>
              <input name="name" maxlength="40" placeholder="選填">
            </label>
            <label>
              <span>手機／LINE</span>
              <input name="contact" maxlength="80" placeholder="選填">
            </label>
            <label>
              <span>居住地區</span>
              <input name="area" maxlength="40" placeholder="例如：台北、新北">
            </label>
            <label>
              <span>目前狀態</span>
              <select name="status">
                <option value="active">上卡中</option>
                <option value="new">待經紀審核</option>
                <option value="paused">休檔中</option>
                <option value="left">已下卡</option>
              </select>
            </label>
          </div>

          <div class="unbound-notice">
            <span>◇</span>
            <p>這筆資料不會建立登入帳號，所以會先標示為「未綁定」。</p>
          </div>

          <div class="unbound-actions">
            <button class="btn btn-primary" type="submit">建立公關資料</button>
            <button class="btn btn-outline unbound-cancel" type="button">取消</button>
          </div>
          <p id="unboundTalentStatus" class="form-status"></p>
        </form>
      </section>
    </div>`;

  const backdrop=host.querySelector('.unbound-talent-backdrop');
  const form=el('unboundTalentForm');
  const close=()=>{host.innerHTML='';};

  host.querySelector('.unbound-close').onclick=close;
  host.querySelector('.unbound-cancel').onclick=close;
  backdrop.onclick=e=>{if(e.target===backdrop)close();};

  form.onsubmit=async e=>{
    e.preventDefault();
    const submit=form.querySelector('button[type="submit"]');
    submit.disabled=true;
    text('unboundTalentStatus','建立中…');

    const x=Object.fromEntries(new FormData(form));
    const nickname=String(x.nickname||'').trim();
    if(!nickname){
      text('unboundTalentStatus','❌ 請輸入藝名／暱稱。');
      submit.disabled=false;
      return;
    }

    const duplicate=S.talents.find(t=>String(t.nickname||'').trim().toLowerCase()===nickname.toLowerCase());
    if(duplicate && !confirm(`目前已經有一位「${nickname}」。\n\n仍然要新增另一筆未綁定公關嗎？`)){
      submit.disabled=false;
      text('unboundTalentStatus','');
      return;
    }

    const payload={
      nickname,
      name:String(x.name||'').trim()||null,
      contact:String(x.contact||'').trim()||null,
      area:String(x.area||'').trim()||null,
      status:x.status||'active',
      user_id:null,
      paused_until:null
    };

    if(payload.status==='paused') payload.paused_until=nextMondayIso();

    const {data,error}=await sb.from('talents')
      .insert(payload)
      .select('*')
      .maybeSingle();

    if(error){
      console.error('create unbound talent failed',error);
      text('unboundTalentStatus','❌ 建立失敗：'+(error.message||'請稍後再試'));
      submit.disabled=false;
      return;
    }

    text('unboundTalentStatus','✅ 已建立未綁定公關。');
    if(data)S.talents.push(data);
    await refreshAdmin();
    setTimeout(()=>renderAdminTab('talents'),350);
  };
}


function renderTalentProfileAdmin(talentId){
 const t=S.talents.find(x=>x.id===talentId);if(!t)return;
 const a=calcTalentAttendance(t);
 const statusLabel={active:'上卡中',paused:'休檔中',new:'待審核'}[t.status]||t.status;
 el('panel').innerHTML=`
 <div class="admin-section-title"><div><button class="back-talents">← 返回公關管理</button><h2>${esc(t.nickname)}｜個人履歷</h2></div></div>

 <section class="talent-resume-card">
   <aside class="talent-resume-photo">
     ${talentAvatarMarkup(t,'talent-resume-avatar')}
     <h3>${esc(t.nickname||'未設定暱稱')}</h3>
     <span class="resume-status status-${esc(t.status||'')}">${esc(statusLabel)}</span>
     <small>${esc(t.area||'未填地區')}</small>
   </aside>

   <div class="talent-resume-body">
     <div class="talent-resume-heading">
       <div><p class="eyebrow">TALENT PROFILE</p><h2>${esc(t.name||t.nickname||'未填姓名')}</h2></div>
       <div class="resume-mini-stats">
         <div><span>年齡</span><b>${esc(ageFromBirthday(t.birthday))}</b></div>
         <div><span>身高</span><b>${t.height_cm?esc(t.height_cm)+' cm':'—'}</b></div>
         <div><span>本月出勤</span><b>${a.scheduled?a.rate+'%':'—'}</b></div>
       </div>
     </div>

     <div class="application-grid talent-resume-grid">
      <div class="application-field"><span>姓名</span><b>${esc(t.name||'未填')}</b></div>
      <div class="application-field"><span>暱稱</span><b>${esc(t.nickname||'未填')}</b></div>
      <div class="application-field"><span>生日</span><b>${esc(t.birthday||'未填')}</b></div>
      <div class="application-field"><span>性別</span><b>${esc(t.gender||'未填')}</b></div>
      <div class="application-field"><span>居住地區</span><b>${esc(t.area||'未填')}</b></div>
      <div class="application-field"><span>手機／LINE</span><b>${esc(t.contact||'未填')}</b></div>
      <div class="application-field"><span>Instagram</span><b>${esc(t.instagram||'未填')}</b></div>
      <div class="application-field"><span>Email</span><b>${esc(t.email||'未填')}</b></div>
      <div class="application-field"><span>身高</span><b>${t.height_cm?esc(t.height_cm)+' cm':'未填'}</b></div>
      <div class="application-field"><span>體重</span><b>${t.weight_kg?esc(t.weight_kg)+' kg':'未填'}</b></div>
      <div class="application-field"><span>血型</span><b>${esc(t.blood_type||'未填')}</b></div>
      <div class="application-field"><span>緊急聯絡人</span><b>${esc(t.emergency_contact||'未填')}</b></div>
      <div class="application-field"><span>緊急聯絡電話</span><b>${esc(t.emergency_phone||'未填')}</b></div>
     </div>

     <section class="admin-bank-card">
       <div class="admin-bank-card-head">
         <div><p class="eyebrow">PAYMENT ACCOUNT ◇</p><h3>薪資匯款資料</h3></div>
         <span>${t.bank_code&&t.bank_account?'資料已填寫':'尚未完整填寫'}</span>
       </div>
       <div class="admin-bank-account-row">
         <div class="admin-bank-code">
           <small>銀行代碼</small>
           <strong>${esc(t.bank_code||'未填')}</strong>
         </div>
         <i>—</i>
         <div class="admin-bank-number">
           <small>銀行帳號</small>
           <strong>${esc(t.bank_account||'未填')}</strong>
         </div>
         ${t.bank_account?`<button type="button" class="copy-bank-account" data-bank="${esc(t.bank_account)}">複製帳號</button>`:''}
       </div>
       <p>此資料由公關本人於「個人資料 → 薪資匯款帳號」填寫。</p>
     </section>

     <div class="profile-hub">
       <a class="mini-btn" href="booking.html?preview=${encodeURIComponent(t.id)}">👀 用她的角度看公關專區</a>
       <button class="mini-btn profile-hotels" data-id="${t.id}">曾上卡店家</button>
     </div>
   </div>
 </section>

 <section class="attendance-card profile-inline-card" id="profileRecent">${profileRecentHtml(t)}</section>
 <section class="profile-inline-card" id="profileAttendance">${profileAttendanceHtml(t)}</section>`;
 bindProfileInline(t);
 document.querySelector('.profile-hotels')?.addEventListener('click',()=>adminHotelCards(t.id));
 document.querySelector('.copy-bank-account')?.addEventListener('click',async e=>{
   const btn=e.currentTarget,account=btn.dataset.bank||'';
   try{
     await navigator.clipboard.writeText(account);
     const old=btn.textContent;btn.textContent='已複製 ✓';
     setTimeout(()=>btn.textContent=old,1400);
   }catch(err){
     console.error(err);
     alert('複製失敗，請手動選取帳號。');
   }
 });
 document.querySelector('.back-talents').onclick=()=>renderAdminTab('talents');
}

function profileRecentHtml(t){
 const from=isoDay(-7),to=isoDay(13);
 const L={pending:'待確認',confirmed:'已確認',leave:'請假',rejected:'未安排',cancelled:'已取消'};
 const rows=talentBookingRows(t).filter(x=>x.booking_date>=from&&x.booking_date<=to&&x.status!=='cancelled').sort((a,b)=>a.booking_date.localeCompare(b.booking_date));
 const today=isoDay();
 return `<div class="profile-inline-head"><div><p class="eyebrow">RECENT SCHEDULE</p><h3>近期班表</h3></div><small>前 7 天 ～ 後 14 天｜${rows.length} 筆｜可直接改狀態</small></div>
 ${rows.length?`<div class="profile-recent-list">${rows.map(x=>`<div class="profile-recent-row ${x.booking_date===today?'is-today':''} ${x.booking_date<today?'is-past':''}"><span class="d">${twDate(x.booking_date)}${x.booking_date===today?'<i>今天</i>':''}</span><span class="v">${esc(x.venue||'未填店家')}${x.status==='leave'?`<small>${esc(x.leave_type||'請假')}${x.leave_note?'｜'+esc(x.leave_note):''}</small>`:x.note?`<small>${esc(x.note)}</small>`:''}</span><select class="status-select profile-status" data-id="${x.id}">${Object.entries(L).map(([v,l])=>`<option value="${v}" ${x.status===v?'selected':''}>${l}</option>`).join('')}</select></div>`).join('')}</div>`:'<p class="empty">這段期間沒有班表。</p>'}`;
}
function profileAttendanceHtml(t,selectedYear){
 const currentYear=new Date().getFullYear();
 const year=Math.min(currentYear,Math.max(ATTENDANCE_START_YEAR,Number(selectedYear)||currentYear));
 const currentKey=isoDay().slice(0,7);
 const now=new Date();
 const months=[];
 for(let m=1;m<=12;m++){const key=`${year}-${String(m).padStart(2,'0')}`;const st=calcTalentMonthlyAttendance(t,key);st.isFuture=new Date(year,m-1,1)>new Date(now.getFullYear(),now.getMonth(),1);st.isCurrent=key===currentKey;months.push(st)}
 const ys=calcTalentYearlyAttendance(t,year);
 const leaves=ys.leaveRows.slice().sort((a,b)=>String(b.booking_date).localeCompare(String(a.booking_date)));
 const years=attendanceYearKeys();
 return `<div class="profile-inline-head"><div><p class="eyebrow">ATTENDANCE</p><h3>出勤／請假分析</h3></div>${years.length>1?`<div class="attendance-year-picker inline">${years.map(y=>`<button type="button" class="attendance-year-btn ${y===year?'active':''}" data-year="${y}">${y}</button>`).join('')}</div>`:`<small>${year} 年｜請假一律算缺勤</small>`}</div>
 <div class="attendance-stats"><div><span>應出勤</span><strong>${ys.scheduled}</strong></div><div><span>實際出勤</span><strong>${ys.attended}</strong></div><div><span>缺勤／請假</span><strong>${ys.absent}</strong></div><div><span>${year===currentYear?'目前':'全年'}出勤率</span><strong>${ys.scheduled?ys.rate+'%':'—'}</strong></div></div>
 <div class="profile-month-strip">${months.map(m=>`<div class="${m.isFuture?'future':''} ${m.isCurrent?'current':''}"><small>${Number(m.key.slice(5))}月</small><b class="${!m.isFuture&&m.scheduled?(m.rate<50?'bad':m.rate<80?'mid':'good'):''}">${m.isFuture?'·':m.scheduled?m.rate+'%':'—'}</b></div>`).join('')}</div>
 <h4 class="profile-leave-title">請假紀錄（${leaves.length}）</h4>
 ${leaves.length?`<div class="attendance-leave-table"><div class="head"><span>日期</span><span>假別</span><span>備註</span></div>${leaves.map(x=>`<div><span>${twDate(x.booking_date)}</span><span>${esc(x.leave_type||'未分類')}</span><span class="leave-note-cell">${esc(x.leave_note||'—')}</span></div>`).join('')}</div>`:'<p class="empty">這一年沒有請假紀錄 ✓</p>'}`;
}
function bindProfileInline(t){
 document.querySelectorAll('#profileAttendance .attendance-year-btn').forEach(b=>b.onclick=()=>{el('profileAttendance').innerHTML=profileAttendanceHtml(t,Number(b.dataset.year));bindProfileInline(t)});
 document.querySelectorAll('#profileRecent .profile-status').forEach(sel=>sel.onchange=async()=>{
   const row=S.bookings.find(x=>x.id===sel.dataset.id);
   if(sel.value==='leave'){window.__afterLeave=()=>renderTalentProfileAdmin(t.id);openLeaveModal(sel.dataset.id);sel.value=row?.status||'pending';return}
   sel.disabled=true;
   const {error}=await sb.from('bookings').update({status:sel.value,leave_type:null,leave_note:null,leave_at:null,leave_timing:null}).eq('id',sel.dataset.id);
   if(error){alert('修改失敗，請稍後再試。');sel.disabled=false;if(row)sel.value=row.status;return}
   await refreshAdmin();
   renderTalentProfileAdmin(t.id);
 });
}
function renderTalent14Days(talentId){
 const t=S.talents.find(x=>x.id===talentId);
 if(!t)return;
 const from=isoDay(),to=isoDay(13);
 const rows=S.bookings.filter(x=>{
   const same=x.talent_id===talentId || (t.user_id && x.user_id===t.user_id);
   return same && x.booking_date>=from && x.booking_date<=to;
 }).sort((a,b)=>a.booking_date.localeCompare(b.booking_date));

 const L={pending:'待確認',confirmed:'已確認',leave:'請假',rejected:'未安排',cancelled:'已取消'};
 el('panel').innerHTML=`<div class="admin-section-title"><div><button class="back-talents">← 返回公關管理</button><h2>${esc(t.nickname)}｜近 14 天報班</h2><p class="panel-note">${esc(from)} ～ ${esc(to)}｜共 ${rows.length} 筆</p></div></div>
 ${rows.length?rows.map(x=>`<div class="record"><div class="record-main"><strong>${esc(x.booking_date)}｜${esc(x.venue)}</strong><small>${esc(x.note||'無備註')}</small></div><div class="booking-row-actions"><select class="status-select t14-status" data-id="${x.id}">${Object.entries(L).map(([v,l])=>`<option value="${v}" ${x.status===v?'selected':''}>${l}</option>`).join('')}</select><button class="delete-booking t14-delete" data-id="${x.id}" data-date="${esc(x.booking_date)}">刪除</button></div></div>`).join(''):'<p class="empty">這位公關近 14 天沒有報班。</p>'}`;

 document.querySelector('.back-talents').onclick=()=>renderAdminTab('talents');
 document.querySelectorAll('.t14-status').forEach(sel=>sel.onchange=async()=>{
   sel.disabled=true;
   const {error}=await sb.from('bookings').update({status:sel.value}).eq('id',sel.dataset.id);
   if(error)alert('修改失敗');
   await refreshAdmin();
   renderTalent14Days(talentId);
 });
 document.querySelectorAll('.t14-delete').forEach(btn=>btn.onclick=async()=>{
   if(!confirm(`確定永久刪除 ${t.nickname} ${btn.dataset.date} 這筆報班嗎？`))return;
   btn.disabled=true;
   const {error}=await sb.from('bookings').delete().eq('id',btn.dataset.id);
   if(error){alert('刪除失敗：Supabase 目前可能尚未允許管理員刪除班表。');btn.disabled=false;return}
   await refreshAdmin();
   renderTalent14Days(talentId);
 });
}





async function renderTalentPayrollHistory(talentId){
  const t=S.talents.find(x=>x.id===talentId);
  if(!t)return;
  const panel=el('panel');
  panel.innerHTML='<div class="member-loading-card">薪資紀錄讀取中…</div>';

  const {data,error}=await sb.from('payrolls')
    .select('*')
    .eq('talent_id',talentId)
    .order('week_start',{ascending:false})
    .order('created_at',{ascending:false});

  if(error){
    console.error(error);
    panel.innerHTML=`<div class="admin-section-title"><div><button class="back-talents">← 返回公關管理</button><h2>${esc(t.nickname)}｜薪資紀錄</h2></div></div><div class="member-setup-card"><strong>讀取失敗</strong><p>目前無法讀取這位公關的薪資紀錄。</p></div>`;
    document.querySelector('.back-talents').onclick=()=>renderAdminTab('talents');
    return;
  }

  const rows=(data||[]).slice().sort((a,b)=>{
    const week=String(b.week_start||'').localeCompare(String(a.week_start||''));
    if(week!==0)return week;
    return String(b.created_at||'').localeCompare(String(a.created_at||''));
  });
  const published=rows.filter(x=>x.is_published).length;
  const drafts=rows.length-published;

  panel.innerHTML=`<div class="admin-section-title payroll-history-admin-title">
    <div>
      <button class="back-talents">← 返回公關管理</button>
      <p class="eyebrow">PAYROLL HISTORY</p>
      <h2>${esc(t.nickname)}｜薪資紀錄</h2>
      <p class="panel-note">由新到舊排列。薪資明細版型與公關本人看到的「我的薪資單」一致，方便你逐週核對。</p>
    </div>
  </div>
  <div class="admin-payroll-history-summary">
    <div><span>全部紀錄</span><strong>${rows.length}</strong><small>份</small></div>
    <div><span>公關看得到</span><strong>${published}</strong><small>已發布</small></div>
    <div><span>尚未公開</span><strong>${drafts}</strong><small>草稿</small></div>
  </div>
  <section class="payroll-page admin-payroll-history-page">
    <div class="payroll-compact-list">
      ${rows.length?rows.map(x=>`<div class="admin-payroll-slip-wrap ${x.is_published?'is-published':'is-draft'}">
        <div class="admin-payroll-visibility"><span>${x.is_published?'✓ 已發布｜公關看得到':'● 草稿｜公關目前看不到'}</span><small>${esc(x.week_start)} ～ ${esc(addDaysIso(x.week_start,6))}</small></div>
        ${renderPayrollSlip(x,false)}
      </div>`).join(''):'<div class="member-empty-lux"><strong>目前沒有薪資紀錄</strong><p>建立第一張薪資單後，會依週次由新到舊顯示在這裡。</p></div>'}
    </div>
  </section>`;

  document.querySelector('.back-talents').onclick=()=>renderAdminTab('talents');
  panel.querySelectorAll('.payroll-slip-top,.payroll-history-toggle').forEach(b=>b.onclick=()=>{
    const slip=b.closest('.payroll-slip');
    if(!slip)return;
    const d=slip.querySelector('.payroll-slip-body'),tgl=slip.querySelector('.payroll-history-toggle');
    if(!d)return;
    d.hidden=!d.hidden;
    slip.classList.toggle('is-open',!d.hidden);
    if(tgl)tgl.textContent=d.hidden?'查看明細 ＋':'收起明細 －';
  });
  panel.querySelectorAll('.payroll-slip-top').forEach(b=>b.addEventListener('keydown',e=>{
    if(e.key==='Enter'||e.key===' '){e.preventDefault();b.click()}
  }));
}

async function renderTalentSectionTrend(talentId){
  const t=S.talents.find(x=>x.id===talentId);
  if(!t)return;
  const panel=el('panel');
  panel.innerHTML='<div class="member-loading-card">節數趨勢讀取中…</div>';

  const {data,error}=await sb.from('payrolls')
    .select('*')
    .eq('talent_id',talentId)
    .order('week_start',{ascending:true});

  if(error){
    panel.innerHTML=`<div class="admin-section-title"><div><button class="back-talents">← 返回公關管理</button><h2>${esc(t.nickname)}｜每週節數趨勢</h2></div></div><div class="member-setup-card"><strong>讀取失敗</strong><p>目前無法讀取薪資紀錄。</p></div>`;
    document.querySelector('.back-talents').onclick=()=>renderAdminTab('talents');
    return;
  }

  const rows=(data||[]).map(x=>({...x,_calc:payrollCalc(x)}));
  const recent=rows.slice(-12);
  const last=recent.at(-1)?._calc.total||0;
  const last4=recent.slice(-4);
  const avg4=last4.length?Math.round(last4.reduce((s,x)=>s+x._calc.total,0)/last4.length):0;
  const maxRow=recent.length?recent.reduce((a,b)=>a._calc.total>=b._calc.total?a:b):null;
  const maxVal=maxRow?maxRow._calc.total:0;
  const maxScale=Math.max(1,...recent.map(x=>x._calc.total));

  panel.innerHTML=`<div class="admin-section-title trend-page-title">
    <div>
      <button class="back-talents">← 返回公關管理</button>
      <p class="eyebrow">WEEKLY SECTION TREND</p>
      <h2>${esc(t.nickname)}｜每週節數趨勢</h2>
      <p class="panel-note">資料直接來自每週薪資單，不需要另外輸入節數。</p>
    </div>
  </div>

  <div class="section-trend-stats">
    <div><span>最近一週</span><strong>${last}</strong><small>節</small></div>
    <div><span>近 4 週平均</span><strong>${avg4}</strong><small>節 / 週</small></div>
    <div><span>近 12 週最高</span><strong>${maxVal}</strong><small>節</small></div>
    <div><span>累計紀錄</span><strong>${rows.length}</strong><small>週</small></div>
  </div>

  <section class="section-trend-card">
    <div class="section-trend-head">
      <div><small>LAST 12 WEEKS</small><h3>每週總節數</h3></div>
      <span>${recent.length?`${esc(recent[0].week_start)} ～ ${esc(recent.at(-1).week_start)}`:'尚無資料'}</span>
    </div>

    ${recent.length?`
      <div class="section-trend-chart">
        ${recent.map((x,i)=>{
          const v=x._calc.total;
          const h=Math.max(5,Math.round(v/maxScale*100));
          const isLatest=i===recent.length-1;
          return `<div class="trend-bar-col">
            <div class="trend-bar-value">${v}</div>
            <div class="trend-bar-track"><i class="${isLatest?'is-latest':''}" style="height:${h}%"></i></div>
            <div class="trend-bar-label">${esc(String(x.week_start).slice(5).replace('-','/'))}</div>
          </div>`;
        }).join('')}
      </div>
      <div class="section-trend-history">
        ${recent.slice().reverse().map(x=>`<div><span>${esc(x.week_start)} ～ ${esc(addDaysIso(x.week_start,6))}</span><b>${x._calc.total} 節</b><small>${esc(x.venue||'未填店名')}</small></div>`).join('')}
      </div>
    `:`<div class="member-empty-lux"><strong>目前沒有薪資單節數資料</strong><p>建立第一張每週薪資單後，這裡會自動開始累積趨勢。</p></div>`}
  </section>`;

  document.querySelector('.back-talents').onclick=()=>renderAdminTab('talents');
}

async function adminPayroll(focusTalentId=''){
  const panel=el('panel');panel.innerHTML='<div class="member-loading-card">薪資資料讀取中…</div>';
  const selectedWeek=window.__payrollWeek||mondayOf(isoDay());
  const {data,error}=await sb.from('payrolls').select('*').eq('week_start',selectedWeek).order('nickname');
  if(error){panel.innerHTML=adminV108Setup('薪資管理');return}
  const rows=data||[],talents=S.talents.filter(t=>t.status!=='left');
  const byTalent=new Map(rows.map(x=>[x.talent_id,x]));
  const counts={published:rows.filter(x=>x.is_published).length,draft:rows.filter(x=>!x.is_published).length,missing:Math.max(0,talents.length-rows.length)};
  panel.innerHTML=`<div class="admin-section-title grouped-title"><div><p class="eyebrow">WEEKLY PAYROLL</p><h2>薪資管理</h2><p class="panel-note">以公關為主整理，每週照名單逐一填寫，不用再從一堆薪資單裡找人。</p></div></div>
  <section class="manager-toolbar"><div class="week-switch"><button id="payPrev" class="week-arrow">‹</button><div><small>本週結算</small><strong>${esc(selectedWeek)} ～ ${esc(addDaysIso(selectedWeek,6))}</strong></div><button id="payNext" class="week-arrow">›</button></div><div class="manager-search"><span>⌕</span><input id="payTalentSearch" placeholder="搜尋公關暱稱"></div></section>
  <section class="payroll-progress"><div><small>本週完成度</small><strong>${counts.published} <i>/ ${talents.length}</i></strong></div><div class="progress-stat done"><b>${counts.published}</b><span>已發布</span></div><div class="progress-stat draft"><b>${counts.draft}</b><span>草稿</span></div><div class="progress-stat missing"><b>${counts.missing}</b><span>尚未填寫</span></div></section>
  <div class="talent-manager-grid" id="payrollTalentGrid">${renderPayrollTalentCards(talents,byTalent)}</div><div id="payrollModalHost"></div>`;
  const rerender=()=>{const q=el('payTalentSearch').value.trim().toLowerCase();el('payrollTalentGrid').innerHTML=renderPayrollTalentCards(talents.filter(t=>t.nickname.toLowerCase().includes(q)),byTalent);bindPayrollTalentCards(byTalent,talents)};
  el('payTalentSearch').oninput=rerender;bindPayrollTalentCards(byTalent,talents);
  el('payPrev').onclick=()=>{window.__payrollWeek=addDaysIso(selectedWeek,-7);adminPayroll()};el('payNext').onclick=()=>{window.__payrollWeek=addDaysIso(selectedWeek,7);adminPayroll()};
  if(focusTalentId){setTimeout(()=>document.querySelector(`[data-pay-talent="${focusTalentId}"]`)?.scrollIntoView({behavior:'smooth',block:'center'}),50)}
}
function renderPayrollTalentCards(talents,byTalent){return talents.map(t=>{const x=byTalent.get(t.id),c=x?payrollCalc(x):null,status=!x?'尚未填寫':x.is_published?'已發布':'草稿';return `<article class="talent-manager-card payroll-person ${x?'has-record':'is-empty'}" data-pay-talent="${t.id}"><div class="manager-avatar">${(t.avatar_portrait_url||t.avatar_url)?`<img src="${esc(t.avatar_portrait_url||t.avatar_url)}" alt="${esc(t.nickname)} 大頭貼">`:`<span>${esc((t.nickname||'?').slice(0,1))}</span>`}</div><div class="manager-person-info"><small>PUBLIC RELATIONS</small><h3>${esc(t.nickname)}</h3><span class="manager-status ${!x?'missing':x.is_published?'published':'draft'}">● ${status}</span>${x?`<p>${c.total} 節　·　節薪 ${money(c.rate)}　·　實領 <b>${money(c.net)}</b></p>`:'<p>這週還沒有建立薪資單</p>'}</div><button class="manager-action ${x?'':'primary'}" data-pay-edit="${t.id}">${x?'編輯薪資':'＋ 填寫薪資'}</button></article>`}).join('')||'<div class="member-empty-lux"><strong>找不到公關</strong><p>請換一個關鍵字搜尋。</p></div>'}
function bindPayrollTalentCards(byTalent,talents){document.querySelectorAll('[data-pay-edit]').forEach(b=>b.onclick=()=>{const id=b.dataset.payEdit;openPayrollEditor(byTalent.get(id)||null,id,talents)})}
function openPayrollEditor(row,focusTalentId,talents){
  const host=el('payrollModalHost')||document.body,start=row?.week_start||mondayOf(isoDay());
  const modal=document.createElement('div');modal.className='leave-modal-backdrop';
  modal.innerHTML=`<div class="leave-modal payroll-editor-modal"><div class="leave-modal-head"><div><p class="eyebrow">PAYROLL EDITOR</p><h3>${row?'編輯':'建立'}每週薪資單</h3></div><button class="leave-close" type="button">×</button></div><form id="payrollEditor"><div class="payroll-editor-grid"><label>公關<select name="talent_id" required><option value="">請選擇</option>${talents.map(t=>`<option value="${t.id}" ${(row?.talent_id||focusTalentId)===t.id?'selected':''}>${esc(t.nickname)}</option>`).join('')}</select></label><label>週次（星期一）<input type="date" name="week_start" value="${esc(start)}" required></label><label>店家<select name="venue" required><option value="">請選擇店家</option>${S.venues.filter(v=>v.is_active||v.name===row?.venue).map(v=>`<option value="${esc(v.name)}" ${row?.venue===v.name?'selected':''}>${esc(v.name)}${!v.is_active?'（已停用）':''}</option>`).join('')}${row?.venue&&!S.venues.some(v=>v.name===row.venue)?`<option value="${esc(row.venue)}" selected>${esc(row.venue)}（歷史店名）</option>`:''}</select></label><label>本週節薪<input type="number" name="section_rate" min="0" step="1" value="${row?.section_rate??''}" required placeholder="例如 210"></label></div><h4>每天個別節數</h4><div class="payroll-seven-days">${payrollDays.map(([k,l],i)=>`<label>週${l}<small>${twDate(addDaysIso(start,i))}</small><input type="number" name="${k}" min="0" step="1" value="${row?.[k]??0}"></label>`).join('')}</div><h4>扣款</h4><div class="payroll-editor-grid deductions">${[['tax_amount','稅金'],['cleaning_fee','清潔費'],['laundry_fee','洗衣費'],['misc_fee','雜支'],['makeup_fee','妝髮'],['advance_amount','預支']].map(([k,l])=>`<label>${l}<input type="number" name="${k}" min="0" step="1" value="${row?.[k]??0}"></label>`).join('')}</div><label>備註<textarea name="note" placeholder="選填">${esc(row?.note||'')}</textarea></label><div class="payroll-live-total" id="payrollLiveTotal"></div><label class="check"><input type="checkbox" name="is_published" ${row?.is_published?'checked':''}> 發布給公關查看（未勾選則儲存為草稿）</label><div class="leave-modal-actions"><button class="btn btn-primary" type="submit">儲存薪資單</button>${row?'<button class="btn btn-outline danger delete-payroll" type="button">刪除本次薪資</button>':''}<button class="btn btn-outline payroll-cancel" type="button">取消</button></div><p id="payrollEditorStatus" class="form-status"></p></form></div>`;
  host.appendChild(modal);const form=modal.querySelector('#payrollEditor'),close=()=>modal.remove();modal.querySelector('.leave-close').onclick=close;modal.querySelector('.payroll-cancel').onclick=close;
  modal.querySelector('.delete-payroll')?.addEventListener('click',async()=>{
    if(!row)return;
    if(!confirm(`確定刪除 ${row.nickname||'這位公關'} ${row.week_start||''} 這一週的薪資單嗎？\n\n刪除後公關端也不會再看到這筆薪資。`))return;
    const btn=modal.querySelector('.delete-payroll');
    btn.disabled=true;btn.textContent='刪除中…';
    const {error}=await sb.from('payrolls').delete().eq('id',row.id);
    if(error){console.error(error);alert('刪除薪資單失敗，請稍後再試。');btn.disabled=false;btn.textContent='刪除本次薪資';return}
    close();
    await adminPayroll();
  });
  const preview=()=>{const x=Object.fromEntries(new FormData(form));const c=payrollCalc(x);el('payrollLiveTotal').innerHTML=`<div><span>總節數</span><b>${c.total} 節</b></div><div><span>節數薪資</span><b>${money(c.gross)}</b></div><div><span>扣款</span><b>− ${money(c.deductions)}</b></div><div class="net"><span>實領</span><strong>${money(c.net)}</strong></div>`};form.oninput=preview;preview();
  form.onsubmit=async e=>{e.preventDefault();const x=Object.fromEntries(new FormData(form)),t=S.talents.find(v=>v.id===x.talent_id);if(!t)return;text('payrollEditorStatus','儲存中…');const c=payrollCalc(x),payload={talent_id:t.id,user_id:t.user_id||null,nickname:t.nickname,week_start:mondayOf(x.week_start),venue:x.venue,section_rate:Number(x.section_rate),mon_sections:Number(x.mon_sections||0),tue_sections:Number(x.tue_sections||0),wed_sections:Number(x.wed_sections||0),thu_sections:Number(x.thu_sections||0),fri_sections:Number(x.fri_sections||0),sat_sections:Number(x.sat_sections||0),sun_sections:Number(x.sun_sections||0),tax_amount:Number(x.tax_amount||0),cleaning_fee:Number(x.cleaning_fee||0),laundry_fee:Number(x.laundry_fee||0),misc_fee:Number(x.misc_fee||0),makeup_fee:Number(x.makeup_fee||0),advance_amount:Number(x.advance_amount||0),gross_amount:c.gross,deduction_total:c.deductions,net_amount:c.net,note:x.note||null,is_published:!!form.elements.is_published.checked,updated_at:new Date().toISOString()};let q=row?sb.from('payrolls').update(payload).eq('id',row.id):sb.from('payrolls').insert(payload);const {error}=await q;if(error){console.error(error);text('payrollEditorStatus','❌ 儲存失敗：'+error.message);return}close();await adminPayroll(t.id)};
}
async function adminHotelCards(focusTalentId=''){
  const panel=el('panel');panel.innerHTML='<div class="member-loading-card">酒店紀錄讀取中…</div>';
  const {data,error}=await sb.from('hotel_card_records').select('*').order('created_at',{ascending:false});
  if(error){panel.innerHTML=adminV108Setup('酒店上下卡紀錄');return}
  const rows=data||[],talents=S.talents.filter(t=>t.status!=='left'),grouped=new Map();
  talents.forEach(t=>grouped.set(t.id,[]));rows.forEach(x=>{if(!grouped.has(x.talent_id))grouped.set(x.talent_id,[]);grouped.get(x.talent_id).push(x)});
  panel.innerHTML=`<div class="admin-section-title grouped-title"><div><p class="eyebrow">HOTEL CARD RECORDS</p><h2>酒店上下卡紀錄</h2><p class="panel-note">一位公關一張卡。先找人，再管理她曾經上卡過的酒店。</p></div></div><section class="manager-toolbar"><div class="manager-summary"><small>公關總數</small><strong>${talents.length}</strong><span>目前共 ${rows.length} 筆酒店紀錄</span></div><div class="manager-search"><span>⌕</span><input id="hotelTalentSearch" placeholder="搜尋公關暱稱"></div></section><div class="talent-manager-grid" id="hotelTalentGrid">${renderHotelTalentCards(talents,grouped)}</div><div id="hotelModalHost"></div><div id="hotelDrawerHost"></div>`;
  const bind=()=>{document.querySelectorAll('[data-hotel-talent]').forEach(b=>b.onclick=()=>openHotelTalentDrawer(b.dataset.hotelTalent,grouped.get(b.dataset.hotelTalent)||[]))};bind();
  el('hotelTalentSearch').oninput=e=>{const q=e.target.value.trim().toLowerCase();el('hotelTalentGrid').innerHTML=renderHotelTalentCards(talents.filter(t=>t.nickname.toLowerCase().includes(q)),grouped);bind()};
  if(focusTalentId)setTimeout(()=>document.querySelector(`[data-hotel-talent="${focusTalentId}"]`)?.scrollIntoView({behavior:'smooth',block:'center'}),50);
}
function renderHotelTalentCards(talents,grouped){return talents.map(t=>{const list=grouped.get(t.id)||[],chips=list.slice(0,4).map(x=>`<span>${esc(x.venue)}<i>${esc(x.status||'曾上卡')}</i></span>`).join('');return `<article class="talent-manager-card hotel-person"><div class="manager-avatar">${(t.avatar_portrait_url||t.avatar_url)?`<img src="${esc(t.avatar_portrait_url||t.avatar_url)}" alt="${esc(t.nickname)} 大頭貼">`:`<span>${esc((t.nickname||'?').slice(0,1))}</span>`}</div><div class="manager-person-info"><small>HOTEL HISTORY</small><h3>${esc(t.nickname)}</h3><p>${list.length?`共 ${list.length} 間／筆酒店紀錄`:'尚未建立酒店紀錄'}</p><div class="hotel-mini-chips">${chips}${list.length>4?`<span class="more">＋${list.length-4}</span>`:''}</div></div><button class="manager-action ${list.length?'':'primary'}" data-hotel-talent="${t.id}">${list.length?'管理紀錄':'＋ 新增紀錄'}</button></article>`}).join('')||'<div class="member-empty-lux"><strong>找不到公關</strong><p>請換一個關鍵字搜尋。</p></div>'}
function openHotelTalentDrawer(talentId,list){const t=S.talents.find(x=>x.id===talentId);if(!t)return;const host=el('hotelDrawerHost'),box=document.createElement('div');box.className='manager-drawer-backdrop';box.innerHTML=`<aside class="manager-drawer"><div class="drawer-head"><div><p class="eyebrow">HOTEL HISTORY</p><h3>${esc(t.nickname)}｜酒店上下卡紀錄</h3><span>${list.length} 筆紀錄</span></div><button class="drawer-close">×</button></div><button class="btn btn-primary drawer-add-hotel">＋ 新增酒店紀錄</button><div class="drawer-record-list">${list.map(x=>`<article><div><small>${esc(x.status||'曾上卡')}</small><h4>${esc(x.venue)}</h4><p>上卡：${esc(x.card_on_date||'未紀錄')}　｜　下卡：${esc(x.card_off_date||'未紀錄')}</p>${x.note?`<span>${esc(x.note)}</span>`:''}</div><button class="mini-btn drawer-edit-hotel" data-id="${x.id}">編輯</button></article>`).join('')||'<div class="member-empty-lux"><strong>還沒有酒店紀錄</strong><p>日期不知道也沒關係，只填店名就能先建立。</p></div>'}</div></aside>`;host.appendChild(box);const close=()=>box.remove();box.querySelector('.drawer-close').onclick=close;box.querySelector('.drawer-add-hotel').onclick=()=>{close();openHotelCardEditor(null,talentId)};box.querySelectorAll('.drawer-edit-hotel').forEach(b=>b.onclick=()=>{const row=list.find(x=>x.id===b.dataset.id);close();openHotelCardEditor(row,talentId)})}
function openHotelCardEditor(row,focusTalentId=''){
  const host=el('hotelModalHost')||document.body,modal=document.createElement('div');modal.className='leave-modal-backdrop';modal.innerHTML=`<div class="leave-modal"><div class="leave-modal-head"><div><p class="eyebrow">HOTEL RECORD</p><h3>${row?'編輯':'新增'}上下卡紀錄</h3></div><button class="leave-close" type="button">×</button></div><form id="hotelCardEditor" class="hotel-card-editor"><label>公關<select name="talent_id" required><option value="">請選擇</option>${S.talents.map(t=>`<option value="${t.id}" ${(row?.talent_id||focusTalentId)===t.id?'selected':''}>${esc(t.nickname)}</option>`).join('')}</select></label><label>店家<select name="venue" required><option value="">請選擇店家</option>${S.venues.filter(v=>v.is_active||v.name===row?.venue).map(v=>`<option value="${esc(v.name)}" ${row?.venue===v.name?'selected':''}>${esc(v.name)}${!v.is_active?'（已停用）':''}</option>`).join('')}${row?.venue&&!S.venues.some(v=>v.name===row.venue)?`<option value="${esc(row.venue)}" selected>${esc(row.venue)}（歷史店名）</option>`:''}</select></label><div class="hotel-date-pair"><label>上卡日期（選填）<input type="date" name="card_on_date" value="${esc(row?.card_on_date||'')}"></label><label>下卡日期（選填）<input type="date" name="card_off_date" value="${esc(row?.card_off_date||'')}"></label></div><label>狀態<select name="status"><option ${row?.status==='曾上卡'?'selected':''}>曾上卡</option><option ${row?.status==='上卡中'?'selected':''}>上卡中</option><option ${row?.status==='已下卡'?'selected':''}>已下卡</option></select></label><label>備註<textarea name="note" placeholder="選填">${esc(row?.note||'')}</textarea></label><div class="leave-modal-actions"><button class="btn btn-primary" type="submit">儲存紀錄</button>${row?'<button class="btn btn-outline danger delete-hotel-record" type="button">刪除</button>':''}<button class="btn btn-outline hotel-cancel" type="button">取消</button></div><p id="hotelCardStatus" class="form-status"></p></form></div>`;host.appendChild(modal);const close=()=>modal.remove();modal.querySelector('.leave-close').onclick=close;modal.querySelector('.hotel-cancel').onclick=close;const form=modal.querySelector('#hotelCardEditor');form.onsubmit=async e=>{e.preventDefault();const x=Object.fromEntries(new FormData(form)),t=S.talents.find(v=>v.id===x.talent_id);if(!t)return;const payload={talent_id:t.id,user_id:t.user_id||null,nickname:t.nickname,venue:x.venue,card_on_date:x.card_on_date||null,card_off_date:x.card_off_date||null,status:x.status,note:x.note||null,updated_at:new Date().toISOString()};text('hotelCardStatus','儲存中…');const {error}=await(row?sb.from('hotel_card_records').update(payload).eq('id',row.id):sb.from('hotel_card_records').insert(payload));if(error){text('hotelCardStatus','❌ 儲存失敗：'+error.message);return}close();await adminHotelCards(t.id)};modal.querySelector('.delete-hotel-record')?.addEventListener('click',async()=>{if(!confirm('確定刪除這筆酒店上下卡紀錄嗎？'))return;const {error}=await sb.from('hotel_card_records').delete().eq('id',row.id);if(error){alert('刪除失敗');return}close();await adminHotelCards()});
}
function adminV108Setup(name){return `<div class="member-setup-card"><strong>${name}尚未連接資料庫</strong><p>請確認 Supabase 對應資料表與權限設定後，再重新整理網站。</p></div>`}

function mondayOf(dateLike){
 const d=new Date(dateLike);
 d.setHours(12,0,0,0);
 const day=d.getDay();
 const diff=day===0?-6:1-day;
 d.setDate(d.getDate()+diff);
 return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0');
}
function addDaysIso(iso,n){
 const d=new Date(iso+'T12:00:00');
 d.setDate(d.getDate()+n);
 return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0');
}
function weekLabel(start){
 return `${twDate(start)}～${twDate(addDaysIso(start,6))}`;
}
function workDaysForTalentWeek(talent,weekStart){
 const end=addDaysIso(weekStart,6);
 const dates=new Set(
   S.bookings
    .filter(x=>{
      const same=x.talent_id===talent.id || (talent.user_id&&x.user_id===talent.user_id);
      return same && x.booking_date>=weekStart && x.booking_date<=end && x.status==='confirmed';
    })
    .map(x=>x.booking_date)
 );
 return dates.size;
}
function talentSectionStats(talent){
 const rows=S.weeklySections
   .filter(x=>x.talent_id===talent.id)
   .map(x=>({...x,workDays:workDaysForTalentWeek(talent,x.week_start)}))
   .filter(x=>x.workDays>0)
   .sort((a,b)=>a.week_start.localeCompare(b.week_start));
 if(!rows.length)return {rows:[],count:0,best:null,worst:null,latest:null,previous:null,diff:null,pct:null};
 const best=rows.reduce((a,b)=>b.sections>a.sections?b:a);
 const worst=rows.reduce((a,b)=>b.sections<a.sections?b:a);
 const latest=rows[rows.length-1];
 const previous=rows.length>1?rows[rows.length-2]:null;
 const diff=previous?latest.sections-previous.sections:null;
 const pct=previous&&previous.sections!==0?(diff/previous.sections*100):null;
 return {rows,count:rows.length,best,worst,latest,previous,diff,pct};
}
function sectionDeltaText(stats){
 if(stats.diff===null)return '尚無前一週可比較';
 const sign=stats.diff>0?'+':'';
 if(stats.pct===null)return `${sign}${stats.diff} 節`;
 const pctSign=stats.pct>0?'+':'';
 return `${sign}${stats.diff} 節（${pctSign}${stats.pct.toFixed(1)}%）`;
}
function renderTalentSectionStats(talentId){
 const t=S.talents.find(x=>x.id===talentId);if(!t)return;
 const st=talentSectionStats(t);
 el('panel').innerHTML=`<div class="admin-section-title"><div><button class="back-sections">← 返回節數統計</button><p class="eyebrow">WEEKLY SECTIONS</p><h2>${esc(t.nickname)}｜節數紀錄</h2></div></div>
 <div class="section-summary-card">
   <h3>目前統計</h3>
   ${st.count?`
   <div class="section-summary-grid">
     <div><span>累積週數</span><strong>${st.count} 週</strong></div>
     <div><span>🏆 一週最佳紀錄</span><strong>${st.best.sections} 節</strong><small>最佳週：${weekLabel(st.best.week_start)}<br>上班天數：${st.best.workDays} 天</small></div>
     <div><span>📉 一週最低紀錄</span><strong>${st.worst.sections} 節</strong><small>最低週：${weekLabel(st.worst.week_start)}<br>上班天數：${st.worst.workDays} 天</small></div>
     <div><span>最近一週</span><strong>${st.latest.sections} 節</strong><small>${weekLabel(st.latest.week_start)}<br>較前一週：${sectionDeltaText(st)}</small></div>
   </div>`:'<p class="empty">目前還沒有符合統計條件的週資料。整週沒有實際上班的週次不納入最高／最低統計。</p>'}
 </div>
 <section class="attendance-card">
   <h3>歷史週次</h3>
   ${S.weeklySections.filter(x=>x.talent_id===t.id).sort((a,b)=>b.week_start.localeCompare(a.week_start)).map(x=>{
      const wd=workDaysForTalentWeek(t,x.week_start);
      return `<div class="record"><div class="record-main"><strong>${weekLabel(x.week_start)}｜${x.sections} 節</strong><small>上班天數：${wd} 天${wd===0?'｜本週不納入最佳／最低統計':''}</small></div></div>`;
   }).join('')||'<p class="empty">尚無歷史節數。</p>'}
 </section>`;
 document.querySelector('.back-sections').onclick=()=>renderAdminTab('sections');
}
function adminSections(){
 const today=isoDay();
 const thisMonday=mondayOf(today);
 const talents=S.talents.filter(x=>x.status==='active' || x.status==='paused');
 const rows=talents.map(t=>{
   const rec=S.weeklySections.find(x=>x.talent_id===t.id&&x.week_start===thisMonday);
   const st=talentSectionStats(t);
   return `<div class="section-entry-row">
     <div class="section-person">
       <strong>${esc(t.nickname)}</strong>
       <small>${st.count?`累積 ${st.count} 週｜最近 ${st.latest?.sections??'—'} 節`:'尚無紀錄'}</small>
     </div>
     <label class="section-input-wrap">本週節數
       <input type="number" min="0" max="10000" step="1" class="section-input" data-id="${t.id}" value="${rec?rec.sections:''}" placeholder="輸入節數">
     </label>
     <button class="mini-btn section-view" data-id="${t.id}">查看統計</button>
   </div>`;
 }).join('');
 el('panel').innerHTML=`<div class="admin-section-title"><div><p class="eyebrow">WEEKLY SECTIONS</p><h2>節數統計</h2><p class="panel-note">每週拿到主管節數表後，在這裡一次輸入。10 分鐘＝1 節。</p></div></div>
 <div class="section-toolbar">
   <label>統計週次<input type="date" id="sectionWeek" value="${thisMonday}"></label>
   <button class="btn btn-primary" id="saveSections">儲存本週節數</button>
 </div>
 <p class="section-week-hint" id="sectionWeekHint">${weekLabel(thisMonday)}</p>
 <div id="sectionRows">${rows||'<p class="empty">目前沒有可統計的公關。</p>'}</div>
 <p id="sectionSaveStatus" class="form-status"></p>
 <div class="section-rule-note">規則：整週沒有實際上班的週次，不納入最佳／最低統計，也不會以 0 節拉低紀錄。</div>`;

 const weekInput=el('sectionWeek');
 const repaint=()=>{
   const monday=mondayOf(weekInput.value||isoDay());
   weekInput.value=monday;
   text('sectionWeekHint',weekLabel(monday));
   document.querySelectorAll('.section-input').forEach(inp=>{
     const rec=S.weeklySections.find(x=>x.talent_id===inp.dataset.id&&x.week_start===monday);
     inp.value=rec?rec.sections:'';
   });
 };
 weekInput.onchange=repaint;

 document.querySelectorAll('.section-view').forEach(b=>b.onclick=()=>renderTalentSectionStats(b.dataset.id));

 el('saveSections').onclick=async()=>{
   const monday=mondayOf(weekInput.value||isoDay());
   const inputs=[...document.querySelectorAll('.section-input')];
   const payloads=inputs
     .filter(inp=>inp.value!=='')
     .map(inp=>({talent_id:inp.dataset.id,week_start:monday,sections:Number(inp.value)}))
     .filter(x=>Number.isInteger(x.sections)&&x.sections>=0);
   if(!payloads.length){text('sectionSaveStatus','請至少輸入一位公關的節數。');return}
   if(!confirm(`確定儲存 ${weekLabel(monday)} 的 ${payloads.length} 位公關節數嗎？`))return;
   el('saveSections').disabled=true;
   text('sectionSaveStatus','儲存中…');
   const {error}=await sb.from('weekly_sections').upsert(payloads,{onConflict:'talent_id,week_start'});
   if(error){
     console.error(error);
     text('sectionSaveStatus','❌ 儲存失敗，請稍後再試。');
     el('saveSections').disabled=false;
     return;
   }
   text('sectionSaveStatus','✅ 已儲存本週節數。');
   await refreshAdmin();
 };
}

function adminVenues(){
 el('panel').innerHTML=`<div class="admin-section-title"><h2>店家管理</h2><button class="mini-btn" id="addVenue">＋ 新增店家</button></div>${S.venues.map(x=>`<div class="record"><div class="record-main"><strong>${esc(x.name)}｜${esc(x.area||'未填地區')}</strong><small>${esc(x.contact||'')}</small></div><div class="venue-actions"><label><input class="va" data-id="${x.id}" type="checkbox" ${x.is_active?'checked':''}> 啟用</label><button class="mini-btn venue-delete" data-id="${x.id}" data-name="${esc(x.name)}">移除</button></div></div>`).join('')||'<p class="empty">目前沒有店家。</p>'}<div id="inlineForm"></div>`;
 document.querySelectorAll('.va').forEach(c=>c.onchange=async()=>{await sb.from('venues').update({is_active:c.checked}).eq('id',c.dataset.id);await refreshAdmin()});
 document.querySelectorAll('.venue-delete').forEach(btn=>btn.onclick=async()=>{
   if(!confirm(`確定要移除「${btn.dataset.name}」嗎？\n\n移除後將不再出現在店家管理與新的報班選單中。`))return;
   btn.disabled=true;
   const {error}=await sb.from('venues').delete().eq('id',btn.dataset.id);
   if(error){alert('移除失敗，請稍後再試。');btn.disabled=false;return}
   await refreshAdmin();
 });
 el('addVenue').onclick=()=>quickForm('venue');
}
function adminAnnouncements(){
 el('panel').innerHTML=`<div class="admin-section-title"><h2>公告管理</h2><button class="mini-btn" id="addAnn">＋ 新增公告</button></div>${S.announcements.map(x=>`<div class="record"><div class="record-main"><strong>${esc(x.title)}</strong><small>${esc(x.content)}</small></div><label><input class="aa" data-id="${x.id}" type="checkbox" ${x.is_active?'checked':''}> 公開</label></div>`).join('')||'<p class="empty">目前沒有公告。</p>'}<div id="inlineForm"></div>`;
 document.querySelectorAll('.aa').forEach(c=>c.onchange=async()=>{await sb.from('announcements').update({is_active:c.checked}).eq('id',c.dataset.id);await refreshAdmin()});el('addAnn').onclick=()=>quickForm('ann');
}
function quickForm(kind){
 const defs={talent:`<input name="nickname" placeholder="藝名" required><input name="contact" placeholder="LINE／電話"><input name="area" placeholder="地區"><input name="instagram" placeholder="Instagram">`,venue:`<input name="name" placeholder="店家名稱" required><input name="area" placeholder="地區"><input name="contact" placeholder="聯絡人／電話">`,ann:`<input name="title" placeholder="公告標題" required><textarea name="content" placeholder="公告內容" required></textarea>`};
 el('inlineForm').innerHTML=`<form id="quickForm" class="inline-form">${defs[kind]}<button class="mini-btn">儲存</button></form>`;
 el('quickForm').onsubmit=async e=>{e.preventDefault();const x=Object.fromEntries(new FormData(e.currentTarget));if(kind==='talent')await sb.from('talents').insert({nickname:x.nickname,contact:x.contact||null,area:x.area||null,instagram:x.instagram||null});if(kind==='venue')await sb.from('venues').insert({name:x.name,area:x.area||null,contact:x.contact||null});if(kind==='ann')await sb.from('announcements').insert({title:x.title,content:x.content});await refreshAdmin()};
}

document.addEventListener("click",function(e){
  const b=e.target.closest&&e.target.closest("#profilePhotoQuickSave");
  if(!b)return;
  const f=document.getElementById("profileForm");
  if(!f)return;
  b.classList.add("is-saving"); b.innerHTML='儲存中 <i>…</i>';
  if(typeof f.requestSubmit==="function")f.requestSubmit();
  else f.dispatchEvent(new Event("submit",{bubbles:true,cancelable:true}));
  setTimeout(function(){b.classList.remove("is-saving");b.innerHTML='已送出儲存 <i>✓</i>';setTimeout(function(){b.innerHTML='儲存照片 <i>✓</i>';},1400);},450);
});


document.addEventListener('DOMContentLoaded',()=>{
  const p=document.querySelector('.home25-process');
  if(!p)return;
  if(!('IntersectionObserver' in window)){p.classList.add('is-visible');return;}
  const io=new IntersectionObserver(es=>es.forEach(e=>{if(e.isIntersecting){p.classList.add('is-visible');io.disconnect();}}),{threshold:.28});
  io.observe(p);
});
