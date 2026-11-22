// Copia el build web (www/) a www-native/ excluyendo el APK descargable.
//
// Motivo: el APK ofrecido para descarga vive en src/assets/apk/ y `ng build`
// lo copia a www/assets/apk/. `npx cap sync` copia webDir a
// android/app/src/main/assets/public/, así que sin este paso el APK quedaría
// embebido dentro de la app nativa (ocupaba ~8,6 MB y crecía en cada build,
// porque cada APK nuevo incrusta la copia del APK anterior).
//
// La web (Vercel) sigue sirviendo www/ con el APK; la app nativa solo carga
// www-native/. Uso: npm run build:android (build + prepare + cap sync).
import { cpSync, rmSync, existsSync } from 'node:fs';
import { relative, sep } from 'node:path';

const SRC = 'www';
const DEST = 'www-native';

if (!existsSync(SRC)) {
  console.error(`No existe ${SRC}/. Ejecuta primero: npm run build`);
  process.exit(1);
}

rmSync(DEST, { recursive: true, force: true });

cpSync(SRC, DEST, {
  recursive: true,
  // Excluye solo el APK descargable (assets/apk/), el resto de assets se copia.
  filter: (src) => {
    const rel = relative(SRC, src).split(sep).join('/');
    return rel !== 'assets/apk' && !rel.startsWith('assets/apk/');
  }
});

console.log(`www-native/ listo (sin assets/apk/).`);
