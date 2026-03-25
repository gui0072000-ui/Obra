// ══════════════════════════════════════════════════════
//  ObraManager v2 — app.js
// ══════════════════════════════════════════════════════

let fbRef = null;
let _fbListening = false;

let state = {
  obra: { nome:'', end:'', rt:'', art:'', empresa:'' },
  paineis: {},
  ganttCells: {},
  diarios: {},
  kanban: { cols: [
    { id:'c1', title:'A Fazer',      color:'#9ca3af', cards:[] },
    { id:'c2', title:'Em Andamento', color:'#f0a500', cards:[] },
    { id:'c3', title:'Aguardando',   color:'#3b82f6', cards:[] },
    { id:'c4', title:'Concluído',    color:'#22c55e', cards:[] },
  ]}
};

let currentPainelId = null;
let _cellKey = '';
let _cellStatus = 'planejado';
let climaSel = '';
let fotosB64 = [];
let dragCardId = null, dragFromColId = null;

// ══════════════════════════════════════════════════════
//  INIT
// ══════════════════════════════════════════════════════
window.addEventListener('load', async () => {
  document.getElementById('header-date').textContent =
    new Date().toLocaleDateString('pt-BR', { weekday:'long', day:'2-digit', month:'long', year:'numeric' });
  document.getElementById('gv-start').value = todayStr();
  document.getElementById('diario-data').value = todayStr();

  loadLocal();
  await tryFirebase();
  renderAll();
});

function renderAll() {
  applyObraHeader();
  renderPaineis();
  renderKanban();
  loadDiario();
  syncKanbanColSel();
}

// ══════════════════════════════════════════════════════
//  FIREBASE — fixed config parser
// ══════════════════════════════════════════════════════
async function tryFirebase() {
  const cfg = getFirebaseCfg();
  if (!cfg) { document.getElementById('firebase-banner').classList.add('visible'); return; }
  try {
    await loadScript('https://www.gstatic.com/firebasejs/9.22.2/firebase-app-compat.js');
    await loadScript('https://www.gstatic.com/firebasejs/9.22.2/firebase-database-compat.js');
    if (!firebase.apps.length) firebase.initializeApp(cfg);
    const db = firebase.database();
    fbRef = db.ref('obramanager/default');
    if (!_fbListening) {
      _fbListening = true;
      fbRef.on('value', snap => {
        const remote = snap.val();
        if (remote) { state = deepMerge(state, remote); saveLocal(); renderAll(); }
      });
    }
    document.getElementById('firebase-banner').classList.remove('visible');
    toast('🔥 Firebase conectado!');
  } catch (e) {
    console.error(e);
    document.getElementById('firebase-banner').classList.add('visible');
    toast('Erro Firebase: ' + e.message, true);
  }
}

function getFirebaseCfg() {
  try { return JSON.parse(localStorage.getItem('om_fb_cfg') || 'null'); } catch { return null; }
}

function saveFirebaseConfig() {
  const raw = document.getElementById('firebase-cfg-input').value.trim();
  try {
    const cfg = parseFirebaseConfig(raw);
    if (!cfg.apiKey || !cfg.projectId) throw new Error('Faltam campos obrigatórios (apiKey, projectId)');
    localStorage.setItem('om_fb_cfg', JSON.stringify(cfg));
    closeModal('modal-firebase');
    toast('Configuração salva! Conectando...');
    tryFirebase();
  } catch (e) {
    toast('Erro na configuração: ' + e.message, true);
  }
}

/**
 * Accepts BOTH formats:
 *   1. Raw JS object:  { apiKey: "...", ... }
 *   2. JSON:           { "apiKey": "...", ... }
 *   3. Full JS const:  const firebaseConfig = { ... }
 */
function parseFirebaseConfig(raw) {
  // Strip surrounding whitespace and optional "const X = " prefix
  let s = raw.trim();
  s = s.replace(/^const\s+\w+\s*=\s*/, '').replace(/;?\s*$/, '').trim();

  // Try direct JSON parse first
  try { return JSON.parse(s); } catch(_) {}

  // Convert JS object literal → JSON:
  // 1. Quote unquoted keys
  let json = s.replace(/([{,]\s*)([a-zA-Z_$][a-zA-Z0-9_$]*)(\s*:)/g, '$1"$2"$3');
  // 2. Replace single-quoted strings with double-quoted
  json = json.replace(/'([^'\\]*(\\.[^'\\]*)*)'/g, '"$1"');
  // 3. Remove trailing commas before } or ]
  json = json.replace(/,(\s*[}\]])/g, '$1');

  return JSON.parse(json);
}

// ══════════════════════════════════════════════════════
//  LOCAL STORAGE
// ══════════════════════════════════════════════════════
function saveLocal() { try { localStorage.setItem('om_state', JSON.stringify(state)); } catch(_) {} }
function loadLocal()  { try { const s = localStorage.getItem('om_state'); if (s) state = deepMerge(state, JSON.parse(s)); } catch(_) {} }
function persist()    { saveLocal(); if (fbRef) fbRef.set(state).catch(e => console.error(e)); }

function deepMerge(a, b) {
  const out = { ...a };
  for (const k of Object.keys(b || {})) {
    if (b[k] && typeof b[k] === 'object' && !Array.isArray(b[k])) out[k] = deepMerge(a[k] || {}, b[k]);
    else out[k] = b[k];
  }
  return out;
}

