/* ============================================================
   WAYNE PROTOCOL v1.6 — lógica de la Bat-Terminal
   Persistencia 100% local (localStorage). Sin backend.
   ============================================================ */

const STORAGE_KEY = 'wayneProtocolData';
const SCHEMA_VERSION = 4;

const DEFAULT_HABITS = [
  '05:00 AM — DESPERTAR',
  'MEDITACIÓN',
  'ESCUCHA DE ENTORNO',
  'HABILIDAD TÉCNICA',
  'ENTRENAMIENTO FÍSICO',
  'NUTRICIÓN CONSCIENTE'
];

const DEFAULT_EXERCISES = [
  { name: 'DOMINADAS', count: 0 },
  { name: 'SENTADILLAS', count: 0 },
  { name: 'FLEXIONES', count: 0 },
  { name: 'PLANCHA (SEG)', count: 0 }
];

const MEAL_SLOTS = ['DESAYUNO', 'ALMUERZO', 'CENA', 'SNACKS'];
const WATER_GOAL_ML = 2000;
const WATER_STEP_ML = 250;
const WEEK_SUCCESS_THRESHOLD = 85; // % mínimo por día para contar como "día de éxito"
const WEEK_SUCCESS_DAYS_NEEDED = 4; // días de éxito necesarios para ganar la racha dorada
const DAY_LABELS = ['L','M','X','J','V','S','D'];

// Objetivo calórico: ratios moderados y suelos de seguridad por sexo
// (déficit/superávit sensatos en vez de un recorte fijo agresivo)
const DEFICIT_RATIO = 0.18;   // ~18% por debajo del mantenimiento
const SURPLUS_RATIO = 0.12;   // ~12% por encima del mantenimiento
const MIN_KCAL_MALE = 1600;
const MIN_KCAL_FEMALE = 1400;

const PIN_MAX_DIMENSION = 640;   // px, lado más largo tras compresión
const PIN_JPEG_QUALITY = 0.72;

/* ---------------- FECHA/HORA LOCAL (sin desfases UTC) ---------------- */
// IMPORTANTE: usamos SIEMPRE la fecha del calendario LOCAL del dispositivo,
// nunca toISOString() (que es UTC y desalinea el cambio de día con la
// medianoche real del usuario).

function localDateKey(d){
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function todayKey(){
  return localDateKey(new Date());
}

function nowStamp(){
  return new Date().toLocaleTimeString('es-ES', { hour:'2-digit', minute:'2-digit' });
}

/* ---------------- CARGA / MIGRACIÓN DE DATOS ---------------- */

function freshState(){
  return {
    version: SCHEMA_VERSION,
    startDate: todayKey(),
    habitDefs: [...DEFAULT_HABITS],
    profile: {
      weight: null, goalWeight: null, age: null, height: null,
      sex: 'm', activity: '1.55'
    },
    weightHistory: [],
    pins: [],
    days: {}
  };
}

function loadData(){
  let raw = localStorage.getItem(STORAGE_KEY);
  if(!raw){
    const fresh = freshState();
    localStorage.setItem(STORAGE_KEY, JSON.stringify(fresh));
    return fresh;
  }
  let data;
  try{
    data = JSON.parse(raw);
  }catch(e){
    data = freshState();
  }

  if(!data.habitDefs){
    const namesFromDays = new Set(DEFAULT_HABITS);
    Object.values(data.days || {}).forEach(day => {
      Object.keys(day.habits || {}).forEach(name => namesFromDays.add(name));
    });
    data.habitDefs = Array.from(namesFromDays);
  }
  if(!data.profile){
    data.profile = { weight: null, goalWeight: null, age: null, height: null, sex: 'm', activity: '1.55' };
  }
  if(!data.weightHistory) data.weightHistory = [];
  if(!data.pins) data.pins = [];
  if(!data.days) data.days = {};
  if(!data.startDate) data.startDate = todayKey();

  Object.values(data.days).forEach(day => {
    if(day.habits){
      Object.keys(day.habits).forEach(name => {
        if(typeof day.habits[name] === 'boolean'){
          day.habits[name] = { done: day.habits[name], at: null };
        }
      });
    }
    if(day.trainingDone === undefined){
      day.trainingDone = (day.exercises || []).some(e => e.count > 0);
    }
    // Migración v1.3 -> v1.4: nuevo Modo Dieta (agua en ml + registro de
    // comidas estructurado). Se AÑADEN campos nuevos sin tocar los antiguos
    // (day.water / day.meals se conservan tal cual, intactos, como archivo
    // histórico) para no perder ni un dato guardado.
    if(day.waterMl === undefined){
      day.waterMl = typeof day.water === 'number' ? day.water * 250 : 0;
    }
    if(day.mealLog === undefined){
      day.mealLog = Object.fromEntries(MEAL_SLOTS.map(s => [s, []]));
    }
  });

  data.version = SCHEMA_VERSION;
  saveData(data);
  return data;
}

function saveData(data){
  try{
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  }catch(err){
    // Almacenamiento lleno o no disponible (modo privado, cuota superada...).
    // No rompemos la app: solo avisamos una vez por sesión para no ser pesados.
    if(!window.__wayneStorageWarned){
      window.__wayneStorageWarned = true;
      showModal({
        title: 'Almacenamiento lleno',
        message: 'No se ha podido guardar el último cambio. Prueba a exportar tus datos y eliminar algún pin antiguo para liberar espacio.',
        hideCancel: true,
        confirmText: 'ENTENDIDO'
      });
    }
  }
}

function ensureToday(data){
  const key = todayKey();
  if(!data.days[key]){
    data.days[key] = {
      habits: Object.fromEntries(data.habitDefs.map(h => [h, { done:false, at:null }])),
      exercises: DEFAULT_EXERCISES.map(e => ({...e})),
      waterMl: 0,
      mealLog: Object.fromEntries(MEAL_SLOTS.map(s => [s, []])),
      trainingDone: false,
      logs: []
    };
    saveData(data);
  }
  data.habitDefs.forEach(h => {
    if(!(h in data.days[key].habits)) data.days[key].habits[h] = { done:false, at:null };
  });
  if(data.days[key].waterMl === undefined) data.days[key].waterMl = 0;
  if(data.days[key].mealLog === undefined) data.days[key].mealLog = Object.fromEntries(MEAL_SLOTS.map(s => [s, []]));
  return data.days[key];
}

let state = loadData();
let today = ensureToday(state);

/* ============================================================
   MODAL GENÉRICO — sustituye prompt()/confirm()/alert() nativos
   ============================================================ */

let modalResolve = null;

function showModal(opts){
  const overlay = document.getElementById('modalOverlay');
  const titleEl = document.getElementById('modalTitle');
  const msgEl = document.getElementById('modalMessage');
  const wrap = document.getElementById('modalInputWrap');
  const inputEl = document.getElementById('modalInput');
  const listEl = document.getElementById('modalList');
  const cancelBtn = document.getElementById('modalCancelBtn');
  const confirmBtn = document.getElementById('modalConfirmBtn');

  titleEl.textContent = opts.title || '';

  if(opts.message){
    msgEl.textContent = opts.message;
    msgEl.hidden = false;
  } else {
    msgEl.hidden = true;
  }

  listEl.innerHTML = '';
  if(opts.list && opts.list.length){
    listEl.hidden = false;
    wrap.hidden = true;
    confirmBtn.hidden = true;
    opts.list.forEach(item => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'modal-list-btn';
      btn.innerHTML = item.label;
      btn.addEventListener('click', () => closeModal(item.value));
      listEl.appendChild(btn);
    });
  } else {
    listEl.hidden = true;
    confirmBtn.hidden = false;
    if(opts.input){
      wrap.hidden = false;
      inputEl.value = opts.inputValue || '';
      inputEl.placeholder = opts.placeholder || '';
    } else {
      wrap.hidden = true;
    }
  }

  confirmBtn.textContent = opts.confirmText || 'ACEPTAR';
  cancelBtn.textContent = opts.cancelText || 'CANCELAR';
  cancelBtn.hidden = !!opts.hideCancel;
  confirmBtn.classList.toggle('danger', !!opts.danger);

  overlay.hidden = false;

  if(opts.input && !opts.list){
    setTimeout(() => inputEl.focus(), 50);
  }

  return new Promise((resolve) => {
    modalResolve = resolve;
  });
}

