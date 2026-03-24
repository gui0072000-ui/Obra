// ══════════════════════════════════════════════════════
//  ObraManager — app.js
//  Firebase Realtime Database + localStorage fallback
// ══════════════════════════════════════════════════════

// ── Firebase SDK (loaded dynamically if config exists) ──
let db = null;          // Firebase database reference
let fbRef = null;       // Root ref: obra-manager/{obraId}
let unsubscribers = []; // Active Firebase listeners

// ── State ──
let state = {
  obra: { nome: '', end: '', rt: '', art: '', empresa: '' },
  paineis: {},   // { [painelId]: PainelObject }
  ganttCells: {},// { [painelId]: { [cellKey]: CellData } }
  diarios: {},   // { [date]: DiarioObject }
  kanban: {
    cols: [
      { id: 'c1', title: 'A Fazer',       color: '#9ca3af', cards: [] },
      { id: 'c2', title: 'Em Andamento',  color: '#f0a500', cards: [] },
      { id: 'c3', title: 'Aguardando',    color: '#3b82f6', cards: [] },
      { id: 'c4', title: 'Concluído',     color: '#22c55e', cards: [] },
    ]
  }
};

let currentPainelId = null;
let _cellKey = '';
let _cellStatus = 'planejado';
let climaSel = '';
let fotosB64 = [];
let dragCardId = null, dragFromColId = null;
const OBRA_ID = 'default'; // Could be multi-tenant later

// ══════════════════════════════════════════════════════
//  INIT
// ══════════════════════════════════════════════════════
window.addEventListener('load', async () => {
  setHeaderDate();
  setDefaultDates();
  loadFromLocalStorage();
  await tryInitFirebase();
  renderAll();
});

function setHeaderDate() {
  const now = new Date();
  document.getElementById('header-date').textContent =
    now.toLocaleDateString('pt-BR', { weekday: 'long', day: '2-digit', month: 'long', year: 'numeric' });
}

function setDefaultDates() {
  const today = todayStr();
  document.getElementById('gantt-view-start').value = today;
  document.getElementById('diario-data').value = today;
}

function renderAll() {
  applyObraHeader();
  renderPaineis();
  renderKanban();
  loadDiario();
  // populate kanban col select
  populateKanbanColSel();
}

// ══════════════════════════════════════════════════════
//  FIREBASE
// ══════════════════════════════════════════════════════
async function tryInitFirebase() {
  const cfg = getFirebaseConfig();
  if (!cfg) {
    document.getElementById('firebase-banner').classList.add('visible');
    return;
  }
  try {
    // Dynamically load Firebase SDKs
    await loadScript('https://www.gstatic.com/firebasejs/9.22.2/firebase-app-compat.js');
    await loadScript('https://www.gstatic.com/firebasejs/9.22.2/firebase-database-compat.js');

    if (!firebase.apps.length) firebase.initializeApp(cfg);
    db = firebase.database();
    fbRef = db.ref('obramanager/' + OBRA_ID);

    // Subscribe to realtime updates
    fbRef.on('value', snapshot => {
      const remote = snapshot.val();
      if (remote) {
        // Merge remote into state (remote is source of truth)
        state = { ...state, ...remote };
        // Ensure kanban cols exist
        if (!state.kanban) state.kanban = { cols: [] };
        saveToLocalStorage();
        renderAll();
        if (currentPainelId) renderGantt();
      }
    });

    document.getElementById('firebase-banner').classList.remove('visible');
    toast('🔥 Firebase conectado — dados sincronizados em tempo real!');
  } catch (e) {
    console.error('Firebase init error:', e);
    document.getElementById('firebase-banner').classList.add('visible');
    toast('Erro ao conectar Firebase. Usando armazenamento local.', true);
  }
}

function loadScript(src) {
  return new Promise((resolve, reject) => {
    if (document.querySelector(`script[src="${src}"]`)) { resolve(); return; }
    const s = document.createElement('script');
    s.src = src; s.onload = resolve; s.onerror = reject;
    document.head.appendChild(s);
  });
}

function getFirebaseConfig() {
  try {
    const raw = localStorage.getItem('om_firebase_config');
    if (!raw) return null;
    return JSON.parse(raw);
  } catch { return null; }
}

function openFirebaseConfig() { openModal('modal-firebase'); }

