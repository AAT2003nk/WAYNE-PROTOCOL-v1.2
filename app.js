/* ============================================================
   WAYNE PROTOCOL v2.2 — lógica de la Bat-Terminal
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
const WEEK_SUCCESS_THRESHOLD = 70; // % mínimo por día para contar como "día de éxito"
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
    mealPacks: [],
    exercisePRs: {},
    exercisePacks: [],
    exerciseLastSet: {},
    profileMeta: null,
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
  if(!data.mealPacks) data.mealPacks = [];
  if(!data.exercisePRs) data.exercisePRs = {};
  if(!data.exercisePacks) data.exercisePacks = [];
  if(!data.exerciseLastSet) data.exerciseLastSet = {};
  if(!data.profileMeta) data.profileMeta = null; // se genera solo al abrir Perfil por primera vez
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
let pendingOnConfirmSync = null;

function showModal(opts){
  const overlay = document.getElementById('modalOverlay');
  const titleEl = document.getElementById('modalTitle');
  const msgEl = document.getElementById('modalMessage');
  const wrap = document.getElementById('modalInputWrap');
  const inputEl = document.getElementById('modalInput');
  const listEl = document.getElementById('modalList');
  const fieldsEl = document.getElementById('modalFields');
  const cancelBtn = document.getElementById('modalCancelBtn');
  const confirmBtn = document.getElementById('modalConfirmBtn');

  titleEl.textContent = opts.title || '';
  pendingOnConfirmSync = typeof opts.onConfirmSync === 'function' ? opts.onConfirmSync : null;

  if(opts.message){
    msgEl.textContent = opts.message;
    msgEl.hidden = false;
  } else {
    msgEl.hidden = true;
  }

  listEl.innerHTML = '';
  fieldsEl.innerHTML = '';

  if(opts.list && opts.list.length){
    listEl.hidden = false;
    wrap.hidden = true;
    fieldsEl.hidden = true;
    confirmBtn.hidden = true;
    opts.list.forEach(item => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'modal-list-btn';
      btn.innerHTML = item.label;
      btn.addEventListener('click', () => closeModal(item.value));
      listEl.appendChild(btn);
    });
  } else if(opts.fields && opts.fields.length){
    listEl.hidden = true;
    wrap.hidden = true;
    fieldsEl.hidden = false;
    confirmBtn.hidden = false;
    opts.fields.forEach(f => {
      const wrapDiv = document.createElement('div');
      wrapDiv.className = 'modal-field';
      const label = document.createElement('label');
      label.textContent = f.label;
      label.setAttribute('for', `modalField-${f.key}`);
      const input = document.createElement('input');
      input.type = f.type || 'text';
      if(f.inputmode) input.inputMode = f.inputmode;
      input.id = `modalField-${f.key}`;
      input.dataset.key = f.key;
      input.placeholder = f.placeholder || '';
      input.value = f.value || '';
      wrapDiv.appendChild(label);
      wrapDiv.appendChild(input);
      fieldsEl.appendChild(wrapDiv);
    });
  } else {
    listEl.hidden = true;
    fieldsEl.hidden = true;
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

  if(opts.input && !opts.list && !opts.fields){
    setTimeout(() => inputEl.focus(), 50);
  } else if(opts.fields && opts.fields.length){
    setTimeout(() => {
      const first = fieldsEl.querySelector('input');
      if(first) first.focus();
    }, 50);
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
  document.getElementById('modalFields').hidden = true;
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
  pendingOnConfirmSync = null;
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
    // CRÍTICO: si hay un onConfirmSync pendiente (p.ej. pedir permiso de
    // notificaciones), se ejecuta AQUÍ, de forma síncrona, dentro del mismo
    // evento de click real del usuario. Si en su lugar esperáramos a que se
    // resuelva la promesa del modal para luego llamar a la API nativa, en
    // Safari/iOS (y cada vez más navegadores) ya se habría perdido la
    // "activación de usuario" y el permiso se bloquearía en silencio sin
    // mostrar siquiera el diálogo del sistema. Esta es la causa por la que
    // las notificaciones no llegaban en versiones anteriores.
    if(pendingOnConfirmSync){
      const fn = pendingOnConfirmSync;
      pendingOnConfirmSync = null;
      fn();
    }
    const wrap = document.getElementById('modalInputWrap');
    const fieldsEl = document.getElementById('modalFields');
    if(!fieldsEl.hidden){
      const result = {};
      fieldsEl.querySelectorAll('input').forEach(inp => {
        result[inp.dataset.key] = inp.value.trim();
      });
      closeModal(result);
    } else if(!wrap.hidden){
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

  document.getElementById('modalFields').addEventListener('keydown', (e) => {
    if(e.key === 'Enter'){
      e.preventDefault();
      document.getElementById('modalConfirmBtn').click();
    }
  });

  document.addEventListener('keydown', (e) => {
    if(e.key === 'Escape' && !overlay.hidden) closeModal(null);
  });
}

/* ============================================================
   TOAST DE DESHACER — patrón genérico "borra ya, confirma en 5s"
   Se usa en hábitos, ejercicios, comidas y pins: el elemento desaparece de
   la vista al instante, pero NO se guarda en localStorage hasta que pasan
   5s sin pulsar "Deshacer". Si el usuario deshace, se restaura tal cual.
   ============================================================ */

let pendingUndo = null; // { timeoutId, onUndo, onFinalize }

function showUndoToast(message, onUndo, onFinalize){
  // si ya había un borrado esperando confirmación, se confirma ya (se guarda)
  // antes de empezar uno nuevo, para no acumular varios a la vez.
  finalizePendingUndo();

  const toast = document.getElementById('undoToast');
  const bar = document.getElementById('undoToastBar');
  document.getElementById('undoToastMsg').textContent = message;
  toast.hidden = false;
  // reinicia la animación de la barra de progreso
  bar.style.animation = 'none';
  void bar.offsetWidth;
  bar.style.animation = '';
  requestAnimationFrame(() => toast.classList.add('show'));

  const timeoutId = setTimeout(() => {
    finalizePendingUndo();
  }, 5000);

  pendingUndo = { timeoutId, onUndo, onFinalize };
}

function finalizePendingUndo(){
  if(!pendingUndo) return;
  clearTimeout(pendingUndo.timeoutId);
  pendingUndo.onFinalize();
  pendingUndo = null;
  hideUndoToast();
}

function hideUndoToast(){
  const toast = document.getElementById('undoToast');
  toast.classList.remove('show');
  setTimeout(() => { if(!toast.classList.contains('show')) toast.hidden = true; }, 250);
}