// ══════════════════════════════════════════════════════
//  TABS
// ══════════════════════════════════════════════════════
function showTab(name) {
  // Special KPI tab — not a real section, lives inside paineis
  if (name === 'kpis') { showKpiView(); return; }
  document.querySelectorAll('.tab').forEach(t => t.classList.toggle('active', t.dataset.tab === name));
  document.querySelectorAll('.section').forEach(s => s.classList.remove('active'));
  document.getElementById('section-' + name).classList.add('active');
  if (name === 'kanban') syncKanbanColSel();
}
function openModal(id)  { document.getElementById(id).classList.add('open'); }
function closeModal(id) { document.getElementById(id).classList.remove('open'); }
document.addEventListener('click', e => { if (e.target.classList.contains('modal-overlay')) e.target.classList.remove('open'); });

// ══════════════════════════════════════════════════════
//  OBRA
// ══════════════════════════════════════════════════════
function openObraConfig() {
  ['nome','end','rt','art','empresa'].forEach(k => { document.getElementById('obra-'+k).value = state.obra[k] || ''; });
  openModal('modal-obra');
}
function saveObraConfig() {
  state.obra = { nome: v('obra-nome'), end: v('obra-end'), rt: v('obra-rt'), art: v('obra-art'), empresa: v('obra-empresa') };
  applyObraHeader(); persist(); closeModal('modal-obra'); toast('Dados salvos!');
}
function applyObraHeader() {
  document.getElementById('header-obra-nome').textContent = state.obra.nome ? '🏗️ ' + state.obra.nome : '— Configure sua obra →';
}

// ══════════════════════════════════════════════════════
//  PAINÉIS
// ══════════════════════════════════════════════════════
function openModalNovoPainel() {
  document.getElementById('np-nome').value = '';
  document.getElementById('np-inicio').value = todayStr();
  document.getElementById('np-fim').value = '';
  document.getElementById('np-desc').value = '';
  const sel = document.getElementById('np-copy');
  sel.innerHTML = '<option value="">— Não copiar —</option>';
  Object.values(state.paineis || {}).forEach(p => sel.innerHTML += `<option value="${p.id}">${p.nome}</option>`);
  const has = Object.keys(state.paineis || {}).length > 0;
  document.getElementById('copy-section').style.display = has ? 'block' : 'none';
  openModal('modal-novo-painel');
}

function criarPainel() {
  const nome = v('np-nome').trim();
  if (!nome) { toast('Informe o nome.', true); return; }
  const id = 'p' + Date.now();
  const copyId = v('np-copy');
  let atividades = [];
  if (copyId && state.paineis[copyId]) {
    atividades = (state.paineis[copyId].atividades || []).map(a => ({ ...a, id: 'a' + Date.now() + rnd() }));
  }
  state.paineis[id] = { id, nome, inicio: v('np-inicio'), fim: v('np-fim'), desc: v('np-desc'), atividades, criadoEm: new Date().toISOString() };
  if (!state.ganttCells) state.ganttCells = {};
  state.ganttCells[id] = {};
  persist(); closeModal('modal-novo-painel'); renderPaineis(); toast('Painel criado!');
  abrirPainel(id);
}

function renderPaineis() {
  const grid = document.getElementById('paineis-grid');
  const list = Object.values(state.paineis || {});
  if (!list.length) {
    grid.innerHTML = `<div class="empty-state"><div class="empty-icon">📊</div>Nenhum painel criado.<br><button class="btn btn-primary" style="margin-top:1rem" onclick="openModalNovoPainel()">+ Criar primeiro painel</button></div>`;
    return;
  }
  grid.innerHTML = list.map(p => {
    const n = (p.atividades || []).length;
    const pct = calcPct(p);
    return `<div class="painel-card" onclick="abrirPainel('${p.id}')">
      <div class="painel-card-title">${p.nome}</div>
      ${p.desc ? `<div class="painel-card-desc">${p.desc}</div>` : ''}
      <div class="painel-meta">
        ${p.inicio ? `<span class="pmeta">📅 ${fd(p.inicio)}</span>` : ''}
        ${p.fim    ? `<span class="pmeta">🏁 ${fd(p.fim)}</span>` : ''}
        <span class="pmeta">📋 ${n} atividade${n!==1?'s':''}</span>
        <span class="pmeta" style="color:var(--accent)">${pct}% médio</span>
      </div>
      <div class="painel-progress"><div class="painel-progress-bar" style="width:${pct}%"></div></div>
      <div class="painel-actions">
        <button class="btn btn-secondary" style="font-size:.73rem;padding:.32rem .65rem" onclick="event.stopPropagation();abrirPainel('${p.id}')">Abrir →</button>
        <button class="btn btn-danger"    style="font-size:.73rem;padding:.32rem .65rem" onclick="event.stopPropagation();deletarPainel('${p.id}')">Excluir</button>
      </div>
    </div>`;
  }).join('');
}

function calcPct(painel) {
  const cells = Object.values((state.ganttCells || {})[painel.id] || {});
  const vals = cells.map(c => c.pct || 0).filter(x => x > 0);
  return vals.length ? Math.round(vals.reduce((a,b)=>a+b,0)/vals.length) : 0;
}

function deletarPainel(id) {
  if (!confirm('Excluir este painel? Todos os dados serão perdidos.')) return;
  delete state.paineis[id];
  if (state.ganttCells) delete state.ganttCells[id];
  persist(); renderPaineis(); toast('Painel excluído.');
}

function abrirPainel(id) {
  currentPainelId = id;
  const p = state.paineis[id];
  document.getElementById('painel-titulo-h').textContent = p.nome;
  document.getElementById('painel-sub-h').textContent = [
    p.inicio ? fd(p.inicio) : '', p.fim ? '→ '+fd(p.fim) : '', p.desc
  ].filter(Boolean).join('  ·  ');
  document.getElementById('gv-start').value = p.inicio || todayStr();
  setView('view-painel');
  renderGantt();
}

function voltarPaineis() { currentPainelId = null; setView('view-lista'); renderPaineis(); }