async function saveFirebaseConfig() {
  const raw = document.getElementById('firebase-config-input').value.trim();
  try {
    // Accept either raw JS object syntax or JSON
    const cleaned = raw
      .replace(/(\w+):/g, '"$1":')  // quote keys
      .replace(/'/g, '"');           // single to double quotes
    const cfg = JSON.parse(cleaned);
    if (!cfg.apiKey) throw new Error('apiKey missing');
    localStorage.setItem('om_firebase_config', JSON.stringify(cfg));
    closeModal('modal-firebase');
    toast('Configuração salva! Conectando...');
    await tryInitFirebase();
  } catch (e) {
    toast('Erro ao analisar config: ' + e.message, true);
  }
}

// ── Persist to Firebase or localStorage ──
function persist() {
  saveToLocalStorage();
  if (fbRef) {
    fbRef.set(state).catch(e => console.error('Firebase write error:', e));
  }
}

function saveToLocalStorage() {
  try { localStorage.setItem('om_state', JSON.stringify(state)); } catch (e) {}
}

function loadFromLocalStorage() {
  try {
    const raw = localStorage.getItem('om_state');
    if (raw) {
      const saved = JSON.parse(raw);
      state = deepMerge(state, saved);
    }
  } catch (e) {}
}

// Deep merge helper
function deepMerge(target, source) {
  const out = { ...target };
  for (const k of Object.keys(source)) {
    if (source[k] && typeof source[k] === 'object' && !Array.isArray(source[k])) {
      out[k] = deepMerge(target[k] || {}, source[k]);
    } else {
      out[k] = source[k];
    }
  }
  return out;
}

// ══════════════════════════════════════════════════════
//  TABS
// ══════════════════════════════════════════════════════
function showTab(name) {
  document.querySelectorAll('.tab').forEach(t => t.classList.toggle('active', t.dataset.tab === name));
  document.querySelectorAll('.section').forEach(s => s.classList.remove('active'));
  document.getElementById('section-' + name).classList.add('active');
  if (name === 'kanban') populateKanbanColSel();
}

// ══════════════════════════════════════════════════════
//  MODAIS
// ══════════════════════════════════════════════════════
function openModal(id) { document.getElementById(id).classList.add('open'); }
function closeModal(id) { document.getElementById(id).classList.remove('open'); }

document.addEventListener('click', e => {
  if (e.target.classList.contains('modal-overlay')) e.target.classList.remove('open');
});

// ══════════════════════════════════════════════════════
//  OBRA CONFIG
// ══════════════════════════════════════════════════════
function openObraConfig() {
  document.getElementById('obra-nome').value    = state.obra.nome    || '';
  document.getElementById('obra-end').value     = state.obra.end     || '';
  document.getElementById('obra-rt').value      = state.obra.rt      || '';
  document.getElementById('obra-art').value     = state.obra.art     || '';
  document.getElementById('obra-empresa').value = state.obra.empresa || '';
  openModal('modal-obra');
}

function saveObraConfig() {
  state.obra = {
    nome:    document.getElementById('obra-nome').value,
    end:     document.getElementById('obra-end').value,
    rt:      document.getElementById('obra-rt').value,
    art:     document.getElementById('obra-art').value,
    empresa: document.getElementById('obra-empresa').value,
  };
  applyObraHeader();
  persist();
  closeModal('modal-obra');
  toast('Dados da obra salvos!');
}

function applyObraHeader() {
  const el = document.getElementById('header-obra-nome');
  el.textContent = state.obra.nome ? '🏗️ ' + state.obra.nome : '— Configure sua obra →';
}

// ══════════════════════════════════════════════════════
//  PAINÉIS
// ══════════════════════════════════════════════════════
function openModalNovoPainel() {
  document.getElementById('np-nome').value  = '';
  document.getElementById('np-inicio').value = todayStr();
  document.getElementById('np-fim').value   = '';
  document.getElementById('np-desc').value  = '';

  // Populate copy-from
  const sel = document.getElementById('np-copy-from');
  sel.innerHTML = '<option value="">— Não copiar —</option>';
  Object.values(state.paineis || {}).forEach(p => {
    sel.innerHTML += `<option value="${p.id}">${p.nome}</option>`;
  });
  const hasPaineis = Object.keys(state.paineis || {}).length > 0;
  document.getElementById('copy-panel-section').style.display = hasPaineis ? 'block' : 'none';

  openModal('modal-novo-painel');
}

function criarPainel() {
  const nome = document.getElementById('np-nome').value.trim();
  if (!nome) { toast('Informe o nome do painel.', true); return; }

  const id = 'p' + Date.now();
  const copyFromId = document.getElementById('np-copy-from').value;

  let atividades = [];
  if (copyFromId && state.paineis[copyFromId]) {
    // Deep copy atividades, reset ids
    atividades = (state.paineis[copyFromId].atividades || []).map(a => ({
      ...a,
      id: 'a' + Date.now() + Math.random().toString(36).slice(2, 6)
    }));
  }

  state.paineis[id] = {
    id,
    nome,
    inicio: document.getElementById('np-inicio').value,
    fim: document.getElementById('np-fim').value,
    desc: document.getElementById('np-desc').value,
    atividades,
    criadoEm: new Date().toISOString()
  };
  if (!state.ganttCells) state.ganttCells = {};
  state.ganttCells[id] = {};

  persist();
  closeModal('modal-novo-painel');
  renderPaineis();
  toast('Painel criado!');
  abrirPainel(id); // Open immediately
}

function renderPaineis() {
  const grid = document.getElementById('paineis-grid');
  const paineis = Object.values(state.paineis || {});
  if (paineis.length === 0) {
    grid.innerHTML = `<div class="empty-state"><div class="empty-icon">📊</div><div>Nenhum painel criado ainda.</div><div style="margin-top:0.5rem;"><button class="btn btn-primary" onclick="openModalNovoPainel()">+ Criar primeiro painel</button></div></div>`;
    return;
  }
  grid.innerHTML = paineis.map(p => {
    const atvCount = (p.atividades || []).length;
    const pct = calcPainelPct(p);
    return `
    <div class="painel-card" onclick="abrirPainel('${p.id}')">
      <div class="painel-card-title">${p.nome}</div>
      ${p.desc ? `<div class="painel-card-desc">${p.desc}</div>` : ''}
      <div class="painel-card-meta">
        ${p.inicio ? `<span class="painel-meta-item">📅 ${fmtDate(p.inicio)}</span>` : ''}
        ${p.fim    ? `<span class="painel-meta-item">🏁 ${fmtDate(p.fim)}</span>` : ''}
        <span class="painel-meta-item">📋 ${atvCount} atividade${atvCount !== 1 ? 's' : ''}</span>
      </div>
      <div class="painel-progress"><div class="painel-progress-bar" style="width:${pct}%"></div></div>
      <div class="painel-card-actions">
        <button class="btn btn-secondary" style="font-size:0.75rem;padding:0.35rem 0.7rem;" onclick="event.stopPropagation();abrirPainel('${p.id}')">Abrir →</button>
        <button class="btn btn-danger" style="font-size:0.75rem;padding:0.35rem 0.7rem;" onclick="event.stopPropagation();deletarPainel('${p.id}')">Excluir</button>
      </div>
    </div>`;
  }).join('');
}

function calcPainelPct(painel) {
  const cells = (state.ganttCells || {})[painel.id] || {};
  const vals = Object.values(cells).map(c => c.pct || 0).filter(v => v > 0);
  if (!vals.length) return 0;
  return Math.round(vals.reduce((a, b) => a + b, 0) / vals.length);
}

function deletarPainel(id) {
  if (!confirm('Excluir este painel? Todos os dados serão perdidos.')) return;
  delete state.paineis[id];
  if (state.ganttCells) delete state.ganttCells[id];
  persist();
  renderPaineis();
  toast('Painel excluído.');
}

function abrirPainel(id) {
  currentPainelId = id;
  const p = state.paineis[id];
  document.getElementById('painel-titulo-header').textContent = p.nome;
  document.getElementById('painel-sub-header').textContent =
    (p.inicio ? fmtDate(p.inicio) : '') + (p.fim ? ' → ' + fmtDate(p.fim) : '') + (p.desc ? ' · ' + p.desc : '');

  // Set gantt view start to painel inicio or today
  document.getElementById('gantt-view-start').value = p.inicio || todayStr();

  document.getElementById('view-lista-paineis').style.display = 'none';
  document.getElementById('view-painel').style.display = 'block';
  renderGantt();
}

function voltarPaineis() {
  currentPainelId = null;
  document.getElementById('view-painel').style.display = 'none';
  document.getElementById('view-lista-paineis').style.display = 'block';
  renderPaineis();
}

// ══════════════════════════════════════════════════════
//  GANTT
// ══════════════════════════════════════════════════════
function goToToday() {
  document.getElementById('gantt-view-start').value = todayStr();
  renderGantt();
}

function renderGantt() {
  const wrapper = document.getElementById('gantt-wrapper');
  if (!currentPainelId) return;
  const painel = state.paineis[currentPainelId];
  if (!painel) return;

  const atividades = painel.atividades || [];
  const cells = (state.ganttCells || {})[currentPainelId] || {};

  if (atividades.length === 0) {
    wrapper.innerHTML = `<div class="empty-state">Adicione atividades para visualizar o cronograma.</div>`;
    return;
  }

  const startDate = document.getElementById('gantt-view-start').value || todayStr();
  const nDays = parseInt(document.getElementById('gantt-view-days').value) || 14;
  const today = todayStr();

  // Build date array
  const dates = [];
  for (let i = 0; i < nDays; i++) dates.push(addDays(startDate, i));

  // Group dates by month for header
  const months = {};
  dates.forEach(d => {
    const key = d.slice(0, 7); // YYYY-MM
    if (!months[key]) months[key] = { label: monthLabel(d), count: 0 };
    months[key].count++;
  });

  // Build HTML
  let html = `<table class="gantt"><thead>`;

  // Month row
  html += `<tr><th class="th-atv" rowspan="2">Atividade</th>`;
  Object.values(months).forEach(m => {
    html += `<th colspan="${m.count}" style="text-align:center;font-family:'Syne',sans-serif;font-weight:700;font-size:0.72rem;color:var(--accent);letter-spacing:0.5px;">${m.label.toUpperCase()}</th>`;
  });
  html += `</tr>`;

  // Day row
  html += `<tr>`;
  dates.forEach(d => {
    const isToday = d === today;
    const dow = dowAbbr(d);
    const day = d.slice(8);
    html += `<th class="${isToday ? 'th-today' : ''}">${dow}<br>${day}</th>`;
  });
  html += `</tr></thead><tbody>`;

  atividades.forEach((atv, idx) => {
    const atvEnd = addDays(atv.inicio, (atv.dur || 5) - 1);
    html += `<tr>
      <td class="td-atv">
        <div class="atv-nome">${atv.nome}</div>
        <div class="atv-meta">👤 ${atv.resp || '—'} · ${atv.dur || 5} dias</div>
        <button class="atv-del" onclick="deleteAtividade('${atv.id}')">✕</button>
      </td>`;

    dates.forEach(d => {
      const inRange = d >= atv.inicio && d <= atvEnd;
      const isToday = d === today;
      const key = `${atv.id}|${d}`;
      const cell = cells[key] || {};
      let gcClass = 'gc-fora';
      let label = '';

      if (inRange) {
        const status = cell.status || 'planejado';
        gcClass = status === 'vazio' ? 'gc-vazio' : 'gc-' + status;
        // If 100% done, override to green
        if (cell.pct === 100) gcClass = 'gc-concluido';
        label = cell.pct != null ? cell.pct + '%' : '';
      }

      html += `<td class="td-day${isToday ? ' today-col' : ''}">
        <div class="gcell ${gcClass}" onclick="${inRange ? `openCellModal('${atv.id}','${d}','${escHtml(atv.nome)}')` : ''}">
          ${label}
        </div>
      </td>`;
    });

    html += `</tr>`;
  });

  html += `</tbody></table>`;
  wrapper.innerHTML = html;
}

function openModalAddAtividade() {
  document.getElementById('atv-nome').value  = '';
  document.getElementById('atv-resp').value  = '';
  document.getElementById('atv-dur').value   = 5;
  const painel = state.paineis[currentPainelId];
  document.getElementById('atv-inicio').value = painel?.inicio || todayStr();
  openModal('modal-add-atv');
}

function addAtividade() {
  const nome = document.getElementById('atv-nome').value.trim();
  if (!nome) { toast('Informe o nome da atividade.', true); return; }
  const painel = state.paineis[currentPainelId];
  if (!painel) return;

  if (!painel.atividades) painel.atividades = [];
  painel.atividades.push({
    id: 'a' + Date.now(),
    nome,
    inicio: document.getElementById('atv-inicio').value || todayStr(),
    dur: parseInt(document.getElementById('atv-dur').value) || 5,
    resp: document.getElementById('atv-resp').value,
  });

  persist();
  closeModal('modal-add-atv');
  renderGantt();
  toast('Atividade adicionada!');
}

function deleteAtividade(atvId) {
  if (!confirm('Remover esta atividade?')) return;
  const painel = state.paineis[currentPainelId];
  if (!painel) return;
  painel.atividades = (painel.atividades || []).filter(a => a.id !== atvId);
  // Clean cells
  const cells = (state.ganttCells || {})[currentPainelId] || {};
  Object.keys(cells).forEach(k => { if (k.startsWith(atvId + '|')) delete cells[k]; });
  persist();
  renderGantt();
  toast('Atividade removida.');
}

// ── Cell modal ──
function openCellModal(atvId, date, nome) {
  _cellKey = `${atvId}|${date}`;
  const cells = (state.ganttCells || {})[currentPainelId] || {};
  const cell = cells[_cellKey] || {};
  const d = new Date(date + 'T12:00:00');
  const dlabel = d.toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' });
  document.getElementById('cell-modal-title').textContent = `${nome} — ${dlabel}`;

  _cellStatus = cell.status || 'planejado';
  document.querySelectorAll('.status-btn').forEach(b => {
    b.classList.toggle('active', b.dataset.val === _cellStatus);
  });

  const pct = cell.pct != null ? cell.pct : 0;
  document.getElementById('cell-pct').value = pct;
  document.getElementById('pct-display').textContent = pct + '%';
  document.getElementById('cell-obs').value = cell.obs || '';
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
    status: _cellStatus,
    pct:    parseInt(document.getElementById('cell-pct').value),
    obs:    document.getElementById('cell-obs').value,
  };
  persist();
  closeModal('modal-cell');
  renderGantt();
  renderPaineis();
  toast('Progresso salvo!');
}

