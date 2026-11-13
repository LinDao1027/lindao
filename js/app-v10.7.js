
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

const statusText={pending:'敺�Ⅱ隤�',confirmed:'撌脩Ⅱ隤�',rejected:'�芸���',cancelled:'撌脣�瘨�',leave:'隢见�'};

// ---------- Public homepage / application ----------
async function loadPublic(){
  // �砍��寧��祇��折��砍�嚗䔶��齿�靘偦�����芰蒈�亥赤摰Ｚ��硔��
}
loadPublic();

el('applyForm')?.addEventListener('submit',async e=>{
  e.preventDefault();const f=e.currentTarget,b=f.querySelector('button[type=submit]');b.disabled=true;text('applyStatus','��枂銝凌��');
  const x=Object.fromEntries(new FormData(f));
  const computedAge=ageFromBirthday(x.birthday);
  if(!computedAge||computedAge<18){text('applyStatus','�� 隢讠Ⅱ隤滨��伐��唾����蝚血��拍鍂撌乩����摰𡁜僑朣～��');b.disabled=false;return}
  const {error}=await sb.from('applications').insert({
    name:'�踹�隢株岷',nickname:x.nickname,birthday:x.birthday,age:computedAge,area:x.area,contact:x.contact,
    instagram:x.instagram||null,experience:x.experience,
    availability:x.availability||null,note:x.note||null
  });
  text('applyStatus',error?'�� ��枂憭望�嚗諹�蝔滚��滩岫��':'�� �唾��𣂼�嚗��蝝�蝡臬歇�嗅�鞈����');
  if(!error)f.reset();b.disabled=false;
});

// ---------- Talent portal ----------
async function talentPortalInit(){
  if(!el('talentPortal'))return;
  const {data:{session}}=await sb.auth.getSession();
  if(!session){renderTalentAuth();return}
  const {data:admin}=await sb.from('admin_users').select('user_id').eq('user_id',session.user.id).maybeSingle();
  if(admin){el('talentPortal').innerHTML=`<div class="portal-shell"><h1>�蹱糓�祇�撠��</h1><p>雿删𤌍�滨蒈�亦��舐恣��摱撣唾���</p><a class="btn btn-primary" href="admin.html">�滚�蝬梶�敺�蝱</a><button class="btn btn-outline" id="talentLogout">�餃枂</button></div>`;el('talentLogout').onclick=async()=>{await sb.auth.signOut();location.reload()};return}
  let {data:profile,error}=await sb.from('talents').select('*').eq('user_id',session.user.id).maybeSingle();
  if(error||!profile){renderNoProfile(session.user.email);return}
  if(profile.status==='paused'&&profile.paused_until&&profile.paused_until<=isoDay()){
    const {data:resumed,error:resumeError}=await sb.from('talents').update({status:'active',paused_until:null}).eq('id',profile.id).select('*').maybeSingle();
    if(!resumeError&&resumed)profile=resumed;
  }
  await renderTalentDashboard(profile,session.user.email);
}
talentPortalInit();


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
  if(!res.ok)throw new Error(data?.error||'�餃�憭望�');
  return data;
}

async function talentLoginWithIdentifier(identifier,password){
  const data=await talentAuthRequest({action:'login',identifier,password});
  if(!data?.session?.access_token||!data?.session?.refresh_token)throw new Error('�餃�憭望�');
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
  el('talentPortal').innerHTML=`
  <div class="portal-auth portal-auth-v79">
    <div class="portal-auth-brand"><img src="assets/lindao-emblem-transparent.png" alt=""><span>LIN DAO ENTERTAINMENT</span></div>
    <div class="portal-intro"><p class="eyebrow">PRIVATE MEMBER ACCESS 繚 V10.45</p><h1>�祇�撠��</h1><p>撠�惇��摱�餃�����𣂼𥼚�准��䰻�讠号銵具����𡃏��衤犖鞈����</p></div>
    <div class="auth-tabs"><button class="auth-tab active" data-mode="login">�餃�</button><button class="auth-tab" data-mode="signup">蝚砌�甈∟酉��</button></div>
    <div id="authBox"></div>
  </div>`;
  const show=mode=>{
    document.querySelectorAll('.auth-tab').forEach(b=>b.classList.toggle('active',b.dataset.mode===mode));
    el('authBox').innerHTML=mode==='login'
    ? `<form id="talentLoginForm" class="form-card portal-form"><label>Email �碶蝙�刻��董��<input name="identifier" required autocomplete="username" placeholder="靘见�嚗鯴iaodao88 �� name@email.com"></label><small class="login-helper">Email��蝙�刻��董�罸��臭誑�餃�嚗䔶���閬���𥟇芋撘譌��</small><label>撖�Ⅳ<input type="password" name="password" required autocomplete="current-password"></label><button class="btn btn-primary">�餃��祇�撠��</button><p id="talentAuthStatus" class="form-status">${esc(msg)}</p></form>`
    : `<form id="talentSignupForm" class="form-card portal-form"><label>�嘥�嚗𤩺黸蝔�<input name="nickname" maxlength="40" required></label><label>雿輻鍂��董��<input name="username" minlength="3" maxlength="20" required autocomplete="username" placeholder="3��20 雿滩㘚���撖怒��彍摮𨰜��. �� _"></label><small class="login-helper">銋见��舐凒�亦鍂�坔�讠�撣唾��餃�嚗䔶��臭誑蝜潛��� Email��</small><label>LINE嚗𤩺�璈�<input name="contact" maxlength="80" required></label><label>撅���啣�<input name="area" maxlength="40" placeholder="靘见�嚗𡁜蝱�梹��啣�"></label><label>Email<input type="email" name="email" required autocomplete="email"></label><label>閮剖�撖�Ⅳ<input type="password" name="password" minlength="8" required autocomplete="new-password"></label><label class="check"><input type="checkbox" required> �𤑳Ⅱ隤滚歇�娪��典極雿𦦵�瘜訫�撟湧翩嚗䔶蒂�峕�撠�董�蠘��嗵鍂�潛号�嗵恣����</label><button class="btn btn-primary">撱箇��祇�撣唾�</button><p id="talentAuthStatus" class="form-status"></p></form>`;
    if(mode==='login'){
      el('talentLoginForm').onsubmit=async e=>{e.preventDefault();const f=e.currentTarget,b=f.querySelector('button');const x=Object.fromEntries(new FormData(f));b.disabled=true;text('talentAuthStatus','�餃�銝凌��');try{await talentLoginWithIdentifier(x.identifier,x.password);location.reload()}catch(err){console.error(err);text('talentAuthStatus','�� �餃�憭望�嚗諹�蝣箄�雿輻鍂��董���Email ���蝣潦��');b.disabled=false}};
    }else{
      el('talentSignupForm').onsubmit=async e=>{e.preventDefault();const f=e.currentTarget,b=f.querySelector('button');b.disabled=true;text('talentAuthStatus','撱箇�撣唾�銝凌��');const x=Object.fromEntries(new FormData(f));x.username=String(x.username||'').trim().toLowerCase();if(!validTalentUsername(x.username)){text('talentAuthStatus','�� 雿輻鍂��董�罸��� 3��20 雿滩㘚���撖怒��彍摮𨰜��. �� _');b.disabled=false;return}try{const chk=await talentAuthRequest({action:'check_username',username:x.username});if(!chk.available){text('talentAuthStatus','�� �坔�衤蝙�刻��董�笔歇�劐犖雿輻鍂嚗諹��𥕢��卝��');b.disabled=false;return}}catch(err){text('talentAuthStatus','�� �急��⊥�蝣箄�雿輻鍂��董���隢讠�敺��閰艾��');b.disabled=false;return}const {data,error}=await sb.auth.signUp({email:x.email,password:x.password,options:{data:{nickname:x.nickname,username:x.username,contact:x.contact,area:x.area||''}}});if(error){text('talentAuthStatus','�� 閮餃�憭望�嚗�'+error.message);b.disabled=false;return}if(data.session){text('talentAuthStatus','�� 撣唾�撱箇��𣂼�嚗峕迤�券�脣��祇�撠����');setTimeout(()=>location.reload(),700)}else{text('talentAuthStatus','�� 撣唾�撌脣遣蝡卝����� Email 靽∠拳摰峕�撽𡑒�嚗���其蝙�刻��董��� Email �餃���');f.reset()}b.disabled=false};
    }
  };
  document.querySelectorAll('.auth-tab').forEach(b=>b.onclick=()=>show(b.dataset.mode));
  show('login');
}
function renderNoProfile(email){
  el('talentPortal').innerHTML=`<div class="portal-shell"><h1>撣唾��嘥��碶葉</h1><p>${esc(email)}</p><p>�桀�撠𡁏𧊋撱箇��祇�鞈��嚗諹��齿鰵�餃�銝�甈∴��乩�憿舐內甇斤𧞄�ｇ�隢贝�蝯∠�蝝���</p><button class="btn btn-outline" id="talentLogout">�餃枂</button></div>`;
  el('talentLogout').onclick=async()=>{await sb.auth.signOut();location.reload()};
}
async function renderTalentDashboard(p,email){
  const {data:venues}=await sb.from('venues').select('name').eq('is_active',true).order('name');
  const {data:myBookings}=await sb.from('bookings').select('*').eq('user_id',p.user_id).order('booking_date',{ascending:true}).order('start_time');
  const normalizedStatus={active:'active',paused:'paused',new:'new',left:'left','���銝�':'active','銝𠰴㨃銝�':'active','�怠�':'paused','隡烐�銝�':'paused','敺�祟��':'new','敺��蝝�撖拇瓲':'new','撌脤𣪧��':'left','撌脖���':'left'}[p.status]||p.status;
  const approved=normalizedStatus==='active';
  const profileStatus={new:'敺��蝝�撖拇瓲',active:'銝𠰴㨃銝�',paused:'隡烐�銝�',left:'撌脖���'}[normalizedStatus]||normalizedStatus;
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
  const nextText=nextBooking?`${twDate(nextBooking.booking_date)} 繚 ${esc(nextBooking.start_time?.slice(0,5)||'')}`:'撠𡁶��剛”';
  const taipeiHour=Number(new Intl.DateTimeFormat('en-GB',{timeZone:'Asia/Taipei',hour:'2-digit',hour12:false}).format(new Date()));
  const timeGreeting=taipeiHour>=5&&taipeiHour<11?'�拙�':taipeiHour>=11&&taipeiHour<18?'���':'�𡁜�';
  const todayRows=rows.filter(x=>x.booking_date===today&&!['cancelled','rejected'].includes(x.status));
  const todayConfirmed=todayRows.filter(x=>x.status==='confirmed');
  const todayLeave=todayRows.filter(x=>x.status==='leave');
  const todayStatusText=todayConfirmed.length?`隞𠰴予 ${esc(todayConfirmed[0].start_time?.slice(0,5)||'')} �厩号`:todayLeave.length?'隞𠰴予撌脰���':'隞𠰴予瘝埝��垍号';
  const memberPortrait=p.avatar_portrait_url||p.avatar_url||'';
  const memberCode=String(p.id||'').replace(/-/g,'').slice(0,8).toUpperCase()||'PRIVATE';
  const memberPortraitMarkup=memberPortrait
    ? `<img src="${esc(memberPortrait)}" alt="${esc(p.nickname||'�祇�')} ��摱敶Ｚ情��">`
    : `<div class="vip-portrait-fallback"><span>��</span><b>${esc((p.nickname||'?').slice(0,1))}</b><small>PRIVATE MEMBER</small></div>`;

  el('talentPortal').innerHTML=`
  <div class="portal-shell portal-v79">
    <section class="member-command-card">
      <div class="lux-motion-layer" aria-hidden="true">
        <span class="lux-orb orb-a"></span>
        <span class="lux-orb orb-b"></span>
        <span class="lux-orb orb-c"></span>
        <span class="lux-star star-a">��</span>
        <span class="lux-star star-b">��</span>
        <span class="lux-star star-c">��</span>
        <span class="lux-ring ring-a"></span>
        <span class="lux-ring ring-b"></span>
        <span class="lux-petal petal-a">��</span>
        <span class="lux-petal petal-b">��</span>
        <span class="lux-petal petal-c">��</span>
        <span class="lux-petal petal-d">��</span>
        <span class="lux-shine-line"></span>
      </div>
      <div class="member-command-main">
        <div class="member-command-brand">
          <span class="member-command-line"></span>
          <p>LIN DAO 繚 PRIVATE MEMBER</p>
          <span class="member-command-sparkle">��</span>
        </div>
        <div class="member-soft-orbit orbit-one"></div>
        <div class="member-soft-orbit orbit-two"></div>
        <p class="eyebrow">TALENT PORTAL 繚 V10.55</p>
        <div class="member-name-row">
          <div>
            <span class="member-welcome">PRIVATE MEMBER 繚 ${timeGreeting} ��</span>
            <h1>${esc(p.nickname||'�芾身摰𡁏黸蝔�')}<span class="fairy-name-suffix">撠譍�憟喉�${timeGreeting}</span></h1>
            <p class="member-soft-caption">隞𠰴予銋毺��芸楛��郊隤選�瞍�漁�啣��鞉�銝�隞嗡��� ��</p>
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
            <span class="talent-status-dot"></span><span>銝𠰴㨃銝�</span>
          </button>
          <span class="talent-status-slash">/</span>
          <button type="button" class="talent-self-status-btn status-pause ${normalizedStatus==='paused'?'is-current':''}" data-status="paused" aria-pressed="${normalizedStatus==='paused'}">
            <span class="talent-status-dot"></span><span>隡烐�銝�</span>
          </button>
        </div>
        <p class="talent-self-status-note">${normalizedStatus==='paused'&&p.paused_until?`隡烐��喃��曹� ${esc(p.paused_until)}嚚𦦵訜憭抵䌊�閙�敺拐��∩葉`:'�桀��舀迤撣詨𥼚�哨�隡烐����蝥��銝钅�曹�'}</p>
        `:`<div class="talent-profile-status status-${esc(normalizedStatus)}">${esc(profileStatus)}</div>`}
      </div>

      <aside class="member-vip-portrait" aria-label="撠𦠜旨��摱霅睃³���">
        <div class="vip-portrait-frame">
          <div class="vip-portrait-shine"></div>
          <div class="vip-portrait-image">${memberPortraitMarkup}</div>
          <div class="vip-portrait-status ${normalizedStatus==='active'?'is-live':normalizedStatus==='paused'?'is-paused':''}">
            <span></span>${normalizedStatus==='active'?'銝𠰴㨃銝�':normalizedStatus==='paused'?'隡烐�銝�':esc(profileStatus)}
          </div>
        </div>
        <div class="vip-member-plaque">
          <p>LIN DAO 繚 PRIVATE MEMBER</p>
          <strong>${esc(p.nickname||'�芾身摰𡁏黸蝔�')} 撠譍�憟�</strong>
          <div><span>MEMBER NO.</span><b>${memberCode}</b></div>
        </div>
      </aside>

      <button class="member-logout" id="talentLogout" type="button">�餃枂 ��</button>
    </section>

    <nav class="member-nav" aria-label="�祇�撠��撠舘汗">
      <button class="profile-tab active" data-section="schedule">
        <span>01</span><div><strong>�剖�銝剖� <i>��</i></strong><small>�梁号 繚 �𤑳��剛” 繚 �砍�</small></div>
      </button>
      <button class="profile-tab" data-section="profile">
        <span>02</span><div><strong>�衤犖鞈�� <i>��</i></strong><small>�舐窗�孵� 繚 �箸𧋦鞈��</small></div>
      </button>
      <button class="profile-tab" data-section="payroll">
        <span>03</span><div><strong>�芾��� <i>嚗�</i></strong><small>瘥誯�梯𢞁鞈� 繚 瘥𤩺𠯫蝭��� 繚 ��狡</small></div>
      </button>
      <button class="profile-tab" data-section="hotelcards">
        <span>04</span><div><strong>�鍦�銝𠹺��∠��� <i>��</i></strong><small>�曆��∪�摰� 繚 �交��詨‵</small></div>
      </button>
    </nav>

    ${approved?`<a class="member-announcement-ticker" id="memberAnnouncementTicker" href="announcements.html">
      <span class="ticker-label"><b>��</b> �砍�</span>
      <span class="ticker-viewport"><span class="ticker-track" id="tickerTrack">�砍�霈��碶葉��</span></span>
      <span class="ticker-more">�亦��券� ��</span>
    </a>`:''}

    <div id="talentScheduleSection" class="member-section">
      ${approved?`
      <div class="member-dashboard-grid member-booking-only">
        <div class="member-booking-column">${bookingComposer(p,venues||[])}</div>
      </div>`:`<div class="approval-box member-pause-box"><strong>${normalizedStatus==='paused'?'�桀�隡烐�銝�':'撣唾��桀�撠𡁏𧊋�𧢲𦆮�梁号'}</strong><p>${normalizedStatus==='paused'?'隡烐��罸��怠��梁号嚗𥕦��𠺶�䔶��∩葉�滚��喳虾�Ｗ儔��':'蝑匧�蝬梶�撖拇瓲�𡁻�敺䕘�撠勗虾隞仿�憪见𥼚�剛��亦��砍���'}</p></div>`}

      <section class="my-schedule member-schedule-panel">
        <div class="member-section-heading">
          <div><p class="eyebrow">MY SCHEDULE ��</p><h2>�𤑳��剛” <span class="soft-heading-mark">��</span></h2></div>
          <span class="member-count">${currentWeekDisplayRows.length+nextWeekRows.length} 蝑�＊蝷箔葉</span>
        </div>
        <div class="schedule-week-summary">
          <div><span>�祇�勗歇�梁号</span><strong>${weekRows.length}</strong><small>憭�</small></div>
          <i></i>
          <div><span>撌脩Ⅱ隤�</span><strong>${confirmedCount}</strong><small>憭�</small></div>
          <i></i>
          <div><span>敺�Ⅱ隤�</span><strong>${pendingCount}</strong><small>憭�</small></div>
        </div>
        <div class="schedule-refresh-note">
          <span>��</span>
          <div><strong>瘥誯�曹��芸��湔鰵�剛”</strong><small>銝𢠃�梁号銵冽��芸��梯�嚗𥕢��勗歇�梁��凋��舀��齿䰻�卝��</small></div>
        </div>

        <div id="myBookingList" class="member-booking-list member-booking-week-groups">
          <section class="booking-week-group">
            <div class="booking-week-head">
              <div><small>THIS WEEK</small><strong>�祇�梁号銵�</strong></div>
              <span>${esc(monday)} 嚚� ${esc(sunday)}</span>
            </div>
            ${renderMyBookings(currentWeekDisplayRows)}
          </section>

          <section class="booking-week-group next-week">
            <div class="booking-week-head">
              <div><small>NEXT WEEK</small><strong>銝钅�梁号銵�</strong></div>
              <span>${esc(nextMonday)} 嚚� ${esc(nextSunday)}</span>
            </div>
            ${renderMyBookings(nextWeekRows)}
          </section>
        </div>
      </section>

    </div>

    <div id="talentProfileSection" class="member-section" style="display:none">
      ${profileEditor(p,email)}
    </div>
    <div id="talentPayrollSection" class="member-section" style="display:none">
      <div class="member-loading-card">�芾��株��碶葉��</div>
    </div>
    <div id="talentHotelCardsSection" class="member-section" style="display:none">
      <div class="member-loading-card">�鍦�銝𠹺��∠�����碶葉��</div>
    </div>
  </div>`;

  el('talentLogout').onclick=async()=>{await sb.auth.signOut();location.reload()};
  document.querySelectorAll('.profile-tab').forEach(btn=>btn.onclick=async()=>{
    document.querySelectorAll('.profile-tab').forEach(x=>x.classList.remove('active'));
    btn.classList.add('active');
    const section=btn.dataset.section;
    ['Schedule','Profile','Payroll','HotelCards'].forEach(k=>{const node=el('talent'+k+'Section');if(node)node.style.display='none'});
    const map={schedule:'talentScheduleSection',profile:'talentProfileSection',payroll:'talentPayrollSection',hotelcards:'talentHotelCardsSection'};
    if(el(map[section]))el(map[section]).style.display='block';
    if(section==='payroll')await renderTalentPayroll(p);
    if(section==='hotelcards')await renderTalentHotelCards(p);
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
const payrollDays=[['mon_sections','銝�'],['tue_sections','鈭�'],['wed_sections','銝�'],['thu_sections','��'],['fri_sections','鈭�'],['sat_sections','��'],['sun_sections','��']];
function payrollCalc(x){
  const total=payrollDays.reduce((s,[k])=>s+Number(x[k]||0),0),rate=Number(x.section_rate||0),gross=total*rate;
  const deductionKeys=['tax_amount','cleaning_fee','laundry_fee','misc_fee','makeup_fee','advance_amount'];
  const deductions=deductionKeys.reduce((s,k)=>s+Number(x[k]||0),0);
  return {total,rate,gross,deductions,net:gross-deductions};
}
async function renderTalentPayroll(p){
  const host=el('talentPayrollSection');if(!host)return;
  host.innerHTML='<div class="member-loading-card">�芾��株��碶葉��</div>';
  const {data,error}=await sb.from('payrolls').select('*').eq('talent_id',p.id).eq('is_published',true).order('week_start',{ascending:false});
  if(error){host.innerHTML='<div class="member-setup-card"><strong>�芾��桀��賢��芸���</strong><p>隢讠眏蝞∠��∠Ⅱ隤� Supabase �芾�鞈��銵刻�甈𢠃�閮剖���</p></div>';return}
  const rows=data||[];
  host.innerHTML=`<section class="payroll-page"><div class="member-section-heading"><div><p class="eyebrow">WEEKLY PAYROLL ��</p><h2>�𤑳��芾���</h2><p class="panel-note">瘥誯�梁�蝞梹�暺鮋�隞颱�蝑�䰻�见��湔�蝝�</p></div><span class="member-count">${rows.length} 隞�</span></div><div class="payroll-compact-list">${rows.length?rows.map((x)=>renderPayrollSlip(x,false)).join(''):'<div class="member-empty-lux"><strong>�桀�����匧歇�澆���𢞁鞈�鱓</strong><p>蝬梶�蝣箄�銝衣䔄撣��嚗峕�憿舐內�券�躰ㄐ��</p></div>'}</div></section>`;
  host.querySelectorAll('.payroll-slip-top,.payroll-history-toggle').forEach(b=>b.onclick=()=>{const slip=b.closest('.payroll-slip'),d=slip.querySelector('.payroll-slip-body'),t=slip.querySelector('.payroll-history-toggle');d.hidden=!d.hidden;slip.classList.toggle('is-open',!d.hidden);if(t)t.textContent=d.hidden?'�亦��𡒊敦 嚗�':'�嗉絲�𡒊敦 嚗�'});
}
function renderPayrollSlip(x,open=false){
  const c=payrollCalc(x),start=x.week_start,end=addDaysIso(start,6),ded=[['蝔��',x.tax_amount],['皜��鞎�',x.cleaning_fee],['瘣𡑒﹝鞎�',x.laundry_fee],['�𨀣𣈲',x.misc_fee],['憒嗪垣',x.makeup_fee],['�鞉𣈲',x.advance_amount]];
  return `<article class="payroll-slip"><div class="payroll-slip-top" role="button" tabindex="0"><div class="payroll-summary-main"><small>PAYROLL 繚 ${esc(x.venue||'�芸‵摨堒�')}</small><h3>${esc(start)} �� ${esc(end)}</h3><span>${c.total} 蝭� 繚 ${x.is_published?'撌脩�蝞�':'敺��蝞�'}</span></div><div class="payroll-net"><span>撖阡�</span><strong>${money(c.net)}</strong><em>��</em></div></div><div class="payroll-slip-body" hidden><div class="payroll-core"><div><span>摨堒�</span><b>${esc(x.venue||'��')}</b></div><div><span>�嘥�</span><b>${esc(x.nickname||'��')}</b></div><div><span>蝮賜���</span><b>${c.total} 蝭�</b></div><div><span>蝭���</span><b>${money(c.rate)} / 蝭�</b></div></div><div class="payroll-days">${payrollDays.map(([k,l],idx)=>`<div><small>��${l}</small><span>${twDate(addDaysIso(start,idx)).replace(/��./,'')}</span><strong>${Number(x[k]||0)}<i>蝭�</i></strong></div>`).join('')}</div><div class="payroll-math"><div><span>蝭��貉𢞁鞈�</span><b>${c.total} � ${money(c.rate)}</b><strong>${money(c.gross)}</strong></div><div class="payroll-deductions"><p>��狡�𡒊敦</p>${ded.map(([l,v])=>`<div><span>${l}</span><b>�� ${money(v)}</b></div>`).join('')}<div class="deduction-total"><span>��狡���</span><b>�� ${money(c.deductions)}</b></div></div><div class="payroll-final"><span>撖阡��芾�</span><strong>${money(c.net)}</strong></div></div>${x.note?`<p class="payroll-note">�躰酉嚚�${esc(x.note)}</p>`:''}</div><button class="payroll-history-toggle" type="button">�亦��𡒊敦 嚗�</button></article>`;
}
async function renderTalentHotelCards(p){
  const host=el('talentHotelCardsSection');if(!host)return;
  host.innerHTML='<div class="member-loading-card">�鍦�銝𠹺��∠�����碶葉��</div>';
  const {data,error}=await sb.from('hotel_card_records').select('*').eq('talent_id',p.id).order('created_at',{ascending:false});
  if(error){host.innerHTML='<div class="member-setup-card"><strong>�鍦�蝝�����賢��芸���</strong><p>隢讠眏蝞∠��∠Ⅱ隤� Supabase �芾�鞈��銵刻�甈𢠃�閮剖���</p></div>';return}
  const rows=(data||[]).slice().sort((a,b)=>{
    const activeA=a.status==='銝𠰴㨃銝�'?0:1;
    const activeB=b.status==='銝𠰴㨃銝�'?0:1;
    if(activeA!==activeB)return activeA-activeB;
    const dateA=String(a.card_on_date||a.created_at||'');
    const dateB=String(b.card_on_date||b.created_at||'');
    return dateB.localeCompare(dateA);
  });
  host.innerHTML=`<section class="hotel-record-page"><div class="member-section-heading"><div><p class="eyebrow">PRIVATE CAREER ARCHIVE</p><h2>�鍦�銝𠹺��∠���</h2><p class="panel-note">銝𠰴㨃銝剔���������蔭���甇瑕蟮蝝�����交��鍦���</p></div><span class="member-count">${rows.length} 蝑�</span></div><div class="hotel-record-grid">${rows.map((x,i)=>`<article class="hotel-record-card hotel-status-${esc((x.status||'record').replace(/\s+/g,'-'))}"><div class="hotel-card-index">${String(i+1).padStart(2,'0')}</div><div class="hotel-card-top"><div class="hotel-record-mark"><span>��</span></div><div class="hotel-card-title"><small>LIN DAO 繚 PRIVATE RECORD</small><h3>${esc(x.venue)}</h3></div><span class="hotel-record-status">${esc(x.status||'�曆���')}</span></div><div class="hotel-record-meta"><div><span>銝𠰴㨃�交�</span><strong>${esc(x.card_on_date||'�芰���')}</strong></div><i></i><div><span>銝见㨃�交�</span><strong>${esc(x.card_off_date||'�芰���')}</strong></div></div>${x.note?`<div class="hotel-record-note"><span>PRIVATE NOTE</span><p>${esc(x.note)}</p></div>`:''}<div class="hotel-card-signature"><span>LIN DAO ENTERTAINMENT</span><b>PRIVATE ARCHIVE</b></div></article>`).join('')||'<div class="member-empty-lux"><strong>�桀�瘝埝��鍦�銝𠹺��∠���</strong><p>蝬梶��啣��曆��∪�摰嗅���＊蝷箏銁�躰ㄐ��</p></div>'}</div></section>`;
}

async function bindTalentSelfStatus(p,email){
  const root=document.querySelector('.talent-self-status');
  if(!root)return;
  root.querySelectorAll('.talent-self-status-btn').forEach(btn=>btn.onclick=async()=>{
    const next=btn.dataset.status;
    const current={active:'active',paused:'paused','���銝�':'active','銝𠰴㨃銝�':'active','�怠�':'paused','隡烐�銝�':'paused'}[p.status]||p.status;
    if(next===current)return;

    let payload;
    if(next==='paused'){
      const pausedUntil=nextMondayIso();
      if(!confirm(`蝣箏�����箝�䔶�瑼𥪯葉�滚�嚗髿n\n�祆活隡烐��喃��曹� ${pausedUntil}嚗𣬚訜憭拇��芸��Ｗ儔�䔶��∩葉�溻��`))return;
      payload={status:'paused',paused_until:pausedUntil};
    }else{
      if(!confirm('蝣箏��Ｗ儔�箝�䔶��∩葉�滚�嚗�'))return;
      payload={status:'active',paused_until:null};
    }

    root.classList.add('is-saving');
    const {data:updated,error}=await sb.from('talents').update(payload).eq('id',p.id).select('*').maybeSingle();
    root.classList.remove('is-saving');

    if(error||!updated){
      console.error(error);
      alert('���衤耨�孵仃�梹�隢讠�敺��閰艾��');
      return;
    }
    await renderTalentDashboard(updated,email);
  });
}

async function announcementsPageInit(){
  const root=el('announcementsPage');if(!root)return;
  const {data:{session}}=await sb.auth.getSession();
  if(!session){
    root.innerHTML=`<div class="announcement-page-state"><strong>隢见��餃��祇�撠��</strong><p>�砍��批捆���靘𥕦歇�餃����雿𨅯��𨀣䰻�卝��</p><a class="btn btn-primary" href="booking.html">�滚��餃�</a></div>`;
    return;
  }
  const {data:profile,error:profileError}=await sb.from('talents').select('*').eq('user_id',session.user.id).maybeSingle();
  if(profileError||!profile){
    root.innerHTML=`<div class="announcement-page-state"><strong>�曆��啣��𡏭���</strong><p>隢贝��𧼮��𨅯����𤥁�蝯∠�蝝���</p><a class="btn btn-outline" href="booking.html">餈𥪜��祇�撠��</a></div>`;
    return;
  }
  const normalized={active:'active',paused:'paused','���銝�':'active','銝𠰴㨃銝�':'active','�怠�':'paused','隡烐�銝�':'paused'}[profile.status]||profile.status;
  if(!['active','paused'].includes(normalized)){
    root.innerHTML=`<div class="announcement-page-state"><strong>�砍�撠𡁏𧊋�𧢲𦆮</strong><p>撣唾��𡁻�蝬梶�撖拇瓲敺�朖�舀䰻�见��𨳍��</p><a class="btn btn-outline" href="booking.html">餈𥪜��祇�撠��</a></div>`;
    return;
  }
  const {data,error}=await sb.from('announcements').select('*').eq('is_active',true).order('created_at',{ascending:false});
  root.innerHTML=`<section class="announcement-page-shell">
    <div class="announcement-page-head">
      <div><p class="eyebrow">MEMBER ANNOUNCEMENTS ��</p><h1>�祇��砍�</h1><p>�滩�閬讐���号�蹱��坿����圈�𡁶䰻�賣��渡��券�躰ㄐ��</p></div>
      <a class="btn btn-outline" href="booking.html">�� 餈𥪜��祇�撠��</a>
    </div>
    <div class="announcement-page-list">${error||!data?.length?'<div class="announcement-page-empty">�桀�瘝埝��砍���</div>':data.map((x,i)=>`<article class="announcement-page-card">
      <div class="announcement-page-number">${String(i+1).padStart(2,'0')}</div>
      <div class="announcement-page-content"><span>${new Date(x.created_at).toLocaleDateString('zh-TW')}</span><h2>${esc(x.title)}</h2><p>${esc(x.content)}</p></div>
      <div class="announcement-page-sparkle">��</div>
    </article>`).join('')}</div>
  </section>`;
}
announcementsPageInit();

function renderTalentAnnouncements(rows){
  return `<section class="talent-announcements">
    <div class="admin-section-title"><div><p class="eyebrow">ANNOUNCEMENTS ��</p><h2>�祇��砍�</h2></div></div>
    <div class="talent-announcement-list">${rows.length
      ? rows.map(x=>`<article class="talent-notice"><div><span>${new Date(x.created_at).toLocaleDateString('zh-TW')}</span><strong>${esc(x.title)}</strong></div><p>${esc(x.content)}</p></article>`).join('')
      : '<div class="talent-notice empty-notice"><p>�桀�瘝埝��砍���</p></div>'}</div>
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
  track.innerHTML=(data||[]).map((x,i)=>`<span class="ticker-item"><b>${esc(x.title)}</b>${x.content?`<em>${esc(x.content)}</em>`:''}</span>${i<data.length-1?'<i>��</i>':''}`).join('');
}