// Modal de "cargando" sin botones, para esperas cortas (p.ej. llamadas a la
// API de alimentos). No usa el sistema de promesas: se abre y se cierra a mano.
function showLoadingModal(title, message){
  document.getElementById('modalTitle').textContent = title || '';
  const msgEl = document.getElementById('modalMessage');
  msgEl.textContent = message || '';
  msgEl.hidden = !message;
  document.getElementById('modalList').hidden = true;
  document.getElementById('modalInputWrap').hidden = true;
  document.getElementById('modalActions').hidden = true;
  document.getElementById('modalSpinner').hidden = false;
  document.getElementById('modalOverlay').hidden = false;
}

function hideLoadingModal(){
  document.getElementById('modalSpinner').hidden = true;
  document.getElementById('modalActions').hidden = false;
  document.getElementById('modalOverlay').hidden = true;
}

function closeModal(result){
  document.getElementById('modalOverlay').hidden = true;
  if(modalResolve){
    const resolve = modalResolve;
    modalResolve = null;
    resolve(result);
  }
}

function setupModalSystem(){
  const overlay = document.getElementById('modalOverlay');
  const inputEl = document.getElementById('modalInput');

  document.getElementById('modalConfirmBtn').addEventListener('click', () => {
    const wrap = document.getElementById('modalInputWrap');
    if(!wrap.hidden){
      const val = inputEl.value.trim();
      closeModal(val.length ? val : null);
    } else {
      closeModal(true);
    }
  });

  document.getElementById('modalCancelBtn').addEventListener('click', () => closeModal(null));

  overlay.addEventListener('click', (e) => {
    if(e.target === overlay) closeModal(null);
  });

  inputEl.addEventListener('keydown', (e) => {
    if(e.key === 'Enter'){
      e.preventDefault();
      document.getElementById('modalConfirmBtn').click();
    }
  });

  document.addEventListener('keydown', (e) => {
    if(e.key === 'Escape' && !overlay.hidden) closeModal(null);
  });
}

/* ---------------- HÁBITOS ---------------- */

function renderHabits(){
  const list = document.getElementById('habitList');
  const tpl = document.getElementById('habitItemTpl');
  list.innerHTML = '';
  state.habitDefs.forEach(name => {
    const entry = today.habits[name] || { done:false, at:null };
    const node = tpl.content.cloneNode(true);
    const input = node.querySelector('input');
    const nameEl = node.querySelector('.habit-name');
    const timeEl = node.querySelector('.habit-time');
    nameEl.textContent = name;
    input.checked = entry.done;
    timeEl.textContent = entry.done && entry.at ? entry.at : '';

    input.addEventListener('change', () => {
      entry.done = input.checked;
      entry.at = input.checked ? nowStamp() : null;
      today.habits[name] = entry;
      saveData(state);
      renderHabits();
      updateRadar();
      updateStreak();
      updateWeekly();
    });

    node.querySelector('.habit-remove').addEventListener('click', async () => {
      const ok = await showModal({
        title: 'Eliminar protocolo',
        message: `¿Eliminar "${name}" de tus protocolos diarios? Tu historial pasado se conserva.`,
        confirmText: 'ELIMINAR',
        danger: true
      });
      if(!ok) return;
      state.habitDefs = state.habitDefs.filter(h => h !== name);
      saveData(state);
      renderHabits();
      updateRadar();
      updateStreak();
      updateWeekly();
    });

    list.appendChild(node);
  });
}

document.getElementById('addHabitBtn').addEventListener('click', async () => {
  const name = await showModal({
    title: 'Nuevo protocolo diario',
    message: 'Ej. LECTURA 30 MIN, GUARDIA NOCTURNA...',
    input: true,
    placeholder: 'Nombre del protocolo',
    confirmText: 'AÑADIR'
  });
  if(name){
    const clean = name.toUpperCase();
    if(!state.habitDefs.includes(clean)){
      state.habitDefs.push(clean);
      today.habits[clean] = { done:false, at:null };
      saveData(state);
      renderHabits();
      updateRadar();
      updateStreak();
      updateWeekly();
    }
  }
});

/* ---------------- RADAR / INTEGRIDAD ---------------- */

function habitPercent(){
  const values = Object.values(today.habits);
  if(values.length === 0) return 0;
  const done = values.filter(v => v.done).length;
  return Math.round((done / values.length) * 100);
}

function updateRadar(){
  const pct = habitPercent();
  const radius = 78;
  const circumference = 2 * Math.PI * radius;
  const arc = document.getElementById('radarArc');
  const filled = (pct/100) * circumference;

  arc.setAttribute('d', describeArcPath(120,120,radius));
  arc.setAttribute('stroke-dasharray', `${filled} ${circumference}`);

  document.getElementById('radarPct').textContent = pct + '%';

  const statusText = document.getElementById('statusText');
  const statusDot = document.getElementById('statusDot');
  if(pct === 100){
    statusText.textContent = 'PROTOCOLO COMPLETO — GOTHAM PROTEGIDA';
    statusDot.style.background = '#ffb703';
    statusDot.style.boxShadow = '0 0 10px #ffb703';
  } else if(pct >= 50){
    statusText.textContent = 'PROTOCOLO EN PROGRESO';
    statusDot.style.background = '#00e5c7';
    statusDot.style.boxShadow = '0 0 8px #00e5c7';
  } else {
    statusText.textContent = 'SISTEMA EN ESPERA';
    statusDot.style.background = '#5f8481';
    statusDot.style.boxShadow = 'none';
  }
}

function describeArcPath(cx, cy, r){
  const start = polarToCartesian(cx, cy, r, 0);
  const end = polarToCartesian(cx, cy, r, 359.999);
  return `M ${start.x} ${start.y} A ${r} ${r} 0 1 1 ${end.x} ${end.y}`;
}

function polarToCartesian(cx, cy, r, angleDeg){
  const angleRad = (angleDeg - 90) * Math.PI / 180;
  return { x: cx + r * Math.cos(angleRad), y: cy + r * Math.sin(angleRad) };
}

/* ---------------- DÍA / RELOJ / RACHA ---------------- */

function daysBetween(d1, d2){
  const a = new Date(d1);
  const b = new Date(d2);
  return Math.round((b - a) / 86400000);
}

function updateDayCounter(){
  const diff = daysBetween(state.startDate, todayKey()) + 1;
  const padded = String(Math.max(diff,1)).padStart(3,'0');
  document.getElementById('dayCounter').textContent = `DÍA ${padded}`;
}

function tickClock(){
  const now = new Date();
  document.getElementById('liveClock').textContent = now.toLocaleTimeString('es-ES');
  const dateStr = now.toLocaleDateString('es-ES', { weekday:'long', day:'numeric', month:'long', year:'numeric' });
  document.getElementById('liveDate').textContent = dateStr.toUpperCase();

  // vigilancia de cambio de día real (hora local): si la fecha local cambió,
  // se crea el registro del nuevo día sin perder el anterior.
  const key = todayKey();
  if(!state.days[key]){
    today = ensureToday(state);
    renderAll();
  }

  // Los recordatorios solo se comprueban una vez por minuto (no en cada
  // segundo) para no malgastar ciclos de CPU sin ninguna necesidad.
  if(now.getSeconds() === 0){
    maybeSendReminder();
  }
}

function updateStreak(){
  let streak = 0;
  let cursor = new Date();
  const todayComplete = habitPercent() === 100;
  if(todayComplete) streak = 1;

  cursor.setDate(cursor.getDate() - 1);
  while(true){
    const key = localDateKey(cursor);
    const day = state.days[key];
    if(!day) break;
    const vals = Object.values(day.habits || {});
    const complete = vals.length > 0 && vals.every(v => v.done);
    if(!complete) break;
    streak++;
    cursor.setDate(cursor.getDate() - 1);
  }
  document.getElementById('streakText').textContent = `RACHA: ${streak}`;
}

