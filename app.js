/**
 * HorasExtra360 · app.js
 * Dashboard Interativo de Horas Extras + Firebase Auth + Firestore
 * ─────────────────────────────────────────────────────────────
 */

import {
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signOut,
  onAuthStateChanged
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";

import {
  doc,
  setDoc,
  getDoc,
  serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

/* ═══════════════════════════════════════════════════════════
   ESTADO GLOBAL
═══════════════════════════════════════════════════════════ */
let allData      = [];
let filteredData = [];
let tableRows    = [];
let activeDates  = new Set();
const charts = {};
let tableSortCol = null;
let tableSortAsc = true;
let tablePage    = 1;
const PAGE_SIZE  = 25;
let currentUser  = null;

/* ═══════════════════════════════════════════════════════════
   FIREBASE
═══════════════════════════════════════════════════════════ */
const auth = window.firebaseAuth;
const db   = window.firebaseDB;

/* ═══════════════════════════════════════════════════════════
   FIRESTORE: SALVAR & CARREGAR
═══════════════════════════════════════════════════════════ */
async function saveToFirestore() {
  if (!currentUser || !allData.length) return;
  try {
    showLoading(true);
    const ref = doc(db, 'users', currentUser.uid, 'dashboard', 'ultimo');
    await setDoc(ref, {
      records: allData,
      updatedAt: serverTimestamp(),
      userEmail: currentUser.email,
      totalRecords: allData.length
    });
    showCloudStatus('☁️ Dados salvos na nuvem com sucesso!', 'green');
  } catch (err) {
    console.error('Erro ao salvar no Firestore:', err);
    showCloudStatus('⚠️ Erro ao salvar: ' + err.message, 'red');
  } finally {
    showLoading(false);
  }
}

async function loadFromFirestore() {
  if (!currentUser) return false;
  try {
    showLoading(true);
    const ref = doc(db, 'users', currentUser.uid, 'dashboard', 'ultimo');
    const snap = await getDoc(ref);
    if (snap.exists()) {
      const payload = snap.data();
      if (payload.records && payload.records.length) {
        allData = payload.records;
        initDashboard();
        showCloudStatus('☁️ Dados carregados da nuvem (' + payload.records.length + ' registros)', 'green');
        return true;
      }
    }
    return false;
  } catch (err) {
    console.error('Erro ao carregar do Firestore:', err);
    showCloudStatus('⚠️ Erro ao carregar: ' + err.message, 'red');
    return false;
  } finally {
    showLoading(false);
  }
}

function showCloudStatus(msg, color) {
  const el = document.getElementById('cloudStatus');
  if (!el) return;
  el.textContent = msg;
  el.style.color = color === 'red' ? 'var(--red)' : 'var(--green)';
  setTimeout(() => { if (el.textContent === msg) el.textContent = ''; }, 5000);
}

function updateCloudButtons() {
  const btnSave = document.getElementById('btnSaveCloud');
  const btnLoad = document.getElementById('btnLoadCloud');
  if (btnSave) btnSave.style.display = currentUser ? 'inline-block' : 'none';
  if (btnLoad) btnLoad.style.display = currentUser ? 'inline-block' : 'none';
}

/* ═══════════════════════════════════════════════════════════
   FIREBASE AUTH
═══════════════════════════════════════════════════════════ */
function initAuth() {
  const loginScreen = document.getElementById('loginScreen');
  const appShell    = document.getElementById('appShell');
  const userEmail   = document.getElementById('userEmail');
  const loginError  = document.getElementById('loginError');

  onAuthStateChanged(auth, user => {
    currentUser = user;
    updateCloudButtons();
    if (user) {
      loginScreen.style.display = 'none';
      appShell.style.display = 'block';
      userEmail.textContent = user.email;
      // Tenta carregar do Firestore primeiro; se não houver, tenta auto-load local
      if (!allData.length) {
        loadFromFirestore().then(loaded => {
          if (!loaded) autoLoad();
        });
      }
    } else {
      loginScreen.style.display = 'flex';
      appShell.style.display = 'none';
      userEmail.textContent = '';
      loginError.textContent = '';
    }
  });

  // Login
  document.getElementById('btnLogin').addEventListener('click', async () => {
    const email = document.getElementById('loginEmail').value.trim();
    const pass  = document.getElementById('loginPassword').value;
    loginError.textContent = '';
    try {
      await signInWithEmailAndPassword(auth, email, pass);
    } catch (err) {
      loginError.textContent = mapAuthError(err.code);
    }
  });

  // Enter no formulário também faz login
  document.getElementById('loginForm').addEventListener('keypress', e => {
    if (e.key === 'Enter') document.getElementById('btnLogin').click();
  });

  // Registro
  document.getElementById('btnRegister').addEventListener('click', async () => {
    const email = document.getElementById('loginEmail').value.trim();
    const pass  = document.getElementById('loginPassword').value;
    loginError.textContent = '';
    if (pass.length < 6) {
      loginError.textContent = 'A senha deve ter pelo menos 6 caracteres.';
      return;
    }
    try {
      await createUserWithEmailAndPassword(auth, email, pass);
    } catch (err) {
      loginError.textContent = mapAuthError(err.code);
    }
  });

  // Logout
  document.getElementById('btnLogout').addEventListener('click', async () => {
    await signOut(auth);
    // Limpa dados para próximo login
    allData = [];
    filteredData = [];
    tableRows = [];
    activeDates = new Set();
    document.getElementById('landing').style.display = 'flex';
    document.getElementById('mainContent').style.display = 'none';
    document.getElementById('filterBar').style.display = 'none';
    Object.values(charts).forEach(c => c.destroy && c.destroy());
    for (const k in charts) delete charts[k];
  });

  // Botões nuvem
  const btnSave = document.getElementById('btnSaveCloud');
  const btnLoad = document.getElementById('btnLoadCloud');
  if (btnSave) btnSave.addEventListener('click', saveToFirestore);
  if (btnLoad) btnLoad.addEventListener('click', loadFromFirestore);
}

function mapAuthError(code) {
  const map = {
    'auth/invalid-email': 'E-mail inválido.',
    'auth/user-disabled': 'Usuário desativado.',
    'auth/user-not-found': 'Usuário não encontrado.',
    'auth/wrong-password': 'Senha incorreta.',
    'auth/email-already-in-use': 'E-mail já cadastrado.',
    'auth/weak-password': 'Senha muito fraca.',
    'auth/invalid-credential': 'E-mail ou senha incorretos.',
  };
  return map[code] || 'Erro de autenticação. Tente novamente.';
}

/* ═══════════════════════════════════════════════════════════
   UTILITÁRIOS
═══════════════════════════════════════════════════════════ */
function hhmm2dec(val) {
  if (val === null || val === undefined || val === '') return 0;
  const s = String(val).trim();
  if (!s || s === '—') return 0;
  const neg = s.startsWith('-');
  const clean = neg ? s.slice(1) : s;
  const parts = clean.split(':');
  if (parts.length < 2) return 0;
  const h = parseInt(parts[0], 10) || 0;
  const m = parseInt(parts[1], 10) || 0;
  const dec = h + m / 60;
  return neg ? -dec : dec;
}

function dec2hhmm(dec) {
  if (dec === null || dec === undefined || isNaN(dec)) return '00:00';
  const neg = dec < 0;
  const abs = Math.abs(dec);
  const h = Math.floor(abs);
  const m = Math.round((abs - h) * 60);
  return (neg ? '-' : '') + String(h).padStart(2, '0') + ':' + String(m).padStart(2, '0');
}

function sumHHMM(arr) { return dec2hhmm(arr.reduce((a, b) => a + b, 0)); }
const R2 = n => Math.round(n * 100) / 100;

/* ═══════════════════════════════════════════════════════════
   LEITURA & NORMALIZAÇÃO
═══════════════════════════════════════════════════════════ */
function buildColMap(headerRow) {
  const map = {};
  headerRow.forEach((cell, i) => {
    if (!cell) return;
    const c = String(cell).toLowerCase().trim();
    if (c === 'nome')                     map.nome = i;
    else if (c === 'cargo')               map.cargo = i;
    else if (c === 'equipe')              map.equipe = i;
    else if (c.includes('h.e. 1'))        map.he1 = i;
    else if (c.includes('h.e. 2'))        map.he2 = i;
    else if (c.includes('h.e. 3'))        map.he3 = i;
    else if (c.includes('h.e. 4'))        map.he4 = i;
    else if (c.includes('horas totais'))  map.horasTotais = i;
    else if (c.includes('saldo final'))   map.saldoFinal = i;
    else if (c.includes('saldo inicial')) map.saldoInicial = i;
    else if (c.includes('pontualidade'))  map.pontualidade = i;
    else if (c.includes('horas previstas')) map.horasPrevistas = i;
    else if (c.includes('h. faltantes')) map.hFaltantes = i;
    else if (c.includes('horas normais')) map.horasNormais = i;
  });
  return map;
}

function parseWorkbook(wb) {
  const records = [];
  wb.SheetNames.forEach(sheetName => {
    const ws   = wb.Sheets[sheetName];
    const raw  = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' });
    if (raw.length < 5) return;
    const headerRow = raw[3];
    const map = buildColMap(headerRow);
    if (map.nome === undefined) return;
    for (let i = 4; i < raw.length; i++) {
      const row = raw[i];
      const nome = String(row[map.nome] || '').trim();
      if (!nome || nome.toUpperCase() === 'TOTAIS') continue;
      const rec = {
        data:          sheetName,
        nome:          nome,
        cargo:         map.cargo  !== undefined ? String(row[map.cargo]  || '').trim() : '—',
        equipe:        map.equipe !== undefined ? String(row[map.equipe] || '').trim() : '—',
        he1:           hhmm2dec(row[map.he1]),
        he2:           hhmm2dec(row[map.he2]),
        he3:           hhmm2dec(row[map.he3]),
        he4:           hhmm2dec(row[map.he4]),
        horasTotais:   hhmm2dec(row[map.horasTotais]),
        saldoFinal:    hhmm2dec(row[map.saldoFinal]),
        saldoInicial:  hhmm2dec(row[map.saldoInicial]),
        pontualidade:  parseFloat(row[map.pontualidade]) || 0,
      };
      rec.totalHE = R2(rec.he1 + rec.he2 + rec.he3 + rec.he4);
      records.push(rec);
    }
  });
  return records;
}

/* ═══════════════════════════════════════════════════════════
   UPLOAD
═══════════════════════════════════════════════════════════ */
document.getElementById('fileInput').addEventListener('change', e => {
  const file = e.target.files[0];
  if (!file) return;
  showLoading(true);
  const reader = new FileReader();
  reader.onload = ev => {
    try {
      const wb = XLSX.read(ev.target.result, { type: 'array', cellText: true, cellNF: false });
      allData = parseWorkbook(wb);
      if (!allData.length) {
        alert('Nenhum dado encontrado. Verifique a estrutura da planilha.');
        showLoading(false);
        return;
      }
      initDashboard();
      // Auto-salva no Firestore se usuário estiver logado
      if (currentUser) saveToFirestore();
    } catch (err) {
      alert('Erro ao ler planilha: ' + err.message);
      console.error(err);
    } finally {
      showLoading(false);
    }
  };
  reader.readAsArrayBuffer(file);
  e.target.value = '';
});

/* ═══════════════════════════════════════════════════════════
   INICIALIZAÇÃO DO DASHBOARD
═══════════════════════════════════════════════════════════ */
function initDashboard() {
  document.getElementById('landing').style.display = 'none';
  document.getElementById('mainContent').style.display = 'block';
  buildDateChips();
  activeDates = new Set(allData.map(r => r.data));
  refreshAll();
  populateFilters();
}

function buildDateChips() {
  const bar    = document.getElementById('filterBar');
  const group  = document.getElementById('dateChips');
  const dates  = [...new Set(allData.map(r => r.data))].sort();
  group.innerHTML = '';
  dates.forEach(d => {
    const btn = document.createElement('button');
    btn.className = 'chip active';
    btn.textContent = d;
    btn.dataset.date = d;
    btn.addEventListener('click', () => toggleDateChip(btn, d));
    group.appendChild(btn);
  });
  document.getElementById('chipAll').addEventListener('click', selectAllDates);
  bar.style.display = 'flex';
}

function toggleDateChip(btn, date) {
  if (activeDates.has(date)) {
    activeDates.delete(date);
    btn.classList.remove('active');
  } else {
    activeDates.add(date);
    btn.classList.add('active');
  }
  refreshAll();
}

function selectAllDates() {
  const dates = [...new Set(allData.map(r => r.data))];
  activeDates = new Set(dates);
  document.querySelectorAll('#dateChips .chip').forEach(b => b.classList.add('active'));
  refreshAll();
}

function refreshAll() {
  filteredData = allData.filter(r => activeDates.has(r.data));
  updateKPIs();
  updateCharts();
  applyTableFilters();
  updateAlerts();
  updateInsights();
}

/* ═══════════════════════════════════════════════════════════
   KPI CARDS
═══════════════════════════════════════════════════════════ */
function updateKPIs() {
  const withHE = filteredData.filter(r => r.totalHE > 0);
  const totalDec = filteredData.reduce((s, r) => s + r.totalHE, 0);
  set('kpiTotalHE', dec2hhmm(totalDec));
  const uniqueColabs = new Set(withHE.map(r => r.nome)).size;
  set('kpiColabs', uniqueColabs);
  const heByColab = {};
  withHE.forEach(r => { heByColab[r.nome] = (heByColab[r.nome] || 0) + r.totalHE; });
  const vals = Object.values(heByColab);
  const media = vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : 0;
  set('kpiMedia', dec2hhmm(media));
  const topEntry = Object.entries(heByColab).sort((a, b) => b[1] - a[1])[0];
  if (topEntry) {
    set('kpiTopName', shortName(topEntry[0]));
    set('kpiTopHours', dec2hhmm(topEntry[1]) + ' h');
  }
  const heByEquipe = {};
  withHE.filter(r => r.equipe && r.equipe !== '—').forEach(r => {
    heByEquipe[r.equipe] = (heByEquipe[r.equipe] || 0) + r.totalHE;
  });
  const topEquipe = Object.entries(heByEquipe).sort((a, b) => b[1] - a[1])[0];
  if (topEquipe) {
    set('kpiEquipe', topEquipe[0]);
    set('kpiEquipeHours', dec2hhmm(topEquipe[1]) + ' h');
  }
}

function set(id, val) {
  const el = document.getElementById(id);
  if (el) el.textContent = val;
}

function shortName(nome) {
  const parts = nome.split(' ');
  if (parts.length <= 2) return nome;
  return parts[0] + ' ' + parts[parts.length - 1];
}

/* ═══════════════════════════════════════════════════════════
   GRÁFICOS
═══════════════════════════════════════════════════════════ */
const C = {
  blue:   '#1e88e5',
  green:  '#26a69a',
  amber:  '#ffc107',
  red:    '#ef5350',
  purple: '#ab47bc',
  teal:   '#00acc1',
  lime:   '#9ccc65',
  orange: '#ff7043',
};
const PALETTE = [C.blue, C.green, C.amber, C.red, C.purple, C.teal, C.lime, C.orange];

const CHART_DEFAULTS = {
  responsive: true,
  maintainAspectRatio: false,
  plugins: {
    legend: { labels: { color: '#90a4ae', font: { size: 11 } } },
    tooltip: { backgroundColor: '#162232', titleColor: '#e8f0fe', bodyColor: '#90a4ae', borderColor: '#233547', borderWidth: 1 },
  },
  scales: {
    x: { ticks: { color: '#90a4ae', font: { size: 11 } }, grid: { color: '#233547' } },
    y: { ticks: { color: '#90a4ae', font: { size: 11 } }, grid: { color: '#233547' } },
  },
};

function destroyChart(key) {
  if (charts[key]) { charts[key].destroy(); delete charts[key]; }
}

function updateCharts() {
  buildTop10Chart();
  buildEquipeChart();
  buildDiarioChart();
  buildPizzaChart();
  buildPontualidadeChart();
}

function buildTop10Chart() {
  const heByColab = {};
  filteredData.forEach(r => {
    if (r.totalHE > 0) heByColab[r.nome] = (heByColab[r.nome] || 0) + r.totalHE;
  });
  const top10 = Object.entries(heByColab).sort((a, b) => b[1] - a[1]).slice(0, 10);
  destroyChart('top10');
  const ctx = document.getElementById('chartTop10').getContext('2d');
  charts.top10 = new Chart(ctx, {
    type: 'bar',
    data: {
      labels: top10.map(([n]) => shortName(n)),
      datasets: [{
        label: 'Total HE (h)',
        data: top10.map(([, v]) => R2(v)),
        backgroundColor: PALETTE,
        borderRadius: 4,
      }],
    },
    options: {
      ...CHART_DEFAULTS,
      plugins: {
        ...CHART_DEFAULTS.plugins,
        legend: { display: false },
        tooltip: { ...CHART_DEFAULTS.plugins.tooltip, callbacks: { label: ctx => ' ' + dec2hhmm(ctx.raw) } },
      },
    },
  });
}

function buildEquipeChart() {
  const heByEquipe = {};
  filteredData.filter(r => r.equipe && r.equipe !== '—').forEach(r => {
    const eq = r.equipe.trim();
    heByEquipe[eq] = (heByEquipe[eq] || 0) + r.totalHE;
  });
  const sorted = Object.entries(heByEquipe).sort((a, b) => b[1] - a[1]);
  destroyChart('equipe');
  const ctx = document.getElementById('chartEquipe').getContext('2d');
  charts.equipe = new Chart(ctx, {
    type: 'bar',
    data: {
      labels: sorted.map(([k]) => k),
      datasets: [{
        label: 'HE Total',
        data: sorted.map(([, v]) => R2(v)),
        backgroundColor: PALETTE,
        borderRadius: 4,
      }],
    },
    options: {
      ...CHART_DEFAULTS,
      indexAxis: 'y',
      plugins: {
        ...CHART_DEFAULTS.plugins,
        legend: { display: false },
        tooltip: { ...CHART_DEFAULTS.plugins.tooltip, callbacks: { label: ctx => ' ' + dec2hhmm(ctx.raw) } },
      },
      scales: {
        x: { ...CHART_DEFAULTS.scales.x },
        y: { ...CHART_DEFAULTS.scales.y, ticks: { color: '#90a4ae', font: { size: 10 } } },
      },
    },
  });
}

function buildDiarioChart() {
  const dates = [...new Set(filteredData.map(r => r.data))].sort();
  const heByDate = {};
  filteredData.forEach(r => { heByDate[r.data] = (heByDate[r.data] || 0) + r.totalHE; });
  destroyChart('diario');
  const ctx = document.getElementById('chartDiario').getContext('2d');
  charts.diario = new Chart(ctx, {
    type: 'line',
    data: {
      labels: dates,
      datasets: [{
        label: 'Total HE do dia',
        data: dates.map(d => R2(heByDate[d] || 0)),
        borderColor: C.blue,
        backgroundColor: 'rgba(30,136,229,.15)',
        fill: true,
        tension: .35,
        pointBackgroundColor: C.blue,
        pointRadius: 5,
        pointHoverRadius: 7,
      }],
    },
    options: {
      ...CHART_DEFAULTS,
      plugins: {
        ...CHART_DEFAULTS.plugins,
        tooltip: { ...CHART_DEFAULTS.plugins.tooltip, callbacks: { label: ctx => ' ' + dec2hhmm(ctx.raw) } },
      },
    },
  });
}

function buildPizzaChart() {
  const totals = [0, 0, 0, 0];
  filteredData.forEach(r => {
    totals[0] += r.he1;
    totals[1] += r.he2;
    totals[2] += r.he3;
    totals[3] += r.he4;
  });
  destroyChart('pizza');
  const ctx = document.getElementById('chartPizza').getContext('2d');
  charts.pizza = new Chart(ctx, {
    type: 'doughnut',
    data: {
      labels: ['HE1', 'HE2', 'HE3', 'HE4'],
      datasets: [{
        data: totals.map(R2),
        backgroundColor: [C.blue, C.amber, C.red, C.purple],
        borderColor: '#1b2d40',
        borderWidth: 2,
        hoverOffset: 6,
      }],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { position: 'bottom', labels: { color: '#90a4ae', font: { size: 11 }, padding: 12 } },
        tooltip: { ...CHART_DEFAULTS.plugins.tooltip, callbacks: { label: ctx => ' ' + ctx.label + ': ' + dec2hhmm(ctx.raw) } },
      },
    },
  });
}

function buildPontualidadeChart() {
  const withPont = filteredData.filter(r => r.pontualidade >= 0);
  const avg = withPont.length
    ? withPont.reduce((s, r) => s + (r.pontualidade > 100 ? 100 : r.pontualidade), 0) / withPont.length
    : 0;
  const pct = R2(avg);
  const pctNorm = Math.min(pct, 100);
  document.getElementById('donutPct').textContent = pctNorm.toFixed(1) + '%';
  const color = pctNorm >= 90 ? C.green : pctNorm >= 70 ? C.amber : C.red;
  destroyChart('pont');
  const ctx = document.getElementById('chartPontualidade').getContext('2d');
  charts.pont = new Chart(ctx, {
    type: 'doughnut',
    data: {
      labels: ['Pontual', 'Atraso'],
      datasets: [{
        data: [pctNorm, 100 - pctNorm],
        backgroundColor: [color, '#233547'],
        borderWidth: 0,
        hoverOffset: 4,
      }],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      cutout: '75%',
      plugins: {
        legend: { display: false },
        tooltip: { ...CHART_DEFAULTS.plugins.tooltip, callbacks: { label: ctx => ' ' + ctx.label + ': ' + ctx.raw.toFixed(1) + '%' } },
      },
    },
  });
}

/* ═══════════════════════════════════════════════════════════
   TABELA ANALÍTICA
═══════════════════════════════════════════════════════════ */
function populateFilters() {
  const sel = document.getElementById('filterEquipe');
  const equipes = [...new Set(allData.map(r => r.equipe).filter(e => e && e !== '—'))].sort();
  sel.innerHTML = '<option value="">Todas as equipes</option>';
  equipes.forEach(eq => {
    const opt = document.createElement('option');
    opt.value = eq;
    opt.textContent = eq;
    sel.appendChild(opt);
  });
  const selDate = document.getElementById('filterDate');
  const dates = [...new Set(allData.map(r => r.data))].sort();
  selDate.innerHTML = '<option value="">Todas as datas</option>';
  dates.forEach(d => {
    const opt = document.createElement('option');
    opt.value = d;
    opt.textContent = d;
    selDate.appendChild(opt);
  });
  document.getElementById('searchName').addEventListener('input', applyTableFilters);
  document.getElementById('filterEquipe').addEventListener('change', applyTableFilters);
  document.getElementById('filterDate').addEventListener('change', applyTableFilters);
  document.querySelectorAll('.data-table th[data-sort]').forEach(th => {
    th.addEventListener('click', () => {
      const col = th.dataset.sort;
      if (tableSortCol === col) { tableSortAsc = !tableSortAsc; }
      else { tableSortCol = col; tableSortAsc = true; }
      applyTableFilters();
    });
  });
  document.getElementById('btnExportExcel').addEventListener('click', exportExcel);
  document.getElementById('btnExportPDF').addEventListener('click', exportPDF);
}

function applyTableFilters() {
  const search = document.getElementById('searchName').value.trim().toLowerCase();
  const equipe = document.getElementById('filterEquipe').value;
  const date   = document.getElementById('filterDate').value;
  tableRows = filteredData.filter(r => {
    if (search  && !r.nome.toLowerCase().includes(search))   return false;
    if (equipe  && r.equipe.trim() !== equipe.trim())         return false;
    if (date    && r.data !== date)                            return false;
    return true;
  });
  if (tableSortCol) {
    tableRows.sort((a, b) => {
      let va = a[tableSortCol], vb = b[tableSortCol];
      if (typeof va === 'string') va = va.toLowerCase();
      if (typeof vb === 'string') vb = vb.toLowerCase();
      if (va < vb) return tableSortAsc ? -1 : 1;
      if (va > vb) return tableSortAsc ?  1 : -1;
      return 0;
    });
  }
  tablePage = 1;
  renderTable();
}

function renderTable() {
  const tbody = document.getElementById('tableBody');
  tbody.innerHTML = '';
  const start = (tablePage - 1) * PAGE_SIZE;
  const page  = tableRows.slice(start, start + PAGE_SIZE);
  page.forEach(r => {
    let cls = 'row-green';
    const totalAcc = filteredData.filter(x => x.nome === r.nome).reduce((s, x) => s + x.totalHE, 0);
    if (totalAcc > 10) cls = 'row-red';
    else if (r.totalHE > 2) cls = 'row-yellow';
    const tr = document.createElement('tr');
    tr.className = cls;
    tr.innerHTML = `
      <td>${r.nome}</td>
      <td>${r.cargo}</td>
      <td>${r.equipe}</td>
      <td class="mono">${r.data}</td>
      <td class="mono">${dec2hhmm(r.he1)}</td>
      <td class="mono">${dec2hhmm(r.he2)}</td>
      <td class="mono">${dec2hhmm(r.he3)}</td>
      <td class="mono">${dec2hhmm(r.he4)}</td>
      <td class="mono"><strong>${dec2hhmm(r.totalHE)}</strong></td>
      <td class="mono">${dec2hhmm(r.saldoFinal)}</td>
    `;
    tbody.appendChild(tr);
  });
  document.getElementById('tableCount').textContent =
    tableRows.length + ' registro' + (tableRows.length !== 1 ? 's' : '');
  buildPagination();
}

function buildPagination() {
  const total = Math.ceil(tableRows.length / PAGE_SIZE);
  const pag   = document.getElementById('pagination');
  pag.innerHTML = '';
  if (total <= 1) return;
  const addBtn = (label, page, active = false) => {
    const btn = document.createElement('button');
    btn.className = 'page-btn' + (active ? ' active' : '');
    btn.textContent = label;
    btn.addEventListener('click', () => { tablePage = page; renderTable(); });
    pag.appendChild(btn);
  };
  if (tablePage > 1) addBtn('‹', tablePage - 1);
  const range = [...Array(total).keys()].map(i => i + 1)
    .filter(p => Math.abs(p - tablePage) <= 2 || p === 1 || p === total);
  let last = 0;
  range.forEach(p => {
    if (last && p - last > 1) {
      const el = document.createElement('span');
      el.className = 'page-btn';
      el.textContent = '…';
      el.style.cursor = 'default';
      pag.appendChild(el);
    }
    addBtn(p, p, p === tablePage);
    last = p;
  });
  if (tablePage < total) addBtn('›', tablePage + 1);
}

/* ═══════════════════════════════════════════════════════════
   EXPORTAÇÕES
═══════════════════════════════════════════════════════════ */
function exportExcel() {
  const rows = tableRows.map(r => ({
    Nome: r.nome, Cargo: r.cargo, Equipe: r.equipe, Data: r.data,
    HE1: dec2hhmm(r.he1), HE2: dec2hhmm(r.he2), HE3: dec2hhmm(r.he3), HE4: dec2hhmm(r.he4),
    'Total HE': dec2hhmm(r.totalHE), 'Saldo Final': dec2hhmm(r.saldoFinal),
  }));
  const ws = XLSX.utils.json_to_sheet(rows);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Horas Extras');
  XLSX.writeFile(wb, 'HorasExtras_Export.xlsx');
}

function exportPDF() {
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF({ orientation: 'landscape' });
  doc.setFontSize(14);
  doc.text('Relatório de Horas Extras', 14, 16);
  doc.setFontSize(9);
  doc.setTextColor(120);
  doc.text('Gerado em: ' + new Date().toLocaleString('pt-BR'), 14, 22);
  const head = [['Nome','Cargo','Equipe','Data','HE1','HE2','HE3','HE4','Total HE','Saldo Final']];
  const body = tableRows.map(r => [
    r.nome, r.cargo, r.equipe, r.data,
    dec2hhmm(r.he1), dec2hhmm(r.he2), dec2hhmm(r.he3), dec2hhmm(r.he4),
    dec2hhmm(r.totalHE), dec2hhmm(r.saldoFinal),
  ]);
  doc.autoTable({
    head, body, startY: 27,
    headStyles: { fillColor: [30, 136, 229], textColor: 255, fontSize: 8 },
    bodyStyles: { fontSize: 7.5 },
    alternateRowStyles: { fillColor: [240, 244, 248] },
    margin: { left: 14, right: 14 },
  });
  doc.save('HorasExtras_Export.pdf');
}

/* ═══════════════════════════════════════════════════════════
   ALERTAS
═══════════════════════════════════════════════════════════ */
function updateAlerts() {
  const heByColab = {};
  filteredData.forEach(r => { heByColab[r.nome] = (heByColab[r.nome] || 0) + r.totalHE; });
  const accList = Object.entries(heByColab).filter(([, v]) => v > 10).sort((a, b) => b[1] - a[1]);
  const ulAccum = document.getElementById('alertAccum');
  ulAccum.innerHTML = '';
  if (!accList.length) {
    ulAccum.innerHTML = '<li style="color:#546e7a">Nenhum colaborador acima do limite.</li>';
  } else {
    accList.slice(0, 20).forEach(([nome, v]) => {
      const li = document.createElement('li');
      li.className = 'red';
      li.innerHTML = `<span class="al-name">${shortName(nome)}</span><span class="al-val red">${dec2hhmm(v)}</span>`;
      ulAccum.appendChild(li);
    });
  }
  const dailyHigh = filteredData.filter(r => r.totalHE > 2).sort((a, b) => b.totalHE - a.totalHE);
  const ulDaily = document.getElementById('alertDaily');
  ulDaily.innerHTML = '';
  if (!dailyHigh.length) {
    ulDaily.innerHTML = '<li style="color:#546e7a">Nenhum alerta diário.</li>';
  } else {
    dailyHigh.slice(0, 20).forEach(r => {
      const li = document.createElement('li');
      li.className = 'yellow';
      li.innerHTML = `<span class="al-name">${shortName(r.nome)} <small>(${r.data})</small></span><span class="al-val yellow">${dec2hhmm(r.totalHE)}</span>`;
      ulDaily.appendChild(li);
    });
  }
  const heByEquipe = {};
  filteredData.filter(r => r.equipe && r.equipe !== '—').forEach(r => {
    const eq = r.equipe.trim();
    heByEquipe[eq] = (heByEquipe[eq] || 0) + r.totalHE;
  });
  const equipeVals = Object.values(heByEquipe);
  const avgEquipe  = equipeVals.length ? equipeVals.reduce((a, b) => a + b, 0) / equipeVals.length : 0;
  const aboveAvg   = Object.entries(heByEquipe).filter(([, v]) => v > avgEquipe).sort((a, b) => b[1] - a[1]);
  const ulEq = document.getElementById('alertEquipes');
  ulEq.innerHTML = '';
  if (!aboveAvg.length) {
    ulEq.innerHTML = '<li style="color:#546e7a">Nenhuma equipe acima da média.</li>';
  } else {
    aboveAvg.forEach(([eq, v]) => {
      const li = document.createElement('li');
      li.className = 'purple';
      li.innerHTML = `<span class="al-name">${eq}</span><span class="al-val purple">${dec2hhmm(v)}</span>`;
      ulEq.appendChild(li);
    });
  }
}

/* ═══════════════════════════════════════════════════════════
   INSIGHTS
═══════════════════════════════════════════════════════════ */
function updateInsights() {
  const list = document.getElementById('insightsList');
  list.innerHTML = '';
  const insights = generateInsights();
  insights.forEach(ins => {
    const card = document.createElement('div');
    card.className = `insight-card ${ins.type}`;
    card.innerHTML = `<span class="insight-icon">${ins.icon}</span><span class="insight-text">${ins.text}</span>`;
    list.appendChild(card);
  });
}

function generateInsights() {
  const items = [];
  const total = filteredData.reduce((s, r) => s + r.totalHE, 0);
  const heByEquipe = {};
  filteredData.filter(r => r.equipe && r.equipe !== '—').forEach(r => {
    const eq = r.equipe.trim();
    heByEquipe[eq] = (heByEquipe[eq] || 0) + r.totalHE;
  });
  const topEq = Object.entries(heByEquipe).sort((a, b) => b[1] - a[1])[0];
  if (topEq && total > 0) {
    const pct = ((topEq[1] / total) * 100).toFixed(1);
    items.push({ icon: '📌', type: 'warn', text: `A equipe <strong>${topEq[0]}</strong> concentrou <strong>${pct}%</strong> das horas extras do período, totalizando <strong>${dec2hhmm(topEq[1])}</strong>.` });
  }
  const heByColab = {};
  filteredData.forEach(r => { heByColab[r.nome] = (heByColab[r.nome] || 0) + r.totalHE; });
  const topCol = Object.entries(heByColab).sort((a, b) => b[1] - a[1])[0];
  if (topCol) {
    items.push({ icon: '🏆', type: 'warn', text: `O colaborador <strong>${topCol[0]}</strong> apresentou o maior volume de horas extras: <strong>${dec2hhmm(topCol[1])}</strong> no período.` });
  }
  const dates = [...new Set(filteredData.map(r => r.data))].sort();
  if (dates.length >= 2) {
    const heByDate = {};
    filteredData.forEach(r => { heByDate[r.data] = (heByDate[r.data] || 0) + r.totalHE; });
    const last  = heByDate[dates[dates.length - 1]] || 0;
    const prev  = heByDate[dates[dates.length - 2]] || 0;
    const diff  = last - prev;
    const trend = diff > 0 ? 'aumentaram' : diff < 0 ? 'diminuíram' : 'se mantiveram estáveis';
    const tipo  = diff > 0 ? 'bad' : diff < 0 ? 'good' : '';
    const icon  = diff > 0 ? '📈' : diff < 0 ? '📉' : '➡️';
    items.push({ icon, type: tipo, text: `As horas extras <strong>${trend}</strong> em relação ao dia anterior (${dates[dates.length - 2]} → ${dates[dates.length - 1]}): variação de <strong>${dec2hhmm(Math.abs(diff))}</strong>.` });
  }
  const uniqueAll = new Set(filteredData.map(r => r.nome)).size;
  const uniqueHE  = new Set(filteredData.filter(r => r.totalHE > 0).map(r => r.nome)).size;
  if (uniqueAll > 0) {
    const pct = ((uniqueHE / uniqueAll) * 100).toFixed(1);
    items.push({ icon: '👥', type: '', text: `<strong>${pct}%</strong> dos colaboradores (${uniqueHE} de ${uniqueAll}) registraram horas extras no período.` });
  }
  const pontAvg = filteredData.reduce((s, r) => s + Math.min(r.pontualidade, 100), 0) / (filteredData.length || 1);
  const pontTipo = pontAvg >= 90 ? 'good' : pontAvg >= 70 ? 'warn' : 'bad';
  items.push({ icon: '⏰', type: pontTipo, text: `Pontualidade média do período: <strong>${pontAvg.toFixed(1)}%</strong>. ${pontAvg >= 90 ? 'Excelente desempenho!' : pontAvg >= 70 ? 'Dentro do aceitável, mas há espaço para melhoria.' : 'Atenção: índice abaixo do esperado.'}` });
  if (dates.length) {
    const heByDate = {};
    filteredData.forEach(r => { heByDate[r.data] = (heByDate[r.data] || 0) + r.totalHE; });
    const pico = Object.entries(heByDate).sort((a, b) => b[1] - a[1])[0];
    items.push({ icon: '🔥', type: 'warn', text: `O dia com maior concentração de horas extras foi <strong>${pico[0]}</strong>, com <strong>${dec2hhmm(pico[1])}</strong> no total.` });
  }
  return items;
}

/* ═══════════════════════════════════════════════════════════
   NAVEGAÇÃO POR ABAS
═══════════════════════════════════════════════════════════ */
document.querySelectorAll('.tab-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    const tab = btn.dataset.tab;
    document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
    document.querySelectorAll('.tab-content').forEach(s => s.classList.remove('active'));
    btn.classList.add('active');
    document.getElementById('tab-' + tab).classList.add('active');
  });
});

/* ═══════════════════════════════════════════════════════════
   LOADING OVERLAY
═══════════════════════════════════════════════════════════ */
function showLoading(show) {
  document.getElementById('loadingOverlay').style.display = show ? 'flex' : 'none';
}

/* ═══════════════════════════════════════════════════════════
   AUTO-LOAD
═══════════════════════════════════════════════════════════ */
async function autoLoad() {
  try {
    const resp = await fetch('Horas_extras.xlsx');
    if (!resp.ok) return;
    showLoading(true);
    const buf = await resp.arrayBuffer();
    const wb = XLSX.read(buf, { type: 'array', cellText: true });
    allData = parseWorkbook(wb);
    if (allData.length) {
      initDashboard();
      if (currentUser) saveToFirestore();
    }
  } catch (e) {
    // silently ignore
  } finally {
    showLoading(false);
  }
}

/* ═══════════════════════════════════════════════════════════
   BOOT
═══════════════════════════════════════════════════════════ */
initAuth();