function talentAvatarMarkup(t,cls='',portrait=false){
  const name=esc(t?.nickname||'?');
  const initial=esc((t?.nickname||'?').slice(0,1));
  const src=portrait?(t?.avatar_portrait_url||t?.avatar_url):t?.avatar_url;
  return src
    ? `<span class="talent-avatar ${cls}"><img src="${esc(src)}" alt="${name} 憭折�鞎�" loading="lazy"></span>`
    : `<span class="talent-avatar talent-avatar-fallback ${cls}"><b>${initial}</b></span>`;
}


let pendingAvatarCrops=null;

function loadImageFile(file){
  return new Promise((resolve,reject)=>{
    const url=URL.createObjectURL(file),img=new Image();
    img.onload=()=>{URL.revokeObjectURL(url);resolve(img)};
    img.onerror=()=>{URL.revokeObjectURL(url);reject(new Error('�𣇉�霈��硋仃�𨰜��'))};
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
  return new Promise((resolve,reject)=>canvas.toBlob(b=>b?resolve(b):reject(new Error('�𣇉��閧�憭望���')),'image/webp',.9));
}

async function openAvatarCropper(file){
  if(!file)return null;
  if(!['image/jpeg','image/png','image/webp'].includes(file.type))throw new Error('�芣𣈲�� JPG��PNG��WEBP �𣇉���');
  if(file.size>10*1024*1024)throw new Error('�𣇉�隢见嚉頞�� 10MB��');
  const img=await loadImageFile(file);
  const state={zoom:1,cx:0,cy:0};
  const modal=document.createElement('div');
  modal.className='avatar-crop-modal';
  modal.innerHTML=`
    <div class="avatar-crop-dialog">
      <div class="avatar-crop-head"><div><p class="eyebrow">PHOTO CROP ��</p><h3>隤踵㟲憭折�鞎�</h3><p>�𡝗𠗊�抒�隤踵㟲雿滨蔭嚗𣬚葬�曉��芸楛�𨀣迭����硔��</p></div><button type="button" class="crop-close">�</button></div>
      <div class="avatar-crop-stage">
        <div class="crop-main"><span>銝餉��抒� 繚 3:4</span><canvas width="600" height="800"></canvas><small>�祇�撠��嚗誩��𦦵恣���撅交風</small></div>
        <div class="crop-side"><span>蝛拙�摨阡�閬� 繚 3:4</span><canvas width="600" height="800"></canvas><small>��閬���讐��梁号蝛拙�摨�</small></div>
      </div>
      <div class="avatar-crop-controls">
        <label>蝮格𦆮 <input class="crop-zoom" type="range" min="1" max="3" step=".02" value="1"></label>
        <div class="crop-hint">�湔𦻖�典椰�羓�����𡝗𠗊雿滨蔭</div>
      </div>
      <div class="avatar-crop-actions"><button type="button" class="btn btn-outline crop-cancel">�𡝗�</button><button type="button" class="btn btn-primary crop-apply">雿輻鍂�坔�贝���</button></div>
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
  if(!birthday)return '��';
  const b=new Date(birthday+'T12:00:00'),n=new Date();
  let age=n.getFullYear()-b.getFullYear();
  const m=n.getMonth()-b.getMonth();
  if(m<0||(m===0&&n.getDate()<b.getDate()))age--;
  return age>=0?age:'��';
}
function profileEditor(p,email){
  return `<section class="profile-editor">
    <div class="profile-header">
      <div>
        <p class="eyebrow">MY PROFILE</p>
        <h2>�𤑳�鞈��</h2>
        <p>�𡃏䌊撌梁��箸𧋦鞈���渡�憟踝�銋见��梁号���蝝��舐窗��凒�嫣噶��</p>
      </div>
    </div>

    <form id="profileForm" class="profile-form">
      <div class="profile-section profile-avatar-section">
        <div class="profile-avatar-copy">
          <p class="eyebrow">PROFILE PHOTO ��</p>
          <h3>�𤑳�憭折�鞎�</h3>
          <p>撱箄降雿輻鍂皜����迤�Ｕ���蝺朞䌊�嗥��抒����蝝�敺�蝱��誑撅交風�∠��孵�憿舐內��</p>
        </div>
        <div class="profile-avatar-editor">
          <div class="profile-avatar-main">
            <span class="profile-avatar-ratio">3:4</span>
            <span class="profile-avatar-preview" id="profileAvatarPreview">${p.avatar_url?`<img src="${esc(p.avatar_url)}" alt="�𤑳�憭折�鞎�">`:`<span>${esc((p.nickname||'?').slice(0,1))}</span>`}</span>
          </div>
          <div class="profile-avatar-tools">
            <strong>銝𠰴���������</strong>
            <ul><li>撱箄降雿輻鍂甇�𢒰���璆𠾼���蝺朞䌊�嗥��游��抒�</li><li>�舀螱 JPG / PNG / WEBP</li><li>�豢�敺�虾�𡝗𠗊雿滨蔭��葬��</li></ul>
            <label class="profile-avatar-upload">�豢��抒�<input id="profileAvatarInput" type="file" accept="image/jpeg,image/png,image/webp" hidden></label>
            <small>鋆��摰峕�敺䕘��劐��嫘���摮䀝耨�嫘�齿���迤撘𤩺凒�啜��</small>
          </div>
          <div class="profile-avatar-mini-preview">
            <div class="profile-preview-label"><b>�鞱汗���</b><small>蝟餌絞�折＊蝷�</small></div>
            <span class="profile-preview-frame">${p.avatar_url?`<img src="${esc(p.avatar_url)}" alt="�𤑳�憭折�鞎�">`:`<span>${esc((p.nickname||'?').slice(0,1))}</span>`}</span>
          </div>
        </div>
      </div>
      <div class="profile-section">
        <div class="profile-photo-quicksave"><div><small>PROFILE PHOTO</small><strong>�抒�隤踵㟲憟賭��𠬍�</strong><span>�湔𦻖�券�躰ㄐ�脣�嚗䔶��典�皛穃���銝钅𢒰��</span></div><button type="button" id="profilePhotoQuickSave">�脣��抒� <i>��</i></button></div><h3>�箸𧋦鞈��</h3>
        <div class="profile-grid">
          <label>憪枏�<input name="name" maxlength="40" value="${esc(p.name||'')}" placeholder="隢贝撓�亙���"></label>
          <label>�梁迂<input name="nickname" maxlength="40" required value="${esc(p.nickname||'')}" placeholder="撟喳虜雿輻鍂��黸蝔�"></label>
          <label class="profile-birthday-field">
            <span class="profile-field-title">��𠯫</span>
            <div class="profile-date-shell">
              <input type="date" name="birthday" value="${esc(p.birthday||'')}" aria-label="��𠯫">
            </div>
            <small class="profile-date-hint">暺墧��舫���𠯫��</small>
          </label>
          <label>撟湧翩<input value="${esc(ageFromBirthday(p.birthday))}" readonly class="readonly"></label>
          <label>�批³�<select name="gender"><option value="">隢钅���</option>${['憟單��','�瑟��','�嗡�','銝漤�誯蠧'].map(v=>`<option ${p.gender===v?'selected':''}>${v}</option>`).join('')}</select></label>
          <label>撅���啣�<input name="area" maxlength="40" value="${esc(p.area||'')}" placeholder="靘见�嚗𡁜蝱�𨰜��鰵��"></label>
        </div>
      </div>

      <div class="profile-section">
        <h3>�舐窗�孵�</h3>
        <div class="profile-grid">
          <label>�𧢲�嚗𦶣INE<input name="contact" maxlength="80" value="${esc(p.contact||'')}" placeholder="�𧢲��毺Ⅳ�� LINE ID"></label>
          <label>Instagram<input name="instagram" maxlength="100" value="${esc(p.instagram||'')}" placeholder="靘见�嚗鋣yourname"></label>
          <label>雿輻鍂��董��<input name="username" maxlength="20" value="${esc(p.username||'')}" placeholder="靘见�嚗䭰ana88"></label>
          <label class="profile-wide">Email<input value="${esc(email)}" readonly class="readonly"></label>
          <small class="profile-wide username-note">雿輻鍂��董�笔虾�其��餃�嚗�3��20 雿滩㘚���撖怒��彍摮𨰜��. �� _嚗𡻈mail 隞滨��臭誑�餃���</small>
        </div>
      </div>

      <div class="profile-section profile-bank-section">
        <div class="profile-bank-heading">
          <div><p class="eyebrow">PAYMENT ACCOUNT ��</p><h3>�芾��舀狡撣唾�</h3></div>
          <small>隢讠Ⅱ隤滩��蹱迤蝣綽��踹��芾��舀狡�航炊��</small>
        </div>
        <div class="bank-account-fields">
          <label class="bank-code-field">
            <span>��銵䔶誨蝣潘�銝厩Ⅳ嚗�</span>
            <input name="bank_code" inputmode="numeric" pattern="[0-9]{3}" maxlength="3" value="${esc(p.bank_code||'')}" placeholder="靘见� 822" autocomplete="off">
          </label>
          <span class="bank-account-divider">��</span>
          <label class="bank-number-field">
            <span>��銵�董��</span>
            <input name="bank_account" inputmode="numeric" pattern="[0-9]*" maxlength="30" value="${esc(p.bank_account||'')}" placeholder="隢贝撓�仿�銵�董��" autocomplete="off">
          </label>
        </div>
        <p class="bank-account-hint">��銵䔶誨蝣潸�憛� 3 雿齿彍摮梹�撣唾�隢衤�摮䀹鼈嚗誯�銵� APP 憿舐內摰峕㟲頛詨���</p>
      </div>

      <div class="profile-section">
        <h3>�衤犖鞈��</h3>
        <div class="profile-grid">
          <label>頨恍�嚗Ếm嚗�<input type="number" name="height_cm" min="120" max="220" value="${esc(p.height_cm||'')}" placeholder="靘见�嚗�165"></label>
          <label>擃娪�嚗ɑg嚗�<input type="number" step="0.1" name="weight_kg" min="30" max="200" value="${esc(p.weight_kg||'')}" placeholder="靘见�嚗�48"></label>
          <label>銵���<select name="blood_type"><option value="">隢钅���</option>${['A','B','AB','O','銝齿�璆�','銝漤�誯蠧'].map(v=>`<option ${p.blood_type===v?'selected':''}>${v}</option>`).join('')}</select></label>
        </div>
      </div>

      <div class="profile-section">
        <h3>蝺𦠜�亥�蝯�</h3>
        <div class="profile-grid">
          <label>蝺𦠜�亥�蝯∩犖<input name="emergency_contact" maxlength="80" value="${esc(p.emergency_contact||'')}" placeholder="憪枏��𣇉迂��"></label>
          <label>蝺𦠜�亥�蝯⊿𤓖閰�<input name="emergency_phone" maxlength="40" value="${esc(p.emergency_phone||'')}" placeholder="�餉店�毺Ⅳ"></label>
        </div>
      </div>

      <div class="profile-save-area">
        <button class="btn btn-primary" id="prepareSaveProfile" type="button">�脣�靽格㺿</button>
        <button class="btn btn-confirm" id="confirmSaveProfile" type="submit" style="display:none">蝣箄�靽格㺿</button>
        <button class="btn btn-outline" id="cancelSaveProfile" type="button" style="display:none">�𡝗�</button>
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
        avatarPreview.innerHTML=`<img src="${crops.preview}" alt="鋆��敺�之�剛票�鞱汗">`;
        const miniPreview=document.querySelector('.profile-preview-frame');
        if(miniPreview)miniPreview.innerHTML=`<img src="${crops.preview}" alt="鋆��敺屸�閬�">`;
        text('profileStatus','�抒�撌脰�����琜��剹���摮䀝耨�嫘�滚��齿�甇���湔鰵��');
      }catch(err){
        console.error(err);avatarInput.value='';
        text('profileStatus','�� '+(err?.message||'�抒��閧�憭望�'));
      }
    };
  }

  prepare.onclick=()=>{
    text('profileStatus','隢讠Ⅱ隤滩��坔�摰對�蝣箏�敺峕��𣬚Ⅱ隤滢耨�嫘�溻��');
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
    text('profileStatus','�脣�銝凌��');

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
      if(payload.username&&!validTalentUsername(payload.username))throw new Error('雿輻鍂��董�罸��� 3��20 雿滩㘚���撖怒��彍摮𨰜��. �� _');
      if(payload.bank_code&&!/^\d{3}$/.test(payload.bank_code))throw new Error('��銵䔶誨蝣潸�頛詨�摰峕㟲 3 蝣潭彍摮�');
      if(payload.bank_account&&!/^\d+$/.test(payload.bank_account))throw new Error('��銵�董�笔蘨�質撓�交彍摮�');
      if(pendingAvatarCrops){
        text('profileStatus','甇�銁銝𠰴�鋆��敺𣬚�憭折�鞎潑��');
        Object.assign(payload,await uploadTalentAvatarCrops(p,pendingAvatarCrops));
      }
    }catch(err){
      console.error(err);
      text('profileStatus','�� 憭折�鞎潔��喳仃�梹�'+(err?.message||'隢讠�敺��閰�'));
      confirmBtn.disabled=false;
      cancelBtn.disabled=false;
      return;
    }

    const {error}=await sb.from('talents').update(payload).eq('id',p.id);
    if(error){
      console.error(error);
      text('profileStatus',error.code==='23505'?'�� �坔�衤蝙�刻��董�笔歇�劐犖雿輻鍂嚗諹��𥕢��卝��':'�� �脣�憭望�嚗諹�蝔滚��滩岫��');
      confirmBtn.disabled=false;
      cancelBtn.disabled=false;
      return;
    }

    text('profileStatus','�� �衤犖鞈��撌脫凒�啜��');
    setTimeout(()=>location.reload(),800);
  };
}