// ══════════════════════════════════════════════════════
//  DIÁRIO
// ══════════════════════════════════════════════════════
function selClima(el, val) {
  document.querySelectorAll('.clima-btn').forEach(b => b.classList.remove('active'));
  el.classList.add('active');
  climaSel = val;
}

function addEfetivoRow(func = '', qtd = '', emp = '') {
  const tbody = document.getElementById('efetivo-tbody');
  const tr = document.createElement('tr');
  tr.innerHTML = `
    <td><input type="text" value="${func}" placeholder="Função"></td>
    <td><input type="number" value="${qtd}" placeholder="0" style="width:58px;"></td>
    <td><input type="text" value="${emp}" placeholder="Empresa"></td>
    <td><button class="btn btn-danger" style="padding:2px 6px;font-size:0.68rem;" onclick="this.closest('tr').remove()">✕</button></td>`;
  tbody.appendChild(tr);
}

function addFotos(event) {
  const preview = document.getElementById('foto-preview');
  for (const file of event.target.files) {
    const reader = new FileReader();
    reader.onload = e => {
      const img = document.createElement('img');
      img.src = e.target.result;
      img.className = 'foto-thumb';
      preview.appendChild(img);
      fotosB64.push(e.target.result);
    };
    reader.readAsDataURL(file);
  }
}