function updateTrainingStreak(){
  let streak = 0;
  let cursor = new Date();
  today.trainingDone = today.exercises.some(e => e.count > 0);
  if(today.trainingDone) streak = 1;

  cursor.setDate(cursor.getDate() - 1);
  while(true){
    const key = localDateKey(cursor);
    const day = state.days[key];
    if(!day) break;
    const done = day.trainingDone !== undefined ? day.trainingDone : (day.exercises || []).some(e => e.count > 0);
    if(!done) break;
    streak++;
    cursor.setDate(cursor.getDate() - 1);
  }
  document.getElementById('trainingStreak').textContent = `${streak} día${streak === 1 ? '' : 's'}`;
}

/* ---------------- ANÁLISIS SEMANAL ---------------- */

function getMonday(date){
  const d = new Date(date);
  const day = d.getDay();
  const diff = (day === 0 ? -6 : 1 - day);
  d.setDate(d.getDate() + diff);
  d.setHours(0,0,0,0);
  return d;
}

function habitPercentForDay(day){
  if(!day) return null;
  const vals = Object.values(day.habits || {});
  if(vals.length === 0) return null;
  return Math.round((vals.filter(v => v.done).length / vals.length) * 100);
}

function buildWeekStats(mondayDate){
  const days = [];
  let hasAnyData = false;
  for(let i=0; i<7; i++){
    const d = new Date(mondayDate);
    d.setDate(d.getDate() + i);
    const key = localDateKey(d);
    const dayData = state.days[key];
    const pct = habitPercentForDay(dayData);
    if(pct !== null) hasAnyData = true;
    days.push({ date: key, percent: pct });
  }
  const withData = days.filter(d => d.percent !== null);
  const successDays = withData.filter(d => d.percent >= WEEK_SUCCESS_THRESHOLD).length;
  const average = withData.length
    ? Math.round(withData.reduce((s,d) => s + d.percent, 0) / withData.length)
    : 0;
  const successfulWeek = successDays >= WEEK_SUCCESS_DAYS_NEEDED;
  return { days, successDays, average, successfulWeek, hasAnyData };
}

function computeGoldStreakWeeks(currentMonday){
  let count = 0;
  let cursor = new Date(currentMonday);
  cursor.setDate(cursor.getDate() - 7);
  while(true){
    const stats = buildWeekStats(cursor);
    if(stats.hasAnyData && stats.successfulWeek){
      count++;
      cursor.setDate(cursor.getDate() - 7);
    } else break;
  }
  return count;
}

function updateWeekly(){
  const now = new Date();
  const monday = getMonday(now);
  const stats = buildWeekStats(monday);
  const goldStreakWeeks = computeGoldStreakWeeks(monday);
  const goldActive = goldStreakWeeks >= 1;

  const sunday = new Date(monday);
  sunday.setDate(sunday.getDate() + 6);
  const fmt = (d) => d.toLocaleDateString('es-ES', { day:'2-digit', month:'2-digit' });
  document.getElementById('weekRange').textContent = `${fmt(monday)} — ${fmt(sunday)}`;

  const panel = document.getElementById('panel-weekly');
  panel.classList.toggle('gold-active', goldActive);
  document.getElementById('goldBanner').hidden = !goldActive;

  const todayStr = todayKey();
  const chart = document.getElementById('weekChart');
  chart.innerHTML = '';
  stats.days.forEach((d, idx) => {
    const col = document.createElement('div');
    col.className = 'week-bar-col' + (goldActive ? ' gold' : '');
    const track = document.createElement('div');
    track.className = 'week-bar-track';
    const bar = document.createElement('div');
    const pct = d.percent === null ? 0 : d.percent;
    bar.className = 'week-bar' + (d.percent === null ? ' empty' : '') + (d.date === todayStr ? ' today' : '');
    bar.style.height = pct + '%';
    track.appendChild(bar);
    const label = document.createElement('span');
    label.className = 'week-day-label' + (d.date === todayStr ? ' today' : '');
    label.textContent = DAY_LABELS[idx];
    col.appendChild(track);
    col.appendChild(label);
    chart.appendChild(col);
  });

  document.getElementById('weekAverage').textContent = stats.average + '%';
  document.getElementById('weekSuccessDays').textContent = `${stats.successDays} / 7`;
}

/* ---------------- ENTRENAMIENTO ---------------- */

function renderExercises(){
  const list = document.getElementById('trainingList');
  const tpl = document.getElementById('exerciseItemTpl');
  list.innerHTML = '';
  today.exercises.forEach((ex, idx) => {
    const node = tpl.content.cloneNode(true);
    node.querySelector('.ex-name').textContent = ex.name;
    node.querySelector('.ex-count').textContent = ex.count;
    node.querySelector('.plus').addEventListener('click', () => {
      today.exercises[idx].count += 1;
      saveData(state);
      renderExercises();
      updateTrainingTotal();
      updateTrainingStreak();
    });
    node.querySelector('.minus').addEventListener('click', () => {
      today.exercises[idx].count = Math.max(0, today.exercises[idx].count - 1);
      saveData(state);
      renderExercises();
      updateTrainingTotal();
      updateTrainingStreak();
    });
    node.querySelector('.ex-remove').addEventListener('click', () => {
      today.exercises.splice(idx,1);
      saveData(state);
      renderExercises();
      updateTrainingTotal();
      updateTrainingStreak();
    });
    list.appendChild(node);
  });
}

function updateTrainingTotal(){
  const total = today.exercises.reduce((sum,e) => sum + e.count, 0);
  document.getElementById('trainingTotal').textContent = total;
}

document.getElementById('addExerciseBtn').addEventListener('click', async () => {
  const name = await showModal({
    title: 'Nuevo ejercicio',
    message: 'Ej. BURPEES, CUERDA, REMO...',
    input: true,
    placeholder: 'Nombre del ejercicio',
    confirmText: 'AÑADIR'
  });
  if(name){
    today.exercises.push({ name: name.toUpperCase(), count: 0 });
    saveData(state);
    renderExercises();
    updateTrainingTotal();
    updateTrainingStreak();
  }
});

/* ---------------- MODO DIETA: AGUA (LITROS) ---------------- */

function renderWaterDiet(){
  const track = document.getElementById('waterTrackDiet');
  if(!track) return;
  track.innerHTML = '';
  const steps = Math.round(WATER_GOAL_ML / WATER_STEP_ML);
  const filledSteps = Math.round((today.waterMl || 0) / WATER_STEP_ML);

  for(let i=0; i<steps; i++){
    const span = document.createElement('span');
    if(i < filledSteps) span.classList.add('filled');
    span.addEventListener('click', () => {
      const newFilled = (i+1 === filledSteps) ? i : i+1;
      today.waterMl = newFilled * WATER_STEP_ML;
      saveData(state);
      renderWaterDiet();
      updateDietStatusTheme();
      renderMonthCalendar();
    });
    track.appendChild(span);
  }

  const liters = ((today.waterMl || 0) / 1000).toFixed(2);
  const goalLiters = (WATER_GOAL_ML / 1000).toFixed(2);
  document.getElementById('waterValueDiet').textContent = `${liters}L / ${goalLiters}L`;
}

/* ---------------- MODO DIETA: REGISTRO DE COMIDAS ---------------- */

function mealSlotTotal(slot){
  const entries = (today.mealLog && today.mealLog[slot]) || [];
  return entries.reduce((sum, e) => sum + (e.kcal || 0), 0);
}

