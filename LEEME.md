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

Si ya tenías datos de versiones anteriores, todo migra solo al abrir la app.

## Personalizar rápido
Todo lo editable está en `app.js`, arriba del todo:
```js
const DEFAULT_HABITS = [...]      // tus hábitos
const DEFAULT_EXERCISES = [...]   // tus ejercicios base
const WATER_GOAL = 8               // vasos de agua objetivo
const MEAL_GOAL = 4                 // comidas objetivo
```

Gotham confía en ti. Ahora ve a hacer esas sentadillas.