function bookingComposer(p,venues){
  const now=new Date();
  now.setHours(12,0,0,0);
  const day=now.getDay(); // 0�� 1銝� ... 5鈭� 6��

  // �曹�嚚鮋�勗�嚗𡁏㟲�卝�峕𧋦�曹�嚚鮋�望𠯫�漤��舫�嚗���怠歇蝬㯄��餌��交���
  // �蹱糓�箔��啣��伐��唬�蝺𡁶��祇��臭誑鋆𦦵蒈�祇�梯��拇𠯫�毺��准��
  // �曹�嚚鮋�望𠯫嚗𡁶雁���閬誩�嚗諹䌊�訫��𥟇��䔶��曹�嚚鮋�望𠯫�溻��
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

  const weekNames=['�望𠯫','�曹�','�曹�','�曹�','�勗�','�曹�','�勗�'];
  const title=showingNextWeek?'銝钅�勗𥼚��':'�祇�勗𥼚��';
  const range=showingNextWeek?'銝钅�曹� 嚚� 銝钅�望𠯫':'�祇�曹� 嚚� �祇�望𠯫';

  return `<section class="booking-composer">
    <div class="admin-section-title">
      <div><p class="eyebrow">WEEKLY BOOKING ��</p><h2>${title}</h2></div>
      <span>${range}</span>
    </div>
    <div class="weekly-booking-notice is-open">
      ${showingNextWeek?'�桀�憛怠神銝钅�梁号銵剁��舫�����曹��喲�望𠯫��':'�桀�憛怠神�祇�梁号銵剁��湧�望��煺��單���𠯫�賢虾隞仿�������鈭娍��芸�����𣂷��梁号銵具��'}
    </div>
    <form id="multiBookingForm">
      <div class="date-grid weekly-date-grid">${dates.map(x=>`<label class="date-chip">
        <input type="checkbox" name="dates" value="${x.iso}">
        <span><b>${weekNames[x.date.getDay()]}</b><small>${twDate(x.iso)}</small></span>
      </label>`).join('')}</div>
      <div class="booking-fields booking-fields-simple">
        <label>摨堒振<select name="venue" required><option value="">隢钅���</option>${venues.map(v=>`<option>${esc(v.name)}</option>`).join('')}<option>�嗡�</option></select></label>
        <label>銝羓号���<input type="time" name="start" required></label>
      </div>
      <label>�躰酉<textarea name="note" maxlength="500" placeholder="�詨‵"></textarea></label>
      <button class="btn btn-primary" type="submit">��枂${showingNextWeek?'銝钅��':'�祇��'}�剛”</button>
      <p id="multiBookingStatus" class="form-status"></p>
    </form>
  </section>`;
}
function bindBookingComposer(p){
  el('multiBookingForm').onsubmit=async e=>{
    e.preventDefault();const f=e.currentTarget,b=f.querySelector('button[type=submit]');const dates=[...f.querySelectorAll('input[name=dates]:checked')].map(x=>x.value);
    if(!dates.length){text('multiBookingStatus','�𩤃� 隢贝秐撠煾����憭押��');return}
    b.disabled=true;text('multiBookingStatus',`瑼Ｘ䰻 ${dates.length} 憭拍号銵其葉�圳);
    const x=Object.fromEntries(new FormData(f));
    const {data:existing,error:checkError}=await sb.from('bookings').select('booking_date,status').eq('talent_id',p.id).in('booking_date',dates).in('status',['pending','confirmed','leave']);
    if(checkError){console.error(checkError);text('multiBookingStatus','�� �⊥�瑼Ｘ䰻�Ｘ��剛”嚗諹��齿鰵�渡�敺��閰艾��');b.disabled=false;return}
    const existed=new Set((existing||[]).map(v=>v.booking_date));
    const newDates=dates.filter(d=>!existed.has(d));
    if(!newDates.length){text('multiBookingStatus','�𩤃� �豢���𠯫�罸�撌脩��厩号銵冽�隢见�蝝����瘝埝��滩���枂��');b.disabled=false;return}
    const rows=newDates.map(d=>({user_id:p.user_id,talent_id:p.id,nickname:p.nickname,contact:p.contact||'',booking_date:d,venue:x.venue,start_time:x.start,note:x.note||null,status:'pending'}));
    const {error}=await sb.from('bookings').insert(rows);
    if(error){console.error(error);text('multiBookingStatus','�� ��枂憭望�嚗諹��齿鰵�渡�敺��閰艾��');b.disabled=false;return}
    const skipped=dates.length-newDates.length;
    text('multiBookingStatus',`�� 撌脤��枂 ${newDates.length} 憭拍号銵�${skipped?`嚗�𡖂�� ${skipped} 憭拙歇�厩����隞交𧊋�滩���枂`:''}嚗𣬚�敺��蝝�蝣箄���`);setTimeout(()=>location.reload(),1000);
  };
}
function renderMyBookings(rows){
  if(!rows.length)return '<div class="member-empty-state"><span>��</span><strong>�桀�瘝埝��剛”</strong><p>摰峕��梁号敺䕘��剛”���蝝�蝣箄����𧢲�憿舐內�券�躰ㄐ��</p></div>';
  const weekday=['��','銝�','鈭�','銝�','��','鈭�','��'];
  return rows.map(x=>{
    const d=new Date(x.booking_date+'T12:00:00');
    const md=`${d.getMonth()+1}/${d.getDate()}`;
    const wd=`��${weekday[d.getDay()]}`;
    return `<article class="my-booking-row member-shift-card">
      <div class="member-shift-date"><strong>${md}</strong><small>${wd}</small></div>
      <div class="member-shift-info">
        <span class="member-shift-venue">${esc(x.venue)}</span>
        <strong>${esc(x.start_time?.slice(0,5)||'�芸‵���')}</strong>
        <small>${x.note?esc(x.note):'�∪�閮�'}</small>
      </div>
      <div class="my-booking-side">
        <span class="booking-badge ${esc(x.status)}">${esc(statusText[x.status]||x.status)}</span>
        ${['pending','confirmed'].includes(x.status)?`<button class="cancel-booking" data-id="${x.id}">�𡝗�</button>`:''}
      </div>
    </article>`;
  }).join('');
}
function bindCancelButtons(){
  document.querySelectorAll('.cancel-booking').forEach(b=>b.onclick=async()=>{
    if(!confirm('蝣箏�閬��瘨��嗘�憭拍��梁号�𠬍�'))return;
    b.disabled=true;const {error}=await sb.from('bookings').update({status:'cancelled'}).eq('id',b.dataset.id);
    if(error){alert('�𡝗�憭望�');b.disabled=false}else location.reload();
  });
}

// ---------- Admin ----------
let S={bookings:[],applications:[],talents:[],venues:[],announcements:[],weeklySections:[]};
async function adminInit(){
 if(!el('adminApp'))return;
 const {data:{session}}=await sb.auth.getSession();
 if(!session){renderAdminLogin();return}
 const {data:m}=await sb.from('admin_users').select('user_id').eq('user_id',session.user.id).maybeSingle();
 if(!m){await sb.auth.signOut();renderAdminLogin('�坔�见董����厩恣��摱甈𢠃���');return}
 renderAdminShell(session.user.email);await refreshAdmin();
}
adminInit();
function renderAdminLogin(msg=''){
 document.body.classList.add('admin-login-mode');
 el('adminApp').classList.add('admin-login-root');
 el('adminApp').innerHTML=`
 <div class="admin-login-page">
   <div class="admin-login-ambient" aria-hidden="true">
     <span class="admin-login-orb orb-one"></span>
     <span class="admin-login-orb orb-two"></span>
     <span class="admin-login-star star-one">��</span>
     <span class="admin-login-star star-two">��</span>
   </div>

   <section class="admin-login-shell">
     <div class="admin-login-brand">
       <img src="assets/lindao-emblem-transparent.png" alt="">
       <div><span>LIN DAO ENTERTAINMENT</span><strong>�堒�憡𥟇�</strong></div>
     </div>

     <div class="admin-login-copy">
       <p class="eyebrow">EXECUTIVE ACCESS 繚 V10.45</p>
       <h1>蝬梶�蝞∠�銝剖�</h1>
       <p>���撌脫�甈羓恣��摱�餃�����函号�踺����𡏭��躰��罸�鞈�����甈𢠃�靽肽風��</p>
     </div>

     <form id="loginForm" class="admin-login-form">
       <label><span>Email</span><input type="email" name="email" required autocomplete="username" placeholder="蝞∠��� Email"></label>
       <label><span>撖�Ⅳ</span><input type="password" name="password" required autocomplete="current-password" placeholder="頛詨�撖�Ⅳ"></label>
       <button class="admin-login-submit" type="submit"><span>�餃�蝞∠�敺�蝱</span><b>��</b></button>
       <p id="loginStatus" class="form-status">${esc(msg)}</p>
     </form>

     <div class="admin-login-foot">
       <span>��</span><p>撠�平 繚 隤牐縑 繚 摰匧� 繚 �梁�</p><small>PRIVATE MANAGEMENT CONSOLE</small>
     </div>
   </section>
 </div>`;
 el('loginForm').onsubmit=async e=>{
   e.preventDefault();
   const x=Object.fromEntries(new FormData(e.currentTarget));
   text('loginStatus','�餃�銝凌��');
   const {error}=await sb.auth.signInWithPassword({email:x.email,password:x.password});
   error?text('loginStatus','�� �餃�憭望�嚗諹�蝣箄�撣唾�撖�Ⅳ��'):location.reload();
 };
}
function renderAdminShell(email){
 document.body.classList.remove('admin-login-mode');
 el('adminApp')?.classList.remove('admin-login-root');
 const nav=[
   ['dashboard','蝮質汗','OVERVIEW','��'],
   ['schedule','�剖�銝剖�','SCHEDULE CENTER','��'],
   ['talents','�祇�蝞∠�','TALENT MANAGEMENT','��'],
   ['applications','�唬犖�唾�','APPLICATIONS','��'],
   ['payroll','�芾�蝞∠�','WEEKLY PAYROLL','嚗�'],
   ['operations','蝬𨅯�蝞∠�','OPERATIONS','��']
 ];
 el('adminApp').innerHTML=`
 <div class="admin96-console">
   <aside class="admin96-sidebar">
     <div class="admin96-logo">
       <img src="assets/lindao-emblem-transparent.png" alt="">
       <div><strong>�堒�憡𥟇�</strong><small>LIN DAO ENTERTAINMENT</small></div>
     </div>
     <nav class="admin96-nav">
       ${nav.map((x,i)=>`<button data-tab="${x[0]}" class="tab ${i?'':'active'}"><i>${x[3]}</i><span><strong>${x[1]}</strong><small>${x[2]}</small></span><b>��</b></button>`).join('')}
     </nav>
     <div class="admin96-brand-card"><div>��</div><strong>撠�平 繚 隤牐縑 繚 摰匧� 繚 �梁�</strong><small>PROFESSIONAL / TRUST / SAFETY<br>PRIVACY PROTECTION</small></div>
   </aside>

   <main class="admin96-main">
     <header class="admin96-topbar">
       <div class="admin96-title"><span class="admin96-menu">��</span><div><h1>蝬梶�蝞∠�銝剖�</h1><small>MANAGEMENT CONSOLE</small></div></div>
       <div class="admin96-tools">
         <div class="admin96-date"><span>��</span><b>${new Date().toLocaleDateString('zh-TW')}</b><small>${new Date().toLocaleDateString('zh-TW',{weekday:'short'})}</small></div>
         <button id="refreshAll">�� <span>�齿鰵�渡�</span></button>
         <button id="logoutBtn">�� <span>撠誩� / 蝬梶�</span></button>
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
 <div class="admin96-stat gold"><div><span>隞𦠜𠯫撌脩Ⅱ隤�</span><small>TODAY CONFIRMED</small><strong>${S.bookings.filter(x=>x.booking_date===isoDay()&&x.status==='confirmed').length}</strong></div><i>��</i></div>
 <div class="admin96-stat rose"><div><span>敺�Ⅱ隤滚𥼚��</span><small>PENDING SCHEDULE</small><strong>${S.bookings.filter(x=>x.status==='pending').length}</strong></div><i>��</i></div>
 <div class="admin96-stat violet"><div><span>敺�祟�詨董��</span><small>PENDING APPROVAL</small><strong>${S.talents.filter(x=>x.status==='new'&&x.user_id).length}</strong></div><i>��</i></div>
 <div class="admin96-stat blue"><div><span>銝𠰴㨃銝剖���</span><small>ACTIVE TALENTS</small><strong>${S.talents.filter(x=>x.status==='active').length}</strong></div><i>��</i></div>`;
 renderAdminTab(document.querySelector('.tab.active')?.dataset.tab||'dashboard');
}
function renderAdminTab(tab){
 const stats=el('stats'); if(stats)stats.style.display=tab==='dashboard'?'grid':'none';
 if(tab==='dashboard')return adminDashboard();
 if(tab==='schedule')return adminBookings('today');
 if(['today','week','nextweek','pendingall'].includes(tab))return adminBookings(tab);
 if(tab==='applications')return adminApplications();
 if(tab==='talents')return adminTalents();
 if(tab==='sections')return adminPayroll();
 if(tab==='payroll')return adminPayroll();
 if(tab==='operations')return adminOperations();
 if(tab==='hotelcards')return adminHotelCards();
 if(tab==='venues')return adminVenues();
 if(tab==='announcements')return adminAnnouncements();
}

function openLeaveModal(bookingId){
  const row=S.bookings.find(x=>x.id===bookingId);if(!row)return;
  const host=el('leaveModalHost')||document.body;
  const types=['���','鈭见�','�毺���','�芸�','摰嗅滬�删�','�嗡�'];
  const modal=document.createElement('div');
  modal.className='leave-modal-backdrop';
  modal.innerHTML=`<div class="leave-modal">
    <div class="leave-modal-head"><div><p class="eyebrow">LEAVE</p><h3>${esc(row.nickname)}嚚�${esc(row.booking_date)}</h3></div><button class="leave-close" type="button">�</button></div>
    <form id="leaveForm">
      <label>��³�<select name="leave_type" required><option value="">隢钅������</option>${types.map(v=>`<option value="${v}" ${row.leave_type===v?'selected':''}>${v}</option>`).join('')}</select></label>
      <label>隢见��笔�嚗誩�閮�<textarea name="leave_note" maxlength="300" placeholder="靘见�嚗𡁶䔄�鉝��振銝剛𠪊���鈭�">${esc(row.leave_note||'')}</textarea></label>
      <div class="leave-modal-actions"><button class="btn btn-primary" type="submit">蝣箄�隢见�</button><button class="btn btn-outline leave-cancel" type="button">�𡝗�</button></div>
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
    text('leaveStatus','�脣�銝凌��');
    const {error}=await sb.from('bookings').update({
      status:'leave',
      leave_type:x.leave_type,
      leave_note:x.leave_note||null,
      leave_at:new Date().toISOString(),
      leave_timing:(()=>{
        const shiftAt=new Date(row.booking_date+'T'+(row.start_time||'00:00:00')+'+08:00');
        const diff=shiftAt.getTime()-Date.now();
        return diff<=24*60*60*1000?'�冽�隢见�':'銝��祈���';
      })()
    }).eq('id',bookingId);
    if(error){console.error(error);text('leaveStatus','�� 隢见��餉�憭望�');b.disabled=false;return}
    close();
    await refreshAdmin();
    if(window.__adminBookingsTab)adminBookings(window.__adminBookingsTab);
  };
}
function talentBookingRows(talent){
  return S.bookings.filter(x=>x.talent_id===talent.id || (talent.user_id&&x.user_id===talent.user_id));
}
function monthKey(dateStr){return String(dateStr||'').slice(0,7)}
function monthLabel(key){const [y,m]=key.split('-');return `${y}/${Number(m)}�Ǒ}
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
  const counts={}; leaveRows.forEach(x=>{const k=x.leave_type||'�芸�憿�';counts[k]=(counts[k]||0)+1});
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
  const valid=years.filter(x=>x.scheduled>0); if(!valid.length)return '<p class="empty">�桀�瘝埝�撟游漲�箏𠹻鞈����</p>';
  const W=760,H=235,L=42,R=18,T=18,B=42,iw=W-L-R,ih=H-T-B;
  const pts=years.map((x,i)=>({x:L+(years.length===1?iw/2:i*iw/(years.length-1)),y:T+(100-x.rate)*ih/100,...x}));
  const path=pts.map((p,i)=>`${i?'L':'M'} ${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join(' ');
  const grids=[0,25,50,75,100].map(v=>{const y=T+(100-v)*ih/100;return `<line x1="${L}" y1="${y}" x2="${W-R}" y2="${y}"/><text x="${L-8}" y="${y+4}" text-anchor="end">${v}%</text>`}).join('');
  const dots=pts.map(p=>`<circle cx="${p.x}" cy="${p.y}" r="5"><title>${p.year} 撟� ${p.scheduled?p.rate+'%':'�∟���'}</title></circle><text class="month" x="${p.x}" y="${H-15}" text-anchor="middle">${p.year}</text>`).join('');
  return `<div class="attendance-chart-wrap"><svg class="attendance-chart" viewBox="0 0 ${W} ${H}" role="img" aria-label="撟游漲�箏𠹻��隅�Ｗ�"><g class="grid">${grids}</g><path class="trend" d="${path}"/>${dots}</svg></div>`;
}
function calcTalentAttendance(talent){
  const key=isoDay().slice(0,7), m=calcTalentMonthlyAttendance(talent,key);
  return {...m,rate:Math.round(m.rate)};
}
function attendanceTrendSvg(months){
  const valid=months.filter(x=>x.scheduled>0); if(!valid.length)return '<p class="empty">�桀�瘝埝�頞喳�����箏𠹻鞈����</p>';
  const W=760,H=250,L=42,R=18,T=18,B=42,iw=W-L-R,ih=H-T-B;
  const pts=months.map((x,i)=>({x:L+(months.length===1?iw/2:i*iw/(months.length-1)),y:T+(100-x.rate)*ih/100,...x}));
  const path=pts.map((p,i)=>`${i?'L':'M'} ${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join(' ');
  const grids=[0,25,50,75,100].map(v=>{const y=T+(100-v)*ih/100;return `<line x1="${L}" y1="${y}" x2="${W-R}" y2="${y}"/><text x="${L-8}" y="${y+4}" text-anchor="end">${v}%</text>`}).join('');
  const dots=pts.map((p,i)=>`<circle cx="${p.x}" cy="${p.y}" r="4"><title>${monthLabel(p.key)} ${p.scheduled?p.rate+'%':'�∟���'}</title></circle>${(i%2===0||months.length<=6)?`<text class="month" x="${p.x}" y="${H-15}" text-anchor="middle">${monthLabel(p.key).replace(/^\d{4}\//,'')}</text>`:''}`).join('');
  return `<div class="attendance-chart-wrap"><svg class="attendance-chart" viewBox="0 0 ${W} ${H}" role="img" aria-label="瘥𤩺��箏𠹻��隅�Ｗ�"><g class="grid">${grids}</g><path class="trend" d="${path}"/>${dots}</svg></div>`;
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
  const monthRows=yearMonths.map(m=>`<div class="${m.isFuture?'future':''}"><span>${monthLabel(m.key)}${m.isCurrent?'嚗��脰�銝哨�':''}</span><span>${m.isFuture?'��':m.scheduled}</span><span>${m.isFuture?'��':m.attended}</span><span>${m.isFuture?'��':m.absent}</span><strong>${m.isFuture?'撠𡁏𧊋��':m.scheduled?m.rate+'%':'��'}</strong></div>`).join('');
  el('panel').innerHTML=`<div class="admin-section-title"><div><button class="back-attendance">�� 餈𥪜�摰峕㟲�箏𠹻���</button><h2>${esc(t.nickname)}嚚𨅯枂�歹�隢见����</h2><p class="panel-note">�箏𠹻��誑�芰����蝞梹����㕑����敺贝��亦撩�扎��枂�斤�嚗嘥祕�𥕦枂�� 繩 �匧枂�� � 100%��</p></div></div>
  <section class="attendance-year-picker"><span>�亦�撟游漲</span><div>${yearButtons}</div></section>
  <div class="attendance-stats">
    <div><span>${year} 撟湔��箏𠹻</span><strong>${yearStat.scheduled}</strong></div><div><span>${year} 撟游祕�𥕦枂��</span><strong>${yearStat.attended}</strong></div><div><span>${year} 撟渡撩�歹�隢见�</span><strong>${yearStat.absent}</strong></div><div><span>${year} 撟�${year===currentYear?'�桀�':'蝯鞟�'}�箏𠹻��</span><strong>${yearStat.scheduled?yearStat.rate+'%':'��'}</strong></div>
  </div>
  <section class="attendance-card"><h3>${year} 撟湔���枂�斤�</h3><p class="panel-note">�湔𦻖�亦� 1嚚�12 ����𧢲���枂�斤�嚗𥕦��芸����隞賭��堒�閮����</p><div class="attendance-month-table"><div class="head"><span>��遢</span><span>�匧枂��</span><span>撖阡�</span><span>蝻箏𠹻</span><span>�箏𠹻��</span></div>${monthRows}</div></section>
  <section class="attendance-card"><h3>${year} 撟渲��������躰酉</h3>${leaveRows.length?`<div class="attendance-leave-table"><div class="head"><span>�交�</span><span>��³�</span><span>憿𧼮�</span><span>隢见��躰酉</span></div>${leaveRows.map(x=>`<div><span>${esc(x.booking_date||'��')}</span><span>${esc(x.leave_type||'�芸�憿�')}</span><span>${esc(x.leave_timing||'�芸�憿�')}</span><span class="leave-note-cell">${esc(x.leave_note||'�∪�閮�')}</span></div>`).join('')}</div>`:'<p class="empty">�坔�见僑摨行��㕑��������</p>'}</section>`;
  document.querySelector('.back-attendance').onclick=()=>renderAllAttendanceAnalysis();
  document.querySelectorAll('.attendance-year-btn').forEach(b=>b.onclick=()=>renderTalentAttendance(talentId,Number(b.dataset.year)));
}
function renderAllAttendanceAnalysis(){
  const key=isoDay().slice(0,7);
  const rows=S.talents.filter(t=>['active','paused'].includes(t.status)).map(t=>({t,a:calcTalentMonthlyAttendance(t,key)})).sort((x,y)=>(x.a.scheduled?x.a.rate:101)-(y.a.scheduled?y.a.rate:101));
  const withData=rows.filter(x=>x.a.scheduled>0), avg=withData.length?Math.round(withData.reduce((n,x)=>n+x.a.rate,0)/withData.length*10)/10:0;
  el('panel').innerHTML=`<div class="admin-section-title"><div><button class="back-dashboard">�� 餈𥪜�蝮質汗</button><h2>�券��祇�嚚𨀣���枂�文���</h2><p class="panel-note">甇���箏𠹻��誑�芰����蝞梹����㕑����敺讠�蝻箏𠹻����詨��𨅯��臬��𥕦僑摨佗��湔𦻖�亦�閰脣僑 1嚚�12 ��枂�斤�����������躰酉嚗�2026 撟渲絲��風�脣僑摨行����靽萘���</p></div></div>
  <div class="attendance-stats"><div><span>蝯梯���遢</span><strong>${monthLabel(key)}</strong></div><div><span>�匧枂�方���</span><strong>${withData.length}</strong></div><div><span>�券��桀�撟喳�</span><strong>${withData.length?avg+'%':'��'}</strong></div><div><span>���蹱�嚗��80%嚗�</span><strong>${withData.filter(x=>x.a.rate<80).length}</strong></div></div>
  <section class="attendance-card"><h3>${monthLabel(key)} �券��箏𠹻��</h3><div class="all-attendance-list">${rows.map(x=>`<button class="all-attendance-person" data-id="${x.t.id}">${talentAvatarMarkup(x.t,'stability-avatar',true)}<span class="copy"><b>${esc(x.t.nickname)}</b><small>�匧枂�� ${x.a.scheduled}嚚𨅯祕�� ${x.a.attended}嚚𦦵撩�� ${x.a.absent}</small></span><span class="bar"><i><em style="width:${x.a.scheduled?x.a.rate:0}%"></em></i></span><strong class="${x.a.scheduled?(x.a.rate<50?'bad':x.a.rate<80?'mid':'good'):''}">${x.a.scheduled?x.a.rate+'%':'��'}</strong></button>`).join('')||'<p class="empty">�桀�瘝埝��祇�鞈����</p>'}</div></section>`;
  document.querySelector('.back-dashboard').onclick=()=>renderAdminTab('dashboard');
  document.querySelectorAll('.all-attendance-person').forEach(b=>b.onclick=()=>renderTalentAttendance(b.dataset.id));
}


function activateAdminGroup(group){
 document.querySelectorAll('.admin96-nav .tab').forEach(x=>x.classList.toggle('active',x.dataset.tab===group));
}
function scheduleCenterBar(active){
 return `<div class="admin-unified-head"><div><p class="eyebrow">SCHEDULE CENTER</p><h2>�剖�銝剖�</h2><p>隞𦠜𠯫��𧋦�晞���蝣箄�����餌号銵券�銝剖銁�䔶��见𧑐�嫘��</p></div><button class="btn btn-primary unified-manual-booking">嚗� 鋆𦦵蒈�剛”</button></div>
 <div class="admin-segmented" role="tablist">
   <button data-schedule-view="today" class="${active==='today'?'active':''}">隞𦠜𠯫�剛”</button>
   <button data-schedule-view="week" class="${active==='week'?'active':''}">�祇�梁号銵�</button>
   <button data-schedule-view="nextweek" class="${active==='nextweek'?'active':''}">銝钅�梁号銵�</button>
   <button data-schedule-view="pendingall" class="${active==='pendingall'?'active':''}">敺�Ⅱ隤�</button>
 </div>`;
}
function bindScheduleCenterBar(){
 document.querySelectorAll('[data-schedule-view]').forEach(b=>b.onclick=()=>{activateAdminGroup('schedule');adminBookings(b.dataset.scheduleView)});
 document.querySelector('.unified-manual-booking')?.addEventListener('click',openManualBookingModal);
}
function adminOperations(){
 activateAdminGroup('operations');
 el('panel').innerHTML=`<div class="admin-unified-head"><div><p class="eyebrow">OPERATIONS</p><h2>蝬𨅯�蝞∠�</h2><p>雿𡡞朌��身摰𡁻�銝剖銁�躰ㄐ嚗諹�撌血��詨鱓�芯��蹱�憭拍�甇���典�����賬��</p></div></div>
 <div class="operations-hub">
  <button data-op="hotelcards"><i>��</i><span><strong>銝𠹺��∠���</strong><small>蝞∠��祇��曆��∪�摰嗉��交�</small></span><b>�脣� ��</b></button>
  <button data-op="venues"><i>��</i><span><strong>摨堒振蝞∠�</strong><small>蝞∠��舫����摨堒振鞈��</small></span><b>�脣� ��</b></button>
  <button data-op="announcements"><i>��</i><span><strong>�砍�蝞∠�</strong><small>�澆���恣����𨅯���</small></span><b>�脣� ��</b></button>
  <button data-op="attendance"><i>��</i><span><strong>�箏𠹻嚗讛������</strong><small>�亦��券��祇�瘥𤩺��箏𠹻��������甇瑕蟮撟游漲鞈��</small></span><b>�脣� ��</b></button>
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
 const weekManual=weekRows.filter(x=>String(x.note||'').includes('蝬梶�鋆𦦵蒈'));
 const nextRows=confirmed.slice().sort((a,b)=>String(a.start_time||'99:99').localeCompare(String(b.start_time||'99:99')) || String(a.nickname||'').localeCompare(String(b.nickname||''))); 
 const todoCount=pending.length+newApps.length+newTalents.length;
 activateAdminGroup('dashboard');
 el('panel').innerHTML=`
 <div class="admin-home-head"><div><p class="eyebrow">TODAY AT A GLANCE</p><h2>隞𠰴予��閬�����鈭�</h2><p>擐㚚��芯��嗘�憭抵��祇�梁�甇��閬���∠�鞈��嚗𥕦��游��賡���葉�啣��厩恣��葉敹���</p></div></div>
 <div class="admin-clean-grid">
   <section class="admin96-card admin96-action-card admin-clean-priority">
    <div class="admin96-card-head"><h2>敺�齒鈭钅�</h2><small>${todoCount?'�芷＊蝷粹�閬���閧������':'�桀�瘝埝�敺�������'}</small></div>
    ${todoCount?`<div class="admin96-action-items">
      ${pending.length?`<button class="dash-go" data-tab="pendingall"><i class="gold">��</i><span><b>敺�Ⅱ隤滨号銵�</b><small>${pending.length} 蝑��蝣箄�</small></span><strong>${pending.length}</strong><em>�閧� ��</em></button>`:''}
      ${newApps.length?`<button class="dash-go" data-tab="applications"><i class="rose">��</i><span><b>�唬犖�唾�</b><small>${newApps.length} 蝑���閧�</small></span><strong>${newApps.length}</strong><em>�閧� ��</em></button>`:''}
      ${newTalents.length?`<button class="dash-go" data-tab="talents"><i class="violet">��</i><span><b>敺��蝝�撖拇瓲</b><small>${newTalents.length} �见董��</small></span><strong>${newTalents.length}</strong><em>�閧� ��</em></button>`:''}
    </div>`:`<div class="dashboard-all-clear"><strong>�� 隞𦠜𠯫敺�齒撌脫�蝛�</strong><span>�桀�瘝埝���閬���唾������𤌍��</span></div>`}
   </section>
   <section class="admin96-card admin-clean-today">
    <div class="admin96-card-head"><h2>隞𦠜𠯫�剖�</h2><button class="text-btn dash-go" data-tab="today">�亦��剖�銝剖� ��</button></div>
    <div class="admin96-ops">
      <div><span>隞𦠜𠯫�剛”</span><strong>${todayRows.length}</strong></div>
      <div><span>撌脩Ⅱ隤�</span><strong class="green">${confirmed.length}</strong></div>
      <div><span>敺�Ⅱ隤�</span><strong class="amber">${todayRows.filter(x=>x.status==='pending').length}</strong></div>
      <div><span>隢见�</span><strong class="red">${leave.length}</strong></div>
    </div>
    ${nextRows.length?`<div class="dashboard-next"><small>隞𦠜𠯫銝羓号</small>${nextRows.map(x=>`<span><b>${esc((x.start_time||'').slice(0,5)||'��')}</b><strong>${esc(x.nickname)}</strong><em>${esc(x.venue||'�芸‵摨堒振')}</em></span>`).join('')}</div>`:'<div class="dashboard-next empty"><span>隞𠰴予�桀�瘝埝�撌脩Ⅱ隤滨号銵�</span></div>'}
    ${leave.length?`<div class="admin-clean-leaves"><small>隞𦠜𠯫隢见�</small>${leave.slice(0,4).map(x=>`<span><b>${esc(x.nickname)}</b> 繚 ${esc(x.leave_type||'�芸�憿�')}${x.leave_note?` 繚 ${esc(x.leave_note)}`:''}</span>`).join('')}</div>`:''}
   </section>
 </div>
 <section class="dashboard-week-strip">
   <div><small>�祇�望�瘜�</small><strong>${twDate(weekStart)} 嚚� ${twDate(weekEnd)}</strong></div>
   <span><b>${weekRows.length}</b> �梁号鈭箸活</span><span><b>${weekLeave.length}</b> 隢见�</span><span><b>${weekPending.length}</b> 敺�Ⅱ隤�</span><span><b>${weekManual.length}</b> 鋆𦦵蒈</span>
 </section>
 <section class="dashboard-quick-actions">
   <div><small>QUICK ACTIONS</small><h3>敹恍���雿�</h3></div>
   <button data-quick="manual">嚗� 鋆𦦵蒈�剛”</button>
   <button data-quick="talent">嚗� �啣��祇�</button>
   <button data-quick="payroll">嚗� 撱箇��芾���</button>
 </section>`;
 document.querySelectorAll('.dash-go').forEach(b=>b.onclick=()=>{
   const tab=b.dataset.tab;
   if(['today','week','nextweek','pendingall'].includes(tab)){activateAdminGroup('schedule');adminBookings(tab);return;}
   const target=document.querySelector(`.admin96-nav .tab[data-tab="${tab}"]`);
   if(target)target.click(); else renderAdminTab(tab);
 });
 document.querySelector('[data-quick="manual"]')?.addEventListener('click',openManualBookingModal);
 document.querySelector('[data-quick="talent"]')?.addEventListener('click',()=>{activateAdminGroup('talents');adminTalents();setTimeout(()=>el('addTalent')?.click(),0)});
 document.querySelector('[data-quick="payroll"]')?.addEventListener('click',()=>{activateAdminGroup('payroll');adminPayroll()});
}

function openManualBookingModal(){
  const host=document.body;
  const activeTalents=S.talents.filter(x=>x.status==='active');
  if(!activeTalents.length){
    alert('�桀�瘝埝��䔶��∩葉�滨��祇��臭誑鋆𦦵蒈�剛”��');
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
  const weekNames=['�曹�','�曹�','�曹�','�勗�','�曹�','�勗�','�望𠯫'];
  const isoUTC=d=>d.toISOString().slice(0,10);

  const modal=document.createElement('div');
  modal.className='leave-modal-backdrop';
  modal.innerHTML=`<div class="leave-modal manual-booking-modal">
    <div class="leave-modal-head">
      <div><p class="eyebrow">MANUAL BOOKING</p><h3>撟怠��𡏭��餌号銵�</h3><p class="panel-note">�臭�甈∟��豢��煺��唳���𠯫嚗偦��啁��交���蝙�函㮾���摰嗚����栞��躰酉嚗䔶蒂�湔𦻖�㛖���歇蝣箄��溻��</p></div>
      <button class="leave-close" type="button">�</button>
    </div>
    <form id="manualBookingForm" novalidate>
      <label>�祇�
        <select name="talent_id" required>
          <option value="">隢钅������</option>
          ${activeTalents.map(t=>`<option value="${t.id}">${esc(t.nickname)}</option>`).join('')}
        </select>
      </label>

      <div class="manual-week-picker">
        <div class="manual-week-toolbar">
          <button type="button" class="mini-btn manual-prev-week">�� 銝𠹺���</button>
          <div class="manual-week-title"><strong>�祇�梯���</strong><small id="manualWeekRange"></small></div>
          <div class="manual-week-actions">
            <button type="button" class="mini-btn manual-this-week">�祇��</button>
            <button type="button" class="mini-btn manual-next-week">銝钅�� ��</button>
          </div>
        </div>
        <div id="manualDateGrid" class="date-grid weekly-date-grid manual-date-grid" aria-label="銴��鋆𦦵蒈�交�"></div>
        <small class="panel-note">�航��詨�憭押��虾���銝𠹺��晞��𧋦�望�銝钅�梧�銝钅�望𠯫�煺��臭誑�湔𦻖鋆𦦵蒈嚗峕䲮靘踵��滚��鉝��</small>
      </div>

      <label>摨堒振
        <select name="venue" required>
          <option value="">隢钅����摰�</option>
          ${activeVenues.map(v=>`<option value="${esc(v.name)}">${esc(v.name)}</option>`).join('')}
          <option value="�嗡�">�嗡�</option>
        </select>
      </label>
      <label>銝羓号���
        <input type="time" name="start_time" required>
      </label>
      <label>�躰酉
        <textarea name="note" maxlength="500" placeholder="靘见�嚗𡁶�蝝�鋆𦦵蒈嚚𨅯祕�𥟇�銝羓号">蝬梶�鋆𦦵蒈</textarea>
      </label>
      <div class="leave-modal-actions">
        <button class="btn btn-primary" type="submit">蝣箄�鋆𦦵蒈���豢𠯫��</button>
        <button class="btn btn-outline manual-booking-cancel" type="button">�𡝗�</button>
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
        <span><b>${weekNames[i]}</b><small>${twDate(date)}</small></span>
      </label>`;
    }).join('');
    const range=modal.querySelector('#manualWeekRange');
    if(range)range.textContent=`${twDate(isoUTC(monday))} 嚚� ${twDate(isoUTC(sunday))}`;
    const title=modal.querySelector('.manual-week-title strong');
    if(title)title.textContent=weekOffset===0?'�祇�梯���':weekOffset===1?'銝钅�梯���':weekOffset===-1?'銝𢠃�梯���':weekOffset<0?`${Math.abs(weekOffset)} �勗�鋆𦦵蒈`:`${weekOffset} �勗�鋆𦦵蒈`;
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
      start_time:String(fd.get('start_time')||'').trim(),
      note:String(fd.get('note')||'').trim()
    };
    const dates=[...form.querySelectorAll('input[name="manual_dates"]:checked')].map(i=>i.value);
    const t=S.talents.find(v=>v.id===x.talent_id);
    if(!t){text('manualBookingStatus','�𩤃� 隢见��豢��祇���'); form.querySelector('[name="talent_id"]')?.focus(); return}
    if(!dates.length){text('manualBookingStatus','�𩤃� 隢贝秐撠煾����憭押��');return}
    if(!x.venue){text('manualBookingStatus','�𩤃� 隢钅����摰嗚��'); form.querySelector('[name="venue"]')?.focus(); return}
    if(!x.start_time){text('manualBookingStatus','�𩤃� 隢见‵撖思��剜��瓐��'); form.querySelector('[name="start_time"]')?.focus(); return}

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
        return `${twDate(d)}嚗�${rows.map(b=>`${b.start_time?.slice(0,5)||'�芸‵���'} ${b.venue||''}嚗�${b.status==='leave'?'隢见�':b.status==='confirmed'?'撌脩Ⅱ隤�':'敺�Ⅱ隤�'}嚗头).join('��')}`;
      }).join('\n');
      if(!newDates.length){
        text('manualBookingStatus','�𩤃� ���豢𠯫�罸�撌脩��厩号銵冽�隢见�蝝����瘝埝��滩�鋆𦦵蒈��');
        return;
      }
      if(!confirm(`${t.nickname} �� ${existingDates.size} 憭拙歇蝬枏��函号銵剁�隢见�嚗䨵n\n${details}\n\n�嗘��交���歲�𠬍��園� ${newDates.length} 憭拍匱蝥諹��鳴�蝣箏��𠬍�`))return;
    }

    btn.disabled=true;
    text('manualBookingStatus',`鋆𦦵蒈 ${newDates.length} 憭拐葉�圳);
    const rows=newDates.map(date=>({
      nickname:t.nickname,
      contact:t.contact||'-',
      booking_date:date,
      venue:x.venue,
      start_time:x.start_time,
      shift:'�芾�',
      note:x.note||'蝬梶�鋆𦦵蒈',
      status:'confirmed',
      user_id:t.user_id||null,
      talent_id:t.id
    }));
    const {error}=await sb.from('bookings').insert(rows);
    if(error){
      console.error(error);
      text('manualBookingStatus','�� 鋆𦦵蒈憭望�嚗�'+(error.message||'隢讠�敺��閰�'));
      btn.disabled=false;
      return;
    }
    const skipped=dates.length-newDates.length;
    alert(`�� 撌脫𤜯 ${t.nickname} 鋆𦦵蒈 ${newDates.length} 憭�${skipped?`嚗�𡖂�� ${skipped} 憭拙歇�厩����隞亥歲�𥳾:''}��`);
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
 window.__adminBookingsTab=tab;
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
 title=tab==='today'?'隞𦠜𠯫�剛”':tab==='week'?'�祇�梁号銵�':tab==='nextweek'?'銝钅�梁号銵�':'���匧�蝣箄�',
 rows=tab==='pendingall'
   ? S.bookings.filter(x=>x.status==='pending')
   : S.bookings.filter(x=>x.booking_date>=f&&x.booking_date<=to&&!['cancelled','rejected'].includes(x.status)),
 L={pending:'敺�Ⅱ隤�',confirmed:'撌脩Ⅱ隤�',leave:'隢见�',rejected:'�芸���',cancelled:'撌脣�瘨�'};

 let html='',groups={};

 if(isWeekView){
   const weekdays=['�����','���銝�','���鈭�','���銝�','�����','���鈭�','�����'];
   const byDate={};
   rows.forEach(x=>{
     if(!byDate[x.booking_date])byDate[x.booking_date]=[];
     byDate[x.booking_date].push(x);
   });
   const allDates=Array.from({length:7},(_,i)=>addDaysIso(weekStart,i));
   html=allDates.map(date=>{
     const dayRows=(byDate[date]||[]).sort((a,b)=>
       String(a.start_time||'99:99').localeCompare(String(b.start_time||'99:99')) ||
       String(a.nickname||'').localeCompare(String(b.nickname||''))
     );
     const d=new Date(date+'T12:00:00');
     const md=`${d.getMonth()+1}��${d.getDate()}�匝;
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
           <strong>${dayRows.length}</strong><span>雿滚���</span>
           ${dayRows.length?`<small>撌脩Ⅱ隤� ${confirmed}${pending?` 繚 敺�Ⅱ隤� ${pending}`:''}${leave?` 繚 隢见� ${leave}`:''}</small>`:''}
         </div>
       </div>
       <div class="week-date-talents">
         ${dayRows.length?dayRows.map(x=>`
           <article class="week-talent-row ${x.status==='leave'?'leave-record':''}">
             ${talentAvatarMarkup(S.talents.find(t=>t.id===x.talent_id)||{nickname:x.nickname},'week-talent-avatar',true)}
             <div class="week-talent-main">
               <div class="week-talent-name"><strong>${esc(x.nickname)}</strong><span class="booking-badge ${esc(x.status)}">${esc(L[x.status]||x.status)}</span></div>
               <p>${esc(x.venue||'�芸‵摨堒振')} <i>繚</i> ${esc(x.start_time?.slice(0,5)||'�芸‵���')}</p>
               ${x.note?`<small>${esc(x.note)}</small>`:''}
               ${x.status==='leave'?`<small class="leave-summary">隢见�嚗�${esc(x.leave_type||'�芸�憿�')}嚚�${esc(x.leave_timing||'�芸�憿�')}${x.leave_note?`嚚�${esc(x.leave_note)}`:''}</small>`:''}
             </div>
             <div class="week-talent-actions">
               <select class="status-select bs" data-id="${x.id}">${Object.entries(L).map(([v,l])=>`<option value="${v}" ${x.status===v?'selected':''}>${l}</option>`).join('')}</select>
               <button class="delete-booking" data-id="${x.id}" data-name="${esc(x.nickname)}" data-date="${esc(x.booking_date)}">�芷膄</button>
             </div>
           </article>`).join(''):`<div class="week-date-empty"><span>��</span><p>�坔予�桀�瘝埝��祇�銝羓号</p></div>`}
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
           <small>${esc(g.contact||'�芸‵�舐窗�孵�')}嚚�${g.rows.length} 憭抬�撌脩Ⅱ隤� ${confirmedCount}嚚𡏭��� ${leaveCount}嚚𨅯�蝣箄� ${pendingCount}</small>
         </div>
         <div class="bulk-actions">
           ${pendingCount?`<button class="mini-btn confirm-all" data-key="${esc(g.key)}">�券�蝣箄�</button>`:''}
         </div>
       </div>
       <div class="talent-booking-days">
         ${g.rows.map(x=>`<div class="record compact-record ${x.status==='leave'?'leave-record':''}">
           <div class="record-main">
             <strong>${esc(x.booking_date)}嚚�${esc(x.venue)}</strong>
             <small>銝羓号 ${esc(x.start_time?.slice(0,5))}嚚�${esc(x.note||'�∪�閮�')}</small>
             ${x.status==='leave'?`<small class="leave-summary">隢见�嚗�${esc(x.leave_type||'�芸�憿�')}嚚�${esc(x.leave_timing||'�芸�憿�')}${x.leave_note?`嚚�${esc(x.leave_note)}`:''}</small>`:''}
           </div>
           <div class="booking-row-actions">
             <select class="status-select bs" data-id="${x.id}">${Object.entries(L).map(([v,l])=>`<option value="${v}" ${x.status===v?'selected':''}>${l}</option>`).join('')}</select>
             ${tab==='today'?`<button class="mini-btn leave-booking" data-id="${x.id}" data-name="${esc(x.nickname)}" data-date="${esc(x.booking_date)}">隢见�</button>`:''}
             <button class="delete-booking" data-id="${x.id}" data-name="${esc(x.nickname)}" data-date="${esc(x.booking_date)}">�芷膄</button>
           </div>
         </div>`).join('')}
       </div>
     </div>`;
   }).join('');
 }

 activateAdminGroup('schedule');
 el('panel').innerHTML=`${scheduleCenterBar(tab)}<div class="admin-section-title compact-title"><div><h2>${title}</h2><span>${rows.length} 蝑�</span></div></div>${isWeekView?`<div class="week-schedule-note"><span>��</span><p>${tab==='nextweek'?'�𣂼��亦��祇�撌脣𥼚����梁号銵剁��嫣噶摰㗇�鈭箏�����拍Ⅱ隤溻��':'靘脲𠯫��㟲��𧋦�梁号銵剁��湔𦻖�𧢲�憭拇��芯��祇�銝羓号嚗𥟇��餅風�脩号銵典虾�湔𦻖�其��嫘�諹��餌号銵具�溻��'}</p></div>${html}`:(rows.length?html:'<p class="empty">�桀�瘝埝��剛”��</p>')}
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
   if(error){console.error(error);alert('���𧢲凒�啣仃�梹�隢讠�敺��閰艾��');const row=S.bookings.find(x=>x.id===sel.dataset.id);if(row)sel.value=row.status;return}
   await refreshAdmin();
   adminBookings(window.__adminBookingsTab||tab||'today');
 });

 document.querySelectorAll('.leave-booking').forEach(btn=>btn.onclick=()=>openLeaveModal(btn.dataset.id));

 document.querySelectorAll('.delete-booking').forEach(btn=>btn.onclick=async()=>{
   if(!confirm(`蝣箏�瘞訾��芷膄 ${btn.dataset.name} ${btn.dataset.date} �嗵��剛”�𠬍�`))return;
   btn.disabled=true;
   const {error}=await sb.from('bookings').delete().eq('id',btn.dataset.id);
   if(error){alert('�芷膄憭望�嚗𡁶𤌍�滚董����匧⏛�斗��琜�隢贝�蝯∠恣��摱閮剖���');btn.disabled=false;return}
   await refreshAdmin();
   adminBookings(window.__adminBookingsTab||tab||'today');
 });

 document.querySelectorAll('.confirm-all').forEach(btn=>btn.onclick=async()=>{
   const g=groups[btn.dataset.key];
   if(!g)return;
   const ids=g.rows.filter(x=>x.status==='pending').map(x=>x.id);
   if(!ids.length)return;
   if(!confirm(`蝣箏�閬��甈∠Ⅱ隤� ${g.nickname} �� ${ids.length} 憭拍号銵典�嚗鬮))return;
   btn.disabled=true;
   const {error}=await sb.from('bookings').update({status:'confirmed'}).in('id',ids);
   if(error){
     alert('�寞活蝣箄�憭望�嚗諹�蝔滚��滩岫��');
     console.error(error);
     btn.disabled=false;
     return;
   }
   await refreshAdmin();
   adminBookings(window.__adminBookingsTab||tab||'pendingall');
 });
}
function adminApplications(){
 const L={new:'敺��蝯�',contacted:'撌脰�蝯�',declined:'銝滩�蝯�'};

 const cards=S.applications.map(x=>`
   <div class="application-card">
     <div class="application-head">
       <div>
         <strong>${esc(x.nickname)}嚚�${esc(x.age)} 甇�</strong>
         <small>${esc(x.area)}嚚𦦵𤚗隢𧢲��橒�${x.created_at?new Date(x.created_at).toLocaleString('zh-TW',{timeZone:TAIPEI_TZ}):'��'}</small>
       </div>
       <select class="status-select aps" data-id="${x.id}">
         <option value="new" ${x.status==='new'?'selected':''}>敺��蝯�</option>
         <option value="contacted" ${x.status==='contacted'?'selected':''}>撌脰�蝯�</option>
         <option value="declined">銝滩�蝯∴��芷膄嚗�</option>
       </select>
     </div>
     <div class="application-grid">
       <div class="application-field"><span>憪枏�</span><b>${esc(x.name||'�芸‵')}</b></div>
       <div class="application-field"><span>�梁迂</span><b>${esc(x.nickname||'�芸‵')}</b></div>
       <div class="application-field"><span>��𠯫</span><b>${esc(x.birthday||'�芸‵')}</b></div>
       <div class="application-field"><span>撟湧翩</span><b>${esc(x.age||'�芸‵')}</b></div>
       <div class="application-field"><span>撅���啣�</span><b>${esc(x.area||'�芸‵')}</b></div>
       <div class="application-field"><span>�𧢲�嚗𦶣INE</span><b>${esc(x.contact||'�芸‵')}</b></div>
       <div class="application-field"><span>Instagram</span><b>${esc(x.instagram||'�芣�靘�')}</b></div>
       <div class="application-field"><span>�㗇��厩㮾�𨅯極雿𦦵�撽�</span><b>${esc(x.experience||'�芸‵')}</b></div>
       <div class="application-field application-wide"><span>�臬極雿𨀣���</span><b>${esc(x.availability||'�芸‵')}</b></div>
       <div class="application-field application-wide"><span>�喃�閫���批捆嚗讛���牧��</span><b class="application-note">${esc(x.note||'�芸‵')}</b></div>
       <div class="application-field application-wide"><span>�唾����</span><b>${x.created_at?new Date(x.created_at).toLocaleString('zh-TW',{timeZone:TAIPEI_TZ}):'��'}</b></div>
       <div class="application-field application-wide"><span>�桀��閧�����</span><b>${esc(x.status==='contacted'?'撌脰�蝯�':'敺��蝯�')}</b></div>
     </div>
   </div>`).join('');

 el('panel').innerHTML=`<div class="admin-section-title"><div><h2>�唬犖�唾�</h2><p class="panel-note">�豢��䔶��舐窗�齿�瘞訾��芷膄�嗵��唬犖�唾���</p></div><span>${S.applications.length} 蝑�</span></div>${cards||'<p class="empty">�桀�瘝埝��唬犖�唾���</p>'}`;

 document.querySelectorAll('.aps').forEach(s=>s.onchange=async()=>{
   const id=s.dataset.id;
   if(s.value==='declined'){
     const person=S.applications.find(x=>x.id===id);
     if(!confirm(`蝣箏��䔶��舐窗��${person?.nickname||'�嗘��唬犖'}�𠬍�

蝣箄�敺峕�瘞訾��芷膄�嗵��唾�鞈����`)){
       s.value=person?.status==='contacted'?'contacted':'new';
       return;
     }
     s.disabled=true;
     const {error}=await sb.from('applications').delete().eq('id',id);
     if(error){alert('�芷膄憭望�嚗諹�蝔滚��滩岫��');s.disabled=false;return}
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
  if(!talent){ alert('�曆��圈�嗘��祇�鞈��嚗諹��齿鰵�渡�敺��閰艾��'); return false; }

  const normalized={
    active:'active', paused:'paused', new:'new', left:'left',
    '���銝�':'active','銝𠰴㨃銝�':'active','�怠�':'paused','隡烐�銝�':'paused',
    '敺�祟��':'new','敺��蝝�撖拇瓲':'new','撌脤𣪧��':'left','撌脖���':'left'
  }[nextStatus]||nextStatus;

  if(!['active','paused','new','left'].includes(normalized)){
    alert('�⊥�颲刻��坔�见��𦦵��卝��');
    return false;
  }

  let payload={status:normalized};
  if(normalized==='paused'){
    const pausedUntil=nextMondayIso();
    if(!confirm(`蝣箏�撠� ${talent.nickname||'�嗘��祇�'} 閮剔��䔶�瑼𥪯葉�滚�嚗髿n\n隡烐��喃��曹� ${pausedUntil}嚗𣬚訜憭拍頂蝯望��芸��Ｗ儔�䔶��∩葉�溻��`)) return false;
    payload.paused_until=pausedUntil;
  }else{
    if(normalized==='active' && !confirm(`蝣箏�撠� ${talent.nickname||'�嗘��祇�'} 閮剔��䔶��∩葉�滚�嚗鬮)) return false;
    if(normalized==='left' && !confirm(`蝣箏�撠� ${talent.nickname||'�嗘��祇�'} 閮剔���歇銝见㨃�滚�嚗髿n\n銝见㨃敺峕�敺硺蜓閬���𨅯��桃宏�啜��歇銝见㨃�祇��㵪�銋见��舫���偶銋�⏛�方��蹱��Ｗ儔銝𠰴㨃��`)) return false;
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
    alert('�祇����𧢲凒�啣仃�梹�隢讠�敺��閰艾��');
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
   <article class="talent-person-card">
     <div class="talent-person-photo">
       ${talentAvatarMarkup(x,'talent-card-avatar')}
       <span class="talent-card-status status-${esc(x.status||'')}">${esc(({active:'銝𠰴㨃銝�',new:'敺�祟��',paused:'隡烐�銝�',left:'撌脖���'})[x.status]||x.status||'�芾身摰�')}</span>
     </div>
     <div class="talent-person-info">
       <div class="talent-person-name">
         <h3>${esc(x.nickname)}</h3>
         ${x.user_id?'<span class="account-tag">撣唾�</span>':'<span class="legacy-tag">�芰�摰�</span>'}
       </div>
       <p>${esc(x.area||'�芸‵�啣�')}</p>
       <small>${esc(x.contact||x.email||'�芸‵�舐窗�孵�')}</small>
       ${x.status==='paused'&&x.paused_until?`<small class="pause-until">隡烐��� ${esc(x.paused_until)}</small>`:''}
     </div>
     <div class="talent-card-actions">
       <button class="mini-btn talent-profile-view" data-id="${x.id}">摰峕㟲鞈��</button>
       <button class="mini-btn talent-attendance" data-id="${x.id}">蝛拙�摨�</button>
       <button class="mini-btn view-14" data-id="${x.id}">餈�14憭�</button>
     </div>
     <select class="status-select ts talent-card-select" data-id="${x.id}">
       ${[['active','銝𠰴㨃銝�'],['new','敺��蝝�撖拇瓲'],['paused','隡烐�銝�'],['left','撌脖���']].map(([v,l])=>`<option value="${v}" ${x.status===v?'selected':''}>${l}</option>`).join('')}
     </select>
   </article>`;

 const leftCard=x=>`
   <article class="talent-left-card">
     ${talentAvatarMarkup(x,'talent-left-avatar')}
     <div class="talent-left-info">
       <small>OFF CARD</small>
       <h3>${esc(x.nickname)}</h3>
       <p>${esc(x.area||'�芸‵�啣�')} 繚 ${esc(x.contact||x.email||'�芸‵�舐窗�孵�')}</p>
     </div>
     <div class="talent-left-actions">
       <button class="mini-btn restore-talent" data-id="${x.id}">�Ｗ儔銝𠰴㨃</button>
       <button class="mini-btn danger permanent-delete-talent" data-id="${x.id}" data-name="${esc(x.nickname)}">瘞訾��芷膄鞈��</button>
     </div>
   </article>`;

 el('panel').innerHTML=`
 <div class="admin-section-title talent-grid-title">
   <div><h2>�祇�蝞∠�</h2><p class="panel-note">銝𠰴㨃銝哨�隡烐�銝剖��𣈯＊蝷箏銁銝餉��滚鱓嚗𥕦歇銝见㨃��宏�唬��寧崕蝡见��麄��</p></div>
   <button class="mini-btn" id="addTalent">嚗� �啣��芰�摰𡁜���</button>
 </div>

 <div class="talent-card-grid">
   ${activeTalents.map(card).join('')||'<p class="empty">�桀�瘝埝�銝𠰴㨃銝剔��祇���</p>'}
 </div>

 ${leftTalents.length?`
 <section class="left-talent-section">
   <div class="left-talent-section-head">
     <div><p class="eyebrow">OFF CARD TALENTS</p><h3>撌脖��∪���</h3><small>�躰ㄐ銝齿��箇𣶹�其蜓閬���𨅯��柴��Ⅱ隤滢��漤�閬���舀偶銋�⏛�扎��</small></div>
     <span>${leftTalents.length} 雿�</span>
   </div>
   <div class="left-talent-list">${leftTalents.map(leftCard).join('')}</div>
 </section>`:''}

 <div id="inlineForm"></div>`;

 document.querySelectorAll('.talent-profile-view').forEach(b=>b.onclick=()=>renderTalentProfileAdmin(b.dataset.id));
 document.querySelectorAll('.talent-attendance').forEach(b=>b.onclick=()=>renderTalentAttendance(b.dataset.id));
 document.querySelectorAll('.view-14').forEach(b=>b.onclick=()=>renderTalent14Days(b.dataset.id));
 document.querySelectorAll('.ts').forEach(s=>s.onchange=async()=>{
   const prev=S.talents.find(x=>String(x.id)===String(s.dataset.id))?.status;
   const ok=await updateTalentStatus(s.dataset.id,s.value);
   if(!ok&&prev)s.value=prev;
 });
 document.querySelectorAll('.restore-talent').forEach(b=>b.onclick=()=>updateTalentStatus(b.dataset.id,'active'));
 document.querySelectorAll('.permanent-delete-talent').forEach(b=>b.onclick=()=>permanentDeleteTalent(b.dataset.id,b.dataset.name));
 el('addTalent').onclick=renderAddTalentForm;
}

async function permanentDeleteTalent(talentId,nickname='�嗘��祇�'){
  const talent=S.talents.find(x=>String(x.id)===String(talentId));
  if(!talent)return;

  const first=confirm(`蝣箏�瘞訾��芷膄��${nickname}�滨��祇�鞈���𠬍�\\n\\n甇斗�雿𦦵�瘜訫儔�麄��`);
  if(!first)return;
  const second=confirm(`��敺𣬚Ⅱ隤㵪��毺�閬�偶銋�⏛�扎��${nickname}�㵪�\\n\\n�芾��柴���摨𦯀�銝见㨃蝝������迨�祇��湔𦻖�𡏭�����坔虾�賣�銝�韏瑕⏛�扎��`);
  if(!second)return;

  const {error}=await sb.from('talents').delete().eq('id',talentId);
  if(error){
    console.error('permanentDeleteTalent failed',error);
    alert('�芷膄憭望�嚗�'+(error.message||'隢讠�敺��閰�'));
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
            <p class="eyebrow">QUICK TALENT CREATE ��</p>
            <h3>�啣��芰�摰𡁜���</h3>
            <p>��遣蝡见��𡏭��辷�銋见��滩��砌犖閮餃�嚗讐�摰𡁜董�煺��臭誑��</p>
          </div>
          <button type="button" class="unbound-close" aria-label="�𣈯�">�</button>
        </div>

        <form id="unboundTalentForm" class="unbound-talent-form">
          <div class="unbound-grid">
            <label>
              <span>�嘥�嚗𤩺黸蝔� <b>*</b></span>
              <input name="nickname" maxlength="40" required placeholder="靘见�嚗𡁜�蝐�">
            </label>
            <label>
              <span>憪枏�</span>
              <input name="name" maxlength="40" placeholder="�詨‵">
            </label>
            <label>
              <span>�𧢲�嚗𦶣INE</span>
              <input name="contact" maxlength="80" placeholder="�詨‵">
            </label>
            <label>
              <span>撅���啣�</span>
              <input name="area" maxlength="40" placeholder="靘见�嚗𡁜蝱�𨰜��鰵��">
            </label>
            <label>
              <span>�桀�����</span>
              <select name="status">
                <option value="active">銝𠰴㨃銝�</option>
                <option value="new">敺��蝝�撖拇瓲</option>
                <option value="paused">隡烐�銝�</option>
                <option value="left">撌脖���</option>
              </select>
            </label>
          </div>

          <div class="unbound-notice">
            <span>��</span>
            <p>�嗵�鞈��銝齿�撱箇��餃�撣唾�嚗峕�隞交����蝷箇��峕𧊋蝬���溻��</p>
          </div>

          <div class="unbound-actions">
            <button class="btn btn-primary" type="submit">撱箇��祇�鞈��</button>
            <button class="btn btn-outline unbound-cancel" type="button">�𡝗�</button>
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
    text('unboundTalentStatus','撱箇�銝凌��');

    const x=Object.fromEntries(new FormData(form));
    const nickname=String(x.nickname||'').trim();
    if(!nickname){
      text('unboundTalentStatus','�� 隢贝撓�亥��㵪��梁迂��');
      submit.disabled=false;
      return;
    }

    const duplicate=S.talents.find(t=>String(t.nickname||'').trim().toLowerCase()===nickname.toLowerCase());
    if(duplicate && !confirm(`�桀�撌脩��劐�雿溻��${nickname}�溻��\n\n隞滨�閬�鰵憓𧼮𡖂銝�蝑�𧊋蝬���祇��𠬍�`)){
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
      text('unboundTalentStatus','�� 撱箇�憭望�嚗�'+(error.message||'隢讠�敺��閰�'));
      submit.disabled=false;
      return;
    }

    text('unboundTalentStatus','�� 撌脣遣蝡𧢲𧊋蝬���祇���');
    if(data)S.talents.push(data);
    await refreshAdmin();
    setTimeout(()=>renderAdminTab('talents'),350);
  };
}


function renderTalentProfileAdmin(talentId){
 const t=S.talents.find(x=>x.id===talentId);if(!t)return;
 const a=calcTalentAttendance(t);
 const statusLabel={active:'銝𠰴㨃銝�',paused:'隡烐�銝�',new:'敺�祟��'}[t.status]||t.status;
 el('panel').innerHTML=`
 <div class="admin-section-title"><div><button class="back-talents">�� 餈𥪜��祇�蝞∠�</button><h2>${esc(t.nickname)}嚚𨅯�衤犖撅交風</h2></div></div>

 <section class="talent-resume-card">
   <aside class="talent-resume-photo">
     ${talentAvatarMarkup(t,'talent-resume-avatar')}
     <h3>${esc(t.nickname||'�芾身摰𡁏黸蝔�')}</h3>
     <span class="resume-status status-${esc(t.status||'')}">${esc(statusLabel)}</span>
     <small>${esc(t.area||'�芸‵�啣�')}</small>
   </aside>

   <div class="talent-resume-body">
     <div class="talent-resume-heading">
       <div><p class="eyebrow">TALENT PROFILE</p><h2>${esc(t.name||t.nickname||'�芸‵憪枏�')}</h2></div>
       <div class="resume-mini-stats">
         <div><span>撟湧翩</span><b>${esc(ageFromBirthday(t.birthday))}</b></div>
         <div><span>頨恍�</span><b>${t.height_cm?esc(t.height_cm)+' cm':'��'}</b></div>
         <div><span>蝛拙�摨�</span><b>${a.scheduled?a.rate+'%':'��'}</b></div>
       </div>
     </div>

     <div class="application-grid talent-resume-grid">
      <div class="application-field"><span>憪枏�</span><b>${esc(t.name||'�芸‵')}</b></div>
      <div class="application-field"><span>�梁迂</span><b>${esc(t.nickname||'�芸‵')}</b></div>
      <div class="application-field"><span>��𠯫</span><b>${esc(t.birthday||'�芸‵')}</b></div>
      <div class="application-field"><span>�批³�</span><b>${esc(t.gender||'�芸‵')}</b></div>
      <div class="application-field"><span>撅���啣�</span><b>${esc(t.area||'�芸‵')}</b></div>
      <div class="application-field"><span>�𧢲�嚗𦶣INE</span><b>${esc(t.contact||'�芸‵')}</b></div>
      <div class="application-field"><span>Instagram</span><b>${esc(t.instagram||'�芸‵')}</b></div>
      <div class="application-field"><span>Email</span><b>${esc(t.email||'�芸‵')}</b></div>
      <div class="application-field"><span>頨恍�</span><b>${t.height_cm?esc(t.height_cm)+' cm':'�芸‵'}</b></div>
      <div class="application-field"><span>擃娪�</span><b>${t.weight_kg?esc(t.weight_kg)+' kg':'�芸‵'}</b></div>
      <div class="application-field"><span>銵���</span><b>${esc(t.blood_type||'�芸‵')}</b></div>
      <div class="application-field"><span>蝺𦠜�亥�蝯∩犖</span><b>${esc(t.emergency_contact||'�芸‵')}</b></div>
      <div class="application-field"><span>蝺𦠜�亥�蝯⊿𤓖閰�</span><b>${esc(t.emergency_phone||'�芸‵')}</b></div>
     </div>

     <section class="admin-bank-card">
       <div class="admin-bank-card-head">
         <div><p class="eyebrow">PAYMENT ACCOUNT ��</p><h3>�芾��舀狡鞈��</h3></div>
         <span>${t.bank_code&&t.bank_account?'鞈��撌脣‵撖�':'撠𡁏𧊋摰峕㟲憛怠神'}</span>
       </div>
       <div class="admin-bank-account-row">
         <div class="admin-bank-code">
           <small>��銵䔶誨蝣�</small>
           <strong>${esc(t.bank_code||'�芸‵')}</strong>
         </div>
         <i>��</i>
         <div class="admin-bank-number">
           <small>��銵�董��</small>
           <strong>${esc(t.bank_account||'�芸‵')}</strong>
         </div>
         ${t.bank_account?`<button type="button" class="copy-bank-account" data-bank="${esc(t.bank_account)}">銴�ˊ撣唾�</button>`:''}
       </div>
       <p>甇方��嗵眏�祇��砌犖�潦���衤犖鞈�� �� �芾��舀狡撣唾��滚‵撖怒��</p>
     </section>

     <div class="profile-hub">
       <button class="mini-btn profile-bookings" data-id="${t.id}">餈烐��剛”</button>
       <button class="mini-btn profile-attendance" data-id="${t.id}">�箏𠹻嚗讛������</button>
       <button class="mini-btn profile-payroll" data-id="${t.id}">�芾�蝝���</button>
       <button class="mini-btn profile-trend" data-id="${t.id}">瘥誯�梁��貉隅��</button>
       <button class="mini-btn profile-hotels" data-id="${t.id}">�曆��∪�摰�</button>
     </div>
   </div>
 </section>`;
 document.querySelector('.profile-bookings')?.addEventListener('click',()=>renderTalent14Days(t.id));
 document.querySelector('.profile-attendance')?.addEventListener('click',()=>renderTalentAttendance(t.id));
 document.querySelector('.profile-payroll')?.addEventListener('click',()=>renderTalentPayrollHistory(t.id));
 document.querySelector('.profile-trend')?.addEventListener('click',()=>renderTalentSectionTrend(t.id));
 document.querySelector('.profile-hotels')?.addEventListener('click',()=>adminHotelCards(t.id));
 document.querySelector('.copy-bank-account')?.addEventListener('click',async e=>{
   const btn=e.currentTarget,account=btn.dataset.bank||'';
   try{
     await navigator.clipboard.writeText(account);
     const old=btn.textContent;btn.textContent='撌脰�鋆� ��';
     setTimeout(()=>btn.textContent=old,1400);
   }catch(err){
     console.error(err);
     alert('銴�ˊ憭望�嚗諹��见��詨�撣唾���');
   }
 });
 document.querySelector('.back-talents').onclick=()=>renderAdminTab('talents');
}

function renderTalent14Days(talentId){
 const t=S.talents.find(x=>x.id===talentId);
 if(!t)return;
 const from=isoDay(),to=isoDay(13);
 const rows=S.bookings.filter(x=>{
   const same=x.talent_id===talentId || (t.user_id && x.user_id===t.user_id);
   return same && x.booking_date>=from && x.booking_date<=to;
 }).sort((a,b)=>a.booking_date.localeCompare(b.booking_date));

 const L={pending:'敺�Ⅱ隤�',confirmed:'撌脩Ⅱ隤�',leave:'隢见�',rejected:'�芸���',cancelled:'撌脣�瘨�'};
 el('panel').innerHTML=`<div class="admin-section-title"><div><button class="back-talents">�� 餈𥪜��祇�蝞∠�</button><h2>${esc(t.nickname)}嚚𡏭� 14 憭拙𥼚��</h2><p class="panel-note">${esc(from)} 嚚� ${esc(to)}嚚𨅯� ${rows.length} 蝑�</p></div></div>
 ${rows.length?rows.map(x=>`<div class="record"><div class="record-main"><strong>${esc(x.booking_date)}嚚�${esc(x.venue)}</strong><small>銝羓号 ${esc(x.start_time?.slice(0,5))}嚚�${esc(x.note||'�∪�閮�')}</small></div><div class="booking-row-actions"><select class="status-select t14-status" data-id="${x.id}">${Object.entries(L).map(([v,l])=>`<option value="${v}" ${x.status===v?'selected':''}>${l}</option>`).join('')}</select><button class="delete-booking t14-delete" data-id="${x.id}" data-date="${esc(x.booking_date)}">�芷膄</button></div></div>`).join(''):'<p class="empty">�嗘��祇�餈� 14 憭拇��匧𥼚�准��</p>'}`;

 document.querySelector('.back-talents').onclick=()=>renderAdminTab('talents');
 document.querySelectorAll('.t14-status').forEach(sel=>sel.onchange=async()=>{
   sel.disabled=true;
   const {error}=await sb.from('bookings').update({status:sel.value}).eq('id',sel.dataset.id);
   if(error)alert('靽格㺿憭望�');
   await refreshAdmin();
   renderTalent14Days(talentId);
 });
 document.querySelectorAll('.t14-delete').forEach(btn=>btn.onclick=async()=>{
   if(!confirm(`蝣箏�瘞訾��芷膄 ${t.nickname} ${btn.dataset.date} �嗵��梁号�𠬍�`))return;
   btn.disabled=true;
   const {error}=await sb.from('bookings').delete().eq('id',btn.dataset.id);
   if(error){alert('�芷膄憭望�嚗锭upabase �桀��航�撠𡁏𧊋��迂蝞∠��∪⏛�斤号銵具��');btn.disabled=false;return}
   await refreshAdmin();
   renderTalent14Days(talentId);
 });
}





async function renderTalentPayrollHistory(talentId){
  const t=S.talents.find(x=>x.id===talentId);
  if(!t)return;
  const panel=el('panel');
  panel.innerHTML='<div class="member-loading-card">�芾�蝝�����碶葉��</div>';

  const {data,error}=await sb.from('payrolls')
    .select('*')
    .eq('talent_id',talentId)
    .order('week_start',{ascending:false})
    .order('created_at',{ascending:false});

  if(error){
    console.error(error);
    panel.innerHTML=`<div class="admin-section-title"><div><button class="back-talents">�� 餈𥪜��祇�蝞∠�</button><h2>${esc(t.nickname)}嚚𡏭𢞁鞈����</h2></div></div><div class="member-setup-card"><strong>霈��硋仃��</strong><p>�桀��⊥�霈��㚚�嗘��祇���𢞁鞈������</p></div>`;
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
      <button class="back-talents">�� 餈𥪜��祇�蝞∠�</button>
      <p class="eyebrow">PAYROLL HISTORY</p>
      <h2>${esc(t.nickname)}嚚𡏭𢞁鞈����</h2>
      <p class="panel-note">�望鰵�啗��鍦���𢞁鞈��蝝啁��贝��祇��砌犖�见����峕���𢞁鞈�鱓�滢��湛��嫣噶雿𣳇�鞾�望瓲撠溻��</p>
    </div>
  </div>
  <div class="admin-payroll-history-summary">
    <div><span>�券�蝝���</span><strong>${rows.length}</strong><small>隞�</small></div>
    <div><span>�祇��见���</span><strong>${published}</strong><small>撌脩䔄撣�</small></div>
    <div><span>撠𡁏𧊋�祇�</span><strong>${drafts}</strong><small>�厩阮</small></div>
  </div>
  <section class="payroll-page admin-payroll-history-page">
    <div class="payroll-compact-list">
      ${rows.length?rows.map(x=>`<div class="admin-payroll-slip-wrap ${x.is_published?'is-published':'is-draft'}">
        <div class="admin-payroll-visibility"><span>${x.is_published?'�� 撌脩䔄撣���祇��见���':'�� �厩阮嚚𨅯��𦦵𤌍�滨�銝滚�'}</span><small>${esc(x.week_start)} 嚚� ${esc(addDaysIso(x.week_start,6))}</small></div>
        ${renderPayrollSlip(x,false)}
      </div>`).join(''):'<div class="member-empty-lux"><strong>�桀�瘝埝��芾�蝝���</strong><p>撱箇�蝚砌�撘菔𢞁鞈�鱓敺䕘�����望活�望鰵�啗�憿舐內�券�躰ㄐ��</p></div>'}
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
    if(tgl)tgl.textContent=d.hidden?'�亦��𡒊敦 嚗�':'�嗉絲�𡒊敦 嚗�';
  });
  panel.querySelectorAll('.payroll-slip-top').forEach(b=>b.addEventListener('keydown',e=>{
    if(e.key==='Enter'||e.key===' '){e.preventDefault();b.click()}
  }));
}

async function renderTalentSectionTrend(talentId){
  const t=S.talents.find(x=>x.id===talentId);
  if(!t)return;
  const panel=el('panel');
  panel.innerHTML='<div class="member-loading-card">蝭��貉隅�Ｚ��碶葉��</div>';

  const {data,error}=await sb.from('payrolls')
    .select('*')
    .eq('talent_id',talentId)
    .order('week_start',{ascending:true});

  if(error){
    panel.innerHTML=`<div class="admin-section-title"><div><button class="back-talents">�� 餈𥪜��祇�蝞∠�</button><h2>${esc(t.nickname)}嚚𨀣��梁��貉隅��</h2></div></div><div class="member-setup-card"><strong>霈��硋仃��</strong><p>�桀��⊥�霈��𤥁𢞁鞈������</p></div>`;
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
      <button class="back-talents">�� 餈𥪜��祇�蝞∠�</button>
      <p class="eyebrow">WEEKLY SECTION TREND</p>
      <h2>${esc(t.nickname)}嚚𨀣��梁��貉隅��</h2>
      <p class="panel-note">鞈���湔𦻖靘�䌊瘥誯�梯𢞁鞈�鱓嚗䔶���閬�𡖂憭𤥁撓�亦��詻��</p>
    </div>
  </div>

  <div class="section-trend-stats">
    <div><span>��餈睲���</span><strong>${last}</strong><small>蝭�</small></div>
    <div><span>餈� 4 �勗像��</span><strong>${avg4}</strong><small>蝭� / ��</small></div>
    <div><span>餈� 12 �望�擃�</span><strong>${maxVal}</strong><small>蝭�</small></div>
    <div><span>蝝航�蝝���</span><strong>${rows.length}</strong><small>��</small></div>
  </div>

  <section class="section-trend-card">
    <div class="section-trend-head">
      <div><small>LAST 12 WEEKS</small><h3>瘥誯�梁蜇蝭���</h3></div>
      <span>${recent.length?`${esc(recent[0].week_start)} 嚚� ${esc(recent.at(-1).week_start)}`:'撠𡁶�鞈��'}</span>
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
        ${recent.slice().reverse().map(x=>`<div><span>${esc(x.week_start)} 嚚� ${esc(addDaysIso(x.week_start,6))}</span><b>${x._calc.total} 蝭�</b><small>${esc(x.venue||'�芸‵摨堒�')}</small></div>`).join('')}
      </div>
    `:`<div class="member-empty-lux"><strong>�桀�瘝埝��芾��桃��貉���</strong><p>撱箇�蝚砌�撘菜��梯𢞁鞈�鱓敺䕘��躰ㄐ��䌊�閖�憪讠敞蝛滩隅�Ｕ��</p></div>`}
  </section>`;

  document.querySelector('.back-talents').onclick=()=>renderAdminTab('talents');
}

async function adminPayroll(focusTalentId=''){
  const panel=el('panel');panel.innerHTML='<div class="member-loading-card">�芾�鞈��霈��碶葉��</div>';
  const selectedWeek=window.__payrollWeek||mondayOf(isoDay());
  const {data,error}=await sb.from('payrolls').select('*').eq('week_start',selectedWeek).order('nickname');
  if(error){panel.innerHTML=adminV108Setup('�芾�蝞∠�');return}
  const rows=data||[],talents=S.talents.filter(t=>t.status!=='left');
  const byTalent=new Map(rows.map(x=>[x.talent_id,x]));
  const counts={published:rows.filter(x=>x.is_published).length,draft:rows.filter(x=>!x.is_published).length,missing:Math.max(0,talents.length-rows.length)};
  panel.innerHTML=`<div class="admin-section-title grouped-title"><div><p class="eyebrow">WEEKLY PAYROLL</p><h2>�芾�蝞∠�</h2><p class="panel-note">隞亙��𦦵�銝餅㟲���瘥誯�梁��滚鱓�𣂷�憛怠神嚗䔶��典�敺硺���𢞁鞈�鱓鋆⊥𪄳鈭箝��</p></div></div>
  <section class="manager-toolbar"><div class="week-switch"><button id="payPrev" class="week-arrow">��</button><div><small>�祇�梁�蝞�</small><strong>${esc(selectedWeek)} 嚚� ${esc(addDaysIso(selectedWeek,6))}</strong></div><button id="payNext" class="week-arrow">��</button></div><div class="manager-search"><span>��</span><input id="payTalentSearch" placeholder="�𨅯��祇��梁迂"></div></section>
  <section class="payroll-progress"><div><small>�祇�勗��𣂼漲</small><strong>${counts.published} <i>/ ${talents.length}</i></strong></div><div class="progress-stat done"><b>${counts.published}</b><span>撌脩䔄撣�</span></div><div class="progress-stat draft"><b>${counts.draft}</b><span>�厩阮</span></div><div class="progress-stat missing"><b>${counts.missing}</b><span>撠𡁏𧊋憛怠神</span></div></section>
  <div class="talent-manager-grid" id="payrollTalentGrid">${renderPayrollTalentCards(talents,byTalent)}</div><div id="payrollModalHost"></div>`;
  const rerender=()=>{const q=el('payTalentSearch').value.trim().toLowerCase();el('payrollTalentGrid').innerHTML=renderPayrollTalentCards(talents.filter(t=>t.nickname.toLowerCase().includes(q)),byTalent);bindPayrollTalentCards(byTalent,talents)};
  el('payTalentSearch').oninput=rerender;bindPayrollTalentCards(byTalent,talents);
  el('payPrev').onclick=()=>{window.__payrollWeek=addDaysIso(selectedWeek,-7);adminPayroll()};el('payNext').onclick=()=>{window.__payrollWeek=addDaysIso(selectedWeek,7);adminPayroll()};
  if(focusTalentId){setTimeout(()=>document.querySelector(`[data-pay-talent="${focusTalentId}"]`)?.scrollIntoView({behavior:'smooth',block:'center'}),50)}
}
function renderPayrollTalentCards(talents,byTalent){return talents.map(t=>{const x=byTalent.get(t.id),c=x?payrollCalc(x):null,status=!x?'撠𡁏𧊋憛怠神':x.is_published?'撌脩䔄撣�':'�厩阮';return `<article class="talent-manager-card payroll-person ${x?'has-record':'is-empty'}" data-pay-talent="${t.id}"><div class="manager-avatar">${(t.avatar_portrait_url||t.avatar_url)?`<img src="${esc(t.avatar_portrait_url||t.avatar_url)}" alt="${esc(t.nickname)} 憭折�鞎�">`:`<span>${esc((t.nickname||'?').slice(0,1))}</span>`}</div><div class="manager-person-info"><small>PUBLIC RELATIONS</small><h3>${esc(t.nickname)}</h3><span class="manager-status ${!x?'missing':x.is_published?'published':'draft'}">�� ${status}</span>${x?`<p>${c.total} 蝭���繚��蝭��� ${money(c.rate)}��繚��撖阡� <b>${money(c.net)}</b></p>`:'<p>�䠷�梢�瘝埝�撱箇��芾���</p>'}</div><button class="manager-action ${x?'':'primary'}" data-pay-edit="${t.id}">${x?'蝺刻摩�芾�':'嚗� 憛怠神�芾�'}</button></article>`}).join('')||'<div class="member-empty-lux"><strong>�曆��啣���</strong><p>隢𧢲�銝��钅��萄��𨅯���</p></div>'}
function bindPayrollTalentCards(byTalent,talents){document.querySelectorAll('[data-pay-edit]').forEach(b=>b.onclick=()=>{const id=b.dataset.payEdit;openPayrollEditor(byTalent.get(id)||null,id,talents)})}
function openPayrollEditor(row,focusTalentId,talents){
  const host=el('payrollModalHost')||document.body,start=row?.week_start||mondayOf(isoDay());
  const modal=document.createElement('div');modal.className='leave-modal-backdrop';
  modal.innerHTML=`<div class="leave-modal payroll-editor-modal"><div class="leave-modal-head"><div><p class="eyebrow">PAYROLL EDITOR</p><h3>${row?'蝺刻摩':'撱箇�'}瘥誯�梯𢞁鞈�鱓</h3></div><button class="leave-close" type="button">�</button></div><form id="payrollEditor"><div class="payroll-editor-grid"><label>�祇�<select name="talent_id" required><option value="">隢钅���</option>${talents.map(t=>`<option value="${t.id}" ${(row?.talent_id||focusTalentId)===t.id?'selected':''}>${esc(t.nickname)}</option>`).join('')}</select></label><label>�望活嚗���煺�嚗�<input type="date" name="week_start" value="${esc(start)}" required></label><label>摨堒振<select name="venue" required><option value="">隢钅����摰�</option>${S.venues.filter(v=>v.is_active||v.name===row?.venue).map(v=>`<option value="${esc(v.name)}" ${row?.venue===v.name?'selected':''}>${esc(v.name)}${!v.is_active?'嚗�歇�𦦵鍂嚗�':''}</option>`).join('')}${row?.venue&&!S.venues.some(v=>v.name===row.venue)?`<option value="${esc(row.venue)}" selected>${esc(row.venue)}嚗�風�脣��㵪�</option>`:''}</select></label><label>�祇�梁���<input type="number" name="section_rate" min="0" step="1" value="${row?.section_rate??''}" required placeholder="靘见� 210"></label></div><h4>瘥誩予�见³�蝭���</h4><div class="payroll-seven-days">${payrollDays.map(([k,l],i)=>`<label>��${l}<small>${twDate(addDaysIso(start,i))}</small><input type="number" name="${k}" min="0" step="1" value="${row?.[k]??0}"></label>`).join('')}</div><h4>��狡</h4><div class="payroll-editor-grid deductions">${[['tax_amount','蝔��'],['cleaning_fee','皜��鞎�'],['laundry_fee','瘣𡑒﹝鞎�'],['misc_fee','�𨀣𣈲'],['makeup_fee','憒嗪垣'],['advance_amount','�鞉𣈲']].map(([k,l])=>`<label>${l}<input type="number" name="${k}" min="0" step="1" value="${row?.[k]??0}"></label>`).join('')}</div><label>�躰酉<textarea name="note" placeholder="�詨‵">${esc(row?.note||'')}</textarea></label><div class="payroll-live-total" id="payrollLiveTotal"></div><label class="check"><input type="checkbox" name="is_published" ${row?.is_published?'checked':''}> �澆�蝯血��𨀣䰻�页��芸㗲�詨��脣��箄�蝔選�</label><div class="leave-modal-actions"><button class="btn btn-primary" type="submit">�脣��芾���</button>${row?'<button class="btn btn-outline danger delete-payroll" type="button">�芷膄�祆活�芾�</button>':''}<button class="btn btn-outline payroll-cancel" type="button">�𡝗�</button></div><p id="payrollEditorStatus" class="form-status"></p></form></div>`;
  host.appendChild(modal);const form=modal.querySelector('#payrollEditor'),close=()=>modal.remove();modal.querySelector('.leave-close').onclick=close;modal.querySelector('.payroll-cancel').onclick=close;
  modal.querySelector('.delete-payroll')?.addEventListener('click',async()=>{
    if(!row)return;
    if(!confirm(`蝣箏��芷膄 ${row.nickname||'�嗘��祇�'} ${row.week_start||''} �嗘��梁��芾��桀�嚗髿n\n�芷膄敺���𦦵垢銋煺�����见��嗵��芾���`))return;
    const btn=modal.querySelector('.delete-payroll');
    btn.disabled=true;btn.textContent='�芷膄銝凌��';
    const {error}=await sb.from('payrolls').delete().eq('id',row.id);
    if(error){console.error(error);alert('�芷膄�芾��桀仃�梹�隢讠�敺��閰艾��');btn.disabled=false;btn.textContent='�芷膄�祆活�芾�';return}
    close();
    await adminPayroll();
  });
  const preview=()=>{const x=Object.fromEntries(new FormData(form));const c=payrollCalc(x);el('payrollLiveTotal').innerHTML=`<div><span>蝮賜���</span><b>${c.total} 蝭�</b></div><div><span>蝭��貉𢞁鞈�</span><b>${money(c.gross)}</b></div><div><span>��狡</span><b>�� ${money(c.deductions)}</b></div><div class="net"><span>撖阡�</span><strong>${money(c.net)}</strong></div>`};form.oninput=preview;preview();
  form.onsubmit=async e=>{e.preventDefault();const x=Object.fromEntries(new FormData(form)),t=S.talents.find(v=>v.id===x.talent_id);if(!t)return;text('payrollEditorStatus','�脣�銝凌��');const c=payrollCalc(x),payload={talent_id:t.id,user_id:t.user_id||null,nickname:t.nickname,week_start:mondayOf(x.week_start),venue:x.venue,section_rate:Number(x.section_rate),mon_sections:Number(x.mon_sections||0),tue_sections:Number(x.tue_sections||0),wed_sections:Number(x.wed_sections||0),thu_sections:Number(x.thu_sections||0),fri_sections:Number(x.fri_sections||0),sat_sections:Number(x.sat_sections||0),sun_sections:Number(x.sun_sections||0),tax_amount:Number(x.tax_amount||0),cleaning_fee:Number(x.cleaning_fee||0),laundry_fee:Number(x.laundry_fee||0),misc_fee:Number(x.misc_fee||0),makeup_fee:Number(x.makeup_fee||0),advance_amount:Number(x.advance_amount||0),gross_amount:c.gross,deduction_total:c.deductions,net_amount:c.net,note:x.note||null,is_published:!!form.elements.is_published.checked,updated_at:new Date().toISOString()};let q=row?sb.from('payrolls').update(payload).eq('id',row.id):sb.from('payrolls').insert(payload);const {error}=await q;if(error){console.error(error);text('payrollEditorStatus','�� �脣�憭望�嚗�'+error.message);return}close();await adminPayroll(t.id)};
}
async function adminHotelCards(focusTalentId=''){
  const panel=el('panel');panel.innerHTML='<div class="member-loading-card">�鍦�蝝�����碶葉��</div>';
  const {data,error}=await sb.from('hotel_card_records').select('*').order('created_at',{ascending:false});
  if(error){panel.innerHTML=adminV108Setup('�鍦�銝𠹺��∠���');return}
  const rows=data||[],talents=S.talents.filter(t=>t.status!=='left'),grouped=new Map();
  talents.forEach(t=>grouped.set(t.id,[]));rows.forEach(x=>{if(!grouped.has(x.talent_id))grouped.set(x.talent_id,[]);grouped.get(x.talent_id).push(x)});
  panel.innerHTML=`<div class="admin-section-title grouped-title"><div><p class="eyebrow">HOTEL CARD RECORDS</p><h2>�鍦�銝𠹺��∠���</h2><p class="panel-note">銝�雿滚��靝�撘萄㨃����曆犖嚗��蝞∠�憟寞㦛蝬㮖��⊿����摨𨰜��</p></div></div><section class="manager-toolbar"><div class="manager-summary"><small>�祇�蝮賣彍</small><strong>${talents.length}</strong><span>�桀��� ${rows.length} 蝑��摨㛖���</span></div><div class="manager-search"><span>��</span><input id="hotelTalentSearch" placeholder="�𨅯��祇��梁迂"></div></section><div class="talent-manager-grid" id="hotelTalentGrid">${renderHotelTalentCards(talents,grouped)}</div><div id="hotelModalHost"></div><div id="hotelDrawerHost"></div>`;
  const bind=()=>{document.querySelectorAll('[data-hotel-talent]').forEach(b=>b.onclick=()=>openHotelTalentDrawer(b.dataset.hotelTalent,grouped.get(b.dataset.hotelTalent)||[]))};bind();
  el('hotelTalentSearch').oninput=e=>{const q=e.target.value.trim().toLowerCase();el('hotelTalentGrid').innerHTML=renderHotelTalentCards(talents.filter(t=>t.nickname.toLowerCase().includes(q)),grouped);bind()};
  if(focusTalentId)setTimeout(()=>document.querySelector(`[data-hotel-talent="${focusTalentId}"]`)?.scrollIntoView({behavior:'smooth',block:'center'}),50);
}
function renderHotelTalentCards(talents,grouped){return talents.map(t=>{const list=grouped.get(t.id)||[],chips=list.slice(0,4).map(x=>`<span>${esc(x.venue)}<i>${esc(x.status||'�曆���')}</i></span>`).join('');return `<article class="talent-manager-card hotel-person"><div class="manager-avatar">${(t.avatar_portrait_url||t.avatar_url)?`<img src="${esc(t.avatar_portrait_url||t.avatar_url)}" alt="${esc(t.nickname)} 憭折�鞎�">`:`<span>${esc((t.nickname||'?').slice(0,1))}</span>`}</div><div class="manager-person-info"><small>HOTEL HISTORY</small><h3>${esc(t.nickname)}</h3><p>${list.length?`�� ${list.length} �橒�蝑��摨㛖���`:'撠𡁏𧊋撱箇��鍦�蝝���'}</p><div class="hotel-mini-chips">${chips}${list.length>4?`<span class="more">嚗�${list.length-4}</span>`:''}</div></div><button class="manager-action ${list.length?'':'primary'}" data-hotel-talent="${t.id}">${list.length?'蝞∠�蝝���':'嚗� �啣�蝝���'}</button></article>`}).join('')||'<div class="member-empty-lux"><strong>�曆��啣���</strong><p>隢𧢲�銝��钅��萄��𨅯���</p></div>'}
function openHotelTalentDrawer(talentId,list){const t=S.talents.find(x=>x.id===talentId);if(!t)return;const host=el('hotelDrawerHost'),box=document.createElement('div');box.className='manager-drawer-backdrop';box.innerHTML=`<aside class="manager-drawer"><div class="drawer-head"><div><p class="eyebrow">HOTEL HISTORY</p><h3>${esc(t.nickname)}嚚𣈯�摨𦯀�銝见㨃蝝���</h3><span>${list.length} 蝑����</span></div><button class="drawer-close">�</button></div><button class="btn btn-primary drawer-add-hotel">嚗� �啣��鍦�蝝���</button><div class="drawer-record-list">${list.map(x=>`<article><div><small>${esc(x.status||'�曆���')}</small><h4>${esc(x.venue)}</h4><p>銝𠰴㨃嚗�${esc(x.card_on_date||'�芰���')}��嚚栶��銝见㨃嚗�${esc(x.card_off_date||'�芰���')}</p>${x.note?`<span>${esc(x.note)}</span>`:''}</div><button class="mini-btn drawer-edit-hotel" data-id="${x.id}">蝺刻摩</button></article>`).join('')||'<div class="member-empty-lux"><strong>����厰�摨㛖���</strong><p>�交�銝滨䰻�㮖�瘝㘾�靽���芸‵摨堒�撠梯���遣蝡卝��</p></div>'}</div></aside>`;host.appendChild(box);const close=()=>box.remove();box.querySelector('.drawer-close').onclick=close;box.querySelector('.drawer-add-hotel').onclick=()=>{close();openHotelCardEditor(null,talentId)};box.querySelectorAll('.drawer-edit-hotel').forEach(b=>b.onclick=()=>{const row=list.find(x=>x.id===b.dataset.id);close();openHotelCardEditor(row,talentId)})}
function openHotelCardEditor(row,focusTalentId=''){
  const host=el('hotelModalHost')||document.body,modal=document.createElement('div');modal.className='leave-modal-backdrop';modal.innerHTML=`<div class="leave-modal"><div class="leave-modal-head"><div><p class="eyebrow">HOTEL RECORD</p><h3>${row?'蝺刻摩':'�啣�'}銝𠹺��∠���</h3></div><button class="leave-close" type="button">�</button></div><form id="hotelCardEditor" class="hotel-card-editor"><label>�祇�<select name="talent_id" required><option value="">隢钅���</option>${S.talents.map(t=>`<option value="${t.id}" ${(row?.talent_id||focusTalentId)===t.id?'selected':''}>${esc(t.nickname)}</option>`).join('')}</select></label><label>摨堒振<select name="venue" required><option value="">隢钅����摰�</option>${S.venues.filter(v=>v.is_active||v.name===row?.venue).map(v=>`<option value="${esc(v.name)}" ${row?.venue===v.name?'selected':''}>${esc(v.name)}${!v.is_active?'嚗�歇�𦦵鍂嚗�':''}</option>`).join('')}${row?.venue&&!S.venues.some(v=>v.name===row.venue)?`<option value="${esc(row.venue)}" selected>${esc(row.venue)}嚗�風�脣��㵪�</option>`:''}</select></label><div class="hotel-date-pair"><label>銝𠰴㨃�交�嚗��憛恬�<input type="date" name="card_on_date" value="${esc(row?.card_on_date||'')}"></label><label>銝见㨃�交�嚗��憛恬�<input type="date" name="card_off_date" value="${esc(row?.card_off_date||'')}"></label></div><label>����<select name="status"><option ${row?.status==='�曆���'?'selected':''}>�曆���</option><option ${row?.status==='銝𠰴㨃銝�'?'selected':''}>銝𠰴㨃銝�</option><option ${row?.status==='撌脖���'?'selected':''}>撌脖���</option></select></label><label>�躰酉<textarea name="note" placeholder="�詨‵">${esc(row?.note||'')}</textarea></label><div class="leave-modal-actions"><button class="btn btn-primary" type="submit">�脣�蝝���</button>${row?'<button class="btn btn-outline danger delete-hotel-record" type="button">�芷膄</button>':''}<button class="btn btn-outline hotel-cancel" type="button">�𡝗�</button></div><p id="hotelCardStatus" class="form-status"></p></form></div>`;host.appendChild(modal);const close=()=>modal.remove();modal.querySelector('.leave-close').onclick=close;modal.querySelector('.hotel-cancel').onclick=close;const form=modal.querySelector('#hotelCardEditor');form.onsubmit=async e=>{e.preventDefault();const x=Object.fromEntries(new FormData(form)),t=S.talents.find(v=>v.id===x.talent_id);if(!t)return;const payload={talent_id:t.id,user_id:t.user_id||null,nickname:t.nickname,venue:x.venue,card_on_date:x.card_on_date||null,card_off_date:x.card_off_date||null,status:x.status,note:x.note||null,updated_at:new Date().toISOString()};text('hotelCardStatus','�脣�銝凌��');const {error}=await(row?sb.from('hotel_card_records').update(payload).eq('id',row.id):sb.from('hotel_card_records').insert(payload));if(error){text('hotelCardStatus','�� �脣�憭望�嚗�'+error.message);return}close();await adminHotelCards(t.id)};modal.querySelector('.delete-hotel-record')?.addEventListener('click',async()=>{if(!confirm('蝣箏��芷膄�嗵��鍦�銝𠹺��∠����嚗�'))return;const {error}=await sb.from('hotel_card_records').delete().eq('id',row.id);if(error){alert('�芷膄憭望�');return}close();await adminHotelCards()});
}
function adminV108Setup(name){return `<div class="member-setup-card"><strong>${name}撠𡁏𧊋��𦻖鞈��摨�</strong><p>隢讠Ⅱ隤� Supabase 撠齿�鞈��銵刻�甈𢠃�閮剖�敺䕘��漤��唳㟲��雯蝡踺��</p></div>`}

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
 return `${twDate(start)}嚚�${twDate(addDaysIso(start,6))}`;
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
 if(stats.diff===null)return '撠𡁶��滢��勗虾瘥磰�';
 const sign=stats.diff>0?'+':'';
 if(stats.pct===null)return `${sign}${stats.diff} 蝭�`;
 const pctSign=stats.pct>0?'+':'';
 return `${sign}${stats.diff} 蝭�嚗�${pctSign}${stats.pct.toFixed(1)}%嚗头;
}
function renderTalentSectionStats(talentId){
 const t=S.talents.find(x=>x.id===talentId);if(!t)return;
 const st=talentSectionStats(t);
 el('panel').innerHTML=`<div class="admin-section-title"><div><button class="back-sections">�� 餈𥪜�蝭��貊絞閮�</button><p class="eyebrow">WEEKLY SECTIONS</p><h2>${esc(t.nickname)}嚚𦦵��貊���</h2></div></div>
 <div class="section-summary-card">
   <h3>�桀�蝯梯�</h3>
   ${st.count?`
   <div class="section-summary-grid">
     <div><span>蝝舐��望彍</span><strong>${st.count} ��</strong></div>
     <div><span>�� 銝��望�雿喟���</span><strong>${st.best.sections} 蝭�</strong><small>��雿喲�梧�${weekLabel(st.best.week_start)}<br>銝羓号憭拇彍嚗�${st.best.workDays} 憭�</small></div>
     <div><span>�� 銝��望�雿𡒊���</span><strong>${st.worst.sections} 蝭�</strong><small>��雿𡡞�梧�${weekLabel(st.worst.week_start)}<br>銝羓号憭拇彍嚗�${st.worst.workDays} 憭�</small></div>
     <div><span>��餈睲���</span><strong>${st.latest.sections} 蝭�</strong><small>${weekLabel(st.latest.week_start)}<br>頛��銝��梧�${sectionDeltaText(st)}</small></div>
   </div>`:'<p class="empty">�桀�����厩泵��絞閮��隞嗥��梯��踺��㟲�望��匧祕�𥕢��剔��望活銝滨��交�擃矋���雿𡒊絞閮���</p>'}
 </div>
 <section class="attendance-card">
   <h3>甇瑕蟮�望活</h3>
   ${S.weeklySections.filter(x=>x.talent_id===t.id).sort((a,b)=>b.week_start.localeCompare(a.week_start)).map(x=>{
      const wd=workDaysForTalentWeek(t,x.week_start);
      return `<div class="record"><div class="record-main"><strong>${weekLabel(x.week_start)}嚚�${x.sections} 蝭�</strong><small>銝羓号憭拇彍嚗�${wd} 憭�${wd===0?'嚚𨀣𧋦�曹�蝝滚���雿喉���雿𡒊絞閮�':''}</small></div></div>`;
   }).join('')||'<p class="empty">撠𡁶�甇瑕蟮蝭��詻��</p>'}
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
       <small>${st.count?`蝝舐� ${st.count} �梧���餈� ${st.latest?.sections??'��'} 蝭�`:'撠𡁶�蝝���'}</small>
     </div>
     <label class="section-input-wrap">�祇�梁���
       <input type="number" min="0" max="10000" step="1" class="section-input" data-id="${t.id}" value="${rec?rec.sections:''}" placeholder="頛詨�蝭���">
     </label>
     <button class="mini-btn section-view" data-id="${t.id}">�亦�蝯梯�</button>
   </div>`;
 }).join('');
 el('panel').innerHTML=`<div class="admin-section-title"><div><p class="eyebrow">WEEKLY SECTIONS</p><h2>蝭��貊絞閮�</h2><p class="panel-note">瘥誯�望嚉�唬蜓蝞∠��貉”敺䕘��券�躰ㄐ銝�甈∟撓�乓��10 ���嚗�1 蝭���</p></div></div>
 <div class="section-toolbar">
   <label>蝯梯��望活<input type="date" id="sectionWeek" value="${thisMonday}"></label>
   <button class="btn btn-primary" id="saveSections">�脣��祇�梁���</button>
 </div>
 <p class="section-week-hint" id="sectionWeekHint">${weekLabel(thisMonday)}</p>
 <div id="sectionRows">${rows||'<p class="empty">�桀�瘝埝��舐絞閮���祇���</p>'}</div>
 <p id="sectionSaveStatus" class="form-status"></p>
 <div class="section-rule-note">閬誩�嚗𡁏㟲�望��匧祕�𥕢��剔��望活嚗䔶�蝝滚���雿喉���雿𡒊絞閮��銋煺���誑 0 蝭��劐�蝝�����</div>`;

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
   if(!payloads.length){text('sectionSaveStatus','隢贝秐撠𤏸撓�乩�雿滚��𦦵�蝭��詻��');return}
   if(!confirm(`蝣箏��脣� ${weekLabel(monday)} �� ${payloads.length} 雿滚��𦦵��詨�嚗鬮))return;
   el('saveSections').disabled=true;
   text('sectionSaveStatus','�脣�銝凌��');
   const {error}=await sb.from('weekly_sections').upsert(payloads,{onConflict:'talent_id,week_start'});
   if(error){
     console.error(error);
     text('sectionSaveStatus','�� �脣�憭望�嚗諹�蝔滚��滩岫��');
     el('saveSections').disabled=false;
     return;
   }
   text('sectionSaveStatus','�� 撌脣�摮䀹𧋦�梁��詻��');
   await refreshAdmin();
 };
}

function adminVenues(){
 el('panel').innerHTML=`<div class="admin-section-title"><h2>摨堒振蝞∠�</h2><button class="mini-btn" id="addVenue">嚗� �啣�摨堒振</button></div>${S.venues.map(x=>`<div class="record"><div class="record-main"><strong>${esc(x.name)}嚚�${esc(x.area||'�芸‵�啣�')}</strong><small>${esc(x.contact||'')}</small></div><div class="venue-actions"><label><input class="va" data-id="${x.id}" type="checkbox" ${x.is_active?'checked':''}> �毺鍂</label><button class="mini-btn venue-delete" data-id="${x.id}" data-name="${esc(x.name)}">蝘駁膄</button></div></div>`).join('')||'<p class="empty">�桀�瘝埝�摨堒振��</p>'}<div id="inlineForm"></div>`;
 document.querySelectorAll('.va').forEach(c=>c.onchange=async()=>{await sb.from('venues').update({is_active:c.checked}).eq('id',c.dataset.id);await refreshAdmin()});
 document.querySelectorAll('.venue-delete').forEach(btn=>btn.onclick=async()=>{
   if(!confirm(`蝣箏�閬�宏�扎��${btn.dataset.name}�滚�嚗髿n\n蝘駁膄敺��銝滚��箇𣶹�典�摰嗥恣����啁��梁号�詨鱓銝准��`))return;
   btn.disabled=true;
   const {error}=await sb.from('venues').delete().eq('id',btn.dataset.id);
   if(error){alert('蝘駁膄憭望�嚗諹�蝔滚��滩岫��');btn.disabled=false;return}
   await refreshAdmin();
 });
 el('addVenue').onclick=()=>quickForm('venue');
}
function adminAnnouncements(){
 el('panel').innerHTML=`<div class="admin-section-title"><h2>�砍�蝞∠�</h2><button class="mini-btn" id="addAnn">嚗� �啣��砍�</button></div>${S.announcements.map(x=>`<div class="record"><div class="record-main"><strong>${esc(x.title)}</strong><small>${esc(x.content)}</small></div><label><input class="aa" data-id="${x.id}" type="checkbox" ${x.is_active?'checked':''}> �祇�</label></div>`).join('')||'<p class="empty">�桀�瘝埝��砍���</p>'}<div id="inlineForm"></div>`;
 document.querySelectorAll('.aa').forEach(c=>c.onchange=async()=>{await sb.from('announcements').update({is_active:c.checked}).eq('id',c.dataset.id);await refreshAdmin()});el('addAnn').onclick=()=>quickForm('ann');
}
function quickForm(kind){
 const defs={talent:`<input name="nickname" placeholder="�嘥�" required><input name="contact" placeholder="LINE嚗誯𤓖閰�"><input name="area" placeholder="�啣�"><input name="instagram" placeholder="Instagram">`,venue:`<input name="name" placeholder="摨堒振�滨迂" required><input name="area" placeholder="�啣�"><input name="contact" placeholder="�舐窗鈭綽��餉店">`,ann:`<input name="title" placeholder="�砍�璅䠷�" required><textarea name="content" placeholder="�砍��批捆" required></textarea>`};
 el('inlineForm').innerHTML=`<form id="quickForm" class="inline-form">${defs[kind]}<button class="mini-btn">�脣�</button></form>`;
 el('quickForm').onsubmit=async e=>{e.preventDefault();const x=Object.fromEntries(new FormData(e.currentTarget));if(kind==='talent')await sb.from('talents').insert({nickname:x.nickname,contact:x.contact||null,area:x.area||null,instagram:x.instagram||null});if(kind==='venue')await sb.from('venues').insert({name:x.name,area:x.area||null,contact:x.contact||null});if(kind==='ann')await sb.from('announcements').insert({title:x.title,content:x.content});await refreshAdmin()};
}

document.addEventListener("click",function(e){
  const b=e.target.closest&&e.target.closest("#profilePhotoQuickSave");
  if(!b)return;
  const f=document.getElementById("profileForm");
  if(!f)return;
  b.classList.add("is-saving"); b.innerHTML='�脣�銝� <i>��</i>';
  if(typeof f.requestSubmit==="function")f.requestSubmit();
  else f.dispatchEvent(new Event("submit",{bubbles:true,cancelable:true}));
  setTimeout(function(){b.classList.remove("is-saving");b.innerHTML='撌脤��枂�脣� <i>��</i>';setTimeout(function(){b.innerHTML='�脣��抒� <i>��</i>';},1400);},450);
});


document.addEventListener('DOMContentLoaded',()=>{
  const p=document.querySelector('.home25-process');
  if(!p)return;
  if(!('IntersectionObserver' in window)){p.classList.add('is-visible');return;}
  const io=new IntersectionObserver(es=>es.forEach(e=>{if(e.isIntersecting){p.classList.add('is-visible');io.disconnect();}}),{threshold:.28});
  io.observe(p);
});