function renderMealSlots(){
  const container = document.getElementById('mealSlots');
  if(!container) return;
  const slotTpl = document.getElementById('mealSlotTpl');
  const entryTpl = document.getElementById('mealEntryTpl');
  container.innerHTML = '';

  MEAL_SLOTS.forEach(slot => {
    const node = slotTpl.content.cloneNode(true);
    node.querySelector('.meal-slot-name').textContent = slot;
    const total = mealSlotTotal(slot);
    node.querySelector('.meal-slot-kcal').textContent = total > 0 ? `${total} kcal` : '';
    node.querySelector('.meal-add-btn').addEventListener('click', () => addMealEntry(slot));

    const list = node.querySelector('.meal-entry-list');
    const entries = (today.mealLog && today.mealLog[slot]) || [];
    if(entries.length === 0){
      const empty = document.createElement('li');
      empty.className = 'meal-slot-empty';
      empty.textContent = 'Sin registros todavía.';
      list.appendChild(empty);
    } else {
      entries.forEach(entry => {
        const eNode = entryTpl.content.cloneNode(true);
        eNode.querySelector('.meal-entry-name').textContent = entry.name;
        eNode.querySelector('.meal-entry-kcal').textContent = entry.kcal ? `${entry.kcal} kcal` : '—';
        eNode.querySelector('.meal-entry-remove').addEventListener('click', () => {
          today.mealLog[slot] = today.mealLog[slot].filter(e => e.id !== entry.id);
          saveData(state);
          renderMealSlots();
          updateKcalSummary();
          updateDietStatusTheme();
          renderMonthCalendar();
        });
        list.appendChild(eNode);
      });
    }
    container.appendChild(node);
  });
}

/* ---------------- BÚSQUEDA DE ALIMENTOS (Open Food Facts) ----------------
   API pública y gratuita, sin clave, con miles de productos de supermercado
   españoles (Mercadona, Carrefour, Lidl...). La consulta sale directamente
   desde el navegador del usuario hacia openfoodfacts.org — Wayne Protocol
   no guarda ni reenvía nada de esto en ningún servidor propio (no existe
   backend). Requiere conexión a internet; si falla, se ofrece modo manual. */

async function searchFoodApi(query){
  const url = `https://world.openfoodfacts.org/cgi/search.pl?search_terms=${encodeURIComponent(query)}&search_simple=1&action=process&json=1&page_size=6`;
  const res = await fetch(url);
  if(!res.ok) throw new Error('network');
  const data = await res.json();
  const products = (data.products || []).filter(p =>
    p.product_name &&
    p.nutriments &&
    (p.nutriments['energy-kcal_100g'] || p.nutriments['energy-kcal_serving'])
  );
  return products.slice(0, 5).map(p => ({
    name: p.product_name,
    brand: p.brands ? p.brands.split(',')[0].trim() : '',
    kcalPer100g: p.nutriments['energy-kcal_100g'] ? parseFloat(p.nutriments['energy-kcal_100g']) : null,
    kcalPerServing: p.nutriments['energy-kcal_serving'] ? parseFloat(p.nutriments['energy-kcal_serving']) : null,
    servingSize: p.serving_size || null
  }));
}

function pushMealEntry(slot, name, kcal){
  if(!today.mealLog) today.mealLog = {};
  if(!today.mealLog[slot]) today.mealLog[slot] = [];
  today.mealLog[slot].push({ id: Date.now().toString(36), name, kcal, at: nowStamp() });
  saveData(state);
  renderMealSlots();
  updateKcalSummary();
  updateDietStatusTheme();
  renderMonthCalendar();
}

async function addMealEntryManual(slot, prefill){
  const name = await showModal({
    title: `Añadir a ${slot}`,
    message: '¿Qué has comido?',
    input: true,
    inputValue: prefill || '',
    placeholder: 'Ej. Pechuga de pollo con arroz',
    confirmText: 'SIGUIENTE'
  });
  if(!name) return;

  const kcalRaw = await showModal({
    title: 'Kcal aproximadas',
    message: 'Opcional — déjalo vacío si no lo sabes.',
    input: true,
    placeholder: 'Ej. 450',
    confirmText: 'GUARDAR',
    cancelText: 'SIN DATO'
  });
  const kcal = kcalRaw ? (parseInt(kcalRaw) || null) : null;
  pushMealEntry(slot, name, kcal);
}

async function addMealEntry(slot){
  const mode = await showModal({
    title: `Añadir a ${slot}`,
    message: '¿Cómo quieres registrarlo?',
    list: [
      { label: '🔍 Buscar producto <span class="list-btn-kcal">calcula las kcal automáticamente</span>', value: 'search' },
      { label: '✍️ Añadir manualmente', value: 'manual' }
    ]
  });
  if(!mode) return;

  if(mode === 'manual'){
    await addMealEntryManual(slot);
    return;
  }

  const query = await showModal({
    title: 'Buscar alimento',
    message: 'Ej. "tortitas de avena mercadona"',
    input: true,
    placeholder: 'Nombre o marca del producto',
    confirmText: 'BUSCAR'
  });
  if(!query) return;

  showLoadingModal('Consultando Alfred...', `Buscando "${query}" en la base de datos de alimentos.`);
  let results = [];
  let failed = false;
  try{
    results = await searchFoodApi(query);
  }catch(err){
    failed = true;
  }
  hideLoadingModal();

  if(failed){
    const tryManual = await showModal({
      title: 'Sin conexión',
      message: 'No se pudo consultar la base de datos de alimentos (revisa tu conexión). ¿Quieres añadirlo a mano?',
      confirmText: 'AÑADIR MANUAL',
      cancelText: 'CANCELAR'
    });
    if(tryManual) await addMealEntryManual(slot, query);
    return;
  }

  if(results.length === 0){
    const tryManual = await showModal({
      title: 'Sin resultados',
      message: `No se encontraron productos para "${query}".`,
      confirmText: 'AÑADIR MANUAL',
      cancelText: 'CANCELAR'
    });
    if(tryManual) await addMealEntryManual(slot, query);
    return;
  }

  const listOptions = results.map(r => {
    const kcalTxt = r.kcalPerServing
      ? `${Math.round(r.kcalPerServing)} kcal/ración${r.servingSize ? ' ('+r.servingSize+')' : ''}`
      : `${Math.round(r.kcalPer100g)} kcal/100g`;
    const label = `${r.name}${r.brand ? ' — ' + r.brand : ''}<span class="list-btn-kcal">${kcalTxt}</span>`;
    return { label, value: r };
  });
  listOptions.push({ label: '✍️ Ninguno de estos, añadir manual', value: 'manual' });

  const picked = await showModal({
    title: 'Resultados',
    message: `Toca el producto correcto para "${query}":`,
    list: listOptions
  });
  if(!picked) return;
  if(picked === 'manual'){ await addMealEntryManual(slot, query); return; }

  const perUnit = picked.kcalPerServing || picked.kcalPer100g;
  const unitLabel = picked.kcalPerServing
    ? `${Math.round(picked.kcalPerServing)} kcal por ración${picked.servingSize ? ' ('+picked.servingSize+')' : ''}`
    : `${Math.round(picked.kcalPer100g)} kcal por cada 100g`;

  const servingsRaw = await showModal({
    title: '¿Cuántas raciones?',
    message: `${picked.name} — ${unitLabel}. Escribe cuántas raciones (o "100g") vas a tomar.`,
    input: true,
    inputValue: '1',
    placeholder: 'Ej. 1, 2, 0.5',
    confirmText: 'AÑADIR'
  });
  if(!servingsRaw) return;

  const servings = parseFloat(servingsRaw.replace(',', '.')) || 1;
  const totalKcal = Math.round(perUnit * servings);
  const displayName = `${picked.name}${servings !== 1 ? ` ×${servings}` : ''}`;

  pushMealEntry(slot, displayName, totalKcal);
}

/* ---------------- MODO DIETA: RESUMEN KCAL Y ANILLO ---------------- */

function todayKcalConsumed(){
  if(!today.mealLog) return 0;
  return MEAL_SLOTS.reduce((sum, slot) => sum + mealSlotTotal(slot), 0);
}

