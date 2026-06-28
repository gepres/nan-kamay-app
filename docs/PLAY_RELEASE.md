# Publicar Ñan Kamay en Google Play

> Guía operativa para la primera publicación. **Decisiones tomadas:** firma vía **EAS Build**
> (keystore gestionado por EAS) y cuenta de desarrollador **ya existente** (app aún no creada).
> Estado del código a 2026-06-28: `package com.gepres.nankamay`, `versionCode 4` / `versionName 1.1.0`.

Lo que **ya quedó listo en el repo**:
- `eas.json` → perfil `production` genera **AAB** (`buildType: app-bundle`) con `autoIncrement` y
  `appVersionSource: local` (el `versionCode` sale de `app.json`).
- `.gitignore` ignora `*.aab` y `play-service-account*.json` (secreto de `eas submit`).
- **Política de privacidad** publicada (requisito de Play): https://nankamay.trek-peru.com/privacidad
  (EN: `/en/privacy`).

> ⚠️ **Sigue firmándose con el debug keystore en builds LOCALES** (`android/app/build.gradle:115`).
> Eso es para repartir APKs por LAN, **no** para Play. La ruta de Play es EAS (abajo), que usa un
> keystore real. No subas a Play un AAB/APK hecho con `gradlew` local.

---

## 0. Requisitos previos (una vez)

```bash
eas login            # inicia sesión en tu cuenta Expo
eas whoami           # confirma
```
El proyecto ya está vinculado (`app.json → extra.eas.projectId`).

---

## 1. Crear la app en Play Console

1. https://play.google.com/console → **Crear app**.
2. Nombre: **Ñan Kamay** · idioma por defecto: **Español** · tipo: **App** · **Gratis**.
3. Acepta las declaraciones (políticas, leyes de exportación de EE. UU.).

> El `applicationId` (`com.gepres.nankamay`) **no se puede cambiar** después del primer subido.

---

## 2. Generar el AAB con EAS

```bash
eas build --platform android --profile production
```
- Produce un **`.aab`** firmado con el keystore de EAS (= **clave de subida / upload key**).
- Si es la primera build, EAS te pregunta por las credenciales: deja que **EAS genere/gestione el
  keystore** (es el que ya tiene la huella `04:95:BB…`).
- Al terminar, EAS da un enlace para **descargar el `.aab`**.

---

## 3. Play App Signing + App Links (paso que NO se puede saltar)

Al subir el primer AAB, Play activa **Play App Signing**: Google genera su propia **clave de firma de
la app** (distinta de tu upload key) y re-firma lo que se distribuye.

➡️ **Los App Links del "seguir en vivo" se verifican contra la clave de firma de la APP**, no contra la
de subida. Por eso, tras crear la app hay que añadir su huella a `assetlinks.json`:

1. Play Console → **Probar y publicar → Integridad de la app → Firma de apps**.
2. Copia el **SHA-256** del *"Certificado de la clave de firma de la app"*.
3. **Pásamelo** y lo agrego a `public/.well-known/assetlinks.json` de la landing (conservando las
   huellas actuales) y redespliego. Sin esto, en la versión de Play el enlace
   `https://nankamay.trek-peru.com/seguir/<token>` abrirá el navegador en vez de la app.

---

## 4. Subir el AAB a una pista de pruebas

**Primer release (recomendado, manual):**
1. Play Console → **Probar y publicar → Pruebas → Pruebas internas → Crear versión**.
2. Sube el `.aab`. Añade notas de la versión.
3. Agrega tu correo como tester → instala desde el enlace de prueba interna.

**Automatizado (opcional, ver §7):** `eas submit -p android`.

---

## 5. Ficha de Play Store (Store listing)

Necesitas (Console → **Crecimiento → Presencia en Store → Ficha principal**):
- **Nombre** (30): `Ñan Kamay`
- **Descripción corta** (80) y **completa** (4000) → borradores en §10.
- **Icono** 512×512 PNG (usa `assets/icon.png` exportado a 512).
- **Gráfico destacado** 1024×500.
- **Capturas de pantalla**: mínimo 2 de teléfono (recomendado 4–8). Sugeridas: Home, grabación activa,
  resumen de ruta, mapa offline, seguir en vivo.
- **Categoría**: *Mapas y navegación* (o *Salud y fitness*). 
- **Datos de contacto** + enlace a la **política de privacidad** (la URL de arriba).

---

## 6. Cuestionarios obligatorios

### 6.1 Seguridad de los datos (Data safety)
Declara, según la política de privacidad:
| Dato | ¿Se recopila? | ¿Se comparte? | Propósito | ¿Opcional? |
|------|---------------|----------------|-----------|------------|
| Ubicación precisa | Sí | Sí (solo "seguir en vivo") | Funcionalidad de la app | El compartir, sí |
| Email | Sí (si crea cuenta) | No | Gestión de cuenta | Sí |
| Fotos/Videos | Sí (waypoints) | No | Funcionalidad | Sí |
| Audio (notas de voz) | Sí (waypoints) | No | Funcionalidad | Sí |
| Actividad en la app / diagnósticos | Sí (analítica anónima + reportes) | No | Analítica / estabilidad | Analítica: opt-out |