function setupUndoToast(){
  document.getElementById('undoToastBtn').addEventListener('click', () => {
    if(!pendingUndo) return;
    clearTimeout(pendingUndo.timeoutId);
    const undo = pendingUndo.onUndo;
    pendingUndo = null;
    undo();
    hideUndoToast();
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

    node.querySelector('.habit-remove').addEventListener('click', () => {
      const index = state.habitDefs.indexOf(name);
      if(index === -1) return;
      state.habitDefs.splice(index, 1);
      renderHabits();
      updateRadar();
      updateStreak();
      updateWeekly();

      showUndoToast(
        `Protocolo "${name}" eliminado`,
        () => { // deshacer
          state.habitDefs.splice(index, 0, name);
          renderHabits();
          updateRadar();
          updateStreak();
          updateWeekly();
        },
        () => { saveData(state); } // confirmar (pasados los 5s)
      );
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

// Insignias de racha — puro azúcar de gamificación, sin afectar a los datos
function getStreakBadge(n){
  if(n >= 100) return '👑';
  if(n >= 60) return '💎';
  if(n >= 30) return '🥇';
  if(n >= 14) return '🥈';
  if(n >= 7) return '🥉';
  if(n >= 3) return '🔥';
  return '';
}

function habitDayComplete(day){
  if(!day) return false;
  const vals = Object.values(day.habits || {});
  return vals.length > 0 && vals.every(v => v.done);
}

function trainingDayFullyComplete(day){
  if(!day || !day.exercises || day.exercises.length === 0) return false;
  return day.exercises.every(e => e.count > 0);
}

function updateStreak(){
  let streak = 0;
  let cursor = new Date();
  const todayComplete = habitDayComplete(today);
  if(todayComplete) streak = 1;

  cursor.setDate(cursor.getDate() - 1);
  while(true){
    const key = localDateKey(cursor);
    const day = state.days[key];
    if(!day) break;
    if(!habitDayComplete(day)) break;
    streak++;
    cursor.setDate(cursor.getDate() - 1);
  }
  const badge = getStreakBadge(streak);
  document.getElementById('streakText').textContent = `RACHA: ${streak}${badge ? ' ' + badge : ''}`;

  if(todayComplete) maybeCelebrate('habits', streak);
}

function updateTrainingStreak(){
  let streak = 0;
  let cursor = new Date();
  today.trainingDone = today.exercises.some(e => e.count > 0);
  const fullyComplete = trainingDayFullyComplete(today);
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
  const badge = getStreakBadge(streak);
  document.getElementById('trainingStreak').textContent = `${streak} día${streak === 1 ? '' : 's'}${badge ? ' ' + badge : ''}`;

  if(fullyComplete) maybeCelebrate('training', streak);
}

/* ---------------- CELEBRACIÓN DE RACHA (estilo Duolingo) ----------------
   Se dispara la PRIMERA vez que, en el día, se completa el 100% de los
   protocolos o se hacen todos los ejercicios propuestos. Muestra la semana
   (lunes-domingo) con los días conseguidos, como el popup de racha de
   Duolingo. Máximo una vez por tipo y por día (con flag en localStorage). */

function maybeCelebrate(kind, streakCount){
  const flagKey = `wayneCelebrate:${kind}:${todayKey()}`;
  if(localStorage.getItem(flagKey)) return;
  localStorage.setItem(flagKey, '1');

  const hasDataFn = kind === 'habits' ? habitDayComplete : trainingDayFullyComplete;
  const monday = getMonday(new Date());
  const todayStr = todayKey();
  const weekDays = [];
  for(let i=0; i<7; i++){
    const d = new Date(monday);
    d.setDate(d.getDate() + i);
    const key = localDateKey(d);
    weekDays.push({
      label: DAY_LABELS[i],
      done: hasDataFn(state.days[key]),
      isToday: key === todayStr,
      isFuture: key > todayStr
    });
  }

  const badge = getStreakBadge(streakCount);
  const title = kind === 'habits' ? '¡Protocolo completo!' : '¡Entrenamiento completo!';
  const sub = kind === 'habits'
    ? `Racha de ${streakCount} día${streakCount === 1 ? '' : 's'} con el 100% de tus hábitos.`
    : `Racha de ${streakCount} día${streakCount === 1 ? '' : 's'} completando todo el entreno.`;

  showCelebration(badge || (kind === 'habits' ? '🦇' : '💪'), title, sub, weekDays);
}

function showCelebration(emoji, title, sub, weekDays){
  document.getElementById('celebrationEmoji').textContent = emoji;
  document.getElementById('celebrationTitle').textContent = title;
  document.getElementById('celebrationSub').textContent = sub;

  const weekEl = document.getElementById('celebrationWeek');
  weekEl.innerHTML = '';
  weekDays.forEach(d => {
    const pill = document.createElement('div');
    pill.className = 'celebration-day' + (d.done ? ' done' : '') + (d.isToday ? ' today' : '') + (d.isFuture ? ' future' : '');
    const span = document.createElement('span');
    span.textContent = d.label;
    const i = document.createElement('i');
    i.textContent = d.done ? '✓' : '';
    pill.appendChild(span);
    pill.appendChild(i);
    weekEl.appendChild(pill);
  });

  document.getElementById('celebrationOverlay').hidden = false;
}

function setupCelebration(){
  const overlay = document.getElementById('celebrationOverlay');
  const close = () => { overlay.hidden = true; };
  document.getElementById('celebrationCloseBtn').addEventListener('click', close);
  overlay.addEventListener('click', (e) => { if(e.target === overlay) close(); });
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

function checkAndUpdatePR(name, count){
  if(!state.exercisePRs) state.exercisePRs = {};
  const best = state.exercisePRs[name] || 0;
  if(count > best){
    state.exercisePRs[name] = count;
    return true;
  }
  return false;
}

function renderExercises(){
  const list = document.getElementById('trainingList');
  const tpl = document.getElementById('exerciseItemTpl');
  list.innerHTML = '';
  today.exercises.forEach((ex, idx) => {
    const node = tpl.content.cloneNode(true);
    node.querySelector('.ex-name').textContent = ex.name;
    node.querySelector('.ex-count').textContent = ex.count;
    const best = (state.exercisePRs && state.exercisePRs[ex.name]) || 0;
    const prEl = node.querySelector('.ex-pr');
    prEl.hidden = !(ex.count > 0 && ex.count >= best);

    node.querySelector('.plus').addEventListener('click', () => {
      today.exercises[idx].count += 1;
      checkAndUpdatePR(ex.name, today.exercises[idx].count);
      saveData(state);
      renderExercises();
      updateTrainingTotal();
      updateTrainingStreak();
      trainingCalendar.render();
      renderTrainingWeekChart();
    });
    node.querySelector('.ex-session-btn').addEventListener('click', () => openWorkoutSession(idx));
    node.querySelector('.minus').addEventListener('click', () => {
      today.exercises[idx].count = Math.max(0, today.exercises[idx].count - 1);
      saveData(state);
      renderExercises();
      updateTrainingTotal();
      updateTrainingStreak();
      trainingCalendar.render();
      renderTrainingWeekChart();
    });
    node.querySelector('.ex-remove').addEventListener('click', () => {
      const removed = today.exercises[idx];
      today.exercises.splice(idx,1);
      renderExercises();
      updateTrainingTotal();
      updateTrainingStreak();
      trainingCalendar.render();
      renderTrainingWeekChart();

      showUndoToast(
        `Ejercicio "${removed.name}" eliminado`,
        () => {
          today.exercises.splice(idx, 0, removed);
          renderExercises();
          updateTrainingTotal();
          updateTrainingStreak();
          trainingCalendar.render();
          renderTrainingWeekChart();
        },
        () => { saveData(state); }
      );
    });
    list.appendChild(node);
  });
}

function dayTrainingVolume(day){
  if(!day || !day.exercises) return 0;
  return day.exercises.reduce((sum, e) => sum + e.count, 0);
}

/* ---------------- SESIÓN DE ENTRENAMIENTO (series / peso / reps) ----------------
   Capa adicional sobre el contador simple +/-: aquí se registran series con
   peso y repeticiones concretas, cada una con un tick para marcarla como
   hecha. En cuanto una serie tiene el tick puesto, el contador rápido de la
   fila se recalcula automáticamente sumando las reps de las series marcadas,
   así ambos sistemas quedan sincronizados sin pisarse. El último peso/reps
   usados de cada ejercicio se recuerdan de una sesión a otra (no "se
   reinician"), aunque las repeticiones de HOY siempre empiezan en 0 al
   cambiar de día, que es lo correcto. */

let sessionExerciseIndex = null;

function recomputeExerciseCountFromSets(idx){
  const ex = today.exercises[idx];
  if(!ex || !ex.sets || ex.sets.length === 0) return; // sin series: no tocar el contador manual
  const total = ex.sets.filter(s => s.done).reduce((sum, s) => sum + (s.reps || 0), 0);
  ex.count = total;
  checkAndUpdatePR(ex.name, ex.count);
}

function openWorkoutSession(idx){
  sessionExerciseIndex = idx;
  const ex = today.exercises[idx];
  if(!ex.sets) ex.sets = [];
  document.getElementById('sessionExerciseName').textContent = ex.name;
  renderSessionSets();
  loadExerciseGuide(ex.name);
  document.getElementById('sessionOverlay').hidden = false;
}

function closeWorkoutSession(){
  document.getElementById('sessionOverlay').hidden = true;
  sessionExerciseIndex = null;
}

/* ---------------- GUÍA VISUAL DEL EJERCICIO (wger.de) ----------------
   wger.de es una base de datos de ejercicios open source y gratuita, sin
   necesidad de clave. La consulta sale directo desde el navegador del
   usuario, igual que Open Food Facts — no hay servidor propio de por
   medio. Es un servicio de terceros que no controlamos: si un día cambia
   su API o no tiene el ejercicio en español, esto se degrada solo a un
   aviso amable en vez de romper nada. En caché en memoria por nombre de
   ejercicio para no repetir la consulta cada vez que abres la sesión. */

const exerciseGuideCache = {};

async function fetchExerciseGuide(name){
  if(exerciseGuideCache[name] !== undefined) return exerciseGuideCache[name];

  try{
    // 1) buscamos el ejercicio por nombre (probamos español, si no hay
    //    resultado probamos inglés, que tiene muchísima más cobertura)
    let suggestion = await searchWgerExercise(name, 2) // 2 = español en wger
                  || await searchWgerExercise(name, 1); // 1 = inglés

    if(!suggestion){
      exerciseGuideCache[name] = null;
      return null;
    }

    const baseId = suggestion.data.base_id || suggestion.data.id;
    let imageUrl = null;
    try{
      const imgRes = await fetch(`https://wger.de/api/v2/exerciseimage/?exercise_base=${baseId}&format=json`);
      if(imgRes.ok){
        const imgData = await imgRes.json();
        if(imgData.results && imgData.results.length > 0){
          imageUrl = imgData.results[0].image;
        }
      }
    }catch(err){ /* sin imagen, no pasa nada, seguimos con el texto */ }

    const guide = {
      name: suggestion.value || name,
      description: (suggestion.data.category || '').toString(),
      image: imageUrl,
      baseId
    };
    exerciseGuideCache[name] = guide;
    return guide;
  }catch(err){
    exerciseGuideCache[name] = null;
    return null;
  }
}

async function searchWgerExercise(name, language){
  const url = `https://wger.de/api/v2/exercise/search/?term=${encodeURIComponent(name)}&language=${language}&format=json`;
  const res = await fetch(url);
  if(!res.ok) throw new Error('network');
  const data = await res.json();
  if(data.suggestions && data.suggestions.length > 0) return data.suggestions[0];
  return null;
}

async function loadExerciseGuide(name){
  const loadingEl = document.getElementById('exerciseGuideLoading');
  const contentEl = document.getElementById('exerciseGuideContent');
  const emptyEl = document.getElementById('exerciseGuideEmpty');
  const imgEl = document.getElementById('exerciseGuideImg');

  loadingEl.hidden = false;
  contentEl.hidden = true;
  emptyEl.hidden = true;

  const guide = await fetchExerciseGuide(name);

  // el usuario pudo cerrar la sesión o cambiar de ejercicio mientras cargaba
  if(sessionExerciseIndex === null || !today.exercises[sessionExerciseIndex]) return;
  if(today.exercises[sessionExerciseIndex].name !== name) return;

  loadingEl.hidden = true;

  if(!guide){
    emptyEl.hidden = false;
    return;
  }

  contentEl.hidden = false;
  document.getElementById('exerciseGuideName').textContent = guide.name;
  document.getElementById('exerciseGuideDesc').textContent = guide.description
    ? `Categoría: ${guide.description}`
    : 'Ejercicio encontrado en la base de datos de wger.';

  if(guide.image){
    imgEl.src = guide.image;
    imgEl.hidden = false;
  } else {
    imgEl.hidden = true;
  }

  const linkEl = document.getElementById('exerciseGuideLink');
  if(guide.baseId){
    linkEl.href = `https://wger.de/en/exercise/${guide.baseId}/view/`;
    linkEl.hidden = false;
  } else {
    linkEl.hidden = true;
  }
}

function renderSessionSets(){
  if(sessionExerciseIndex === null) return;
  const ex = today.exercises[sessionExerciseIndex];
  if(!ex) return;
  const list = document.getElementById('sessionSetList');
  const tpl = document.getElementById('sessionSetRowTpl');
  list.innerHTML = '';

  if(!ex.sets || ex.sets.length === 0){
    const empty = document.createElement('p');
    empty.className = 'hint';
    empty.textContent = 'Todavía no has añadido ninguna serie.';
    list.appendChild(empty);
  } else {
    ex.sets.forEach((set, sIdx) => {
      const node = tpl.content.cloneNode(true);
      const row = node.querySelector('.session-set-row');
      row.classList.toggle('done', !!set.done);
      node.querySelector('.session-set-num').textContent = `S${sIdx + 1}`;
      const weightTxt = set.weight ? `${set.weight}kg × ` : '';
      node.querySelector('.session-set-info').textContent = `${weightTxt}${set.reps} reps`;
      node.querySelector('.session-set-tick').addEventListener('click', () => {
        set.done = !set.done;
        recomputeExerciseCountFromSets(sessionExerciseIndex);
        saveData(state);
        renderSessionSets();
        renderExercises();
        updateTrainingTotal();
        updateTrainingStreak();
        trainingCalendar.render();
        renderTrainingWeekChart();
      });
      node.querySelector('.session-set-remove').addEventListener('click', () => {
        ex.sets.splice(sIdx, 1);
        recomputeExerciseCountFromSets(sessionExerciseIndex);
        saveData(state);
        renderSessionSets();
        renderExercises();
        updateTrainingTotal();
        trainingCalendar.render();
        renderTrainingWeekChart();
      });
      list.appendChild(node);
    });
  }

  const doneReps = (ex.sets || []).filter(s => s.done).reduce((sum, s) => sum + (s.reps || 0), 0);
  document.getElementById('sessionVolumeText').textContent = `${doneReps} reps completadas hoy (${(ex.sets||[]).filter(s=>s.done).length} series)`;
}

async function addSessionSet(){
  if(sessionExerciseIndex === null) return;
  const ex = today.exercises[sessionExerciseIndex];
  const last = (state.exerciseLastSet && state.exerciseLastSet[ex.name]) || {};

  const fields = await showModal({
    title: `Nueva serie — ${ex.name}`,
    message: 'El peso es opcional (déjalo en blanco para ejercicios con peso corporal).',
    fields: [
      { key:'weight', label:'Peso (kg)', placeholder:'Ej. 20', type:'number', inputmode:'decimal', value: last.weight != null ? String(last.weight) : '' },
      { key:'reps', label:'Repeticiones', placeholder:'Ej. 12', type:'number', inputmode:'decimal', value: last.reps != null ? String(last.reps) : '' }
    ],
    confirmText: 'AÑADIR SERIE',
    cancelText: 'CANCELAR'
  });
  if(!fields) return;

  const reps = parseInt(fields.reps) || 0;
  if(reps <= 0) return;
  const weight = fields.weight ? (parseFloat(fields.weight.replace(',', '.')) || 0) : 0;

  if(!ex.sets) ex.sets = [];
  ex.sets.push({ id: Date.now().toString(36), weight, reps, done: false });

  if(!state.exerciseLastSet) state.exerciseLastSet = {};
  state.exerciseLastSet[ex.name] = { weight, reps };

  saveData(state);
  renderSessionSets();
}

function setupWorkoutSession(){
  document.getElementById('sessionCloseBtn').addEventListener('click', closeWorkoutSession);
  document.getElementById('sessionOverlay').addEventListener('click', (e) => {
    if(e.target.id === 'sessionOverlay') closeWorkoutSession();
  });
  document.getElementById('sessionAddSetBtn').addEventListener('click', addSessionSet);
}

/* ---------------- RUTINAS (PACKS DE ENTRENAMIENTO) ----------------
   Igual que los packs de comida: guarda una rutina (lista de ejercicios)
   una vez y añádela entera a la lista de hoy con un toque. Las reps de cada
   ejercicio siempre empiezan en 0 ese día — lo que se "recuerda" es la
   lista de ejercicios y, gracias al sistema de series, el último peso/reps
   usados de cada uno. */

function renderTrainingPacks(){
  const container = document.getElementById('trainingPackList');
  if(!container) return;
  const tpl = document.getElementById('trainingPackItemTpl');
  container.innerHTML = '';

  if(!state.exercisePacks || state.exercisePacks.length === 0){
    const empty = document.createElement('div');
    empty.className = 'pack-empty';
    empty.textContent = 'Aún no tienes rutinas guardadas.';
    container.appendChild(empty);
    return;
  }

  state.exercisePacks.forEach(pack => {
    const node = tpl.content.cloneNode(true);
    node.querySelector('.pack-item-name').textContent = pack.name;
    node.querySelector('.pack-item-contents').textContent = pack.items.join(' · ');

    node.querySelector('.pack-add-btn').addEventListener('click', () => addTrainingPackToToday(pack));

    node.querySelector('.pack-remove').addEventListener('click', () => {
      const index = state.exercisePacks.findIndex(p => p.id === pack.id);
      if(index === -1) return;
      state.exercisePacks.splice(index, 1);
      renderTrainingPacks();
      showUndoToast(
        `Rutina "${pack.name}" eliminada`,
        () => { state.exercisePacks.splice(index, 0, pack); renderTrainingPacks(); },
        () => { saveData(state); }
      );
    });

    container.appendChild(node);
  });
}

function addTrainingPackToToday(pack){
  const existingNames = today.exercises.map(e => e.name.toUpperCase());
  let added = 0;
  pack.items.forEach(name => {
    if(!existingNames.includes(name.toUpperCase())){
      today.exercises.push({ name, count: 0 });
      existingNames.push(name.toUpperCase());
      added++;
    }
  });
  saveData(state);
  renderExercises();
  updateTrainingTotal();
  updateTrainingStreak();
  trainingCalendar.render();
  renderTrainingWeekChart();

  showModal({
    title: 'Rutina añadida',
    message: added > 0
      ? `Se añadieron ${added} ejercicio${added===1?'':'s'} de "${pack.name}" a hoy. Los que ya tenías en la lista no se han duplicado.`
      : `Todos los ejercicios de "${pack.name}" ya estaban en tu lista de hoy.`,
    hideCancel: true, confirmText: 'ENTENDIDO'
  });
}

async function createTrainingPackFlow(){
  const name = await showModal({
    title: 'Nueva rutina',
    message: 'Ej. "Push Day", "Piernas fuego"...',
    input: true,
    placeholder: 'Nombre de la rutina',
    confirmText: 'SIGUIENTE'
  });
  if(!name) return;

  const items = [];
  let addingMore = true;

  while(addingMore){
    const exName = await showModal({
      title: items.length === 0 ? 'Primer ejercicio' : `Ejercicio ${items.length + 1}`,
      input: true,
      placeholder: 'Ej. SENTADILLAS',
      confirmText: 'AÑADIR',
      cancelText: items.length === 0 ? 'CANCELAR' : 'TERMINAR RUTINA'
    });
    if(!exName){
      if(items.length === 0) return;
      break;
    }
    items.push(exName.toUpperCase());

    const continueChoice = await showModal({
      title: `Rutina "${name}" — ${items.length} ejercicio${items.length===1?'':'s'}`,
      list: [
        { label: '➕ Añadir otro ejercicio', value: 'more' },
        { label: '✅ Terminar y guardar rutina', value: 'done' }
      ]
    });
    addingMore = continueChoice === 'more';
    if(!continueChoice) break;
  }

  if(items.length === 0) return;
  state.exercisePacks.push({ id: Date.now().toString(36), name, items });
  saveData(state);
  renderTrainingPacks();
}

document.getElementById('addTrainingPackBtn').addEventListener('click', createTrainingPackFlow);

function renderTrainingWeekChart(){
  const container = document.getElementById('trainingWeekChart');
  if(!container) return;
  const monday = getMonday(new Date());
  const todayStr = todayKey();

  const volumes = [];
  for(let i=0; i<7; i++){
    const d = new Date(monday);
    d.setDate(d.getDate() + i);
    const key = localDateKey(d);
    volumes.push({ date: key, vol: dayTrainingVolume(state.days[key]) });
  }
  const maxVol = Math.max(1, ...volumes.map(v => v.vol));

  container.innerHTML = '';
  volumes.forEach((v, idx) => {
    const col = document.createElement('div');
    col.className = 'week-bar-col';
    const track = document.createElement('div');
    track.className = 'week-bar-track';
    const bar = document.createElement('div');
    const pct = v.vol > 0 ? Math.max(6, Math.round((v.vol / maxVol) * 100)) : 0;
    bar.className = 'week-bar' + (v.vol === 0 ? ' empty' : '') + (v.date === todayStr ? ' today' : '');
    bar.style.height = pct + '%';
    bar.title = `${v.vol} reps`;
    track.appendChild(bar);
    const label = document.createElement('span');
    label.className = 'week-day-label' + (v.date === todayStr ? ' today' : '');
    label.textContent = DAY_LABELS[idx];
    col.appendChild(track);
    col.appendChild(label);
    container.appendChild(col);
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
    trainingCalendar.render();
    renderTrainingWeekChart();
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

function mealSlotMacros(slot){
  const entries = (today.mealLog && today.mealLog[slot]) || [];
  return entries.reduce((acc, e) => {
    acc.protein += (e.macros && e.macros.protein) || 0;
    acc.carbs += (e.macros && e.macros.carbs) || 0;
    acc.fat += (e.macros && e.macros.fat) || 0;
    return acc;
  }, { protein:0, carbs:0, fat:0 });
}

function formatMacros(macros){
  if(!macros) return '';
  const parts = [];
  if(macros.protein) parts.push(`P ${Math.round(macros.protein)}g`);
  if(macros.carbs) parts.push(`C ${Math.round(macros.carbs)}g`);
  if(macros.fat) parts.push(`G ${Math.round(macros.fat)}g`);
  return parts.join(' · ');
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
    node.querySelector('.meal-pack-btn').addEventListener('click', () => saveSlotAsPack(slot));

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
        const macrosTxt = formatMacros(entry.macros);
        if(macrosTxt){
          const macrosEl = document.createElement('span');
          macrosEl.className = 'meal-entry-macros';
          macrosEl.textContent = macrosTxt;
          eNode.querySelector('.meal-entry').appendChild(macrosEl);
        }
        eNode.querySelector('.meal-entry-remove').addEventListener('click', () => {
          const entryIndex = today.mealLog[slot].findIndex(e => e.id === entry.id);
          if(entryIndex === -1) return;
          today.mealLog[slot].splice(entryIndex, 1);
          renderMealSlots();
          updateKcalSummary();
          updateDietStatusTheme();
          renderMonthCalendar();

          showUndoToast(
            `"${entry.name}" eliminado de ${slot}`,
            () => {
              today.mealLog[slot].splice(entryIndex, 0, entry);
              renderMealSlots();
              updateKcalSummary();
              updateDietStatusTheme();
              renderMonthCalendar();
            },
            () => { saveData(state); }
          );
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

function parseFoodProduct(p){
  const n = p.nutriments || {};
  return {
    name: p.product_name,
    brand: p.brands ? p.brands.split(',')[0].trim() : '',
    barcode: p.code || null,
    kcalPer100g: n['energy-kcal_100g'] ? parseFloat(n['energy-kcal_100g']) : null,
    kcalPerServing: n['energy-kcal_serving'] ? parseFloat(n['energy-kcal_serving']) : null,
    proteinPer100g: n['proteins_100g'] ? parseFloat(n['proteins_100g']) : 0,
    proteinPerServing: n['proteins_serving'] ? parseFloat(n['proteins_serving']) : null,
    carbsPer100g: n['carbohydrates_100g'] ? parseFloat(n['carbohydrates_100g']) : 0,
    carbsPerServing: n['carbohydrates_serving'] ? parseFloat(n['carbohydrates_serving']) : null,
    fatPer100g: n['fat_100g'] ? parseFloat(n['fat_100g']) : 0,
    fatPerServing: n['fat_serving'] ? parseFloat(n['fat_serving']) : null,
    servingSize: p.serving_size || null
  };
}

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
  return products.slice(0, 5).map(parseFoodProduct);
}

async function lookupFoodByBarcode(barcode){
  const url = `https://world.openfoodfacts.org/api/v2/product/${encodeURIComponent(barcode)}.json`;
  const res = await fetch(url);
  if(!res.ok) throw new Error('network');
  const data = await res.json();
  if(data.status !== 1 || !data.product || !data.product.product_name) return null;
  return parseFoodProduct(data.product);
}

function pushMealEntry(slot, name, kcal, macros){
  pushMealEntries(slot, [{ name, kcal, macros }]);
}

// Versión "en bloque": añade varios alimentos a la vez a una franja con un
// único guardado (la usa tanto un pack completo como una entrada suelta).
function pushMealEntries(slot, items){
  if(!today.mealLog) today.mealLog = {};
  if(!today.mealLog[slot]) today.mealLog[slot] = [];
  items.forEach(item => {
    today.mealLog[slot].push({
      id: Date.now().toString(36) + Math.random().toString(36).slice(2,6),
      name: item.name,
      kcal: item.kcal,
      macros: item.macros || null,
      at: nowStamp()
    });
  });
  saveData(state);
  renderMealSlots();
  updateKcalSummary();
  updateDietStatusTheme();
  renderMonthCalendar();
}

/* ---------------- PACKS DE COMIDA ----------------
   Un pack es una comida completa (varios alimentos con sus kcal/macros)
   guardada una sola vez, para poder meterla entera en cualquier franja con
   un toque — sin volver a escribir cada componente cada día. */

function packTotalKcal(pack){
  return pack.items.reduce((sum, it) => sum + (it.kcal || 0), 0);
}

function renderPacks(){
  const container = document.getElementById('packList');
  if(!container) return;
  const tpl = document.getElementById('packItemTpl');
  container.innerHTML = '';

  if(!state.mealPacks || state.mealPacks.length === 0){
    const empty = document.createElement('div');
    empty.className = 'pack-empty';
    empty.textContent = 'Aún no tienes packs guardados.';
    container.appendChild(empty);
    return;
  }

  state.mealPacks.forEach(pack => {
    const node = tpl.content.cloneNode(true);
    node.querySelector('.pack-item-name').textContent = pack.name;
    node.querySelector('.pack-item-kcal').textContent = `${packTotalKcal(pack)} kcal`;
    node.querySelector('.pack-item-contents').textContent = pack.items.map(it => it.name).join(' · ');

    node.querySelector('.pack-add-btn').addEventListener('click', () => addPackToSlot(pack));

    node.querySelector('.pack-remove').addEventListener('click', () => {
      const index = state.mealPacks.findIndex(p => p.id === pack.id);
      if(index === -1) return;
      state.mealPacks.splice(index, 1);
      renderPacks();
      showUndoToast(
        `Pack "${pack.name}" eliminado`,
        () => { state.mealPacks.splice(index, 0, pack); renderPacks(); },
        () => { saveData(state); }
      );
    });

    container.appendChild(node);
  });
}

async function addPackToSlot(pack){
  const slot = await showModal({
    title: `Añadir "${pack.name}" a...`,
    list: MEAL_SLOTS.map(s => ({ label: s, value: s }))
  });
  if(!slot) return;
  pushMealEntries(slot, pack.items);
}

// Crea un pack desde cero: nombre + bucle de alimentos (kcal/macros a mano).
async function createMealPackFlow(){
  const name = await showModal({
    title: 'Nuevo pack',
    message: 'Ej. "Desayuno de fuerza", "Comida post-entreno"...',
    input: true,
    placeholder: 'Nombre del pack',
    confirmText: 'SIGUIENTE'
  });
  if(!name) return;

  const items = [];
  let addingMore = true;

  while(addingMore){
    const fields = await showModal({
      title: items.length === 0 ? 'Primer alimento' : `Alimento ${items.length + 1}`,
      message: 'Kcal y macros opcionales — solo se guarda lo que rellenes.',
      fields: [
        { key:'name', label:'Alimento', placeholder:'Ej. Avena con plátano' },
        { key:'kcal', label:'Kcal', placeholder:'Ej. 350', type:'number', inputmode:'decimal' },
        { key:'protein', label:'Proteína (g)', placeholder:'Ej. 20', type:'number', inputmode:'decimal' },
        { key:'carbs', label:'Carbohidratos (g)', placeholder:'Ej. 40', type:'number', inputmode:'decimal' },
        { key:'fat', label:'Grasas (g)', placeholder:'Ej. 8', type:'number', inputmode:'decimal' }
      ],
      confirmText: 'GUARDAR ALIMENTO',
      cancelText: items.length === 0 ? 'CANCELAR' : 'TERMINAR PACK'
    });

    if(!fields){
      if(items.length === 0) return; // se canceló sin añadir nada, no se crea el pack
      break;
    }
    if(!fields.name){
      break; // confirmó vacío = por si acaso, tratamos como fin
    }

    const macros = {
      protein: parseFloat((fields.protein || '').replace(',', '.')) || 0,
      carbs: parseFloat((fields.carbs || '').replace(',', '.')) || 0,
      fat: parseFloat((fields.fat || '').replace(',', '.')) || 0
    };
    const hasMacros = macros.protein || macros.carbs || macros.fat;

    items.push({
      name: fields.name,
      kcal: fields.kcal ? (parseFloat(fields.kcal.replace(',', '.')) || null) : null,
      macros: hasMacros ? macros : null
    });

    const continueChoice = await showModal({
      title: `Pack "${name}" — ${items.length} alimento${items.length===1?'':'s'}`,
      list: [
        { label: '➕ Añadir otro alimento', value: 'more' },
        { label: '✅ Terminar y guardar pack', value: 'done' }
      ]
    });
    addingMore = continueChoice === 'more';
    if(!continueChoice) break; // cerró el modal: terminamos igualmente con lo que haya
  }

  if(items.length === 0) return;

  state.mealPacks.push({ id: Date.now().toString(36), name, items });
  saveData(state);
  renderPacks();
}

// Atajo: convierte lo que ya has registrado hoy en una franja en un pack
// reutilizable, sin tener que volver a escribirlo todo.
async function saveSlotAsPack(slot){
  const entries = (today.mealLog && today.mealLog[slot]) || [];
  if(entries.length === 0){
    await showModal({
      title: 'Franja vacía',
      message: `Todavía no has registrado nada en ${slot} hoy.`,
      hideCancel: true, confirmText: 'ENTENDIDO'
    });
    return;
  }
  const name = await showModal({
    title: `Guardar ${slot} como pack`,
    message: `Se guardarán los ${entries.length} alimento${entries.length===1?'':'s'} de ${slot} de hoy como un pack reutilizable.`,
    input: true,
    inputValue: slot.charAt(0) + slot.slice(1).toLowerCase(),
    placeholder: 'Nombre del pack',
    confirmText: 'GUARDAR'
  });
  if(!name) return;

  const items = entries.map(e => ({ name: e.name, kcal: e.kcal, macros: e.macros || null }));
  state.mealPacks.push({ id: Date.now().toString(36), name, items });
  saveData(state);
  renderPacks();
}

document.getElementById('addPackBtn').addEventListener('click', createMealPackFlow);

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

  const macroFields = await showModal({
    title: 'Kcal y macros (todo opcional)',
    message: 'Déjalo en blanco lo que no sepas — solo se guarda lo que rellenes.',
    fields: [
      { key:'kcal', label:'Kcal', placeholder:'Ej. 450', type:'number', inputmode:'decimal' },
      { key:'protein', label:'Proteína (g)', placeholder:'Ej. 30', type:'number', inputmode:'decimal' },
      { key:'carbs', label:'Carbohidratos (g)', placeholder:'Ej. 40', type:'number', inputmode:'decimal' },
      { key:'fat', label:'Grasas (g)', placeholder:'Ej. 12', type:'number', inputmode:'decimal' }
    ],
    confirmText: 'GUARDAR',
    cancelText: 'CANCELAR'
  });
  if(!macroFields) return;

  const kcal = macroFields.kcal ? (parseFloat(macroFields.kcal.replace(',', '.')) || null) : null;
  const macros = {
    protein: parseFloat((macroFields.protein || '').replace(',', '.')) || 0,
    carbs: parseFloat((macroFields.carbs || '').replace(',', '.')) || 0,
    fat: parseFloat((macroFields.fat || '').replace(',', '.')) || 0
  };
  const hasMacros = macros.protein || macros.carbs || macros.fat;
  pushMealEntry(slot, name, kcal, hasMacros ? macros : null);
}

async function addMealEntry(slot){
  const mode = await showModal({
    title: `Añadir a ${slot}`,
    message: '¿Cómo quieres registrarlo?',
    list: [
      { label: '📷 Escanear código de barras <span class="list-btn-kcal">cámara, al instante</span>', value: 'scan' },
      { label: '🔍 Buscar producto <span class="list-btn-kcal">calcula kcal y macros solo</span>', value: 'search' },
      { label: '✍️ Añadir manualmente', value: 'manual' }
    ]
  });
  if(!mode) return;

  if(mode === 'manual'){
    await addMealEntryManual(slot);
    return;
  }

  if(mode === 'scan'){
    const product = await openBarcodeScanner();
    if(!product) return;
    if(product.manualFallback){
      await addMealEntryManual(slot);
      return;
    }
    await addProductToSlot(slot, product);
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

  await addProductToSlot(slot, picked);
}

// Común a "buscar producto" y "escanear código de barras": pide raciones y
// calcula kcal + macros a partir de los datos de Open Food Facts.
async function addProductToSlot(slot, picked){
  const perUnitKcal = picked.kcalPerServing || picked.kcalPer100g;
  const usingServing = !!picked.kcalPerServing;
  const unitLabel = usingServing
    ? `${Math.round(picked.kcalPerServing)} kcal por ración${picked.servingSize ? ' ('+picked.servingSize+')' : ''}`
    : `${Math.round(picked.kcalPer100g)} kcal por cada 100g`;

  const servingsRaw = await showModal({
    title: '¿Cuántas raciones?',
    message: `${picked.name}${picked.brand ? ' — ' + picked.brand : ''} — ${unitLabel}. Escribe cuántas raciones (o "100g") vas a tomar.`,
    input: true,
    inputValue: '1',
    placeholder: 'Ej. 1, 2, 0.5',
    confirmText: 'AÑADIR'
  });
  if(!servingsRaw) return;

  const servings = parseFloat(servingsRaw.replace(',', '.')) || 1;
  const totalKcal = Math.round(perUnitKcal * servings);
  const displayName = `${picked.name}${servings !== 1 ? ` ×${servings}` : ''}`;

  const proteinUnit = usingServing ? (picked.proteinPerServing ?? picked.proteinPer100g) : picked.proteinPer100g;
  const carbsUnit = usingServing ? (picked.carbsPerServing ?? picked.carbsPer100g) : picked.carbsPer100g;
  const fatUnit = usingServing ? (picked.fatPerServing ?? picked.fatPer100g) : picked.fatPer100g;

  const macros = {
    protein: Math.round((proteinUnit || 0) * servings * 10) / 10,
    carbs: Math.round((carbsUnit || 0) * servings * 10) / 10,
    fat: Math.round((fatUnit || 0) * servings * 10) / 10
  };
  const hasMacros = macros.protein || macros.carbs || macros.fat;

  pushMealEntry(slot, displayName, totalKcal, hasMacros ? macros : null);
}

/* ---------------- ESCÁNER DE CÓDIGO DE BARRAS (ZXing + Open Food Facts) ----------------
   ZXing (@zxing/library) es una librería open source y gratuita que lee
   códigos de barras directamente del vídeo de la cámara, sin depender de
   ninguna API nativa del navegador (por eso funciona también en iOS Safari,
   donde la BarcodeDetector nativa no existe). Cero claves, cero servidor. */

async function openBarcodeScanner(){
  if(typeof ZXing === 'undefined'){
    await showModal({
      title: 'Escáner no disponible',
      message: 'No se ha podido cargar el lector de códigos de barras (revisa tu conexión a internet la primera vez que lo uses) — prueba con "Buscar producto" mientras tanto.',
      hideCancel: true, confirmText: 'ENTENDIDO'
    });
    return null;
  }
  if(!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia){
    await showModal({
      title: 'Sin cámara',
      message: 'Este dispositivo o navegador no permite acceder a la cámara.',
      hideCancel: true, confirmText: 'ENTENDIDO'
    });
    return null;
  }

  const overlay = document.getElementById('scannerOverlay');
  const video = document.getElementById('scannerVideo');
  const statusEl = document.getElementById('scannerStatus');
  const closeBtn = document.getElementById('scannerCloseBtn');
  statusEl.textContent = 'Apunta al código de barras del producto...';
  overlay.hidden = false;

  const reader = new ZXing.BrowserMultiFormatReader();

  return new Promise((resolve) => {
    let settled = false;

    function cleanup(){
      try{ reader.reset(); }catch(err){ /* silencioso */ }
      overlay.hidden = true;
      closeBtn.removeEventListener('click', onCancel);
    }

    function onCancel(){
      if(settled) return;
      settled = true;
      cleanup();
      resolve(null);
    }
    closeBtn.addEventListener('click', onCancel);

    reader.decodeFromVideoDevice(undefined, video, async (result, err) => {
      if(settled || !result) return;
      settled = true;
      const barcode = result.getText();
      statusEl.textContent = `Código detectado: ${barcode}. Consultando...`;

      let product = null;
      try{
        product = await lookupFoodByBarcode(barcode);
      }catch(e){ /* sin conexión o fallo de red */ }

      cleanup();

      if(!product){
        const tryManual = await showModal({
          title: 'Producto no encontrado',
          message: `El código ${barcode} no está en la base de datos de Open Food Facts, o no se pudo consultar. ¿Quieres añadirlo a mano?`,
          confirmText: 'AÑADIR MANUAL',
          cancelText: 'CANCELAR'
        });
        resolve(tryManual ? { manualFallback: true } : null);
        return;
      }
      resolve(product);
    }).catch((err) => {
      if(settled) return;
      settled = true;
      cleanup();
      showModal({
        title: 'No se pudo abrir la cámara',
        message: 'Comprueba que le has dado permiso de cámara a la app (botón "PERMISOS") y que ninguna otra app la esté usando.',
        hideCancel: true, confirmText: 'ENTENDIDO'
      });
      resolve(null);
    });
  });
}

/* ---------------- MODO DIETA: RESUMEN KCAL Y ANILLO ---------------- */

function todayKcalConsumed(){
  if(!today.mealLog) return 0;
  return MEAL_SLOTS.reduce((sum, slot) => sum + mealSlotTotal(slot), 0);
}

function todayMacrosConsumed(){
  return MEAL_SLOTS.reduce((acc, slot) => {
    const m = mealSlotMacros(slot);
    acc.protein += m.protein;
    acc.carbs += m.carbs;
    acc.fat += m.fat;
    return acc;
  }, { protein:0, carbs:0, fat:0 });
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

  const macros = todayMacrosConsumed();
  const macroBox = document.getElementById('macroSummary');
  if(macroBox){
    const hasAnyMacro = macros.protein || macros.carbs || macros.fat;
    macroBox.hidden = !hasAnyMacro;
    if(hasAnyMacro){
      document.getElementById('macroProtein').textContent = `${Math.round(macros.protein)}g`;
      document.getElementById('macroCarbs').textContent = `${Math.round(macros.carbs)}g`;
      document.getElementById('macroFat').textContent = `${Math.round(macros.fat)}g`;
    }
  }
}

/* ---------------- ADHERENCIA: MOTOR GENÉRICO DE CALENDARIO ----------------
   Se usa tanto para el Modo Dieta (comidas/agua) como para Entrenamiento
   (ejercicios), cada uno con su propia función "¿este día cuenta?" y sus
   propios botones/rejilla en el DOM. */

function dayHasDietData(day){
  if(!day) return false;
  const hasMeals = day.mealLog && Object.values(day.mealLog).some(list => list && list.length > 0);
  const hasWater = (day.waterMl || 0) > 0;
  return !!(hasMeals || hasWater);
}

function dayHasTrainingData(day){
  if(!day) return false;
  return !!(day.exercises && day.exercises.some(e => e.count > 0));
}

function computeDayCalStatus(key, hasDataFn){
  const todayStr = todayKey();
  if(key > todayStr) return 'future';
  if(key < state.startDate) return 'before-start';
  const day = state.days[key];
  const hasData = hasDataFn(day);
  if(key === todayStr) return hasData ? 'good' : 'pending';
  return hasData ? 'good' : 'failed';
}

function createMonthCalendar(ids, hasDataFn, detailFn){
  const view = { year: null, month: null };

  function render(){
    const grid = document.getElementById(ids.grid);
    const label = document.getElementById(ids.label);
    if(!grid || view.year === null) return;

    const firstOfMonth = new Date(view.year, view.month, 1);
    const startWeekday = (firstOfMonth.getDay() + 6) % 7; // 0 = lunes
    const daysInMonth = new Date(view.year, view.month + 1, 0).getDate();

    label.textContent = firstOfMonth.toLocaleDateString('es-ES', { month:'long', year:'numeric' }).toUpperCase();

    grid.innerHTML = '';
    for(let i=0; i<startWeekday; i++){
      const cell = document.createElement('div');
      cell.className = 'cal-cell cal-empty';
      grid.appendChild(cell);
    }

    const todayStr = todayKey();
    for(let d=1; d<=daysInMonth; d++){
      const dateObj = new Date(view.year, view.month, d);
      const key = localDateKey(dateObj);
      const status = computeDayCalStatus(key, hasDataFn);
      const cell = document.createElement('div');
      cell.className = `cal-cell cal-${status}`;
      if(key === todayStr) cell.classList.add('cal-today');
      cell.textContent = d;
      if(status !== 'future' && status !== 'before-start'){
        cell.classList.add('cal-clickable');
        cell.addEventListener('click', () => showDayDetail(key, dateObj, status, detailFn));
      }
      grid.appendChild(cell);
    }

    const realNow = new Date();
    const isCurrentMonth = (view.year === realNow.getFullYear() && view.month === realNow.getMonth());
    document.getElementById(ids.nextBtn).disabled = isCurrentMonth;
  }

  function setup(){
    const now = new Date();
    view.year = now.getFullYear();
    view.month = now.getMonth();

    document.getElementById(ids.prevBtn).addEventListener('click', () => {
      view.month--;
      if(view.month < 0){ view.month = 11; view.year--; }
      render();
    });

    document.getElementById(ids.nextBtn).addEventListener('click', () => {
      const realNow = new Date();
      if(view.year === realNow.getFullYear() && view.month === realNow.getMonth()) return;
      view.month++;
      if(view.month > 11){ view.month = 0; view.year++; }
      render();
    });

    render();
  }

  return { setup, render };
}

// Resumen que se muestra al tocar un día del calendario
function dietDayDetail(day){
  const lines = [];
  MEAL_SLOTS.forEach(slot => {
    const entries = (day && day.mealLog && day.mealLog[slot]) || [];
    if(entries.length){
      const txt = entries.map(e => e.name + (e.kcal ? ` (${e.kcal} kcal)` : '')).join(', ');
      lines.push(`${slot}: ${txt}`);
    }
  });
  const waterMl = (day && day.waterMl) || 0;
  lines.push(`Agua: ${(waterMl/1000).toFixed(2)}L`);
  return lines;
}

function trainingDayDetail(day){
  const exs = ((day && day.exercises) || []).filter(e => e.count > 0);
  if(exs.length === 0) return [];
  return exs.map(e => `${e.name}: ${e.count}`);
}

function showDayDetail(key, dateObj, status, detailFn){
  const day = state.days[key];
  const dateLabel = dateObj.toLocaleDateString('es-ES', { weekday:'long', day:'numeric', month:'long' });
  const lines = detailFn(day);
  const message = lines.length
    ? lines.join('\n')
    : (status === 'failed' ? 'No hay ningún registro guardado este día.' : 'Aún no has registrado nada hoy.');
  showModal({
    title: dateLabel.charAt(0).toUpperCase() + dateLabel.slice(1),
    message,
    hideCancel: true,
    confirmText: 'CERRAR'
  });
}

const dietCalendar = createMonthCalendar(
  { grid:'calGrid', label:'calMonthLabel', prevBtn:'calPrevBtn', nextBtn:'calNextBtn' },
  dayHasDietData,
  dietDayDetail
);
const trainingCalendar = createMonthCalendar(
  { grid:'calGridTraining', label:'calMonthLabelTraining', prevBtn:'calPrevBtnTraining', nextBtn:'calNextBtnTraining' },
  dayHasTrainingData,
  trainingDayDetail
);

function renderMonthCalendar(){ dietCalendar.render(); trainingCalendar.render(); }
function setupMonthCalendar(){ dietCalendar.setup(); trainingCalendar.setup(); }

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

/* ---------------- MOTIVACIÓN PERSONAL (PINS) ---------------- */

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
    img.alt = pin.caption || 'Pin de Motivación Personal';
    img.addEventListener('click', () => openLightbox(pin));
    node.querySelector('.pin-caption').textContent = pin.caption || pin.date;
    node.querySelector('.pin-remove').addEventListener('click', () => {
      const index = state.pins.findIndex(p => p.id === pin.id);
      if(index === -1) return;
      state.pins.splice(index, 1);
      renderPins();

      showUndoToast(
        'Pin eliminado de Motivación Personal',
        () => {
          state.pins.splice(index, 0, pin);
          renderPins();
        },
        () => { saveData(state); }
      );
    });
    grid.appendChild(node);
  });
}

function openLightbox(pin){
  document.getElementById('lightboxImg').src = pin.dataUrl;
  const caption = document.getElementById('lightboxCaption');
  caption.textContent = pin.caption || pin.date;
  document.getElementById('lightboxOverlay').hidden = false;
}

function closeLightbox(){
  document.getElementById('lightboxOverlay').hidden = true;
}

function setupLightbox(){
  document.getElementById('lightboxCloseBtn').addEventListener('click', closeLightbox);
  document.getElementById('lightboxOverlay').addEventListener('click', (e) => {
    if(e.target.id === 'lightboxOverlay') closeLightbox();
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
      allEntries.push({ date: dateKey, entry });
    });
  });
  allEntries.slice(0, 20).forEach(({ date, entry }) => {
    const div = document.createElement('div');
    div.className = 'log-entry';
    const time = document.createElement('time');
    time.textContent = `${date} — ${entry.hour}`;
    div.appendChild(time);
    const p = document.createElement('span');
    p.textContent = entry.text;
    div.appendChild(p);

    const removeBtn = document.createElement('button');
    removeBtn.className = 'log-entry-remove';
    removeBtn.textContent = '×';
    removeBtn.title = 'Eliminar nota';
    removeBtn.addEventListener('click', () => {
      const dayLogs = state.days[date] && state.days[date].logs;
      if(!dayLogs) return;
      const idx = dayLogs.indexOf(entry);
      if(idx === -1) return;
      dayLogs.splice(idx, 1);
      renderLogHistory();
      showUndoToast(
        'Nota de bitácora eliminada',
        () => { dayLogs.splice(idx, 0, entry); renderLogHistory(); },
        () => { saveData(state); }
      );
    });
    div.appendChild(removeBtn);

    container.appendChild(div);
  });
}

document.getElementById('saveNoteBtn').addEventListener('click', () => {
  const textarea = document.getElementById('logNote');
  const text = textarea.value.trim();
  if(!text) return;
  if(!today.logs) today.logs = [];
  today.logs.unshift({ id: Date.now().toString(36), text, hour: nowStamp() });
  saveData(state);
  textarea.value = '';
  const flag = document.getElementById('saveFlag');
  flag.textContent = 'REGISTRADO EN LA BITÁCORA';
  flag.classList.add('show');
  setTimeout(() => flag.classList.remove('show'), 2000);
  renderLogHistory();
});

/* ---------------- SWIPE ENTRE PANTALLAS (WAYNE PROTOCOL <-> MODO DIETA) ---------------- */

let wayneGoToScreen = null; // se rellena en setupSwipe(); lo usa la Bottom Hot Bar

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
    updateHotBarActiveState(screenName);
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

  window.addEventListener('resize', () => snapTo(activeScreen, false));

  wayneGoToScreen = snapTo;
  snapTo('main', false);
}

/* ---------------- BOTTOM HOT BAR ---------------- */

function updateHotBarActiveState(screenName){
  document.querySelectorAll('.hot-btn[data-target]').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.target === screenName);
  });
}

function setupHotBar(){
  document.getElementById('hotTrainingBtn').addEventListener('click', () => {
    closeSheet('profileOverlay');
    closeSheet('socialOverlay');
    if(wayneGoToScreen) wayneGoToScreen('main');
  });

  document.getElementById('hotDietBtn').addEventListener('click', () => {
    closeSheet('profileOverlay');
    closeSheet('socialOverlay');
    if(wayneGoToScreen) wayneGoToScreen('diet');
  });

  document.getElementById('hotSocialBtn').addEventListener('click', () => openSheet('socialOverlay'));
  document.getElementById('hotProfileBtn').addEventListener('click', () => openSheet('profileOverlay'));

  document.getElementById('hotPlusBtn').addEventListener('click', openQuickAddMenu);

  updateHotBarActiveState('main');
}

async function openQuickAddMenu(){
  const choice = await showModal({
    title: 'Añadir rápido',
    list: [
      { label: '✅ Protocolo diario', value: 'habit' },
      { label: '🏋️ Ejercicio', value: 'exercise' },
      { label: '🍽️ Comida', value: 'meal' },
      { label: '📌 Pin a Motivación Personal', value: 'pin' }
    ]
  });
  if(!choice) return;

  if(choice === 'habit'){
    document.getElementById('addHabitBtn').click();
  } else if(choice === 'exercise'){
    if(wayneGoToScreen) wayneGoToScreen('main');
    document.getElementById('addExerciseBtn').click();
  } else if(choice === 'meal'){
    if(wayneGoToScreen) wayneGoToScreen('diet');
    const slot = await showModal({
      title: '¿A qué franja?',
      list: MEAL_SLOTS.map(s => ({ label: s, value: s }))
    });
    if(slot) addMealEntry(slot);
  } else if(choice === 'pin'){
    if(wayneGoToScreen) wayneGoToScreen('main');
    document.getElementById('addPinBtn').click();
  }
}

function openSheet(id){
  if(id === 'profileOverlay') renderProfileSheet();
  document.getElementById(id).hidden = false;
}

function closeSheet(id){
  document.getElementById(id).hidden = true;
}

/* ---------------- PERFIL DE INVITADO (100% local, sin servidor) ----------------
   No hay backend: esto NO es una cuenta real ni es visible por nadie más.
   Es solo una identidad local con foto y @handle aleatorio, pensada como
   cimiento para un futuro sistema de perfiles/Social de verdad. */

const HANDLE_ADJECTIVES = ['dark','night','shadow','silent','stone','iron','steel','swift','grim','quiet'];
const HANDLE_NOUNS = ['knight','wing','bat','falcon','wayne','gotham','vigil','raven','ghost','sentinel'];

function generateRandomHandle(){
  const a = HANDLE_ADJECTIVES[Math.floor(Math.random() * HANDLE_ADJECTIVES.length)];
  const n = HANDLE_NOUNS[Math.floor(Math.random() * HANDLE_NOUNS.length)];
  const num = Math.floor(Math.random() * 900 + 100);
  return `@${a}_${n}${num}`;
}

function ensureGuestProfile(){
  if(!state.profileMeta){
    state.profileMeta = {
      handle: generateRandomHandle(),
      avatarDataUrl: null
    };
    saveData(state);
  }
}

function renderProfileSheet(){
  ensureGuestProfile();
  document.getElementById('profileHandleText').textContent = state.profileMeta.handle;
  document.getElementById('profileAvatarImg').src = state.profileMeta.avatarDataUrl || 'icon.svg';

  document.getElementById('profileStatDay').textContent =
    document.getElementById('dayCounter').textContent.replace('DÍA ', '').replace(/^0+/, '') || '1';
  document.getElementById('profileStatStreak').textContent =
    (document.getElementById('streakText').textContent.match(/\d+/) || ['0'])[0];
  document.getElementById('profileStatPins').textContent = (state.pins || []).length;

  renderProfileSummary();
  renderPins();
}

// Resumen a largo plazo: recorre TODO el historial guardado (no solo la
// semana actual) para dar una foto de cómo vas con perspectiva de tiempo.
function computeLongTermStats(){
  const dayKeys = Object.keys(state.days).sort();
  const totalDaysActive = dayKeys.filter(k => {
    const d = state.days[k];
    return habitDayComplete(d) || dayTrainingVolume(d) > 0 || dayHasDietData(d);
  }).length;

  let bestHabitStreak = 0, curHabit = 0;
  let bestTrainingStreak = 0, curTraining = 0;
  let totalWorkouts = 0;
  let habitPctSum = 0, habitPctCount = 0;

  dayKeys.forEach(key => {
    const day = state.days[key];
    if(habitDayComplete(day)){ curHabit++; bestHabitStreak = Math.max(bestHabitStreak, curHabit); }
    else { curHabit = 0; }

    const vol = dayTrainingVolume(day);
    if(vol > 0){ curTraining++; bestTrainingStreak = Math.max(bestTrainingStreak, curTraining); totalWorkouts++; }
    else { curTraining = 0; }

    const pct = habitPercentForDay(day);
    if(pct !== null){ habitPctSum += pct; habitPctCount++; }
  });

  const avgHabitPct = habitPctCount ? Math.round(habitPctSum / habitPctCount) : 0;

  return {
    memberSince: state.startDate,
    totalDaysActive,
    bestHabitStreak,
    bestTrainingStreak,
    totalWorkouts,
    avgHabitPct
  };
}

function renderProfileSummary(){
  const grid = document.getElementById('profileSummaryGrid');
  if(!grid) return;
  const s = computeLongTermStats();
  const chips = [
    { label: 'MIEMBRO DESDE', value: s.memberSince },
    { label: 'DÍAS ACTIVOS', value: s.totalDaysActive },
    { label: 'MEJOR RACHA HÁBITOS', value: `${s.bestHabitStreak} días` },
    { label: 'MEJOR RACHA ENTRENO', value: `${s.bestTrainingStreak} días` },
    { label: 'ENTRENAMIENTOS TOTALES', value: s.totalWorkouts },
    { label: 'MEDIA DE HÁBITOS', value: `${s.avgHabitPct}%` }
  ];
  grid.innerHTML = '';
  chips.forEach(c => {
    const chip = document.createElement('div');
    chip.className = 'profile-summary-chip';
    const span = document.createElement('span');
    span.textContent = c.label;
    const strong = document.createElement('strong');
    strong.textContent = c.value;
    chip.appendChild(span);
    chip.appendChild(strong);
    grid.appendChild(chip);
  });
}

// Cualquiera puede ponerse el @ que quiera — no hay verificación real
// (eso necesitaría una cuenta vinculada de verdad, ver Roadmap), así que se
// dice explícitamente en la propia pantalla para no generar confusión.
async function editProfileHandle(){
  ensureGuestProfile();
  const raw = await showModal({
    title: 'Cambiar tu @',
    message: 'Elige el @ que quieras. No está verificado por Google — es solo tu identificador local.',
    input: true,
    inputValue: state.profileMeta.handle.replace(/^@/, ''),
    placeholder: 'tu_usuario',
    confirmText: 'GUARDAR'
  });
  if(!raw) return;

  const clean = raw.trim().toLowerCase().replace(/[^a-z0-9_]/g, '').slice(0, 24);
  if(!clean){
    await showModal({
      title: 'Nombre no válido',
      message: 'Usa solo letras, números y guiones bajos.',
      hideCancel: true, confirmText: 'ENTENDIDO'
    });
    return;
  }

  state.profileMeta.handle = `@${clean}`;
  saveData(state);
  document.getElementById('profileHandleText').textContent = state.profileMeta.handle;
}

function setupProfileSheet(){
  document.getElementById('profileCloseBtn').addEventListener('click', () => closeSheet('profileOverlay'));
  document.getElementById('socialCloseBtn').addEventListener('click', () => closeSheet('socialOverlay'));

  document.getElementById('profileHandle').addEventListener('click', editProfileHandle);

  document.getElementById('profileAvatarEditBtn').addEventListener('click', () => {
    document.getElementById('profileAvatarInput').click();
  });

  document.getElementById('profileAvatarInput').addEventListener('change', async (e) => {
    const file = e.target.files[0];
    if(!file) return;
    try{
      const dataUrl = await fileToCompressedDataUrl(file);
      ensureGuestProfile();
      state.profileMeta.avatarDataUrl = dataUrl;
      saveData(state);
      document.getElementById('profileAvatarImg').src = dataUrl;
    }catch(err){
      await showModal({
        title: 'No se pudo cambiar la foto',
        message: 'Prueba con otra imagen.',
        hideCancel: true, confirmText: 'ENTENDIDO'
      });
    }
    e.target.value = '';
  });

  document.getElementById('profileGoogleBtn').addEventListener('click', startGoogleLink);
}

/* ---------------- VINCULACIÓN CON GOOGLE (Google Identity Services) ----------------
   Implementación REAL, no una simulación: usa la librería oficial de Google
   (accounts.google.com/gsi/client), 100% en el navegador, sin backend. Lo
   único que falta para que funcione de verdad es un Client ID de Google
   Cloud, que solo el propio dueño de la app puede crear (son credenciales
   ligadas a su cuenta de Google). Instrucciones completas en el README.

   Mientras GOOGLE_CLIENT_ID no esté configurado, el botón lo explica en
   vez de fingir que funciona. */

const GOOGLE_CLIENT_ID = '926885443193-n75bg3q6crlkfiu5gikgm5otnlhg3plc.apps.googleusercontent.com';

function googleClientConfigured(){
  return GOOGLE_CLIENT_ID && !GOOGLE_CLIENT_ID.startsWith('926885443193-n75bg3q6crlkfiu5gikgm5otnlhg3plc.apps.googleusercontent.com');
}

// Decodifica el id_token (JWT) para leer nombre/foto/email. Es una lectura
// simple en el propio navegador, sin verificar la firma — suficiente para
// una app personal sin backend que la valide; no se usa para nada sensible.
function decodeGoogleJWT(token){
  try{
    const payload = token.split('.')[1];
    const json = decodeURIComponent(atob(payload.replace(/-/g, '+').replace(/_/g, '/'))
      .split('').map(c => '%' + c.charCodeAt(0).toString(16).padStart(2, '0')).join(''));
    return JSON.parse(json);
  }catch(err){
    return null;
  }
}

async function handleGoogleCredentialResponse(response){
  const profile = decodeGoogleJWT(response.credential);
  if(!profile){
    await showModal({
      title: 'No se pudo leer tu cuenta',
      message: 'Google devolvió una respuesta que no se pudo procesar. Inténtalo de nuevo.',
      hideCancel: true, confirmText: 'ENTENDIDO'
    });
    return;
  }

  const wantsPhoto = await showModal({
    title: '🔗 Vincular con Google',
    message: `Hola, ${profile.name || 'usuario'}. ¿Quieres usar tu foto de perfil de Google (${profile.email}) en el Wayne Protocol?`,
    confirmText: 'USAR MI FOTO',
    cancelText: 'AHORA NO'
  });

  ensureGuestProfile();
  if(wantsPhoto && profile.picture){
    state.profileMeta.avatarDataUrl = profile.picture;
    document.getElementById('profileAvatarImg').src = profile.picture;
  }

  const wantsEmails = await showModal({
    title: '📧 Correos sobre la app',
    message: '¿Quieres recibir correos de Wayne Protocol (novedades, avisos)? Puedes cambiar esto cuando quieras.',
    confirmText: 'SÍ, QUIERO',
    cancelText: 'NO, GRACIAS'
  });

  state.profileMeta.googleLinked = true;
  state.profileMeta.googleEmail = profile.email || null;
  state.profileMeta.emailOptIn = !!wantsEmails;
  saveData(state);

  await showModal({
    title: '✅ Cuenta vinculada',
    message: wantsEmails
      ? 'Listo. Tu cuenta de Google está vinculada y recibirás correos sobre la app.'
      : 'Listo. Tu cuenta de Google está vinculada. No recibirás correos.',
    hideCancel: true, confirmText: 'GENIAL'
  });
}

function startGoogleLink(){
  if(!googleClientConfigured()){
    showModal({
      title: '🔗 Vincular con Google — falta configurar',
      message: 'El código ya está preparado y funciona de verdad, pero necesita un Client ID de Google Cloud propio (son credenciales ligadas a tu cuenta, nadie puede crearlas por ti). Busca "GOOGLE_CLIENT_ID" en app.js y sigue las instrucciones del README para conseguir el tuyo gratis en unos minutos.',
      hideCancel: true, confirmText: 'ENTENDIDO'
    });
    return;
  }
  if(typeof google === 'undefined' || !google.accounts){
    showModal({
      title: 'Google no disponible',
      message: 'No se pudo cargar la librería de Google (revisa tu conexión) o el navegador la está bloqueando.',
      hideCancel: true, confirmText: 'ENTENDIDO'
    });
    return;
  }
  google.accounts.id.initialize({
    client_id: GOOGLE_CLIENT_ID,
    callback: handleGoogleCredentialResponse
  });
  google.accounts.id.prompt();
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
   archivos (el mismo que ya usa Motivación Personal) no requiere ningún
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
        message: 'Ya están activadas. Alfred, Dick Grayson y Bruce te avisarán como mucho dos veces al día (mañana y noche) si se te olvida registrar algo. Usa "🧪 Probar notificación" para comprobar que te llegan bien.',
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
        message: 'Las tienes bloqueadas a nivel de navegador. Si cambias de opinión, actívalas desde los ajustes del propio sitio (icono de candado/ⓘ en la barra de direcciones) y luego recarga la app.',
        hideCancel: true, confirmText: 'ENTENDIDO'
      });
    }
    return;
  }

  // IMPORTANTE: Notification.requestPermission() se dispara dentro de
  // onConfirmSync, es decir, de forma SÍNCRONA en el mismo click del botón
  // "ACTIVAR" — no después de un await. Ver el comentario en
  // setupModalSystem() para el porqué exacto de esto.
  await showModal({
    title: '🔔 Notificaciones',
    message: 'Alfred, Dick Grayson y Bruce quieren mandarte como mucho 2 avisos al día (mañana y ~23:00) solo si se te olvida registrar algo. ¿Los activamos?',
    confirmText: 'ACTIVAR',
    cancelText: 'AHORA NO',
    onConfirmSync: () => {
      Notification.requestPermission().then((result) => {
        if(result === 'granted'){
          registerPeriodicSyncBestEffort();
          showModal({
            title: '🔔 ¡Activadas!',
            message: 'Prueba a tocar "🧪 Probar notificación" en el menú de Permisos para comprobar que te llega bien en este dispositivo.',
            hideCancel: true, confirmText: 'GENIAL'
          });
        } else if(result === 'denied'){
          showModal({
            title: '🔔 Permiso denegado',
            message: 'Sin problema. Si cambias de opinión más adelante, puedes volver a intentarlo desde el botón "PERMISOS".',
            hideCancel: true, confirmText: 'VALE'
          });
        }
      }).catch(() => {});
    }
  });
}

