
(function(){
const app = document.getElementById('app');
const C = window.EXP_CONFIG || {};
const state = {
  participant:{}, wordPool:[], emotionManifest:{}, group:'', selectedWords:[], emotionImages:[],
  trialLog:[], ratings:{baseline:{},post:{},task:{}}, imageLog:[], subtraction:{}, recall:{},
  startTimeISO:'', endTimeISO:'', preloaded:new Set()
};
const sleep = ms => new Promise(r=>setTimeout(r,ms));
const nowISO = ()=>new Date().toISOString();
const shuffle = arr => arr.map(v=>({k:Math.random(),v})).sort((a,b)=>a.k-b.k).map(x=>x.v);
const csvEscape = v => { const s=String(v ?? ''); return /[,"\n]/.test(s)?'"'+s.replace(/"/g,'""')+'"':s; };
const toChineseList = arr => Array.isArray(arr)?arr.filter(Boolean).join('、'):'';
const downloadBlob = (content, filename, type='text/plain;charset=utf-8') => {
  const blob = new Blob([content], {type}); const url = URL.createObjectURL(blob); return {filename,url};
};
function mount(html){ app.innerHTML = html; }
function btnRow(buttons){ return `<div class="btn-row">${buttons.map(b=>`<button class="${b.secondary?'secondary':''}" id="${b.id}">${b.text}</button>`).join('')}</div>`; }
function screen(inner, panel='panel'){ return `<div class="screen"><div class="${panel}">${inner}</div></div>`; }
function esc(s){ return String(s ?? '').replace(/[&<>\"]/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;','\"':'&quot;'}[ch] || ch)); }
function imageOrFallback(src, alt, cls='word-img'){ return `<img class="${cls}" src="${src}" alt="${esc(alt)}" onerror="this.outerHTML='<div class=\'word-fallback\'>${esc(alt)}</div>'">`; }
function val(id){ return document.getElementById(id).value; }

function showPreloadScreen(title, subtitle){
  mount(screen(`
    <div class="preload-wrap">
      <div class="title">${title}</div>
      <div class="subtitle">${subtitle}</div>
      <div class="progress-shell"><div id="progressBar" class="progress-bar"></div></div>
      <div id="progressText" class="progress-text">正在准备刺激材料…</div>
    </div>
  `, 'panel narrow'));
}
function updatePreloadProgress(done, total, label='正在准备刺激材料…'){
  const bar = document.getElementById('progressBar');
  const txt = document.getElementById('progressText');
  const pct = total > 0 ? Math.round(done * 100 / total) : 100;
  if (bar) bar.style.width = pct + '%';
  if (txt) txt.textContent = `${label} ${done}/${total}`;
}
function preloadOne(src){
  return new Promise((resolve, reject)=>{
    const img = new Image();
    img.onload = () => resolve(src);
    img.onerror = () => reject(new Error('load_failed:' + src));
    img.src = src;
  });
}
async function preloadStimulusAssets(){
  const targets = [];
  (state.emotionImages || []).forEach(src => { if (src) targets.push(src); });
  (state.selectedWords || []).forEach(item => { if (item && item.image) targets.push(item.image); });
  const uniqueTargets = [...new Set(targets)];
  if (!uniqueTargets.length) return;

  showPreloadScreen('正在准备实验', '请稍候，系统正在预加载图片材料。');
  await new Promise(resolve => requestAnimationFrame(()=>resolve()));
  await new Promise(resolve => requestAnimationFrame(()=>resolve()));
  await sleep(200);

  let done = 0;
  updatePreloadProgress(0, uniqueTargets.length);
  for (const src of uniqueTargets){
    try{
      await preloadOne(src);
      state.preloaded.add(src);
    }catch(e){
      console.warn('preload failed:', src);
    }
    done += 1;
    updatePreloadProgress(done, uniqueTargets.length);
    await sleep(25);
  }
  updatePreloadProgress(uniqueTargets.length, uniqueTargets.length, '图片材料准备完成');
  await sleep(350);
}
async function ensureAssets(){
  const [words, manifest] = await Promise.all([
    fetch('word_pool.json').then(r=>r.json()),
    fetch('emotion_manifest.json').then(r=>r.json())
  ]);
  state.wordPool = words; state.emotionManifest = manifest;
}
async function tryFullscreen(){
  if (!C.requireFullscreen) return true;
  try{ if (!document.fullscreenElement) await document.documentElement.requestFullscreen(); return true; }catch(e){ return false; }
}
function pickGroup(form){
  const query = new URLSearchParams(location.search);
  if (C.defaultGroupMode === 'query' && query.get('group')) return query.get('group').toUpperCase();
  if (form.groupMode === 'manual' && form.groupManual) return form.groupManual;
  const groups = ['PH','PL','NH','NL']; return groups[Math.floor(Math.random()*groups.length)];
}
function waitForSpace(){
  return new Promise(resolve=>{
    const h = e => { if (e.code === 'Space'){ e.preventDefault(); document.removeEventListener('keydown', h); resolve(); } };
    document.addEventListener('keydown', h);
  });
}
function setDeep(path, score){ const [top, sub] = path.split('.'); state.ratings[top][sub] = score; }
function showWelcome(){
  mount(screen(`
    <div class="title">欢迎参加实验</div>
    <div class="subtitle">本实验为在线版学习与记忆任务，请认真阅读以下说明后开始。</div>
    <div class="instructions">
      <ol>
        <li>请使用电脑端浏览器完成实验，建议使用 Chrome 或 Edge。</li>
        <li>实验时长约 6-8 分钟。</li>
        <li>请在安静环境下独立完成，并尽量保持全屏。</li>
        <li>实验过程中请勿切换页面，也不要借助纸笔、手机或其他工具辅助作答。</li>
        <li>完成全部任务后，请等待页面提示“实验结束”再关闭浏览器。</li>
      </ol>
    </div>
    <div class="hint"><span class="badge">电脑端</span><span class="badge">中文输入</span><span class="badge">保持专注</span></div>
    ${btnRow([{id:'start', text:'我已阅读，开始实验'}])}
  `, 'panel narrow'));
  document.getElementById('start').onclick = async ()=>{ await tryFullscreen(); showParticipantForm(); };
}
function showParticipantForm(){
  mount(`
  <div class="screen"><div class="form-card">
    <div class="form-title">实验1在线版启动页</div>
    <div class="grid">
      <div class="field"><label>被试编号</label><input id="subjectID" value="W001" placeholder="请输入 W001 这类编号"></div>
      <div class="field"><label>姓名</label><input id="name"></div>
      <div class="field"><label>年龄</label><input id="age"></div>
      <div class="field"><label>性别</label><select id="gender"><option>男</option><option>女</option></select></div>
      <div class="field"><label>年级</label><select id="grade"><option>大一</option><option>大二</option><option>大三</option><option>大四</option><option>研究生</option><option>博士生</option></select></div>
      <div class="field"><label>分组方式</label><input value="随机分组（固定）" disabled></div>
      <div class="field"><label>当前设置</label><input value="程序将自动随机分配到 PH / PL / NH / NL" disabled></div>
      <div class="field"><label>备注</label><textarea id="note" placeholder="可留空"></textarea></div>
    </div>
    <div class="status">
      当前版本用于线上扩展样本。<br>
      请统一使用 <span class="code">W001、W002、W003...</span> 这类编号。<br>
      程序会在实验开始时自动随机分配组别（PH / PL / NH / NL），并在结果文件中单独记录组别信息。
    </div>
    <div class="btn-row"><button id="go">进入实验</button></div>
  </div></div>`);
  document.getElementById('go').onclick = ()=>{
    const rawID = val('subjectID').trim().toUpperCase();
    if(!rawID){ alert('被试编号不能为空。'); return; }
    if(!/^W\d{3,4}$/.test(rawID)){ alert('请输入 W001 这类编号。'); return; }

    const form = {
      subjectID: rawID,
      participantName: val('name').trim(),
      participantAge: val('age').trim(),
      participantGender: val('gender'),
      participantGrade: val('grade'),
      note: val('note').trim(),
      groupMode: 'random'
    };
    state.participant = form;
    state.group = pickGroup(form);
    state.participant.groupLabel = state.group;
    state.participant.sampleSource = '线上';
    state.startTimeISO = nowISO();
    selectWords();
    (async ()=>{
      await preloadStimulusAssets();
      showRatingScreen({title:'当前评分', question:'此刻你的情绪效价如何？', anchors:'1 = 非常消极    9 = 非常积极', key:'baseline.valence',
        next:()=>showRatingScreen({title:'当前评分', question:'此刻你的情绪唤醒程度如何？', anchors:'1 = 非常平静    9 = 非常激动', key:'baseline.arousal', next:showEmotionIntro})
      });
    })();
  };
}

function showRatingScreen({title, question, anchors, key, next}){
  mount(screen(`
    <div class="rating-wrap">
      <div class="title">${title}</div>
      <div class="question">${question}</div>
      <div class="anchors">${anchors}</div>
      <div class="scale-row">${[1,2,3,4,5,6,7,8,9].map(n=>`<button class="scale-btn" data-score="${n}">${n}</button>`).join('')}</div>
      <div class="hint">请按数字键 1 - 9，或点击按钮评分。</div>
      ${btnRow([{id:'next', text:'下一步'}])}
    </div>
  `));
  let current = null;
  const bs = [...document.querySelectorAll('.scale-btn')];
  const choose = n => { current=n; bs.forEach(b=>b.classList.toggle('active', Number(b.dataset.score)===n)); };
  bs.forEach(b=>b.onclick=()=>choose(Number(b.dataset.score)));
  const keyHandler = e => {
    if(/^[1-9]$/.test(e.key)) choose(Number(e.key));
    if(e.key === 'Enter' && current) document.getElementById('next').click();
  };
  document.addEventListener('keydown', keyHandler);
  document.getElementById('next').onclick = ()=>{
    document.removeEventListener('keydown', keyHandler);
    if(!current){ alert('请先评分。'); return; }
    setDeep(key, current); next();
  };
}
function selectWords(){
  let pool = [...state.wordPool];
  if (C.useSuggestedOrder) pool.sort((a,b)=>a.suggestedOrder-b.suggestedOrder);
  if (C.randomizeWordSubset) pool = shuffle(pool);
  state.selectedWords = pool.slice(0, C.nWordsToUse);
  if (C.randomizePresentationOrder) state.selectedWords = shuffle(state.selectedWords);
  state.emotionImages = state.emotionManifest[state.group] || [];
}
function showEmotionIntro(){
  mount(screen(`
    <div class="title">图片观看阶段</div>
    <div class="subtitle">接下来将呈现一组图片，请自然观看。</div>
    <div class="hint">按空格键开始</div>
  `));
  waitForSpace().then(runEmotionImages);
}
async function runEmotionImages(){
  if(!state.emotionImages.length) return showPostRatings();
  for(let i=0;i<state.emotionImages.length;i++){
    const src = state.emotionImages[i];
    mount(`<div class="stim-screen"><div class="word-stage">${imageOrFallback(src, "图片", "preview")}</div></div>`);
    const onset = performance.now();
    await sleep(C.imageSec);
    state.imageLog.push({index:i+1,file:src,onsetMs:onset,offsetMs:performance.now()});
    mount(`<div class="stim-screen"><div class="word-stage"></div></div>`);
    await sleep(C.imageISI);
  }
  showPostRatings();
}
function showPostRatings(){
  showRatingScreen({title:'当前评分', question:'此刻你的情绪效价如何？', anchors:'1 = 非常消极    9 = 非常积极', key:'post.valence',
    next:()=>showRatingScreen({title:'当前评分', question:'此刻你的情绪唤醒程度如何？', anchors:'1 = 非常平静    9 = 非常激动', key:'post.arousal',
      next:()=>showRatingScreen({title:'当前评分', question:'此刻你想接近当前状态的程度如何？', anchors:'1 = 完全不想    9 = 非常想', key:'post.approach',
        next:()=>showRatingScreen({title:'当前评分', question:'此刻你想回避当前状态的程度如何？', anchors:'1 = 完全不想    9 = 非常想', key:'post.avoidance',
          next:()=>showRatingScreen({title:'当前评分', question:'此刻你想立即采取行动的迫切程度如何？', anchors:'1 = 完全没有    9 = 非常强烈', key:'post.actionUrge',
            next:showEncodingIntro
          })
        })
      })
    })
  });
}
function showEncodingIntro(){
  mount(screen(`<div class="title">词语记忆阶段</div><div class="subtitle">接下来你会看到若干词语。<br>请尽量记住这些词语，以便稍后回忆。</div><div class="hint">按空格键开始</div>`, 'panel narrow'));
  waitForSpace().then(runEncoding);
}
async function runEncoding(){
  state.encodingStartMs = performance.now();
  for(let t=0;t<state.selectedWords.length;t++){
    mount(`<div class="stim-screen"><div class="word-stage"><div class="cross">+</div></div></div>`);
    const fixOnset = performance.now();
    await sleep(C.fixationMs);
    mount(`<div class="stim-screen"><div class="word-stage"></div></div>`);
    await sleep(100);
    const item = state.selectedWords[t];
    mount(`<div class="stim-screen"><div class="word-stage">${imageOrFallback(item.image, item.word, "word-img")}</div></div>`);
    const wordOnset = performance.now();
    await sleep(C.wordMs);
    const wordOffset = performance.now();
    state.trialLog.push({trial:t+1, word:item.word, wordImage:item.image, fixOnsetMs:fixOnset, wordOnsetMs:wordOnset, wordOffsetMs:wordOffset});
    mount(`<div class="stim-screen"><div class="word-stage"></div></div>`);
    await sleep(C.blankMs);
  }
  state.encodingDurationSec = (performance.now()-state.encodingStartMs)/1000;
  showSubtractionIntro();
}
function showSubtractionIntro(){
  mount(screen(`<div class="title">倒数任务</div><div class="subtitle">请在电脑中逐行输入结果</div><div class="hint">按下空格开始</div>`, 'panel narrow'));
  waitForSpace().then(showSubtractionInput);
}
function showSubtractionInput(){
  const startTs = performance.now();
  mount(`<div class="screen"><div class="form-card"><div class="form-title">倒数任务</div><div class="subtitle" style="color:#111827;text-align:center">请从 1000 开始，每次减 3，并在下方逐行输入结果。</div><div class="timer" id="subTimer" style="color:#111827">剩余时间：${C.interferenceSec} 秒</div><textarea id="subInput" class="big-input" placeholder="每行输入一个结果"></textarea><div class="btn-row"><button id="subSubmit">提交</button></div></div></div>`);
  const timerEl = document.getElementById('subTimer'); const endAt = Date.now()+C.interferenceSec*1000;
  const iv = setInterval(()=>{ const remain = Math.max(0, Math.ceil((endAt-Date.now())/1000)); timerEl.textContent = `剩余时间：${remain} 秒`; if(remain<=0){ clearInterval(iv); submitSub(); }}, 200);
  document.getElementById('subSubmit').onclick = ()=>{ clearInterval(iv); submitSub(); };
  function submitSub(){
    const raw = document.getElementById('subInput').value;
    state.subtraction = {rawText:raw, lines:raw.split(/\r?\n/).map(s=>s.trim()).filter(Boolean), durationSec:(performance.now()-startTs)/1000};
    showRecallPrompt();
  }
}
function showRecallPrompt(){
  mount(screen(`<div class="title">自由回忆阶段</div><div class="subtitle">接下来请尽可能回忆刚才呈现过的词语并写出来，<br>想到多少写多少。</div><div class="hint">按空格键进入输入界面</div>`, 'panel narrow'));
  waitForSpace().then(showRecallInput);
}
function showRecallInput(){
  const startTs = performance.now();
  mount(`<div class="screen"><div class="form-card"><div class="form-title">自由回忆输入</div><div class="subtitle" style="color:#111827;text-align:center">请把你记得的词语逐行写出，想到多少写多少。</div><div class="timer" id="recallTimer" style="color:#111827">剩余时间：${C.recallSec} 秒</div><textarea id="recallInput" class="big-input" placeholder="每行输入一个词语"></textarea><div class="btn-row"><button id="recallSubmit">提交</button></div></div></div>`);
  const timerEl = document.getElementById('recallTimer'); const endAt = Date.now()+C.recallSec*1000;
  const iv = setInterval(()=>{ const remain = Math.max(0, Math.ceil((endAt-Date.now())/1000)); timerEl.textContent = `剩余时间：${remain} 秒`; if(remain<=0){ clearInterval(iv); submitRecall(); }}, 200);
  document.getElementById('recallSubmit').onclick = ()=>{ clearInterval(iv); submitRecall(); };
  function submitRecall(){
    const raw = document.getElementById('recallInput').value;
    state.recall = {rawText:raw, lines:raw.split(/\r?\n/).map(s=>s.trim()).filter(Boolean), durationSec:(performance.now()-startTs)/1000};
    scoreRecall(); showTaskRatings();
  }
}
function scoreRecall(){
  const target = state.selectedWords.map(w=>w.word.trim()); const seen=new Set(); const correctWords=[]; const duplicates=[]; const intrusions=[];
  state.recall.lines.forEach(line=>{ if(target.includes(line)){ if(!seen.has(line)){correctWords.push(line); seen.add(line);} else duplicates.push(line);} else intrusions.push(line); });
  const missedWords = target.filter(w=>!seen.has(w));
  Object.assign(state.recall, {correctWords, missedWords, intrusions, duplicates, correctCount:correctWords.length, totalPresented:target.length, correctRate:target.length?correctWords.length/target.length:0});
  state.totalTaskTimeSec = (state.encodingDurationSec||0) + (state.subtraction.durationSec||0) + (state.recall.durationSec||0);
  state.memoryTaskTimeSec = (state.encodingDurationSec||0) + (state.recall.durationSec||0);
  state.efficiencyIndex = state.recall.correctCount / Math.max(state.totalTaskTimeSec, 1e-9);
  state.memoryEfficiencyIndex = state.recall.correctCount / Math.max(state.memoryTaskTimeSec, 1e-9);
}
function showTaskRatings(){
  showRatingScreen({title:'当前评分', question:'你在刚才任务中的努力程度如何？', anchors:'1 = 非常低    9 = 非常高', key:'task.effort',
    next:()=>showRatingScreen({title:'当前评分', question:'你觉得刚才任务的难度如何？', anchors:'1 = 非常容易    9 = 非常困难', key:'task.difficulty',
      next:()=>showRatingScreen({title:'当前评分', question:'你现在感到的疲劳程度如何？', anchors:'1 = 完全不疲劳    9 = 非常疲劳', key:'task.fatigue',
        next:finishExperiment
      })
    })
  });
}
async function finishExperiment(){
  state.endTimeISO = nowISO();
  state.ratings.post.directionIndex = (state.ratings.post.approach||0) - (state.ratings.post.avoidance||0);
  state.ratings.post.strengthIndex = state.ratings.post.actionUrge || 0;
  const bundle = buildOutputs();
  let uploadStatus = '未配置自动上传';
  if (C.webhookUrl) {
    uploadStatus = '自动上传失败';
    try{
      const ctrl = new AbortController(); const t = setTimeout(()=>ctrl.abort(), C.webhookTimeoutMs || 12000);
      const resp = await fetch(C.webhookUrl, {method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify(bundle.json, null, 2), signal:ctrl.signal});
      clearTimeout(t); uploadStatus = resp.ok ? '自动上传成功' : ('自动上传失败（HTTP '+resp.status+'）');
    }catch(e){ uploadStatus = '自动上传失败'; }
  }
  bundle.json.uploadStatus = uploadStatus;
  const files = [
    downloadBlob(JSON.stringify(bundle.json, null, 2), `${state.participant.subjectID}_${state.group}_exp1_online.json`, 'application/json;charset=utf-8'),
    downloadBlob(bundle.summaryCsv, `${state.participant.subjectID}_${state.group}_summary_cn.csv`, 'text/csv;charset=utf-8'),
    downloadBlob(bundle.trialsCsv, `${state.participant.subjectID}_${state.group}_trials_cn.csv`, 'text/csv;charset=utf-8'),
    downloadBlob(bundle.recallCsv, `${state.participant.subjectID}_${state.group}_recall_cn.csv`, 'text/csv;charset=utf-8')
  ];
  mount(screen(`
    <div class="title">实验结束</div>
    <div class="subtitle">感谢你的参与。</div>
    <div class="anchors">正确回忆数：${state.recall.correctCount} / ${state.recall.totalPresented}<br>正确率：${(state.recall.correctRate*100).toFixed(2)}%</div>
    <div class="hint">数据上传状态：${uploadStatus}<br>下方会自动下载结果文件；若浏览器阻止下载，可点击链接手动保存。</div>
    <div class="download-list">${files.map(f=>`<a download="${f.filename}" href="${f.url}">${f.filename}</a>`).join('')}</div>
    <div class="contact-box">
      <img class="contact-qr" src="assets/contact/qq_qr.jpg" alt="主试QQ二维码">
      <div class="contact-text">
        <strong>请联系主试领取被试费用。</strong><br>
        实验结束后，请将：<br>
        1. 实验完成页面截图；<br>
        2. 本次自动下载的数据文件；<br>
        发送给主试。<br><br>
        请使用右侧二维码添加主试 QQ，并备注你的被试编号。
      </div>
    </div>
    <div class="finish-note">请确认已保存结果文件，并完成联系后再关闭浏览器。</div>
  `));
  files.forEach((f, idx)=>setTimeout(()=>{ const a=document.createElement('a'); a.href=f.url; a.download=f.filename; a.click(); }, 300*(idx+1)));
}
function buildOutputs(){
  const summaryRows = [
    ['项目','结果'], ['被试编号', state.participant.subjectID], ['姓名', state.participant.participantName || ''], ['年龄', state.participant.participantAge || ''], ['性别', state.participant.participantGender || ''], ['年级', state.participant.participantGrade || ''], ['组别', state.group], ['备注', state.participant.note || ''], ['样本来源', state.participant.sampleSource || '线上'],
    ['呈现给被试的词语', toChineseList(state.selectedWords.map(w=>w.word))], ['被试自由回忆原始文本', state.recall.rawText || ''], ['被试自由回忆分行', toChineseList(state.recall.lines || [])],
    ['回忆正确的词语', toChineseList(state.recall.correctWords || [])], ['漏报词语', toChineseList(state.recall.missedWords || [])], ['侵入词语', toChineseList(state.recall.intrusions || [])], ['重复词语', toChineseList(state.recall.duplicates || [])],
    ['正确回忆数', state.recall.correctCount], ['总呈现词数', state.recall.totalPresented], ['正确率', state.recall.correctRate], ['编码阶段时长（秒）', state.encodingDurationSec], ['干扰阶段时长（秒）', state.subtraction.durationSec], ['倒数任务原始输入', state.subtraction.rawText || ''], ['倒数任务分行输入', toChineseList(state.subtraction.lines || [])],
    ['回忆阶段时长（秒）', state.recall.durationSec], ['总任务时间（秒）', state.totalTaskTimeSec], ['总流程效率指数', state.efficiencyIndex], ['记忆任务时间（秒）', state.memoryTaskTimeSec], ['记忆效率指数', state.memoryEfficiencyIndex],
    ['前测效价', state.ratings.baseline.valence], ['前测唤醒', state.ratings.baseline.arousal], ['后测效价', state.ratings.post.valence], ['后测唤醒', state.ratings.post.arousal], ['后测趋近倾向', state.ratings.post.approach], ['后测回避倾向', state.ratings.post.avoidance], ['后测行动冲动', state.ratings.post.actionUrge], ['后测动机方向指数', state.ratings.post.directionIndex], ['后测动机强度指数', state.ratings.post.strengthIndex],
    ['努力评分', state.ratings.task.effort], ['难度评分', state.ratings.task.difficulty], ['疲劳评分', state.ratings.task.fatigue], ['开始时间', state.startTimeISO], ['结束时间', state.endTimeISO]
  ];
  const trialsRows = [['被试编号','组别','试次','词语','词语图片','注视点开始时间ms','词语开始时间ms','词语结束时间ms']];
  state.trialLog.forEach(t=>trialsRows.push([state.participant.subjectID, state.group, t.trial, t.word, t.wordImage, t.fixOnsetMs, t.wordOnsetMs, t.wordOffsetMs]));
  const recallRows = [['被试编号','组别','目标词语','是否正确回忆','正确回忆顺序','被试自由回忆原始文本']];
  state.selectedWords.map(w=>w.word).forEach(word=>{ const idx=(state.recall.correctWords||[]).indexOf(word); recallRows.push([state.participant.subjectID, state.group, word, idx>=0?1:0, idx>=0?idx+1:'', state.recall.rawText || '']); });
  const csv = rows => '\ufeff' + rows.map(r=>r.map(csvEscape).join(',')).join('\n');
  return {
    json: {
      participant: state.participant, groupLabel: state.group, sampleSource: state.participant.sampleSource || '线上', wordListPresented: state.selectedWords, imageLog: state.imageLog,
      baseline: state.ratings.baseline, postInduction: state.ratings.post, subtraction: state.subtraction, recall: state.recall,
      trialLog: state.trialLog, taskRatings: state.ratings.task, encodingDurationSec: state.encodingDurationSec,
      totalTaskTimeSec: state.totalTaskTimeSec, memoryTaskTimeSec: state.memoryTaskTimeSec,
      efficiencyIndex: state.efficiencyIndex, memoryEfficiencyIndex: state.memoryEfficiencyIndex,
      startTimeISO: state.startTimeISO, endTimeISO: state.endTimeISO, browser: navigator.userAgent,
      screen: { width: window.screen.width, height: window.screen.height }
    },
    summaryCsv: csv(summaryRows), trialsCsv: csv(trialsRows), recallCsv: csv(recallRows)
  };
}
ensureAssets().then(showWelcome);
})();