function setView(id) {
  ['view-lista','view-painel','view-kpis'].forEach(v => document.getElementById(v).style.display = v===id ? 'block' : 'none');
}

// ══════════════════════════════════════════════════════
//  GANTT
// ══════════════════════════════════════════════════════
function goToToday() { document.getElementById('gv-start').value = todayStr(); renderGantt(); }

function renderGantt() {
  const wrapper = document.getElementById('gantt-wrapper');
  if (!currentPainelId) return;
  const painel = state.paineis[currentPainelId];
  const atividades = painel?.atividades || [];
  const cells = (state.ganttCells || {})[currentPainelId] || {};

  if (!atividades.length) {
    wrapper.innerHTML = `<div class="empty-state">Adicione atividades para visualizar.</div>`;
    return;
  }

  const startDate = document.getElementById('gv-start').value || todayStr();
  const nDays = parseInt(document.getElementById('gv-days').value) || 14;
  const today = todayStr();
  const dates = [];
  for (let i = 0; i < nDays; i++) dates.push(addDays(startDate, i));

  // Month grouping
  const months = {};
  dates.forEach(d => {
    const key = d.slice(0,7);
    if (!months[key]) months[key] = { label: monthLabel(d), count: 0 };
    months[key].count++;
  });

  let html = `<table class="gantt"><thead>`;
  // Month row
  html += `<tr><th class="th-atv" rowspan="2">Atividade</th>`;
  Object.values(months).forEach(m => html += `<th colspan="${m.count}" class="th-month">${m.label.toUpperCase()}</th>`);
  html += `</tr><tr>`;
  dates.forEach(d => html += `<th class="${d===today?'th-today':''}">${dowAbbr(d)}<br>${d.slice(8)}</th>`);
  html += `</tr></thead><tbody>`;

  atividades.forEach(atv => {
    const planEnd  = addDays(atv.inicio, (atv.dur || 5) - 1);
    const ext      = atv.ext || 0;
    const totalEnd = addDays(atv.inicio, (atv.dur || 5) + ext - 1);

    html += `<tr>
      <td class="td-atv">
        <div class="atv-row-nome">
          ${atv.nome}
          <button class="atv-edit-btn" onclick="openEditAtv('${atv.id}')" title="Editar atividade">✏️</button>
        </div>
        <div class="atv-row-meta">👤 ${atv.resp||'—'} · ${atv.dur||5}d plan.${ext>0?` + ${ext}d ext.`:''}</div>
      </td>`;

    dates.forEach(d => {
      const inPlan = d >= atv.inicio && d <= planEnd;
      const inExt  = d > planEnd && d <= totalEnd;
      const isToday = d === today;
      const key = `${atv.id}|${d}`;
      const cell = cells[key] || {};

      let gcClass = 'gc-fora';
      let label = '';
      let clickable = false;

      if (inExt) {
        // Extension days always show as atrasado (overrideable)
        gcClass = cell.status ? 'gc-' + (cell.status === 'vazio' ? 'vazio' : cell.status) : 'gc-extensao';
        label = cell.pct != null ? cell.pct + '%' : '';
        clickable = true;
      } else if (inPlan) {
        const status = cell.status || 'planejado';
        gcClass = status === 'vazio' ? 'gc-vazio' : 'gc-' + status;
        if (cell.pct === 100) gcClass = 'gc-concluido';
        label = cell.pct != null ? cell.pct + '%' : '';
        clickable = true;
      }

      const onclick = clickable ? `openCellModal('${atv.id}','${d}','${escHtml(atv.nome)}')` : '';
      html += `<td class="td-day${isToday?' today-col':''}">
        <div class="gcell ${gcClass}" ${onclick?`onclick="${onclick}"`:''} title="${cell.obs||''}">${label}</div>
      </td>`;
    });

    html += `</tr>`;
  });

  html += `</tbody></table>`;
  wrapper.innerHTML = html;
}

// ── Add activity ──
function openModalAddAtv() {
  document.getElementById('atv-nome').value = '';
  document.getElementById('atv-resp').value = '';
  document.getElementById('atv-dur').value = 5;
  document.getElementById('atv-inicio').value = state.paineis[currentPainelId]?.inicio || todayStr();
  openModal('modal-add-atv');
}

function addAtividade() {
  const nome = v('atv-nome').trim();
  if (!nome) { toast('Informe o nome.', true); return; }
  const painel = state.paineis[currentPainelId];
  if (!painel.atividades) painel.atividades = [];
  painel.atividades.push({ id:'a'+Date.now(), nome, inicio:v('atv-inicio')||todayStr(), dur:+v('atv-dur')||5, resp:v('atv-resp'), ext:0 });
  persist(); closeModal('modal-add-atv'); renderGantt(); toast('Atividade adicionada!');
}

// ── Edit activity ──
function openEditAtv(atvId) {
  const painel = state.paineis[currentPainelId];
  const atv = (painel?.atividades || []).find(a => a.id === atvId);
  if (!atv) return;
  document.getElementById('edit-atv-id').value = atv.id;
  document.getElementById('edit-atv-nome').value = atv.nome;
  document.getElementById('edit-atv-inicio').value = atv.inicio;
  document.getElementById('edit-atv-dur').value = atv.dur || 5;
  document.getElementById('edit-atv-resp').value = atv.resp || '';
  document.getElementById('edit-atv-ext').value = atv.ext || 0;
  document.getElementById('edit-atv-ext-motivo').value = atv.extMotivo || '';
  openModal('modal-edit-atv');
}