async function requestCameraPermission(){
  if(!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia){
    return;
  }
  await showModal({
    title: '📷 Cámara',
    message: 'Para escanear códigos de barras de productos hace falta tu cámara. ¿Damos el permiso ya?',
    confirmText: 'PERMITIR',
    cancelText: 'AHORA NO',
    onConfirmSync: () => {
      navigator.mediaDevices.getUserMedia({ video: true }).then((stream) => {
        stream.getTracks().forEach(t => t.stop());
        showModal({
          title: '📷 Cámara lista',
          message: 'Permiso concedido. Ya puedes usar "Escanear código de barras" en el registro de comidas.',
          hideCancel: true, confirmText: 'GENIAL'
        });
      }).catch(() => {
        // el usuario denegó o no hay cámara disponible; no insistimos
      });
    }
  });
}

async function explainGalleryAccess(){
  await showModal({
    title: '🖼️ Galería',
    message: 'En un navegador web no existe un permiso de "galería" aparte: al pulsar "+" en Motivación Personal, el propio sistema te enseña tu carpeta de fotos sin pedir nada extra. Aquí no hay nada que activar.',
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

// Envía una notificación de forma robusta: si el Service Worker no está
// listo en 1.5s (registro fallido, scope incorrecto, etc.) no nos quedamos
// colgados esperando para siempre — caemos a la API Notification directa,
// que no depende del Service Worker en absoluto.
async function fireReminderNotification(title, body){
  if(!('Notification' in window) || Notification.permission !== 'granted') return false;

  if('serviceWorker' in navigator && navigator.serviceWorker.controller){
    try{
      const reg = await Promise.race([
        navigator.serviceWorker.ready,
        new Promise((_, reject) => setTimeout(() => reject(new Error('sw-timeout')), 1500))
      ]);
      await reg.showNotification(title, { body, icon: 'icon.svg', badge: 'icon.svg', tag: 'wayne-reminder' });
      return true;
    }catch(err){
      console.warn('Wayne Protocol: showNotification vía Service Worker falló o tardó demasiado, uso Notification directa.', err);
    }
  }

  try{
    new Notification(title, { body, icon: 'icon.svg' });
    return true;
  }catch(err){
    console.error('Wayne Protocol: no se pudo mostrar ninguna notificación.', err);
    return false;
  }
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
  const sent = await fireReminderNotification(title, body);
  if(sent) localStorage.setItem(flagKey, '1');
}

/* ---------------- INDICADOR DE CONEXIÓN (offline-first) ----------------
   Todo lo esencial de la app (hábitos, entreno, dieta, pins, bitácora...)
   ya funciona 100% sin conexión porque vive en localStorage, que es local al
   dispositivo por naturaleza — no hace falta "activar" nada para eso. Lo
   único que de verdad necesita internet es: la búsqueda de alimentos, el
   escáner de código de barras (consulta a Open Food Facts) y la primera
   carga de fuentes/librerías externas. Este aviso es solo para que sepas
   por qué esas dos cosas concretas pueden fallar si no tienes red. */

function updateOfflineBanner(){
  const banner = document.getElementById('offlineBanner');
  if(!banner) return;
  banner.hidden = navigator.onLine;
}

function setupOfflineIndicator(){
  updateOfflineBanner();
  window.addEventListener('online', updateOfflineBanner);
  window.addEventListener('offline', updateOfflineBanner);
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
  renderTrainingPacks();
  renderMealSlots();
  renderPacks();
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
  renderTrainingWeekChart();
  updateRadar();
  updateDayCounter();
  updateStreak();
  updateWeekly();
}

setupModalSystem();
setupCelebration();
setupLightbox();
setupUndoToast();
setupHiddenReset();
setupSwipe();
setupHotBar();
setupProfileSheet();
setupWorkoutSession();
setupBackup();
setupMonthCalendar();
setupOfflineIndicator();
renderAll();
tickClock();
maybeSendReminder();
setInterval(tickClock, 1000);
setTimeout(runOnboarding, 800);

/* ---------------- TEMAS OCULTOS: BATGIRL, YMIR, SPIDEY Y NOCTURNE ---------------- */

const THEME_KEY = 'wayneProtocolTheme';

function applyTheme(theme){
  document.body.classList.toggle('theme-batgirl', theme === 'batgirl');
  document.body.classList.toggle('theme-ymir', theme === 'ymir');
  document.body.classList.toggle('theme-spidey', theme === 'spidey');
  document.body.classList.toggle('theme-nocturne', theme === 'nocturne');
}

(function initTheme(){
  let saved = localStorage.getItem(THEME_KEY) || 'default';
  // migración silenciosa: quien ya hubiera activado el antiguo tema "elite"
  // (renombrado a "ymir") no pierde su elección al actualizar.
  if(saved === 'elite'){
    saved = 'ymir';
    localStorage.setItem(THEME_KEY, saved);
  }
  applyTheme(saved);
})();

// Patrón genérico: tocar 3 veces (en menos de 1.2s) una letra concreta de
// "W.A.Y.N.E" alterna entre el tema por defecto y el tema oculto asociado.
// Si estaba activo el OTRO tema oculto, este lo sustituye (solo uno a la vez).
function setupHiddenThemeTrigger(elementId, themeName){
  const trigger = document.getElementById(elementId);
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
      const next = current === themeName ? 'default' : themeName;
      localStorage.setItem(THEME_KEY, next);
      applyTheme(next);
    }
  });
}

setupHiddenThemeTrigger('batgirlTrigger', 'batgirl');
setupHiddenThemeTrigger('ymirTrigger', 'ymir');
setupHiddenThemeTrigger('spideyTrigger', 'spidey');
setupHiddenThemeTrigger('nocturneTrigger', 'nocturne');

/* ---------------- SERVICE WORKER (PWA offline) ---------------- */
if('serviceWorker' in navigator){
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('sw.js').catch(() => {
      /* silencioso: si falla el registro, la app sigue funcionando online */
    });
  });
}