function updateKcalSummary(){
  const consumed = todayKcalConsumed();
  const goal = state.profile && state.profile.kcalGoal ? state.profile.kcalGoal : null;

  const consumedEl = document.getElementById('kcalConsumed');
  const consumedBigEl = document.getElementById('kcalConsumedBig');
  const goalMiniEl = document.getElementById('kcalGoalMini');
  const remainingEl = document.getElementById('kcalRemaining');
  const remainingBox = document.getElementById('kcalRemainingBox');
  const hintEl = document.getElementById('kcalSummaryHint');
  if(!consumedEl) return;

  consumedEl.textContent = `${consumed} kcal`;
  consumedBigEl.textContent = `${consumed} kcal`;

  if(goal){
    goalMiniEl.textContent = `${goal} kcal`;
    const remaining = goal - consumed;
    remainingEl.textContent = `${remaining >= 0 ? remaining : Math.abs(remaining)} kcal${remaining < 0 ? ' de más' : ''}`;
    remainingBox.classList.toggle('over-budget', remaining < 0);
    hintEl.hidden = true;
  } else {
    goalMiniEl.textContent = '— kcal';
    remainingEl.textContent = '—';
    remainingBox.classList.remove('over-budget');
    hintEl.hidden = false;
  }

  const pct = goal ? Math.min(100, Math.round((consumed / goal) * 100)) : 0;
  const radius = 88;
  const circumference = 2 * Math.PI * radius;
  const arc = document.getElementById('dietArc');
  if(arc){
    arc.setAttribute('d', describeArcPath(120,120,radius));
    arc.setAttribute('stroke-dasharray', `${(pct/100) * circumference} ${circumference}`);
  }
  const pctEl = document.getElementById('dietPct');
  if(pctEl) pctEl.textContent = pct + '%';
}

/* ---------------- MODO DIETA: ADHERENCIA (calendario + estado dinámico) ----------------
   Un día "cuenta" (verde) si tiene al menos una comida registrada o algo de
   agua anotada. Un día pasado sin nada de eso es "fallido" (rojo). Los días
   futuros o anteriores a que existiera la app se muestran neutros/atenuados. */

function dayHasDietData(day){
  if(!day) return false;
  const hasMeals = day.mealLog && Object.values(day.mealLog).some(list => list && list.length > 0);
  const hasWater = (day.waterMl || 0) > 0;
  return !!(hasMeals || hasWater);
}

function computeDayCalStatus(key){
  const todayStr = todayKey();
  if(key > todayStr) return 'future';
  if(key < state.startDate) return 'before-start';
  const day = state.days[key];
  const hasData = dayHasDietData(day);
  if(key === todayStr) return hasData ? 'good' : 'pending';
  return hasData ? 'good' : 'failed';
}

let calViewYear = null;
let calViewMonth = null; // 0-indexado

function renderMonthCalendar(){
  const grid = document.getElementById('calGrid');
  const label = document.getElementById('calMonthLabel');
  if(!grid || calViewYear === null) return;

  const firstOfMonth = new Date(calViewYear, calViewMonth, 1);
  const startWeekday = (firstOfMonth.getDay() + 6) % 7; // 0 = lunes
  const daysInMonth = new Date(calViewYear, calViewMonth + 1, 0).getDate();

  label.textContent = firstOfMonth.toLocaleDateString('es-ES', { month:'long', year:'numeric' }).toUpperCase();

  grid.innerHTML = '';
  for(let i=0; i<startWeekday; i++){
    const cell = document.createElement('div');
    cell.className = 'cal-cell cal-empty';
    grid.appendChild(cell);
  }

  const todayStr = todayKey();
  for(let d=1; d<=daysInMonth; d++){
    const dateObj = new Date(calViewYear, calViewMonth, d);
    const key = localDateKey(dateObj);
    const status = computeDayCalStatus(key);
    const cell = document.createElement('div');
    cell.className = `cal-cell cal-${status}`;
    if(key === todayStr) cell.classList.add('cal-today');
    cell.textContent = d;
    grid.appendChild(cell);
  }

  const realNow = new Date();
  const isCurrentMonth = (calViewYear === realNow.getFullYear() && calViewMonth === realNow.getMonth());
  document.getElementById('calNextBtn').disabled = isCurrentMonth;
}

function setupMonthCalendar(){
  const now = new Date();
  calViewYear = now.getFullYear();
  calViewMonth = now.getMonth();

  document.getElementById('calPrevBtn').addEventListener('click', () => {
    calViewMonth--;
    if(calViewMonth < 0){ calViewMonth = 11; calViewYear--; }
    renderMonthCalendar();
  });

  document.getElementById('calNextBtn').addEventListener('click', () => {
    const realNow = new Date();
    if(calViewYear === realNow.getFullYear() && calViewMonth === realNow.getMonth()) return;
    calViewMonth++;
    if(calViewMonth > 11){ calViewMonth = 0; calViewYear++; }
    renderMonthCalendar();
  });

  renderMonthCalendar();
}

// Estado reciente de adherencia: cuenta días fallidos consecutivos hacia
// atrás (sin contar hoy, que aún está en curso). 0 fallos = verde (buena
// racha), 1 fallo = neutro (aviso suave, sin alarmar por un solo día
// ajetreado), 2 o más = rojo de alerta.
function computeDietAdherenceStatus(){
  let missed = 0;
  let cursor = new Date();
  cursor.setDate(cursor.getDate() - 1);
  let checkedAny = false;

  while(true){
    const key = localDateKey(cursor);
    if(key < state.startDate) break;
    checkedAny = true;
    const day = state.days[key];
    if(dayHasDietData(day)) break;
    missed++;
    cursor.setDate(cursor.getDate() - 1);
  }

  if(!checkedAny) return 'neutral';
  if(missed >= 2) return 'alert';
  if(missed === 0) return 'good';
  return 'neutral';
}

function updateDietStatusTheme(){
  const screen = document.getElementById('screenDiet');
  if(!screen) return;
  const status = computeDietAdherenceStatus();
  screen.classList.remove('status-good', 'status-alert');
  if(status === 'good') screen.classList.add('status-good');
  else if(status === 'alert') screen.classList.add('status-alert');
}

/* ---------------- NUTRICIÓN: PERFIL FÍSICO Y KCAL ---------------- */

function renderProfileForm(){
  const p = state.profile;
  document.getElementById('fWeight').value = p.weight ?? '';
  document.getElementById('fGoalWeight').value = p.goalWeight ?? '';
  document.getElementById('fAge').value = p.age ?? '';
  document.getElementById('fHeight').value = p.height ?? '';
  document.getElementById('fSex').value = p.sex ?? 'm';
  document.getElementById('fActivity').value = p.activity ?? '1.55';
}

function readProfileForm(){
  return {
    weight: parseFloat(document.getElementById('fWeight').value) || null,
    goalWeight: parseFloat(document.getElementById('fGoalWeight').value) || null,
    age: parseInt(document.getElementById('fAge').value) || null,
    height: parseInt(document.getElementById('fHeight').value) || null,
    sex: document.getElementById('fSex').value,
    activity: document.getElementById('fActivity').value
  };
}

function renderWeightProgress(){
  const el = document.getElementById('weightProgress');
  const hist = state.weightHistory;
  if(hist.length < 1 || !state.profile.weight){
    el.textContent = '';
    return;
  }
  const first = hist[0].weight;
  const current = state.profile.weight;
  const diff = (current - first);
  const sign = diff > 0 ? '+' : '';
  el.innerHTML = `Peso inicial registrado: <strong>${first} kg</strong> · Variación: <strong>${sign}${diff.toFixed(1)} kg</strong> desde el ${hist[0].date}`;
}