function saveEditAtv() {
  const id = v('edit-atv-id');
  const painel = state.paineis[currentPainelId];
  const idx = (painel?.atividades || []).findIndex(a => a.id === id);
  if (idx === -1) return;
  const ext = Math.max(0, +v('edit-atv-ext') || 0);
  painel.atividades[idx] = {
    ...painel.atividades[idx],
    nome:      v('edit-atv-nome'),
    inicio:    v('edit-atv-inicio'),
    dur:       +v('edit-atv-dur') || 5,
    resp:      v('edit-atv-resp'),
    ext,
    extMotivo: v('edit-atv-ext-motivo'),
  };
  // Auto-mark extension cells as 'atrasado' if not already set
  if (ext > 0) {
    if (!state.ganttCells[currentPainelId]) state.ganttCells[currentPainelId] = {};
    const atv = painel.atividades[idx];
    const extStart = addDays(atv.inicio, atv.dur);
    for (let i = 0; i < ext; i++) {
      const d = addDays(extStart, i);
      const key = `${id}|${d}`;
      if (!state.ganttCells[currentPainelId][key]) {
        state.ganttCells[currentPainelId][key] = { status:'atrasado', pct:0, obs:atv.extMotivo || '' };
      }
    }
  }
  persist(); closeModal('modal-edit-atv'); renderGantt(); toast('Atividade atualizada!');
}

function deleteAtividade(atvId) {
  if (!confirm('Remover esta atividade?')) return;
  const painel = state.paineis[currentPainelId];
  painel.atividades = (painel.atividades || []).filter(a => a.id !== atvId);
  const cells = (state.ganttCells || {})[currentPainelId] || {};
  Object.keys(cells).forEach(k => { if (k.startsWith(atvId + '|')) delete cells[k]; });
  persist(); closeModal('modal-edit-atv'); renderGantt(); toast('Atividade removida.');
}

// ── Cell modal ──
function openCellModal(atvId, date, nome) {
  _cellKey = `${atvId}|${date}`;
  const cells = (state.ganttCells || {})[currentPainelId] || {};
  const cell = cells[_cellKey] || {};
  const d = new Date(date+'T12:00:00');
  document.getElementById('cell-modal-title').textContent = `${nome} — ${d.toLocaleDateString('pt-BR',{day:'2-digit',month:'short'})}`;

  _cellStatus = cell.status || 'planejado';
  document.querySelectorAll('.status-btn').forEach(b => b.classList.toggle('active', b.dataset.val === _cellStatus));

  const pct = cell.pct ?? 0;
  document.getElementById('cell-pct').value = pct;
  document.getElementById('pct-display').textContent = pct + '%';

  // KPI fields
  document.getElementById('ci-colab').value    = cell.colab    ?? '';
  document.getElementById('ci-horas').value    = cell.horas    ?? '';
  document.getElementById('ci-m2').value       = cell.m2       ?? '';
  document.getElementById('ci-aco').value      = cell.aco      ?? '';
  document.getElementById('ci-concreto').value = cell.concreto ?? '';
  document.getElementById('ci-outros').value   = cell.outros   ?? '';
  document.getElementById('ci-obs').value      = cell.obs      ?? '';
  openModal('modal-cell');
}

function selStatus(el) {
  document.querySelectorAll('.status-btn').forEach(b => b.classList.remove('active'));
  el.classList.add('active');
  _cellStatus = el.dataset.val;
}

function saveCellData() {
  if (!state.ganttCells) state.ganttCells = {};
  if (!state.ganttCells[currentPainelId]) state.ganttCells[currentPainelId] = {};
  state.ganttCells[currentPainelId][_cellKey] = {
    status:   _cellStatus,
    pct:      +document.getElementById('cell-pct').value,
    colab:    numOrNull('ci-colab'),
    horas:    numOrNull('ci-horas'),
    m2:       numOrNull('ci-m2'),
    aco:      numOrNull('ci-aco'),
    concreto: numOrNull('ci-concreto'),
    outros:   numOrNull('ci-outros'),
    obs:      document.getElementById('ci-obs').value,
  };
  persist(); closeModal('modal-cell'); renderGantt(); toast('Salvo!');
}

// ══════════════════════════════════════════════════════
//  KPI DASHBOARD
// ══════════════════════════════════════════════════════
function showKpiView() {
  if (!currentPainelId) return;
  const painel = state.paineis[currentPainelId];
  document.getElementById('kpi-painel-nome').textContent = painel.nome;
  setView('view-kpis');
  renderKpiContent(painel);
}

function voltarGantt() { setView('view-painel'); }