function saveDiario() {
  const date = document.getElementById('diario-data').value;
  if (!date) { toast('Selecione a data.', true); return; }
  const efetivo = [];
  document.querySelectorAll('#efetivo-tbody tr').forEach(tr => {
    const inputs = tr.querySelectorAll('input');
    if (inputs[0].value) efetivo.push({ func: inputs[0].value, qtd: inputs[1].value, emp: inputs[2].value });
  });
  state.diarios[date] = {
    clima:        climaSel,
    temp:         document.getElementById('temperatura').value,
    periodo:      document.getElementById('d-periodo').value,
    efetivo,
    atividades:   document.getElementById('d-atividades').value,
    ocorrencias:  document.getElementById('d-ocorrencias').value,
    equipamentos: document.getElementById('d-equipamentos').value,
    resumo:       document.getElementById('d-resumo').value,
    fotos:        fotosB64.slice(),
  };
  persist();
  toast('Diário salvo!');
}

function loadDiario() {
  const date = document.getElementById('diario-data').value;
  climaSel = '';
  fotosB64 = [];
  document.querySelectorAll('.clima-btn').forEach(b => b.classList.remove('active'));
  document.getElementById('foto-preview').innerHTML = '';
  document.getElementById('efetivo-tbody').innerHTML = '';

  const d = (state.diarios || {})[date];
  if (!d) {
    ['temperatura','d-atividades','d-ocorrencias','d-equipamentos','d-resumo'].forEach(id => {
      const el = document.getElementById(id);
      if (el) el.value = '';
    });
    addEfetivoRow();
    return;
  }
  climaSel = d.clima || '';
  document.querySelectorAll('.clima-btn').forEach(b => {
    if (b.textContent.trim() === d.clima) b.classList.add('active');
  });
  document.getElementById('temperatura').value       = d.temp || '';
  if (d.periodo) document.getElementById('d-periodo').value = d.periodo;
  document.getElementById('d-atividades').value      = d.atividades   || '';
  document.getElementById('d-ocorrencias').value     = d.ocorrencias  || '';
  document.getElementById('d-equipamentos').value    = d.equipamentos || '';
  document.getElementById('d-resumo').value          = d.resumo       || '';

  (d.efetivo || []).forEach(e => addEfetivoRow(e.func, e.qtd, e.emp));
  if (!(d.efetivo || []).length) addEfetivoRow();

  (d.fotos || []).forEach(src => {
    const img = document.createElement('img');
    img.src = src; img.className = 'foto-thumb';
    document.getElementById('foto-preview').appendChild(img);
    fotosB64.push(src);
  });
}

