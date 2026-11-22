import type { CapacitorConfig } from '@capacitor/cli';

/**
 * Configuración de Capacitor (APK Android).
 *
 * - appId: DEBE coincidir exactamente con el package name del OAuth client
 *   de tipo Android en Google Cloud (client 945903017889-*, proyecto
 *   cultural-event-512610). La huella SHA-1 de firma debug está registrada
 *   ahí: 34:FF:03:91:6D:01:80:D6:7B:61:53:2E:AB:D5:70:FC:C4:BA:81:60.
 * - webDir: `www-native`, salida de `scripts/prepare-native.mjs` (copia de
 *   `www` SIN el APK descargable de `assets/apk/`, para que el APK no quede
 *   embebido dentro de la app). La web (Vercel) sigue sirviendo `www/`.
 *   Flujo nativo: `npm run build:android` (build + prepare + cap sync).
 */
const config: CapacitorConfig = {
  appId: 'cl.eventocultural.app',
  appName: 'Evento Cultural',
  webDir: 'www-native'
};

export default config;