function renderKpiContent(painel) {
  const cells = (state.ganttCells || {})[painel.id] || {};
  const atividades = painel.atividades || [];
  const container = document.getElementById('kpi-content');

  // ── Aggregate por atividade ──
  const atvKpis = atividades.map(atv => {
    const atvCells = Object.entries(cells)
      .filter(([k]) => k.startsWith(atv.id + '|'))
      .map(([, v]) => v);
    return { atv, ...aggregateCells(atvCells) };
  });

  // ── Macro (painel todo) ──
  const macro = aggregateCells(Object.values(cells));
  const totalDays = atividades.reduce((s,a) => s + (a.dur||0) + (a.ext||0), 0);
  const totalExt  = atividades.reduce((s,a) => s + (a.ext||0), 0);

  // ── Macro KPI cards ──
  let html = `<div class="card">
    <div class="kpi-section-title">📊 KPIs Macro — ${painel.nome}</div>
    <div class="kpi-grid">
      ${kpiCard('HH Total', fmtNum(macro.hh), 'Hora·Homem acumulado')}
      ${kpiCard('m² Total', fmtNum(macro.m2), 'Área executada')}
      ${kpiCard('Produt. HH', macro.hh>0 ? fmtNum(macro.m2/macro.hh,'2') : '—', 'm²/HH')}
      ${kpiCard('Produt. Colabo.', macro.colabDias>0 ? fmtNum(macro.m2/macro.colabDias,'2') : '—', 'm²/colaborador·dia')}
      ${kpiCard('Aço Total', fmtNum(macro.aco), 'kg')}
      ${kpiCard('Concreto', fmtNum(macro.concreto), 'm³')}
      ${kpiCard('Dias Executados', macro.diasComDados, 'com dados')}
      ${kpiCard('Dias de Extensão', totalExt, 'total no painel', totalExt>0?'color:var(--purple)':'')}
    </div>
  </div>`;

  // ── KPIs por atividade ──
  html += `<div class="card">
    <div class="kpi-section-title">🔍 KPIs por Atividade</div>
    <div style="overflow-x:auto">
    <table class="kpi-atv-table">
      <thead><tr>
        <th>Atividade</th><th>Resp.</th>
        <th>Plan.(d)</th><th>Ext.(d)</th>
        <th>HH</th><th>m²</th>
        <th>m²/HH</th><th>m²/Colab·d</th>
        <th>Aço (kg)</th><th>Concreto (m³)</th>
        <th>Progresso</th>
      </tr></thead><tbody>`;

  atvKpis.forEach(({ atv, hh, m2, aco, concreto, colabDias, diasComDados, avgPct }) => {
    const prodHH    = hh > 0 ? fmtNum(m2/hh,'2') : '—';
    const prodColab = colabDias > 0 ? fmtNum(m2/colabDias,'2') : '—';
    const extColor  = atv.ext > 0 ? 'color:var(--purple);font-weight:600' : '';
    html += `<tr>
      <td style="font-weight:600">${atv.nome}</td>
      <td>${atv.resp||'—'}</td>
      <td>${atv.dur||5}</td>
      <td style="${extColor}">${atv.ext||0}</td>
      <td>${fmtNum(hh)}</td>
      <td>${fmtNum(m2)}</td>
      <td>${prodHH}</td>
      <td>${prodColab}</td>
      <td>${fmtNum(aco)}</td>
      <td>${fmtNum(concreto)}</td>
      <td>
        <div style="display:flex;align-items:center;gap:.4rem">
          <div style="flex:1;height:6px;background:var(--border);border-radius:3px;overflow:hidden">
            <div style="height:100%;width:${avgPct}%;background:${avgPct===100?'var(--green)':'var(--accent)'};border-radius:3px"></div>
          </div>
          <span style="font-family:'DM Mono',monospace;font-size:.7rem">${avgPct}%</span>
        </div>
      </td>
    </tr>`;
  });

  html += `</tbody></table></div></div>`;

  // ── Histórico diário ──
  const allCellsSorted = Object.entries(cells)
    .filter(([,c]) => c.colab || c.horas || c.m2)
    .sort(([a],[b]) => a.split('|')[1] > b.split('|')[1] ? 1 : -1);

  if (allCellsSorted.length) {
    html += `<div class="card">
      <div class="kpi-section-title">📅 Histórico Diário de Produção</div>
      <div style="overflow-x:auto"><table class="kpi-atv-table">
        <thead><tr><th>Data</th><th>Atividade</th><th>Colabor.</th><th>Horas</th><th>HH</th><th>m²</th><th>Aço (kg)</th><th>Concreto (m³)</th><th>%</th><th>Observação</th></tr></thead>
        <tbody>`;
    allCellsSorted.forEach(([key, cell]) => {
      const [atvId, date] = key.split('|');
      const atvName = atividades.find(a=>a.id===atvId)?.nome || atvId;
      const hh = (cell.colab||0)*(cell.horas||0);
      html += `<tr>
        <td style="font-family:'DM Mono',monospace;font-size:.72rem">${fd(date)}</td>
        <td>${atvName}</td>
        <td>${cell.colab||'—'}</td>
        <td>${cell.horas||'—'}</td>
        <td>${hh>0?fmtNum(hh):'—'}</td>
        <td>${cell.m2||'—'}</td>
        <td>${cell.aco||'—'}</td>
        <td>${cell.concreto||'—'}</td>
        <td><span style="font-family:'DM Mono',monospace">${cell.pct||0}%</span></td>
        <td style="font-size:.72rem;color:var(--muted)">${cell.obs||''}</td>
      </tr>`;
    });
    html += `</tbody></table></div></div>`;
  }

  container.innerHTML = html;
}

function aggregateCells(cells) {
  let hh=0, m2=0, aco=0, concreto=0, colabDias=0, diasComDados=0, pctSum=0, pctCount=0;
  cells.forEach(c => {
    if (!c) return;
    const h = (c.colab||0)*(c.horas||0);
    hh += h;
    m2 += c.m2||0;
    aco += c.aco||0;
    concreto += c.concreto||0;
    colabDias += c.colab||0;
    if (c.colab||c.horas||c.m2||c.aco) diasComDados++;
    if (c.pct != null) { pctSum += c.pct; pctCount++; }
  });
  return { hh, m2, aco, concreto, colabDias, diasComDados, avgPct: pctCount ? Math.round(pctSum/pctCount) : 0 };
}

function kpiCard(label, val, sub, style='') {
  return `<div class="kpi-card">
    <div class="kpi-card-val" style="${style}">${val||'—'}</div>
    <div class="kpi-card-label">${label}</div>
    ${sub?`<div class="kpi-card-sub">${sub}</div>`:''}
  </div>`;
}