// ══════════════════════════════════════════════════════
//  KANBAN
// ══════════════════════════════════════════════════════
function renderKanban() {
  const board = document.getElementById('kanban-board');
  board.innerHTML = '';
  const cols = state.kanban?.cols || [];

  cols.forEach(col => {
    const colEl = document.createElement('div');
    colEl.className = 'kanban-col';
    colEl.dataset.colId = col.id;
    colEl.innerHTML = `
      <div class="kanban-col-head">
        <span class="kanban-col-title" style="color:${col.color}">${col.title}</span>
        <span class="kanban-count">${(col.cards || []).length}</span>
      </div>
      <div class="kanban-cards" id="kcards-${col.id}"></div>
      <div class="kanban-add-card" onclick="openModalAddCard('${col.id}')">+ Tarefa</div>`;
    board.appendChild(colEl);

    const cardsEl = document.getElementById('kcards-' + col.id);
    (col.cards || []).forEach(card => cardsEl.appendChild(buildKanbanCard(card, col.id)));

    // DnD
    cardsEl.addEventListener('dragover', e => { e.preventDefault(); colEl.classList.add('drag-over'); });
    cardsEl.addEventListener('dragleave', () => colEl.classList.remove('drag-over'));
    cardsEl.addEventListener('drop', e => {
      e.preventDefault();
      colEl.classList.remove('drag-over');
      if (dragCardId) moveKanbanCard(dragCardId, dragFromColId, col.id);
    });
  });

  // Add col button
  const addBtn = document.createElement('div');
  addBtn.className = 'add-col-btn';
  addBtn.onclick = () => openModal('modal-col');
  addBtn.innerHTML = `<div style="font-size:1.4rem;">＋</div><div>Nova Coluna</div>`;
  board.appendChild(addBtn);
}

