# CHANGELOG — Wayne Protocol

Historial reconstruido a partir de las notas de cada versión entregadas durante el desarrollo (no hay un repositorio Git detrás, así que este documento hace de historial). Va de la v1.0 a la v2.1, que es la base sobre la que se sigue construyendo ahora.

---

## v1.0 — Primer despliegue
La Batcomputadora original como PWA instalable. Sentó la base que todo lo demás fue ampliando:
- **Radar de integridad**: aro circular que se llena según el % de protocolos diarios completados.
- **Protocolos diarios**: checklist de hábitos.
- **Entrenamiento**: contador de repeticiones por ejercicio.
- **Nutrición**: control de vasos de agua y comidas "limpias" (versión muy simple, antes de los macros).
- **Bitácora**: notas de texto libre con fecha y hora, estilo diario de Alfred.
- **Racha**: días consecutivos con el 100% del protocolo cumplido.
- Instalación vía GitHub Pages + manifest/service worker para que funcionara como app instalable.

## v1.1 — Personalización y nutrición ampliada
- Protocolos diarios totalmente editables desde la app (añadir/quitar hábitos).
- Nutrición ampliada: peso actual, peso objetivo, kcal diarias y una primera calculadora orientativa según edad/peso/actividad.
- Racha de entrenamiento independiente de la de hábitos.

## v1.2 — Análisis semanal y primer tema oculto
- **Análisis semanal**: gráfico de barras Lunes-Domingo del % de cumplimiento.
- **Racha dorada**: si conseguías 4 días o más al 85%+ en una semana, la semana siguiente se activaba en dorado.
- **Tema oculto Batgirl** (primera versión, rosa/pastel): triple toque en la "E" de W.A.Y.N.E.

## v1.3 — De prototipo a app fiable
Parche grande de calidad, casi todo arreglos:
- **Bug de fecha/hora**: la app calculaba el día con hora UTC en vez de con la hora local, lo que desalineaba el cambio de día respecto a la medianoche real. Se corrigió para usar siempre el calendario local.
- Salto visual del reloj arreglado (fuente monoespaciada, sin saltos de tamaño).
- Desbordamiento de los inputs de Perfil Físico en móvil, corregido.
- Déficit calórico demasiado agresivo (se quedaba clavado en 1200 kcal): pasó a ser un % del mantenimiento con suelos de seguridad de 1600/1400 kcal.
- **Salón de la Fama**: primera versión de la galería de fotos motivacionales.
- Toda interacción pasó de `prompt()`/`confirm()`/`alert()` del navegador a modales propios con la estética de la app.
- Botón de reinicio ocultado detrás de un icono de murciélago (5 toques para revelarlo).

## v1.4 — Modo Dieta
- Nueva pantalla completa dedicada a la alimentación, accesible haciendo **swipe** desde la pantalla principal.
- Tema de color propio (ámbar/"ember"), reservando el verde para un futuro Modo Finanzas (más tarde cancelado, ver v2.x).
- La sección "Nutrición // Combustible" de la pantalla principal se eliminó, absorbida por esta nueva pantalla.

## v1.5 — Retoques de pulido
- Barra de scroll del navegador ocultada en ambas pantallas.
- Brillos del Modo Dieta que se veían azulados (heredados del teal por defecto) corregidos a blanco.
- **Copia de seguridad**: exportar/importar todos los datos a un archivo `.json`.

## v1.6 — Comida real y notificaciones (primer intento)
- **Búsqueda de alimentos** vía Open Food Facts (API pública y gratuita) para calcular kcal automáticamente.
- Sistema de permisos (notificaciones, cámara, galería) con onboarding.
- Notificaciones de Alfred/Grayson/Bruce por la mañana y por la noche (con las limitaciones honestas de una PWA sin servidor).
- **Analítica mensual**: calendario verde/rojo de adherencia a la dieta.
- El Modo Dieta cambia de color dinámicamente según la constancia reciente (verde si vas bien, rojo si llevas días sin registrar).

## v1.7 — Arreglo real de notificaciones + macros + escáner
- **Bug de notificaciones encontrado y corregido de verdad**: se pedía el permiso después de un `await`, lo que en Safari/iOS pierde la activación de usuario y bloquea el permiso en silencio. Se movió la llamada a la API nativa dentro del click síncrono.
- **Escáner de código de barras real** con ZXing (librería gratuita, funciona también en iOS) conectado a Open Food Facts.
- **Macros** (proteína/carbohidratos/grasas) por alimento y en el resumen diario.
- Calendario de adherencia también en Entrenamiento (reutilizando el motor de calendario).
- **Sistema de deshacer (5s)** en cualquier borrado, sustituyendo a los diálogos de confirmación.

## v1.8 — Tema oculto Ymir
- Segundo tema oculto: violeta neón + cian sobre fondo OLED, tarjetas muy redondeadas, tipografía Plus Jakarta Sans. Triple toque en la "Y".
- Llamado "Elite" internamente en un primer momento; renombrado a "Ymir" para evitar parecidos con nombres de otras apps.

## v2.0 (primer intento, con tropiezos)
Versión ambiciosa: API de alimentos con packs de comida, sistema de permisos completo, Bottom Hot Bar (Social/Entreno/+/Dietas/Perfil), perfil de invitado con @handle aleatorio, Motivación Personal con lightbox, gamificación de rachas estilo Duolingo, calendario con detalle al tocar un día. En el camino hubo una versión con un rediseño de Batgirl que rompió la app por completo; se descartó y se volvió a un backup funcional.

## v2.1 — Backup estable (base actual)
Versión saneada tras el incidente anterior: Bottom Hot Bar con iconos SVG propios y orden corregido (Dietas a la izquierda, coherente con la dirección del swipe), racha dorada al 70% en vez de 85%, Motivación Personal y Copia de Seguridad trasladadas a Perfil (con nuevo resumen a largo plazo), y la gran pieza de esta versión: **sesión de entrenamiento real** con series, peso, repeticiones y tick de finalizado, más **rutinas (packs de entrenamiento)** igual que los packs de comida. Tema Batgirl rediseñado también sobre la mecánica de Ymir (pastel, con el mismo pulido fluido).

---

*A partir de aquí, ver `README.md` para el estado actual de la app.*