// ══════════════════════════════════════════════════════
//  DIÁRIO
// ══════════════════════════════════════════════════════
function selClima(el, val) {
  document.querySelectorAll('.clima-btn').forEach(b=>b.classList.remove('active'));
  el.classList.add('active'); climaSel = val;
}
function addEfetivoRow(func='', qtd='', emp='') {
  const tr = document.createElement('tr');
  tr.innerHTML = `
    <td><input type="text" value="${func}" placeholder="Função"></td>
    <td><input type="number" value="${qtd}" placeholder="0" style="width:55px"></td>
    <td><input type="text" value="${emp}" placeholder="Empresa"></td>
    <td><button class="btn btn-danger" style="padding:2px 5px;font-size:.66rem" onclick="this.closest('tr').remove()">✕</button></td>`;
  document.getElementById('efetivo-tbody').appendChild(tr);
}
function addFotos(event) {
  for (const file of event.target.files) {
    const r = new FileReader();
    r.onload = e => {
      const img = document.createElement('img');
      img.src = e.target.result; img.className = 'foto-thumb';
      document.getElementById('foto-preview').appendChild(img);
      fotosB64.push(e.target.result);
    };
    r.readAsDataURL(file);
  }
}
function saveDiario() {
  const date = document.getElementById('diario-data').value;
  if (!date) { toast('Selecione a data.', true); return; }
  const efetivo = [];
  document.querySelectorAll('#efetivo-tbody tr').forEach(tr => {
    const inp = tr.querySelectorAll('input');
    if (inp[0].value) efetivo.push({ func:inp[0].value, qtd:inp[1].value, emp:inp[2].value });
  });
  state.diarios[date] = {
    clima: climaSel, temp: v('temperatura'), periodo: v('d-periodo'),
    efetivo, atividades: v('d-atividades'), ocorrencias: v('d-ocorrencias'),
    equipamentos: v('d-equipamentos'), resumo: v('d-resumo'), fotos: fotosB64.slice(),
  };
  persist(); toast('Diário salvo!');
}
function loadDiario() {
  const date = document.getElementById('diario-data').value;
  climaSel = ''; fotosB64 = [];
  document.querySelectorAll('.clima-btn').forEach(b=>b.classList.remove('active'));
  document.getElementById('foto-preview').innerHTML = '';
  document.getElementById('efetivo-tbody').innerHTML = '';
  const d = (state.diarios||{})[date];
  if (!d) {
    ['temperatura','d-atividades','d-ocorrencias','d-equipamentos','d-resumo'].forEach(id=>{const el=document.getElementById(id);if(el)el.value='';});
    addEfetivoRow(); return;
  }
  climaSel = d.clima||'';
  document.querySelectorAll('.clima-btn').forEach(b=>{ if(b.textContent.trim()===d.clima) b.classList.add('active'); });
  document.getElementById('temperatura').value = d.temp||'';
  if (d.periodo) document.getElementById('d-periodo').value = d.periodo;
  document.getElementById('d-atividades').value = d.atividades||'';
  document.getElementById('d-ocorrencias').value = d.ocorrencias||'';
  document.getElementById('d-equipamentos').value = d.equipamentos||'';
  document.getElementById('d-resumo').value = d.resumo||'';
  (d.efetivo||[]).forEach(e=>addEfetivoRow(e.func,e.qtd,e.emp));
  if (!(d.efetivo||[]).length) addEfetivoRow();
  (d.fotos||[]).forEach(src=>{ const img=document.createElement('img'); img.src=src; img.className='foto-thumb'; document.getElementById('foto-preview').appendChild(img); fotosB64.push(src); });
}