async function calcAndShowKcal(){
  const prevGoal = state.profile ? state.profile.kcalGoal : null;
  const prevGoalLabel = state.profile ? state.profile.kcalGoalLabel : null;
  const p = readProfileForm();
  p.kcalGoal = prevGoal;
  p.kcalGoalLabel = prevGoalLabel;
  state.profile = p;

  if(p.weight){
    const hist = state.weightHistory;
    const last = hist[hist.length - 1];
    if(!last || last.weight !== p.weight){
      hist.push({ date: todayKey(), weight: p.weight });
    }
  }
  saveData(state);
  renderWeightProgress();

  const result = document.getElementById('kcalResult');
  if(!p.weight || !p.height || !p.age){
    await showModal({
      title: 'Faltan datos',
      message: 'Completa peso, altura y edad para calcular tu objetivo calórico.',
      hideCancel: true,
      confirmText: 'ENTENDIDO'
    });
    return;
  }

  // Fórmula Mifflin-St Jeor
  let bmr = 10 * p.weight + 6.25 * p.height - 5 * p.age;
  bmr += (p.sex === 'm') ? 5 : -161;

  const tdee = bmr * parseFloat(p.activity);

  let goalLabel = 'OBJETIVO DIARIO SUGERIDO (MANTENIMIENTO)';
  let goalKcal = tdee;

  if(p.goalWeight){
    if(p.goalWeight < p.weight - 0.5){
      goalLabel = 'OBJETIVO DIARIO SUGERIDO (DÉFICIT)';
      goalKcal = tdee * (1 - DEFICIT_RATIO);
    } else if(p.goalWeight > p.weight + 0.5){
      goalLabel = 'OBJETIVO DIARIO SUGERIDO (SUPERÁVIT)';
      goalKcal = tdee * (1 + SURPLUS_RATIO);
    }
  }

  const floor = (p.sex === 'm') ? MIN_KCAL_MALE : MIN_KCAL_FEMALE;
  goalKcal = Math.max(floor, Math.round(goalKcal));

  state.profile.kcalGoal = goalKcal;
  state.profile.kcalGoalLabel = goalLabel;
  saveData(state);

  document.getElementById('bmrValue').textContent = `${Math.round(bmr)} kcal`;
  document.getElementById('tdeeValue').textContent = `${Math.round(tdee)} kcal`;
  document.getElementById('kcalGoalLabel').textContent = goalLabel;
  document.getElementById('kcalGoalValue').textContent = `${goalKcal} kcal`;
  result.hidden = false;

  updateKcalSummary();
}

document.getElementById('calcKcalBtn').addEventListener('click', calcAndShowKcal);

document.getElementById('cameraBtn').addEventListener('click', () => {
  showModal({
    title: 'Próximamente',
    message: '🦇 Alfred está calibrando el análisis visual de comida. Llegará en una próxima versión del Wayne Protocol.',
    hideCancel: true,
    confirmText: 'ENTENDIDO'
  });
});

/* ---------------- SALÓN DE LA FAMA (PINS) ---------------- */

function fileToCompressedDataUrl(file){
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const img = new Image();
      img.onload = () => {
        let { width, height } = img;
        if(width > height && width > PIN_MAX_DIMENSION){
          height = Math.round(height * (PIN_MAX_DIMENSION / width));
          width = PIN_MAX_DIMENSION;
        } else if(height >= width && height > PIN_MAX_DIMENSION){
          width = Math.round(width * (PIN_MAX_DIMENSION / height));
          height = PIN_MAX_DIMENSION;
        }
        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0, width, height);
        resolve(canvas.toDataURL('image/jpeg', PIN_JPEG_QUALITY));
      };
      img.onerror = () => reject(new Error('No se pudo leer la imagen'));
      img.src = e.target.result;
    };
    reader.onerror = () => reject(new Error('No se pudo leer el archivo'));
    reader.readAsDataURL(file);
  });
}

function renderPins(){
  const grid = document.getElementById('pinGrid');
  const tpl = document.getElementById('pinItemTpl');
  grid.innerHTML = '';

  if(!state.pins || state.pins.length === 0){
    const empty = document.createElement('div');
    empty.className = 'pin-empty';
    empty.textContent = 'Aún no hay pins. Añade el primero con el botón +.';
    grid.appendChild(empty);
    return;
  }

  state.pins.forEach((pin) => {
    const node = tpl.content.cloneNode(true);
    const img = node.querySelector('.pin-img');
    img.src = pin.dataUrl;
    img.alt = pin.caption || 'Pin del Salón de la Fama';
    node.querySelector('.pin-caption').textContent = pin.caption || pin.date;
    node.querySelector('.pin-remove').addEventListener('click', async () => {
      const ok = await showModal({
        title: 'Eliminar pin',
        message: '¿Quitar esta imagen del Salón de la Fama? No se puede deshacer.',
        confirmText: 'ELIMINAR',
        danger: true
      });
      if(!ok) return;
      state.pins = state.pins.filter(p => p.id !== pin.id);
      saveData(state);
      renderPins();
    });
    grid.appendChild(node);
  });
}

document.getElementById('addPinBtn').addEventListener('click', () => {
  document.getElementById('pinFileInput').click();
});

document.getElementById('pinFileInput').addEventListener('change', async (e) => {
  const file = e.target.files[0];
  if(!file) return;

  try{
    const dataUrl = await fileToCompressedDataUrl(file);
    const caption = await showModal({
      title: 'Añadir pin',
      message: 'Ponle un título a este recuerdo (opcional).',
      input: true,
      placeholder: 'Ej. Primera semana completa',
      confirmText: 'GUARDAR'
    });
    if(caption === null){ e.target.value = ''; return; }

    state.pins = state.pins || [];
    state.pins.unshift({
      id: Date.now().toString(36),
      dataUrl,
      caption: caption || '',
      date: todayKey()
    });
    saveData(state);
    renderPins();
  }catch(err){
    await showModal({
      title: 'No se pudo guardar',
      message: 'La imagen es demasiado grande o el almacenamiento local está lleno. Prueba con otra foto o elimina algún pin antiguo.',
      hideCancel: true,
      confirmText: 'ENTENDIDO'
    });
  }
  e.target.value = '';
});

/* ---------------- BITÁCORA ---------------- */

function renderLogHistory(){
  const container = document.getElementById('logHistory');
  container.innerHTML = '';
  const allEntries = [];
  Object.keys(state.days).sort().reverse().forEach(dateKey => {
    (state.days[dateKey].logs || []).forEach(entry => {
      allEntries.push({ date: dateKey, ...entry });
    });
  });
  allEntries.slice(0, 20).forEach(entry => {
    const div = document.createElement('div');
    div.className = 'log-entry';
    const time = document.createElement('time');
    time.textContent = `${entry.date} — ${entry.hour}`;
    div.appendChild(time);
    const p = document.createElement('span');
    p.textContent = entry.text;
    div.appendChild(p);
    container.appendChild(div);
  });
}

document.getElementById('saveNoteBtn').addEventListener('click', () => {
  const textarea = document.getElementById('logNote');
  const text = textarea.value.trim();
  if(!text) return;
  if(!today.logs) today.logs = [];
  today.logs.unshift({ text, hour: nowStamp() });
  saveData(state);
  textarea.value = '';
  const flag = document.getElementById('saveFlag');
  flag.textContent = 'REGISTRADO EN LA BITÁCORA';
  flag.classList.add('show');
  setTimeout(() => flag.classList.remove('show'), 2000);
  renderLogHistory();
});

/* ---------------- SWIPE ENTRE PANTALLAS (WAYNE PROTOCOL <-> MODO DIETA) ---------------- */

