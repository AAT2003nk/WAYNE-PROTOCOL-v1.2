# WAYNE PROTOCOL v2.1

Bat-terminal personal: hábitos diarios, entrenamiento, dieta con macros, bitácora, Motivación Personal (fotos) y perfil de invitado — todo local, sin servidor, sin cuentas reales (todavía).

> Este archivo se llamaba `LEEME.md`. A partir de esta versión pasa a llamarse `README.md`.

## Archivos del proyecto
- `index.html` — estructura de la app (dos pantallas: Wayne Protocol + Modo Dieta, más las pantallas superpuestas de Perfil/Social)
- `style.css` — estética batcomputadora + tema oculto Batgirl (rosa) + tema oculto **Ymir** (violeta/cian, antes llamado "Elite")
- `app.js` — toda la lógica
- `manifest.json`, `icon.svg`, `sw.js` — la parte PWA instalable

## Instalación (GitHub Pages)
1. Sube estos archivos a la raíz de un repositorio de GitHub.
2. **Settings → Pages** → rama `main`, carpeta `/root`. Guarda.
3. Abre la URL que te da desde el móvil → "Añadir a pantalla de inicio" (Android: menú ⋮; iOS: compartir).

---

## Qué hay en v2.0

### 🍽️ Nutrición
- **Packs de comida**: guarda una comida completa (varios alimentos con kcal/macros) una sola vez y añádela entera a cualquier franja con un toque. También puedes convertir lo que ya registraste hoy en una franja en un pack con el botón 💾.
- Registro de comidas con búsqueda automática (Open Food Facts) o escáner de código de barras — **el escáner ya no tiene un panel aparte**, vive integrado dentro de "añadir comida" para no duplicar el mismo botón dos veces.
- Macros (proteína/carbohidratos/grasas) por alimento y resumen diario.
- Calculadora de objetivo calórico (BMR/TDEE, Mifflin-St Jeor).
- Calendario de adherencia mensual — **toca cualquier día** para ver un resumen de qué comiste y cuánta agua bebiste ese día.
- El panel entero cambia de color (verde si vas bien, rojo si llevas 2+ días sin registrar nada).

### 🏋️ Entrenamiento
- Registro de ejercicios con contador de reps, racha y calendario mensual — **toca cualquier día** para ver qué ejercicios hiciste.
- **Récords personales (PR)**: cada ejercicio recuerda tu mejor marca histórica y muestra una insignia 🏆 cuando estás en tu mejor día.
- **Gráfico de volumen semanal**: barras Lunes-Domingo con el total de repeticiones de cada día, para ver de un vistazo si la semana va a más o a menos.
- Gamificación estilo Duolingo: al completar el 100% de tus protocolos o todos los ejercicios del día, aparece una animación con la semana (L-D) marcada. Insignias de racha (🔥🥉🥈🥇💎👑) según los días consecutivos.

### 🧭 Bottom Hot Bar
Sustituye a los antiguos botones de deslizar por los bordes. Cinco accesos fijos abajo: **Social** · **Entreno** · **+ (añadir rápido)** · **Dietas** · **Perfil**. El gesto de swipe entre Wayne Protocol y Modo Dieta se mantiene intacto — la hot bar es un atajo adicional, no lo sustituye.

### 👤 Perfil (invitado)
Accesible desde la Hot Bar. Cuenta 100% local y anónima: @handle generado al azar (estilo Instagram, ej. `@dark_knight482`) y foto de perfil personalizable. Sin registro, sin servidor. Incluye un botón "Vincular con Google" ya visible pero todavía inactivo — ver Roadmap.

### 📌 Motivación Personal
Antes "Salón de la Fama". Mismo sistema de fotos con captions, ahora con **lightbox**: toca una foto para verla en grande con el título bien legible.

### 🎨 Temas ocultos: Ymir y Batgirl · edición Ymir
El tema violeta/cian (antes llamado "Elite" en código, renombrado para evitar cualquier parecido con nombres de otras apps) se activa igual que siempre: 3 toques en la "Y" de W.A.Y.N.E. Y ahora el tema rosa **Batgirl** (3 toques en la "E") comparte el mismo pulido: glass-blur en tarjetas y modales, transiciones tipo spring, todo más suave — la paleta rosa/pastel no cambia, solo el acabado. Ambos siguen siendo experimentales y solo afectan a esas dos pieles ocultas; **la UX del tema por defecto no se ha tocado**.

---

## 🗺️ Roadmap / decisiones de producto

**❌ Modo Finanzas — CANCELADO oficialmente.** Estaba reservado (el color verde de la app nunca se usa en ningún tema por esto) pero se descarta como funcionalidad. El verde queda libre para otros usos futuros.

**🔒 Social real (fotos, likes, comentarios, buscar perfiles por @) — bloqueado, prioridad baja/nula.** Esto necesita una base de datos y un servidor de verdad; una PWA estática como esta no puede simular cuentas compartidas entre dispositivos sin backend. El botón "Social" en la Hot Bar ya existe y explica esto mismo al usuario en vez de simular algo que no funciona.

**🔗 Inicio de sesión con Google — diseñado, no conectado todavía.** El botón ya está en Perfil. Cuando se implemente de verdad: pedirá permiso explícito para usar la foto de perfil de Google, preguntará claramente si quieres recibir correos sobre la app (opt-in, nunca por defecto), y te dejará elegir tu propio @ si está disponible.

**📋 Pendiente de próximas sesiones:** mejoras adicionales de bitácora (edición de notas), independencia visual completa de la sección Entrenamiento, y todo lo que dependa de que exista Social/backend.

---

## Personalizar rápido
Todo lo editable está en `app.js`, arriba del todo:
```js
const DEFAULT_HABITS = [...]        // tus hábitos por defecto
const DEFAULT_EXERCISES = [...]     // tus ejercicios base
const MEAL_SLOTS = [...]            // franjas del registro de comidas
const WATER_GOAL_ML = 2000          // objetivo de agua diario (ml)
const WATER_STEP_ML = 250           // cuánto suma cada toque
```

Gotham confía en ti. Ahora ve a hacer esas sentadillas.
