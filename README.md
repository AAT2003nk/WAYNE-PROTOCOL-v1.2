# WAYNE PROTOCOL v2.0

Bat-terminal personal: hábitos diarios, entrenamiento con series/peso/reps y rutinas, dieta con macros y packs, bitácora, perfil de invitado con resumen a largo plazo — todo local, sin servidor, sin cuentas reales (todavía).

> Este archivo se llamaba `LEEME.md`. A partir de esta versión pasa a llamarse `README.md`.
> Nota de control de versiones: la numeración se corrigió aquí — esta es la v2.0 real.

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

### 🏋️ Entrenamiento (a fondo esta vez)
- **Sesión de entrenamiento real**: botón ▶ en cada ejercicio abre un registro de series con peso (kg), repeticiones y un tick para marcar cada serie como hecha. El contador rápido de la fila se recalcula solo a partir de las series marcadas, así no hay dos sistemas peleándose entre sí.
- **El último peso/reps usados de cada ejercicio se recuerdan** de una sesión a otra (se guardan aparte, no dentro del día) — al abrir una serie nueva, los campos ya vienen rellenos con lo último que apuntaste. Las repeticiones de hoy siguen empezando en 0 cada día nuevo, que es lo correcto; lo que ya no se pierde es el peso/reps de referencia.
- **Rutinas (packs de entrenamiento)**: mismo sistema que los packs de comida — guarda una rutina completa una vez ("Push Day", "Piernas fuego"...) y añádela entera a la lista de hoy con un toque. Los ejercicios que ya tuvieras en la lista no se duplican.
- Récords personales (PR), racha, gráfico de volumen semanal y calendario de adherencia — todo lo de antes, intacto.
- La racha dorada del análisis semanal ahora se activa al 70% (antes 85%, demasiado exigente para el día a día real).

### 🍽️ Nutrición
- Packs de comida, búsqueda automática (Open Food Facts), escáner de código de barras integrado en "añadir comida", macros, calculadora BMR/TDEE, calendario de adherencia con detalle al tocar un día.

### 👤 Perfil — ahora es el centro de mando personal
- **Motivación Personal** (antes en la pantalla principal) vive ahora aquí, con lightbox al tocar una foto.
- **Copia de seguridad** (exportar/importar/permisos) también se mudó aquí — la pantalla principal queda más despejada.
- **Resumen a largo plazo** nuevo: miembro desde, días activos, mejor racha de hábitos y de entrenamiento históricas, entrenamientos totales, media de hábitos — para ver de un vistazo cómo vas más allá del día a día.
- @handle aleatorio + foto personalizable, 100% local. Botón "Vincular con Google" visible pero todavía inactivo (ver Roadmap).

### 🧭 Bottom Hot Bar
Iconos propios en SVG en vez de emojis (Social, Dietas, +, Entreno, Perfil). El orden ahora coincide con la dirección real del swipe: **Dietas a la izquierda del centro** (la pantalla de Dieta está físicamente a la izquierda) y **Entreno a la derecha** — antes estaban cambiados. El gesto de deslizar entre pantallas se mantiene intacto.

### 🎨 Temas ocultos: Ymir y Batgirl
Violeta/cian (3 toques en la "Y") y rosa (3 toques en la "E"), ambos con el mismo pulido fluido. Experimentales, no afectan al tema por defecto.

---

## 🗺️ Roadmap / decisiones de producto

**❌ Modo Finanzas — CANCELADO oficialmente.** Estaba reservado (el color verde de la app nunca se usa en ningún tema por esto) pero se descarta como funcionalidad. El verde queda libre para otros usos futuros.

**🔒 Social real (fotos, likes, comentarios, buscar perfiles por @) — bloqueado, prioridad baja/nula.** Esto necesita una base de datos y un servidor de verdad; una PWA estática como esta no puede simular cuentas compartidas entre dispositivos sin backend. El botón "Social" en la Hot Bar ya existe y explica esto mismo al usuario en vez de simular algo que no funciona.

**🔗 Inicio de sesión con Google — diseñado, no conectado todavía.** El botón ya está en Perfil. Cuando se implemente de verdad: pedirá permiso explícito para usar la foto de perfil de Google, preguntará claramente si quieres recibir correos sobre la app (opt-in, nunca por defecto), y te dejará elegir tu propio @ si está disponible.

**🎬 Referencia visual del ejercicio (GIF/vídeo/imagen) — investigado, no incluido todavía.** La opción realista y gratuita es la API pública de wger.de (base de datos de ejercicios open source, sin necesidad de pago), pero integrarla bien necesita más tiempo de prueba real con conexión que el que tengo en esta sesión — prefiero no meter una integración a medias que falle en silencio. Queda como la siguiente pieza clara a construir.

**📋 Pendiente de próximas sesiones:** mejoras adicionales de bitácora (edición de notas), referencia visual de ejercicios (ver arriba), y todo lo que dependa de que exista Social/backend.

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
