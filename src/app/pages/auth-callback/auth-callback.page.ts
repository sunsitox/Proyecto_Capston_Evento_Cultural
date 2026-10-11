import { Component, inject, signal } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { ApiService } from '../../core/services/api.service';
import { IonButton } from '@ionic/angular';

/**
 * Página de regreso de OAuth. Procesa el fragmento de Supabase Auth
 * (#access_token=...) y continúa a la app. Si no hay sesión válida,
 * ofrece volver al login.
 */
@Component({
  selector: 'app-auth-callback',
  standalone: true,
  imports: [IonButton, RouterLink],
  template: `
    <main class="callback-wrap">
      <h1>Completando inicio de sesiÃ³nâ¦</h1>
      @if (resultado() === 'ok') {
        <p>Â¡Listo! Te estamos redirigiendo.</p>
      } @else if (resultado() === 'error') {
        <p role="alert">
          No se pudo completar el inicio de sesiÃ³n con el proveedor.
          Recuerda activar el proveedor OAuth y las URLs de redirecciÃ³n en Supabase.
        </p>
        <ion-button routerLink="/login">Volver al inicio de sesiÃ³n</ion-button>
      } @else {
        <p>Procesandoâ¦</p>
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
    // procesarCallbackOAuth es async (intercambia code por sesión con supabase-js).
    this.api.procesarCallbackOAuth().then((usuario) => {
      if (usuario) {
        this.resultado.set('ok');
        setTimeout(() => void this.router.navigateByUrl('/home'), 800);
      } else {
        this.resultado.set('error');
      }
    });
  }
}
