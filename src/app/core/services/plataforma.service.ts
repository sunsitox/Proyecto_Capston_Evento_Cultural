import { Injectable, signal } from '@angular/core';
import { Capacitor } from '@capacitor/core';

/**
 * Detección centralizada de la plataforma.
 *
 * Antes, `MainLayoutComponent` y `PerfilPage` duplicaban cada una el signal
 * `mostrarDescargaApk = signal(!Capacitor.isNativePlatform())`. Ahora hay
 * una sola fuente de verdad: los componentes injectan este servicio y leen
 * `mostrarDescargaApk()` en la plantilla.
 *
 * - `esNativa`: true dentro de la app nativa (Capacitor Android/iOS).
 * - `mostrarDescargaApk`: true solo en la página web (incluida la vista
 *   móvil del navegador). Dentro de la app el CTA de descarga del APK es
 *   redundante, porque ya se está usando la app.
 */
@Injectable({ providedIn: 'root' })
export class PlataformaService {
  readonly esNativa = signal(Capacitor.isNativePlatform());
  readonly mostrarDescargaApk = signal(!Capacitor.isNativePlatform());
}