function setupSwipe(){
  const viewport = document.getElementById('appViewport');
  const track = document.getElementById('appTrack');
  let startX = 0, startY = 0, baseX = 0;
  let dragging = false;
  let directionLock = null; // null | 'h' | 'v'
  let activeScreen = 'main'; // 'main' | 'diet'

  function currentBaseX(){
    return activeScreen === 'diet' ? 0 : -window.innerWidth;
  }

  function snapTo(screenName, animate = true){
    activeScreen = screenName;
    const x = screenName === 'diet' ? 0 : -window.innerWidth;
    track.classList.remove('dragging');
    if(animate){
      requestAnimationFrame(() => {
        track.style.transform = `translateX(${x}px)`;
      });
    } else {
      // sin animación (carga inicial o resize): aplicar de forma síncrona
      // para que no parpadee un frame en la posición equivocada.
      track.style.transition = 'none';
      track.style.transform = `translateX(${x}px)`;
      void track.offsetHeight; // fuerza reflow antes de recuperar la transición
      track.style.transition = '';
    }
  }

  function onPointerDown(e){
    if(e.pointerType === 'mouse' && e.button !== 0) return;
    startX = e.clientX;
    startY = e.clientY;
    baseX = currentBaseX();
    dragging = true;
    directionLock = null;
  }

  function onPointerMove(e){
    if(!dragging) return;
    const dx = e.clientX - startX;
    const dy = e.clientY - startY;

    if(directionLock === null){
      if(Math.abs(dx) > 8 || Math.abs(dy) > 8){
        directionLock = Math.abs(dx) > Math.abs(dy) ? 'h' : 'v';
        if(directionLock === 'h') track.classList.add('dragging');
      }
    }

    if(directionLock === 'v') return; // deja que el scroll vertical nativo actúe

    if(directionLock === 'h'){
      e.preventDefault();
      let x = baseX + dx;
      x = Math.max(-window.innerWidth, Math.min(0, x));
      track.style.transform = `translateX(${x}px)`;
    }
  }

  function onPointerUp(e){
    if(!dragging) return;
    dragging = false;
    if(directionLock !== 'h'){ directionLock = null; return; }

    const dx = e.clientX - startX;
    const threshold = window.innerWidth * 0.28;
    let target = activeScreen;
    if(activeScreen === 'main' && dx > threshold) target = 'diet';
    else if(activeScreen === 'diet' && dx < -threshold) target = 'main';
    snapTo(target);
    directionLock = null;
  }

  viewport.addEventListener('pointerdown', onPointerDown);
  viewport.addEventListener('pointermove', onPointerMove, { passive:false });
  window.addEventListener('pointerup', onPointerUp);
  window.addEventListener('pointercancel', onPointerUp);

  document.getElementById('peekToDiet').addEventListener('click', () => snapTo('diet'));
  document.getElementById('peekToMain').addEventListener('click', () => snapTo('main'));

  window.addEventListener('resize', () => snapTo(activeScreen, false));

  snapTo('main', false);
}

/* ---------------- COPIA DE SEGURIDAD (EXPORTAR / IMPORTAR) ---------------- */