function buildKanbanCard(card, colId) {
  const el = document.createElement('div');
  el.className = 'kanban-card';
  el.draggable = true;
  el.dataset.cardId = card.id;
  const catLabel = { estrutura:'Estrutura', fundacao:'Fundação', instalacao:'Instalação', acabamento:'Acabamento', geral:'Geral' }[card.cat] || card.cat;
  el.innerHTML = `
    <button class="kanban-card-del" onclick="deleteKanbanCard('${card.id}','${colId}')">✕</button>
    <div class="kanban-card-title">${card.title}</div>
    ${card.desc ? `<div style="font-size:0.7rem;color:var(--muted);margin-bottom:0.35rem;">${card.desc}</div>` : ''}
    <div class="kanban-card-meta">
      <span class="ktag ktag-${card.cat||'geral'}">${catLabel}</span>
      ${card.resp ? `<span>👤 ${card.resp}</span>` : ''}
      ${card.prazo ? `<span>📅 ${fmtDate(card.prazo)}</span>` : ''}
    </div>`;
  el.addEventListener('dragstart', () => {
    dragCardId = card.id; dragFromColId = colId;
    setTimeout(() => el.classList.add('dragging'), 0);
  });
  el.addEventListener('dragend', () => el.classList.remove('dragging'));
  return el;
}

function moveKanbanCard(cardId, fromId, toId) {
  if (fromId === toId) return;
  const from = state.kanban.cols.find(c => c.id === fromId);
  const to   = state.kanban.cols.find(c => c.id === toId);
  if (!from || !to) return;
  const idx = (from.cards || []).findIndex(c => c.id === cardId);
  if (idx === -1) return;
  const [card] = from.cards.splice(idx, 1);
  if (!to.cards) to.cards = [];
  to.cards.push(card);
  persist();
  renderKanban();
}

function deleteKanbanCard(cardId, colId) {
  const col = state.kanban.cols.find(c => c.id === colId);
  if (col) col.cards = (col.cards || []).filter(c => c.id !== cardId);
  persist();
  renderKanban();
}

let _addCardColId = null;
function openModalAddCard(colId) {
  _addCardColId = colId || null;
  ['card-titulo','card-resp','card-desc'].forEach(id => document.getElementById(id).value = '');
  document.getElementById('card-prazo').value = '';
  populateKanbanColSel();
  if (colId) document.getElementById('card-col-sel').value = colId;
  openModal('modal-card');
}

function populateKanbanColSel() {
  const sel = document.getElementById('card-col-sel');
  if (!sel) return;
  sel.innerHTML = (state.kanban?.cols || []).map(c => `<option value="${c.id}">${c.title}</option>`).join('');
  if (_addCardColId) sel.value = _addCardColId;
}

function addKanbanCard() {
  const title = document.getElementById('card-titulo').value.trim();
  if (!title) { toast('Informe o título.', true); return; }
  const colId = document.getElementById('card-col-sel').value;
  const col = state.kanban.cols.find(c => c.id === colId);
  if (!col) return;
  if (!col.cards) col.cards = [];
  col.cards.push({
    id:    'k' + Date.now(),
    title,
    resp:  document.getElementById('card-resp').value,
    prazo: document.getElementById('card-prazo').value,
    cat:   document.getElementById('card-cat').value,
    desc:  document.getElementById('card-desc').value,
  });
  persist();
  closeModal('modal-card');
  renderKanban();
  toast('Tarefa adicionada!');
}

