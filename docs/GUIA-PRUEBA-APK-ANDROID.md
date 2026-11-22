# Prueba manual del APK en un Android real — CTA visible en web, oculto en la app

**Objetivo:** verificar en un teléfono real que (a) los CTA «Descargar APK» existen en la web (escritorio y vista móvil del navegador) y (b) **no existen dentro de la app nativa**, donde serían redundantes (`PlataformaService.mostrarDescargaApk = !Capacitor.isNativePlatform()`).

**Criterio de aprobación:** todos los pasos de los §2 y §3 pasan sin excepción. Si alguno falla, anotarlo en la tabla de evidencia y detener la entrega.

## §0 Reconstruir el APK fresco (requisito previo, una sola vez)

El APK descargable y el bundle nativo cambian en cada build. Siempre seguir esta secuencia completa, en este orden, desde la raíz del proyecto:

```bat
npm run build:android
cd android && gradlew assembleDebug
```

Comandos de verificación sin teléfono (deben pasar antes de instalar nada):

| # | Verificación | Comando / ruta | Esperado |
|---|---|---|---|
| V1 | La web conserva el APK | `www/assets/apk/evento-cultural-debug.apk` | Existe (≈ 8,3 MB tras el fix de exclusión) |
| V2 | El bundle nativo NO contiene el APK | `test ! -d www-native/assets/apk && test ! -d android/app/src/main/assets/public/assets/apk` | Ambos sin `assets/apk/` |
| V3 | El APK generado no incrusta otro APK | `unzip -l android/app/build/outputs/apk/debug/app-debug.apk \| grep ".apk"` | Sin resultados (solo el propio `app-debug.apk`) |
| V4 | El bundle la app carga la guarda | `grep -rl mostrarDescargaApk android/app/src/main/assets/public/*.js` | Al menos 1 archivo |

> Antes del fix de exclusión, el APK pesaba 14 MB y el `unzip -l` listaba `assets/public/assets/apk/evento-cultural-debug.apk` (8.655.334 bytes) dentro del propio APK. Tras el fix: 8,3 MB y V3 vacío. Es la prueba mecánica de que ya no se embebe.

Actualizar el APK que se ofrece en la web con el build fresco:

```bat
copy android\app\build\outputs\apk\debug\app-debug.apk src\assets\apk\evento-cultural-debug.apk
npm run build
```

## §1 Instalar en el Android real

Dos opciones equivalentes (elegir una):

- **Opción A (ADB, con depuración USB):** conectar el teléfono, aceptar el aviso de depuración y ejecutar:
  `adb install -r android/app/build/outputs/apk/debug/app-debug.apk`
  Verificar que el teléfono aparece con `adb devices` (debe listar `device`, no `unauthorized`).
- **Opción B (archivo):** copiar `android/app/build/outputs/apk/debug/app-debug.apk` al teléfono (cable, Drive, WhatsApp, etc.), abrir el archivo y aceptar «Instalar apps desconocidas» si el sistema lo pide.

En ambos casos, la app debe aparecer en el cajón de apps como **«Evento Cultural»**.

## §2 Verificación dentro de la app nativa — el CTA debe estar OCULTO

Abrir la app y recorrer cada tab de la barra inferior. En ninguno debe aparecer:

- [ ] **P1 · Banner móvil** «¿Usas Android? Descarga la app nativa» (debajo del header, encima del contenido). Recorrer: Descubrir, Calendario, Mapa, Para ti, Perfil.
- [ ] **P2 · Bloque de Perfil** «¿Usas Android? Descarga la app nativa (versión de prueba, ~8 MB)» con botón «Descargar APK» (página Perfil, abajo del todo).
- [ ] **P3 · Enlace de pie de página**: en la app móvil no hay footer web, pero no debe existir ningún enlace `Descargar APK` en ninguna pantalla.

Si P1–P3 pasan, el CTA está oculto en la app (redundancia eliminada).

## §3 Verificación en el navegador del teléfono (vista móvil web) — el CTA debe estar VISIBLE

En el navegador del teléfono (Chrome o el predeterminado, **no** en la app), ir a la URL de la web:

- [ ] **P4 · Banner visible** con el texto «¿Usas Android? Descarga la app nativa» y botón «Descargar».
- [ ] **P5 · Descarga funcional**: al tocar «Descargar», el navegador debe iniciar la descarga de `evento-cultural-debug.apk` (≈ 8,3 MB) y, al abrirse, mostrar el instalador de Android (o guardar el archivo en Descargas). Debe descargar como `application/octet-stream`, nunca como HTML ni error 404.
- [ ] **P6 (opcional, escritorio)**: en un navegador de escritorio, el footer (columna «Plataforma») debe mostrar «App móvil (Android): Descargar APK».

Si P4–P5 pasan, la web sigue ofreciendo la descarga (antes la vista móvil web no tenía el acceso).

## §4 Tabla de evidencia (completar al ejecutar la prueba)

| Campo | Valor |
|---|---|
| Fecha / hora | |
| Modelo de teléfono y versión de Android | |
| Método de instalación (ADB / archivo) | |
| Tamaño del APK instalado (bytes) | |
| `unzip -l` sin APK anidado (V3) | Sí / No |
| P1 banner en app | Ausente / Presente |
| P2 bloque en Perfil (app) | Ausente / Presente |
| P4 banner en navegador móvil | Visible / Ausente |
| P5 descarga en navegador móvil | Funciona / Falla |
| Capturas tomadas (listar) | |

Adjuntar las capturas de P1/P2 (app, sin CTA) y P4/P5 (navegador, con CTA) junto a esta guía.

## Notas

- El APK instalado es `debug` (`cl.eventocultural.app`); desinstalar la versión anterior antes de instalar si hay conflicto de firma.
- La prueba es manual por diseño: no hay CI con dispositivo. Los pasos V1–V4 automatizables quedan arriba para que nadie confunda un APK viejo con un fallo de la lógica.
- `docs/AUDITORIA_FASE3_2026-11-21.md` registra el estado del APK al 21-11 (8.655.334 bytes, embebido); esta guía describe el estado posterior a la exclusión.
