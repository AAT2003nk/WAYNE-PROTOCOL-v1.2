# WAYNE PROTOCOL v1.0

Bat-terminal personal: hábitos diarios, entrenamiento, nutrición y bitácora. Todo se guarda en el `localStorage` de tu propio teléfono — nada sale de tu dispositivo, ni Alfred lo ve.

## Archivos
- `index.html` — estructura de la app
- `style.css` — estética batcomputadora (negro táctico + neón teal + acento ámbar bat-señal)
- `app.js` — toda la lógica (hábitos, entrenamiento, nutrición, bitácora, racha)
- `manifest.json` + `icon.svg` + `sw.js` — lo que convierte esto en una PWA instalable

## Instalación en 5 minutos (GitHub Pages)

1. Crea un repositorio nuevo en GitHub (puede ser privado o público).
2. Sube estos 6 archivos a la raíz del repo (arrastra y suelta desde la web de GitHub si no quieres usar git por terminal).
3. Ve a **Settings → Pages**, en "Branch" selecciona `main` y carpeta `/root`. Guarda.
4. En 1-2 minutos te dará una URL como `https://tuusuario.github.io/tu-repo/`.
5. Abre esa URL desde el navegador de tu móvil:
   - **Android (Chrome)**: menú ⋮ → "Añadir a pantalla de inicio".
   - **iOS (Safari)**: botón compartir → "Añadir a pantalla de inicio".
6. Listo — icono de murciélago en tu pantalla, se abre a pantalla completa, funciona sin conexión.

## Alternativa aún más rápida (sin GitHub)
Puedes arrastrar la carpeta completa a [app.netlify.com/drop](https://app.netlify.com/drop) y te da una URL pública al instante.

## Qué hace cada panel (v1.1)
- **Radar de integridad**: aro que se llena según el % de protocolos diarios completados hoy, con el murciélago en el centro.
- **Reloj y fecha en vivo**: hora real del sistema, actualizada cada segundo. La app detecta el cambio de día automáticamente (a medianoche) y abre un registro nuevo sin que hagas nada.
- **Protocolos diarios**: totalmente editables desde la propia app — botón `+` para añadir los tuyos, botón `×` para quitar uno (tu historial pasado nunca se borra). Cada hábito marcado guarda la hora exacta en que lo cumpliste.
- **Entrenamiento**: contador de repeticiones por ejercicio (botón `+` para añadir ejercicios nuevos) y su propia **racha de entrenamiento** (días consecutivos con al menos un ejercicio registrado).
- **Nutrición ampliada**:
  - Agua y comidas limpias del día (como antes).
  - **Perfil físico**: peso actual, peso objetivo, edad, altura, sexo y nivel de actividad.
  - **Calculadora de kcal**: calcula tu metabolismo basal (BMR) y mantenimiento (TDEE) con la fórmula Mifflin-St Jeor, y sugiere un objetivo diario (déficit, mantenimiento o superávit según tu peso objetivo). Es orientativo, no reemplaza a un profesional.
  - **Progreso de peso**: cada vez que actualizas tu peso se guarda en un historial con fecha, para ver tu variación real.
  - **Escanear comida con cámara**: botón visible pero marcado como "Work In Progress" — Alfred aún la está calibrando.
- **Bitácora**: notas de texto libre con fecha y hora real, tipo diario de Alfred.
- **Racha de hábitos**: días consecutivos con el 100% del protocolo cumplido.

## Novedades v1.2
- **Análisis semanal**: nuevo panel bajo "Protocolos diarios" con un gráfico de barras Lunes→Domingo de tu % de cumplimiento cada día. La semana se calcula siempre en vivo (de lunes a domingo), así que "se reinicia" sola cada lunes sin que hagas nada.
- **Racha dorada**: si en una semana consigues 4 días o más con el 85%+ de tus protocolos cumplidos, la semana **siguiente** se activa automáticamente en dorado (bordes, barras y stats cambian de color) con un banner de aviso. Si rompes la racha, la semana siguiente vuelve al color por defecto.
- **Tema oculto de Batgirl** 🩷: toca 3 veces seguidas la "E" final de "W.A.Y.N.E" (en menos de ~1.2s) y toda la app cambia a una paleta rosa/pastel. Vuelve a tocar 3 veces para volver al modo oscuro. Tu elección se recuerda entre sesiones. Es un easter egg — no hay ninguna pista visual de que está ahí.

## Novedades y arreglos v1.3

**Novedades:**
- **Salón de la Fama**: nueva sección para subir fotos/pins motivacionales. Se comprimen automáticamente (máx. 640px, JPEG) antes de guardarse en `localStorage`, para no llenar el almacenamiento con fotos pesadas. Sobreviven a cualquier actualización de código (commit nuevo en GitHub) porque viven en el navegador del dispositivo, no en los archivos de la app.
- **Todo el front ahora usa sus propios formularios**: se acabaron los `prompt()` / `confirm()` / `alert()` del navegador. Añadir hábitos, ejercicios, pins, confirmar borrados, avisos de la calculadora, etc. — todo pasa por un modal propio con la estética exacta de la app (y que también respeta el tema Batgirl).
- **Botón de reinicio oculto**: el antiguo botón "REINICIAR PROTOCOLO" ha desaparecido. En su lugar hay un icono de murciélago en rojo brillante al final de la página. Tócalo 5 veces (en menos de 4 segundos) y entonces aparece el botón real de reinicio, que además pide confirmación antes de borrar nada.

**Arreglos:**
- **Bug de fecha/hora**: la app calculaba el "día actual" con hora UTC en vez de con la hora local del dispositivo, lo que podía desalinear el cambio de día respecto a la medianoche real y perder el registro de hábitos marcados tarde por la noche. Ahora todo el cálculo de fechas usa siempre el calendario local — el cambio de día ocurre exactamente a medianoche de tu zona horaria, y ningún día se pierde.
- **Salto visual del reloj**: la hora y la fecha del header ahora usan una fuente monoespaciada con números tabulares y están apiladas en columna, así el bloque ya no cambia de tamaño ni "salta" cada segundo en pantallas de móvil.
- **Desbordamiento en Perfil Físico**: los campos de peso objetivo, altura y actividad ya no se salen de la pantalla en móvil — los inputs y selects ahora ocupan el 100% de su columna correctamente.
- **Déficit calórico demasiado agresivo**: antes el objetivo calórico podía quedarse siempre clavado en 1200 kcal. Ahora el déficit/superávit se calcula como un porcentaje del mantenimiento (18% déficit / 12% superávit, más sostenible) y el suelo de seguridad sube a 1600 kcal (hombres) / 1400 kcal (mujeres) en vez de 1200.

Si ya tenías datos de versiones anteriores, todo migra solo al abrir la app — no se pierde nada.

## Personalizar rápido
Todo lo editable está en `app.js`, arriba del todo:
```js
const DEFAULT_HABITS = [...]      // tus hábitos
const DEFAULT_EXERCISES = [...]   // tus ejercicios base
const WATER_GOAL = 8               // vasos de agua objetivo
const MEAL_GOAL = 4                 // comidas objetivo
```

Gotham confía en ti. Ahora ve a hacer esas sentadillas.