function addKanbanCol() {
  const nome = document.getElementById('col-nome').value.trim();
  if (!nome) { toast('Informe o nome da coluna.', true); return; }
  if (!state.kanban.cols) state.kanban.cols = [];
  state.kanban.cols.push({
    id: 'c' + Date.now(),
    title: nome,
    color: document.getElementById('col-cor').value,
    cards: []
  });
  persist();
  closeModal('modal-col');
  renderKanban();
  populateKanbanColSel();
  toast('Coluna criada!');
}

// ══════════════════════════════════════════════════════
//  PDF EXPORT
// ══════════════════════════════════════════════════════
async function exportGanttPDF() {
  if (!currentPainelId) return;
  const painel = state.paineis[currentPainelId];
  toast('Gerando PDF...');

  try {
    await loadScript('https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js');
    await loadScript('https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js');

    const { jsPDF } = window.jspdf;
    const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
    const W = doc.internal.pageSize.getWidth();
    const H = doc.internal.pageSize.getHeight();

    // Dark background
    doc.setFillColor(15, 17, 23);
    doc.rect(0, 0, W, H, 'F');

    // Header bar
    doc.setFillColor(24, 27, 35);
    doc.rect(0, 0, W, 22, 'F');

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(14);
    doc.setTextColor(240, 165, 0);
    doc.text('ObraManager — ' + painel.nome, 14, 10);

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    doc.setTextColor(107, 114, 128);
    const subParts = [state.obra.nome, state.obra.rt ? 'RT: ' + state.obra.rt : '', new Date().toLocaleDateString('pt-BR')].filter(Boolean);
    doc.text(subParts.join('   ·   '), 14, 17);
    doc.text('Emitido em ' + new Date().toLocaleString('pt-BR'), W - 14, 17, { align: 'right' });

    // Capture gantt table
    const el = document.getElementById('gantt-wrapper');
    const canvas = await html2canvas(el, {
      backgroundColor: '#181b23',
      scale: 2,
      logging: false,
      useCORS: true
    });

    const imgW = W - 20;
    const imgH = Math.min((canvas.height * imgW) / canvas.width, H - 30);
    doc.addImage(canvas.toDataURL('image/png'), 'PNG', 10, 25, imgW, imgH);

    // Footer
    doc.setFontSize(7);
    doc.setTextColor(107, 114, 128);
    doc.text('ObraManager · Página 1 de 1', W / 2, H - 6, { align: 'center' });

    doc.save(`cronograma_${painel.nome.replace(/\s+/g, '_')}_${todayStr()}.pdf`);
    toast('PDF gerado com sucesso!');
  } catch (e) {
    console.error(e);
    toast('Erro ao gerar PDF: ' + e.message, true);
  }
}