// ══════════════════════════════════════════════════════
//  KANBAN
// ══════════════════════════════════════════════════════
function renderKanban() {
  const board = document.getElementById('kanban-board');
  board.innerHTML = '';
  (state.kanban?.cols||[]).forEach(col => {
    const el = document.createElement('div');
    el.className = 'kanban-col';
    el.dataset.colId = col.id;
    el.innerHTML = `<div class="kanban-col-head"><span class="kanban-col-title" style="color:${col.color}">${col.title}</span><span class="kanban-count">${(col.cards||[]).length}</span></div><div class="kanban-cards" id="kcards-${col.id}"></div><div class="kanban-add-card" onclick="openModalAddCard('${col.id}')">+ Tarefa</div>`;
    board.appendChild(el);
    const cardsEl = document.getElementById('kcards-'+col.id);
    (col.cards||[]).forEach(card => cardsEl.appendChild(buildCard(card, col.id)));
    cardsEl.addEventListener('dragover', e=>{ e.preventDefault(); el.classList.add('drag-over'); });
    cardsEl.addEventListener('dragleave', ()=>el.classList.remove('drag-over'));
    cardsEl.addEventListener('drop', e=>{ e.preventDefault(); el.classList.remove('drag-over'); if(dragCardId) moveCard(dragCardId,dragFromColId,col.id); });
  });
  const addBtn = document.createElement('div');
  addBtn.className = 'add-col-btn';
  addBtn.onclick = ()=>openModal('modal-col');
  addBtn.innerHTML = `<div style="font-size:1.3rem">＋</div><div>Nova Coluna</div>`;
  board.appendChild(addBtn);
}
function buildCard(card, colId) {
  const el = document.createElement('div');
  el.className = 'kanban-card'; el.draggable = true; el.dataset.cardId = card.id;
  const catLabel = {estrutura:'Estrutura',fundacao:'Fundação',instalacao:'Instalação',acabamento:'Acabamento',geral:'Geral'}[card.cat]||card.cat;
  el.innerHTML = `<button class="kanban-card-del" onclick="delCard('${card.id}','${colId}')">✕</button><div class="kanban-card-title">${card.title}</div>${card.desc?`<div style="font-size:.7rem;color:var(--muted);margin-bottom:.3rem">${card.desc}</div>`:''}<div class="kanban-card-meta"><span class="ktag ktag-${card.cat||'geral'}">${catLabel}</span>${card.resp?`<span>👤 ${card.resp}</span>`:''} ${card.prazo?`<span>📅 ${fd(card.prazo)}</span>`:''}</div>`;
  el.addEventListener('dragstart', ()=>{ dragCardId=card.id; dragFromColId=colId; setTimeout(()=>el.classList.add('dragging'),0); });
  el.addEventListener('dragend', ()=>el.classList.remove('dragging'));
  return el;
}
function moveCard(cId, fId, tId) {
  if (fId===tId) return;
  const from = state.kanban.cols.find(c=>c.id===fId);
  const to   = state.kanban.cols.find(c=>c.id===tId);
  if (!from||!to) return;
  const idx = (from.cards||[]).findIndex(c=>c.id===cId);
  if (idx===-1) return;
  const [card] = from.cards.splice(idx,1);
  if (!to.cards) to.cards=[];
  to.cards.push(card);
  persist(); renderKanban();
}
function delCard(cId, colId) {
  const col = state.kanban.cols.find(c=>c.id===colId);
  if (col) col.cards = (col.cards||[]).filter(c=>c.id!==cId);
  persist(); renderKanban();
}
let _addCardColId = null;
function openModalAddCard(colId) {
  _addCardColId = colId||null;
  ['card-titulo','card-resp','card-desc'].forEach(id=>document.getElementById(id).value='');
  document.getElementById('card-prazo').value='';
  syncKanbanColSel();
  if (colId) document.getElementById('card-col-sel').value = colId;
  openModal('modal-card');
}
function syncKanbanColSel() {
  const sel = document.getElementById('card-col-sel');
  if (!sel) return;
  sel.innerHTML = (state.kanban?.cols||[]).map(c=>`<option value="${c.id}">${c.title}</option>`).join('');
  if (_addCardColId) sel.value = _addCardColId;
}
function addKanbanCard() {
  const title = v('card-titulo').trim();
  if (!title) { toast('Informe o título.', true); return; }
  const col = state.kanban.cols.find(c=>c.id===v('card-col-sel'));
  if (!col) return;
  if (!col.cards) col.cards=[];
  col.cards.push({ id:'k'+Date.now(), title, resp:v('card-resp'), prazo:v('card-prazo'), cat:v('card-cat'), desc:v('card-desc') });
  persist(); closeModal('modal-card'); renderKanban(); toast('Tarefa adicionada!');
}
function addKanbanCol() {
  const nome = v('col-nome').trim();
  if (!nome) { toast('Informe o nome.', true); return; }
  if (!state.kanban.cols) state.kanban.cols=[];
  state.kanban.cols.push({ id:'c'+Date.now(), title:nome, color:v('col-cor'), cards:[] });
  persist(); closeModal('modal-col'); renderKanban(); syncKanbanColSel(); toast('Coluna criada!');
}

// ══════════════════════════════════════════════════════
//  PDF
// ══════════════════════════════════════════════════════
async function exportGanttPDF() {
  if (!currentPainelId) return;
  toast('Gerando PDF...');
  try {
    await loadScript('https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js');
    await loadScript('https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js');
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF({ orientation:'landscape', unit:'mm', format:'a4' });
    const W = doc.internal.pageSize.getWidth(), H = doc.internal.pageSize.getHeight();
    const painel = state.paineis[currentPainelId];
    doc.setFillColor(15,17,23); doc.rect(0,0,W,H,'F');
    doc.setFillColor(24,27,35); doc.rect(0,0,W,22,'F');
    doc.setFont('helvetica','bold'); doc.setFontSize(13); doc.setTextColor(240,165,0);
    doc.text('ObraManager — ' + painel.nome, 14, 10);
    doc.setFont('helvetica','normal'); doc.setFontSize(8); doc.setTextColor(107,114,128);
    doc.text([state.obra.nome, state.obra.rt?'RT: '+state.obra.rt:''].filter(Boolean).join('  ·  '), 14, 17);
    doc.text('Emitido em ' + new Date().toLocaleString('pt-BR'), W-14, 17, { align:'right' });
    const el = document.getElementById('gantt-wrapper');
    const canvas = await html2canvas(el, { backgroundColor:'#181b23', scale:2, logging:false, useCORS:true });
    const iW = W-20, iH = Math.min((canvas.height*iW)/canvas.width, H-30);
    doc.addImage(canvas.toDataURL('image/png'), 'PNG', 10, 25, iW, iH);
    doc.setFontSize(7); doc.setTextColor(107,114,128);
    doc.text('ObraManager · Pág. 1/1', W/2, H-6, { align:'center' });
    doc.save(`cronograma_${painel.nome.replace(/\s+/g,'_')}_${todayStr()}.pdf`);
    toast('PDF gerado!');
  } catch (e) { console.error(e); toast('Erro PDF: '+e.message, true); }
}