function setupBackup(){
  document.getElementById('permissionsBtn').addEventListener('click', openPermissionsMenu);

  document.getElementById('exportBtn').addEventListener('click', () => {
    const raw = localStorage.getItem(STORAGE_KEY);
    const bundle = {
      app: 'wayne-protocol',
      exportedAt: new Date().toISOString(),
      wayneProtocolData: raw ? JSON.parse(raw) : null,
      wayneProtocolTheme: localStorage.getItem(THEME_KEY) || 'default'
    };
    const blob = new Blob([JSON.stringify(bundle, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    const stamp = todayKey();
    a.href = url;
    a.download = `wayne-protocol-backup-${stamp}.json`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
  });

  document.getElementById('importBtn').addEventListener('click', () => {
    document.getElementById('importFileInput').click();
  });

  document.getElementById('importFileInput').addEventListener('change', async (e) => {
    const file = e.target.files[0];
    if(!file){ return; }

    try{
      const text = await file.text();
      const parsed = JSON.parse(text);
      const payload = parsed.wayneProtocolData ? parsed.wayneProtocolData : parsed;

      if(!payload || typeof payload !== 'object' || !payload.days || !payload.habitDefs){
        await showModal({
          title: 'Archivo no válido',
          message: 'Este archivo no parece ser una copia de seguridad del Wayne Protocol.',
          hideCancel: true,
          confirmText: 'ENTENDIDO'
        });
        e.target.value = '';
        return;
      }

      const ok = await showModal({
        title: '⚠ Restaurar copia de seguridad',
        message: 'Esto SUSTITUIRÁ todos tus datos actuales (hábitos, entrenamiento, pins, bitácora, dieta...) por los del archivo importado. No se puede deshacer.',
        confirmText: 'RESTAURAR',
        danger: true
      });
      if(!ok){ e.target.value = ''; return; }

      localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
      if(parsed.wayneProtocolTheme){
        localStorage.setItem(THEME_KEY, parsed.wayneProtocolTheme);
      }

      await showModal({
        title: 'Restaurado',
        message: 'Tus datos se han restaurado correctamente. La app se recargará ahora.',
        hideCancel: true,
        confirmText: 'ACEPTAR'
      });
      location.reload();
    }catch(err){
      await showModal({
        title: 'No se pudo leer el archivo',
        message: 'Comprueba que el archivo no esté dañado y que sea un .json exportado desde esta misma app.',
        hideCancel: true,
        confirmText: 'ENTENDIDO'
      });
    }
    e.target.value = '';
  });
}

/* ---------------- PERMISOS: NOTIFICACIONES, CÁMARA Y GALERÍA ----------------
   En la web no existe un permiso de "galería" independiente: el selector de
   archivos (el mismo que ya usa el Salón de la Fama) no requiere ningún
   permiso especial, el navegador lo gestiona solo. Por honestidad se lo
   explicamos así al usuario en vez de simular un permiso que no existe. */

async function requestNotificationPermission(explain){
  if(!('Notification' in window)){
    if(explain){
      await showModal({
        title: '🔔 Notificaciones',
        message: 'Este navegador no soporta notificaciones. Alfred no podrá avisarte por aquí.',
        hideCancel: true, confirmText: 'ENTENDIDO'
      });
    }
    return;
  }

  if(Notification.permission === 'granted'){
    if(explain){
      await showModal({
        title: '🔔 Notificaciones activas',
        message: 'Ya están activadas. Alfred, Dick Grayson y Bruce te avisarán como mucho dos veces al día (mañana y noche) si se te olvida registrar algo.',
        hideCancel: true, confirmText: 'PERFECTO'
      });
    }
    registerPeriodicSyncBestEffort();
    return;
  }

  if(Notification.permission === 'denied'){
    if(explain){
      await showModal({
        title: '🔔 Notificaciones bloqueadas',
        message: 'Las tienes bloqueadas a nivel de navegador. Si cambias de opinión, actívalas desde los ajustes del propio sitio (icono de candado en la barra de direcciones).',
        hideCancel: true, confirmText: 'ENTENDIDO'
      });
    }
    return;
  }

  const wantsIt = await showModal({
    title: '🔔 Notificaciones',
    message: 'Alfred, Dick Grayson y Bruce quieren mandarte como mucho 2 avisos al día (uno por la mañana, otro sobre las 23:00) solo si se te olvida registrar algo. Nada invasivo. ¿Los activamos?',
    confirmText: 'ACTIVAR',
    cancelText: 'AHORA NO'
  });
  if(!wantsIt) return;

  try{
    const result = await Notification.requestPermission();
    if(result === 'granted') registerPeriodicSyncBestEffort();
  }catch(err){ /* el usuario cerró el diálogo nativo del navegador; no pasa nada */ }
}

async function requestCameraPermission(){
  if(!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia){
    return;
  }
  const wantsIt = await showModal({
    title: '📷 Cámara',
    message: 'Cuando el escáner de comida esté listo hará falta tu cámara. ¿Damos el permiso ya para tenerlo preparado? Puedes decir que no ahora y te lo pediremos más adelante.',
    confirmText: 'PERMITIR',
    cancelText: 'AHORA NO'
  });
  if(!wantsIt) return;
  try{
    const stream = await navigator.mediaDevices.getUserMedia({ video: true });
    stream.getTracks().forEach(t => t.stop());
    await showModal({
      title: '📷 Cámara lista',
      message: 'Permiso concedido. En cuanto el escáner de comida esté terminado, ya podrá usar tu cámara sin pedirte nada de nuevo.',
      hideCancel: true, confirmText: 'GENIAL'
    });
  }catch(err){
    // el usuario denegó o no hay cámara disponible; no insistimos
  }
}

async function explainGalleryAccess(){
  await showModal({
    title: '🖼️ Galería',
    message: 'En un navegador web no existe un permiso de "galería" aparte: al pulsar "+" en el Salón de la Fama, el propio sistema te enseña tu carpeta de fotos sin pedir nada extra. Aquí no hay nada que activar.',
    hideCancel: true, confirmText: 'ENTENDIDO'
  });
}

async function runOnboarding(){
  if(localStorage.getItem('wayneOnboardingDone')) return;
  await requestNotificationPermission(false);
  await requestCameraPermission();
  await explainGalleryAccess();
  localStorage.setItem('wayneOnboardingDone', '1');
}

async function openPermissionsMenu(){
  const choice = await showModal({
    title: 'Permisos de la app',
    message: '¿Qué quieres revisar?',
    list: [
      { label: '🔔 Notificaciones', value: 'notif' },
      { label: '📷 Cámara', value: 'camera' },
      { label: '🖼️ Galería (info)', value: 'gallery' }
    ]
  });
  if(!choice) return;
  if(choice === 'notif') await requestNotificationPermission(true);
  else if(choice === 'camera') await requestCameraPermission();
  else if(choice === 'gallery') await explainGalleryAccess();
}

// Best-effort: la Periodic Background Sync API solo existe en Chrome/Android
// (PWA instalada + cierto nivel de uso) y NUNCA en iOS Safari. Cuando no está
// disponible, esto simplemente no hace nada — el aviso fiable sigue siendo
// el que se comprueba cada vez que se abre la app (ver maybeSendReminder).
async function registerPeriodicSyncBestEffort(){
  try{
    if(!('serviceWorker' in navigator)) return;
    const reg = await navigator.serviceWorker.ready;
    if(!('periodicSync' in reg)) return;
    const status = await navigator.permissions.query({ name: 'periodic-background-sync' });
    if(status.state === 'granted'){
      await reg.periodicSync.register('wayne-reminder-check', { minInterval: 12 * 60 * 60 * 1000 });
    }
  }catch(err){
    // sin soporte: nada que hacer, es un extra opcional
  }
}

/* ---------------- RECORDATORIOS: MENSAJES DE ALFRED / GRAYSON / BRUCE ---------------- */

const ALFRED_MESSAGES = [
  'Amo Bruce, el registro de hoy sigue en blanco. Gotham puede esperar cinco minutos; sus protocolos, no tanto.',
  'Los protocolos de hoy siguen sin marcar. No voy a insistir más de la cuenta, señor... pero tomo nota.',
  'Un caballero disciplinado también anota su jornada. Se lo recuerdo con cariño.'
];
const GRAYSON_MESSAGES = [
  '¡Eh, jefe! ¿Ya registraste algo hoy? No hace falta ser perfecto, solo constante.',
  '¿Comiste bien o solo café y adrenalina otra vez? Anótalo en el Wayne Protocol.',
  '¿Entrenaste hoy o solo lo pensaste? Déjalo por escrito, que luego se te olvida.'
];
const BRUCE_MESSAGES = [
  'La disciplina no descansa. Registra tu comida y tu entrenamiento de hoy.',
  'Cada dato cuenta. Un minuto ahora te ahorra dudas mañana.',
  'No hace falta un día perfecto, solo un día registrado.'
];

function pickRandomNotification(){
  const pools = [
    { sender: 'Alfred', messages: ALFRED_MESSAGES },
    { sender: 'Dick Grayson', messages: GRAYSON_MESSAGES },
    { sender: 'Bruce Wayne', messages: BRUCE_MESSAGES }
  ];
  const pool = pools[Math.floor(Math.random() * pools.length)];
  const msg = pool.messages[Math.floor(Math.random() * pool.messages.length)];
  return { title: pool.sender, body: msg };
}

// Ventanas horarias suaves y no invasivas: mañana (8:00-11:00) y un rato
// antes de medianoche (22:00-23:59). Como mucho un aviso por ventana y día.
function currentReminderSlot(){
  const h = new Date().getHours();
  if(h >= 8 && h < 11) return 'morning';
  if(h >= 22 && h < 24) return 'night';
  return null;
}

async function maybeSendReminder(){
  if(!('Notification' in window) || Notification.permission !== 'granted') return;

  const slot = currentReminderSlot();
  if(!slot) return;

  const flagKey = `wayneNotif:${slot}:${todayKey()}`;
  if(localStorage.getItem(flagKey)) return;

  // Si ya está todo registrado hoy, no molestamos — solo marcamos la
  // ventana como "vista" para no volver a comprobarlo cada minuto.
  const habitsDone = habitPercent() === 100;
  const dietLogged = dayHasDietData(today);
  if(habitsDone && dietLogged){
    localStorage.setItem(flagKey, '1');
    return;
  }

  const { title, body } = pickRandomNotification();
  try{
    if('serviceWorker' in navigator){
      const reg = await navigator.serviceWorker.ready;
      await reg.showNotification(title, { body, icon: 'icon.svg', badge: 'icon.svg', tag: 'wayne-reminder' });
    } else {
      new Notification(title, { body, icon: 'icon.svg' });
    }
    localStorage.setItem(flagKey, '1');
  }catch(err){ /* silencioso: si falla el envío, se reintentará el siguiente minuto */ }
}

/* ---------------- RESET OCULTO ---------------- */

function setupHiddenReset(){
  const trigger = document.getElementById('batTriggerBtn');
  const resetBtn = document.getElementById('resetBtn');
  let clicks = [];
  const WINDOW_MS = 4000;
  const TAPS_NEEDED = 5;

  trigger.addEventListener('click', () => {
    const now = Date.now();
    clicks.push(now);
    clicks = clicks.filter(t => now - t <= WINDOW_MS);
    if(clicks.length >= TAPS_NEEDED){
      clicks = [];
      resetBtn.hidden = false;
      resetBtn.scrollIntoView({ behavior:'smooth', block:'center' });
    }
  });

  resetBtn.addEventListener('click', async () => {
    const ok = await showModal({
      title: '⚠ Reiniciar Protocolo Wayne',
      message: 'Esto borrará TODOS tus datos guardados en este dispositivo: hábitos, entrenamiento, nutrición, pins y bitácora. No se puede deshacer.',
      confirmText: 'BORRAR TODO',
      danger: true
    });
    if(!ok) return;
    localStorage.removeItem(STORAGE_KEY);
    state = loadData();
    today = ensureToday(state);
    resetBtn.hidden = true;
    renderAll();
  });
}

/* ---------------- INIT ---------------- */

function renderAll(){
  renderHabits();
  renderExercises();
  renderMealSlots();
  renderWaterDiet();
  updateKcalSummary();
  updateDietStatusTheme();
  renderMonthCalendar();
  renderProfileForm();
  renderWeightProgress();
  renderLogHistory();
  renderPins();
  updateTrainingTotal();
  updateTrainingStreak();
  updateRadar();
  updateDayCounter();
  updateStreak();
  updateWeekly();
}

setupModalSystem();
setupHiddenReset();
setupSwipe();
setupBackup();
setupMonthCalendar();
renderAll();
tickClock();
maybeSendReminder();
setInterval(tickClock, 1000);
setTimeout(runOnboarding, 800);

/* ---------------- TEMA OCULTO: BATGIRL ---------------- */

const THEME_KEY = 'wayneProtocolTheme';

function applyTheme(theme){
  document.body.classList.toggle('theme-batgirl', theme === 'batgirl');
}

(function initTheme(){
  const saved = localStorage.getItem(THEME_KEY) || 'default';
  applyTheme(saved);
})();

(function setupBatgirlTrigger(){
  const trigger = document.getElementById('batgirlTrigger');
  if(!trigger) return;
  let clicks = [];
  const WINDOW_MS = 1200;

  trigger.addEventListener('click', () => {
    const now = Date.now();
    clicks.push(now);
    clicks = clicks.filter(t => now - t <= WINDOW_MS);
    if(clicks.length >= 3){
      clicks = [];
      const current = localStorage.getItem(THEME_KEY) || 'default';
      const next = current === 'batgirl' ? 'default' : 'batgirl';
      localStorage.setItem(THEME_KEY, next);
      applyTheme(next);
    }
  });
})();

/* ---------------- SERVICE WORKER (PWA offline) ---------------- */
if('serviceWorker' in navigator){
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('sw.js').catch(() => {
      /* silencioso: si falla el registro, la app sigue funcionando online */
    });
  });
}