- **Cifrado en tránsito:** Sí.
- **¿El usuario puede pedir eliminación?** Sí (por correo / borrando rutas).

### 6.2 Acceso a ubicación en segundo plano (CRÍTICO — causa típica de rechazo)
Como la app declara `ACCESS_BACKGROUND_LOCATION`, Play exige un formulario aparte:
- **Justificación:** "Grabar la ruta de senderismo de forma continua mientras la pantalla está
  apagada o la app en segundo plano; sin esto la grabación se cortaría."
- **Video de demostración** (enlace YouTube/Drive) que muestre: (1) el **aviso in-app** explicando el
  uso en segundo plano, (2) el usuario aceptando, (3) el permiso *"Permitir todo el tiempo"*, (4) la
  grabación continuando en segundo plano con la notificación persistente.
- Ver **§8**: hace falta confirmar/añadir el "aviso prominente" in-app.

### 6.3 Otros
- **Clasificación de contenido** (cuestionario IARC).
- **Público objetivo**: 13+ (no dirigido a niños).
- **Anuncios**: No.
- **App de noticias**: No.

---

## 7. (Opcional) `eas submit` automatizado

Para subir sin pasar por la consola en cada release:
1. Google Cloud Console (proyecto del Play) → crea una **cuenta de servicio** con rol que permita
   publicar.
2. Play Console → **Usuarios y permisos** → invita esa cuenta de servicio con permiso de release.
3. Descarga el **JSON** de la cuenta de servicio → guárdalo en la raíz del repo como
   **`play-service-account.json`** (ya está en `.gitignore`; **nunca** lo commitees).
4. `eas submit --platform android --profile production` (sube a la pista `internal`, configurada en
   `eas.json`).

---

## 8. Pendiente de código recomendado: aviso prominente (prominent disclosure)

Play suele **rechazar** apps con ubicación en segundo plano si no muestran un **aviso in-app explícito
ANTES** de solicitar ese permiso. Hoy la app solicita el permiso directamente (`requestPermissions` en
`useTracking.ts` / pre-grabación).

**Acción recomendada:** un diálogo previo, por ejemplo:
> *"Ñan Kamay usa tu ubicación, incluso en segundo plano, para grabar tu ruta mientras la pantalla está
> apagada. La ubicación solo se registra mientras grabas. ¿Continuar?"* — botones **Continuar / Ahora no**,
> y solo tras "Continuar" se pide el permiso del sistema.

Esto **debe aparecer en el video** del §6.2. Avísame y lo implemento (es un cambio acotado de UI).

---

## 9. Checklist final antes de "Enviar a revisión"

- [ ] App creada en Play Console (`com.gepres.nankamay`).
- [ ] AAB de `eas build --profile production` subido a **Pruebas internas** y probado en tu teléfono.
- [ ] **SHA-256 de Play App Signing** añadido a `assetlinks.json` (pásamelo) y App Link verificado.
- [ ] **Aviso prominente** in-app implementado (§8) y grabado en el video.
- [ ] Formulario de **ubicación en segundo plano** enviado (con video).
- [ ] **Data safety** completado.
- [ ] **Política de privacidad** enlazada en la ficha.
- [ ] Ficha completa (descripciones, icono 512, gráfico 1024×500, ≥2 capturas).
- [ ] **Clasificación de contenido** completada.
- [ ] (Opcional) `play-service-account.json` para `eas submit`.

---

## 10. Borradores de ficha (es)

**Descripción corta (≤80):**
> Graba rutas de trekking con GPS, offline. Mapas sin conexión, waypoints y seguridad.

**Descripción completa (borrador):**
> **Ñan Kamay** — "el camino de la mano" — es tu compañero para el senderismo y la montaña en los Andes
> y donde vayas. Graba tu recorrido con GPS de alta precisión, **funciona sin conexión** y guarda todo
> primero en tu teléfono.
>
> **Características**
> • Grabación GPS precisa, también con la pantalla apagada (segundo plano).
> • **Mapas offline**: descarga regiones y navega sin datos.
> • **Waypoints** con fotos, video y notas de voz.
> • Estadísticas: distancia, desnivel, ritmo, parciales por kilómetro.
> • **Exporta** tus rutas en GPX, KML y KMZ.
> • **Seguridad**: check-in y S.O.S. por SMS (funciona sin datos) y **seguimiento en vivo** por enlace.
> • Editor de trazado y planificador de rutas.
> • Sincronización opcional en la nube y respaldo de tus rutas.
>
> Gratis, sin anuncios. Tu privacidad primero: la analítica es anónima y la puedes desactivar.

**Notas de la versión (1.1.0):**
> Mapas offline, seguimiento en vivo (web), editor de trazado, seguridad (SOS/check-in) y mejoras de GPS.