async function exportDiarioPDF() {
  const date = document.getElementById('diario-data').value;
  const d = (state.diarios||{})[date];
  if (!d) { toast('Salve o diário antes de exportar.', true); return; }
  toast('Gerando PDF do diário...');
  try {
    await loadScript('https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js');
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF({ unit:'mm', format:'a4' });
    const W = doc.internal.pageSize.getWidth(), PH = doc.internal.pageSize.getHeight();
    let y = 0;
    const np = (sp=5) => { y+=sp; if(y>PH-14){ doc.addPage(); y=16; } };
    const sec = (t) => {
      if(y>PH-18){doc.addPage();y=16;}
      doc.setFillColor(30,34,46); doc.rect(10,y-4,W-20,8,'F');
      doc.setFont('helvetica','bold'); doc.setFontSize(9); doc.setTextColor(240,165,0);
      doc.text(t,14,y+1); y+=8;
    };
    const fld = (lbl, val) => {
      if(!val) return;
      if(y>PH-12){doc.addPage();y=16;}
      doc.setFont('helvetica','bold'); doc.setFontSize(7.5); doc.setTextColor(107,114,128);
      doc.text(lbl.toUpperCase(),14,y); y+=4;
      doc.setFont('helvetica','normal'); doc.setFontSize(9); doc.setTextColor(232,234,240);
      doc.splitTextToSize(String(val),W-28).forEach(l=>{if(y>PH-8){doc.addPage();y=16;}doc.text(l,14,y);y+=5;});
      y+=2;
    };
    // Header
    doc.setFillColor(15,17,23); doc.rect(0,0,W,PH,'F');
    doc.setFillColor(24,27,35); doc.rect(0,0,W,28,'F');
    doc.setFont('helvetica','bold'); doc.setFontSize(16); doc.setTextColor(240,165,0);
    doc.text('Diário de Obras',14,13);
    doc.setFontSize(10); doc.setTextColor(232,234,240);
    doc.text(state.obra.nome||'Obra',14,21);
    doc.setFontSize(8); doc.setTextColor(107,114,128);
    const dateLabel = new Date(date+'T12:00:00').toLocaleDateString('pt-BR',{weekday:'long',day:'2-digit',month:'long',year:'numeric'});
    doc.text(dateLabel, W-14, 21, {align:'right'});
    if(state.obra.rt) doc.text(`RT: ${state.obra.rt}${state.obra.art?' · ART: '+state.obra.art:''}`,14,26);
    y=36;

    sec('🌤 CONDIÇÕES CLIMÁTICAS');
    doc.setFont('helvetica','normal'); doc.setFontSize(9.5); doc.setTextColor(232,234,240);
    doc.text([d.clima, d.temp?d.temp+'°C':'', d.periodo].filter(Boolean).join('   ·   ')||'—',14,y); y+=8;

    if(d.efetivo?.length){
      sec('👷 EFETIVO DA OBRA');
      doc.setFontSize(7.5); doc.setFont('helvetica','bold'); doc.setTextColor(107,114,128);
      doc.text('FUNÇÃO',14,y); doc.text('QTD',90,y); doc.text('EMPRESA',110,y); y+=4;
      doc.setDrawColor(42,47,62); doc.line(14,y,W-14,y); y+=3;
      doc.setFont('helvetica','normal'); doc.setFontSize(9); doc.setTextColor(232,234,240);
      d.efetivo.forEach(e=>{ if(y>PH-10){doc.addPage();y=16;} doc.text(e.func||'',14,y); doc.text(String(e.qtd||''),90,y); doc.text(e.emp||'',110,y); y+=6; });
      y+=2;
    }
    fld('Atividades Executadas', d.atividades);
    fld('Ocorrências e Observações', d.ocorrencias);
    fld('Equipamentos', d.equipamentos);
    fld('Resumo do Dia', d.resumo);

    if(d.fotos?.length){
      doc.addPage(); y=16;
      sec('📸 REGISTRO FOTOGRÁFICO'); y+=4;
      let fx=14, ci=0;
      for(const foto of d.fotos.slice(0,9)){
        try{ doc.addImage(foto,'JPEG',fx,y,58,45); ci++; if(ci%3===0){fx=14;y+=53;if(y>PH-60){doc.addPage();y=16;}}else fx+=63; }catch(_){}
      }
    }
    const pages = doc.internal.getNumberOfPages();
    for(let i=1;i<=pages;i++){
      doc.setPage(i); doc.setFontSize(7); doc.setTextColor(107,114,128);
      doc.text(`ObraManager · ${new Date().toLocaleString('pt-BR')} · Pág. ${i}/${pages}`, W/2, PH-6, {align:'center'});
    }
    doc.save(`diario_${date}.pdf`);
    toast('PDF do diário gerado!');
  } catch(e){ console.error(e); toast('Erro PDF: '+e.message, true); }
}

// ══════════════════════════════════════════════════════
//  UTILS
// ══════════════════════════════════════════════════════
function todayStr() { return new Date().toISOString().slice(0,10); }
function addDays(s, n) { const d=new Date(s+'T12:00:00'); d.setDate(d.getDate()+n); return d.toISOString().slice(0,10); }
function fd(s) { if(!s) return ''; const [y,m,d]=s.split('-'); return `${d}/${m}/${y}`; }
function monthLabel(s) { return new Date(s+'T12:00:00').toLocaleDateString('pt-BR',{month:'long',year:'numeric'}); }
function dowAbbr(s) { return ['Dom','Seg','Ter','Qua','Qui','Sex','Sáb'][new Date(s+'T12:00:00').getDay()]; }
function escHtml(s) { return (s||'').replace(/'/g,"\\'").replace(/"/g,'&quot;'); }
function v(id) { return document.getElementById(id)?.value || ''; }
function rnd() { return Math.random().toString(36).slice(2,6); }
function numOrNull(id) { const n=parseFloat(document.getElementById(id)?.value); return isNaN(n)?null:n; }
function fmtNum(n, dec=1) { if(n===null||n===undefined||n==='') return '—'; if(typeof n==='number') return n%1===0?n.toString():n.toFixed(dec); return n; }
function loadScript(src) {
  return new Promise((res,rej)=>{
    if(document.querySelector(`script[src="${src}"]`)){res();return;}
    const s=document.createElement('script'); s.src=src; s.onload=res; s.onerror=rej; document.head.appendChild(s);
  });
}
function toast(msg, isError=false) {
  const el=document.getElementById('toast');
  el.textContent=msg; el.classList.toggle('error',isError); el.classList.add('show');
  clearTimeout(el._t); el._t=setTimeout(()=>el.classList.remove('show'),3500);
}
