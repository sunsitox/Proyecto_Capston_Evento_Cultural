import { Component, inject, signal } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { ApiService } from '../../core/services/api.service';
import { IonButton } from '@ionic/angular';

/**
 * Página de regreso de OAuth y de recuperación de contraseña. Procesa el
 * fragmento/query de Supabase Auth (#access_token=... o ?code=...) y sigue a la
 * app. Si la URL trae ?type=recovery (enlace de "¿Olvidaste tu contraseña?"),
 * lleva a /restablecer-contrasena para fijar la contraseña nueva; en caso
 * contrario continúa a /home. Si no hay sesión válida, ofrece volver al login.
 */
@Component({
  selector: 'app-auth-callback',
  standalone: true,
  imports: [IonButton, RouterLink],
  template: `
    <main class="callback-wrap">
      <h1>Completando inicio de sesión…</h1>
      @if (resultado() === 'ok') {
        <p>¡Listo! Te estamos redirigiendo.</p>
      } @else if (resultado() === 'error') {
        <p role="alert">
          No se pudo completar el enlace: puede haber expirado o ya se usó.
          Solicita uno nuevo en el inicio de sesión.
        </p>
        <ion-button routerLink="/login">Volver al inicio de sesión</ion-button>
      } @else {
        <p>Procesando…</p>
      }
    </main>
  `,
  styles: [`
    .callback-wrap { max-width: 480px; margin: 15vh auto; text-align: center; padding: 0 16px; }
    h1 { font-size: 1.25rem; }
  `]
})
export class AuthCallbackPage {
  private readonly api = inject(ApiService);
  private readonly router = inject(Router);

  readonly resultado = signal<'procesando' | 'ok' | 'error'>('procesando');

  constructor() {
    // Se captura ANTES de procesarCallbackOAuth: el método limpia la URL
    // (history.replaceState) justo después de canjear el código por sesión.
    // PKCE lo entrega en el query; flujo implícito, en el fragmento.
    const esRecuperacion =
      location.search.includes('type=recovery') ||
      location.hash.includes('type=recovery');

    // procesarCallbackOAuth es async (intercambia code por sesión con supabase-js).
    this.api.procesarCallbackOAuth().then((usuario) => {
      if (usuario) {
        this.resultado.set('ok');
        const destino = esRecuperacion ? '/restablecer-contrasena' : '/home';
        setTimeout(() => void this.router.navigateByUrl(destino), 800);
      } else {
        this.resultado.set('error');
      }
    });
  }
}
