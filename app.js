/* ============================================================
   WAYNE PROTOCOL v1.4 — lógica de la Bat-Terminal
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
  localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
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
  const cancelBtn = document.getElementById('modalCancelBtn');
  const confirmBtn = document.getElementById('modalConfirmBtn');

  titleEl.textContent = opts.title || '';

  if(opts.message){
    msgEl.textContent = opts.message;
    msgEl.hidden = false;
  } else {
    msgEl.hidden = true;
  }

  if(opts.input){
    wrap.hidden = false;
    inputEl.value = opts.inputValue || '';
    inputEl.placeholder = opts.placeholder || '';
  } else {
    wrap.hidden = true;
  }

  confirmBtn.textContent = opts.confirmText || 'ACEPTAR';
  cancelBtn.textContent = opts.cancelText || 'CANCELAR';
  cancelBtn.hidden = !!opts.hideCancel;
  confirmBtn.classList.toggle('danger', !!opts.danger);

  overlay.hidden = false;

  if(opts.input){
    setTimeout(() => inputEl.focus(), 50);
  }

  return new Promise((resolve) => {
    modalResolve = resolve;
  });
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
        });
        list.appendChild(eNode);
      });
    }
    container.appendChild(node);
  });
}

async function addMealEntry(slot){
  const name = await showModal({
    title: `Añadir a ${slot}`,
    message: '¿Qué has comido?',
    input: true,
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

  if(!today.mealLog) today.mealLog = {};
  if(!today.mealLog[slot]) today.mealLog[slot] = [];
  today.mealLog[slot].push({ id: Date.now().toString(36), name, kcal, at: nowStamp() });
  saveData(state);
  renderMealSlots();
  updateKcalSummary();
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
renderAll();
tickClock();
setInterval(tickClock, 1000);

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