async function exportDiarioPDF() {
  const date = document.getElementById('diario-data').value;
  const d = (state.diarios || {})[date];
  if (!d) { toast('Salve o diário antes de exportar!', true); return; }
  toast('Gerando PDF do diário...');

  try {
    await loadScript('https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js');
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF({ unit: 'mm', format: 'a4' });
    const W = doc.internal.pageSize.getWidth();
    const PH = doc.internal.pageSize.getHeight();
    let y = 0;

    // ── helpers ──
    const checkPage = (space = 12) => {
      if (y + space > PH - 14) { doc.addPage(); y = 16; }
    };
    const section = (title) => {
      checkPage(14);
      doc.setFillColor(30, 34, 46);
      doc.rect(10, y - 4, W - 20, 8, 'F');
      doc.setFont('helvetica', 'bold'); doc.setFontSize(9);
      doc.setTextColor(240, 165, 0);
      doc.text(title, 14, y + 1);
      y += 7;
    };
    const field = (label, value) => {
      if (!value) return;
      checkPage(10);
      doc.setFont('helvetica', 'bold'); doc.setFontSize(7.5); doc.setTextColor(107,114,128);
      doc.text(label.toUpperCase(), 14, y); y += 4;
      doc.setFont('helvetica', 'normal'); doc.setFontSize(9); doc.setTextColor(232,234,240);
      const lines = doc.splitTextToSize(String(value), W - 28);
      lines.forEach(l => { checkPage(5); doc.text(l, 14, y); y += 5; });
      y += 2;
    };

    // Cover header
    doc.setFillColor(15, 17, 23);
    doc.rect(0, 0, W, PH, 'F');
    doc.setFillColor(24, 27, 35);
    doc.rect(0, 0, W, 28, 'F');
    doc.setFont('helvetica', 'bold'); doc.setFontSize(18);
    doc.setTextColor(240, 165, 0);
    doc.text('Diário de Obras', 14, 13);
    doc.setFont('helvetica', 'normal'); doc.setFontSize(10);
    doc.setTextColor(232, 234, 240);
    doc.text(state.obra.nome || 'Obra', 14, 21);
    doc.setFontSize(9); doc.setTextColor(107,114,128);
    const dateObj = new Date(date + 'T12:00:00');
    doc.text(dateObj.toLocaleDateString('pt-BR', { weekday:'long', day:'2-digit', month:'long', year:'numeric' }), W-14, 21, { align:'right' });

    if (state.obra.rt) {
      doc.setFontSize(8); doc.setTextColor(107,114,128);
      doc.text(`RT: ${state.obra.rt}${state.obra.art ? '  ·  ART: ' + state.obra.art : ''}`, 14, 26);
    }
    y = 36;

    // Clima
    section('🌤 CONDIÇÕES CLIMÁTICAS');
    const climaStr = [d.clima, d.temp ? d.temp+'°C' : '', d.periodo].filter(Boolean).join('   ·   ');
    doc.setFont('helvetica','normal'); doc.setFontSize(9.5); doc.setTextColor(232,234,240);
    doc.text(climaStr || '—', 14, y); y += 8;

    // Efetivo
    if (d.efetivo?.length) {
      section('👷 EFETIVO DA OBRA');
      // Table header
      doc.setFontSize(7.5); doc.setFont('helvetica','bold'); doc.setTextColor(107,114,128);
      doc.text('FUNÇÃO', 14, y); doc.text('QTD', 90, y); doc.text('EMPRESA', 110, y); y += 4;
      doc.setDrawColor(42,47,62); doc.line(14, y, W-14, y); y += 3;
      doc.setFont('helvetica','normal'); doc.setFontSize(9); doc.setTextColor(232,234,240);
      d.efetivo.forEach(e => {
        checkPage(6);
        doc.text(e.func||'', 14, y);
        doc.text(String(e.qtd||''), 90, y);
        doc.text(e.emp||'', 110, y);
        y += 6;
      });
      y += 2;
    }

    // Atividades
    field('Atividades Executadas', d.atividades);
    field('Ocorrências e Observações', d.ocorrencias);
    field('Equipamentos', d.equipamentos);
    field('Resumo do Dia', d.resumo);

    // Fotos
    if (d.fotos?.length) {
      doc.addPage(); y = 16;
      section('📸 REGISTRO FOTOGRÁFICO');
      y += 4;
      let fx = 14, colIdx = 0;
      const fW = 58, fH = 45, gap = 8, cols = 3;
      for (const foto of d.fotos.slice(0, 9)) {
        try {
          doc.addImage(foto, 'JPEG', fx, y, fW, fH);
          colIdx++;
          if (colIdx % cols === 0) { fx = 14; y += fH + gap; checkPage(fH + gap); }
          else { fx += fW + gap; }
        } catch (e) {}
      }
    }

    // Footer on all pages
    const pages = doc.internal.getNumberOfPages();
    for (let i = 1; i <= pages; i++) {
      doc.setPage(i);
      doc.setFontSize(7); doc.setTextColor(107,114,128);
      doc.text(`ObraManager  ·  Gerado em ${new Date().toLocaleString('pt-BR')}  ·  Pág. ${i}/${pages}`, W/2, PH-6, { align:'center' });
    }

    doc.save(`diario_${date}.pdf`);
    toast('PDF do diário gerado!');
  } catch (e) {
    console.error(e);
    toast('Erro ao gerar PDF: ' + e.message, true);
  }
}

// ══════════════════════════════════════════════════════
//  UTILS
// ══════════════════════════════════════════════════════
function todayStr() {
  return new Date().toISOString().slice(0, 10);
}
function dateToStr(d) { return d.toISOString().slice(0, 10); }
function addDays(dateStr, n) {
  const d = new Date(dateStr + 'T12:00:00');
  d.setDate(d.getDate() + n);
  return dateToStr(d);
}
function fmtDate(s) {
  if (!s) return '';
  const [y, m, d] = s.split('-');
  return `${d}/${m}/${y}`;
}
function monthLabel(dateStr) {
  const d = new Date(dateStr + 'T12:00:00');
  return d.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' });
}
function dowAbbr(dateStr) {
  const d = new Date(dateStr + 'T12:00:00');
  return ['Dom','Seg','Ter','Qua','Qui','Sex','Sáb'][d.getDay()];
}
function escHtml(s) { return s.replace(/'/g, "\\'").replace(/"/g, '&quot;'); }

function toast(msg, isError = false) {
  const el = document.getElementById('toast');
  el.textContent = msg;
  el.classList.toggle('error', isError);
  el.classList.add('show');
  clearTimeout(el._t);
  el._t = setTimeout(() => el.classList.remove('show'), 3500);
}
