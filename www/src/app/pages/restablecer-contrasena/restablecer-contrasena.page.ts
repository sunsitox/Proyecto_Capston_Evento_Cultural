import { Component, inject, signal, computed } from '@angular/core';
import {
  AbstractControl,
  FormBuilder,
  ReactiveFormsModule,
  ValidationErrors,
  Validators
} from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { ActivatedRoute } from '@angular/router';
import { ApiService } from '../../core/services/api.service';
import {
  PasswordRulesValidator
} from '../../shared/validators/password-rules.validator';
import {
  IonItem,
  IonInput,
  IonButton,
  IonIcon,
  IonSpinner
} from '@ionic/angular';

/**
 * Fijar contraseña nueva a partir del enlace de recuperación.
 *
 * Dos vías en esta pantalla:
 *  - Flujo desacoplado (token): la URL trae ?token=<JWT temporal> firmado por
 *    la Edge Function (payload base64 con exp). La pantalla compara el exp con
 *    el reloj para avisar al instante, y al confirmar envía { token, password }
 *    a reset-password-confirm, que escribe la contraseña nueva en la base de
 *    datos (Admin API). Si la validación pasa, la app inicia sesión con la
 *    contraseña nueva y vuelve a /home.
 *  - Flujo legacy (enlace de Supabase Auth: pasó por
 *    /auth/callback?type=recovery): si llegó con sesión de un solo uso,
 *    cambia la contraseña con updateUser (se conserva por compatibilidad).
 */
@Component({
  selector: 'app-restablecer-contrasena',
  standalone: true,
  imports: [
    ReactiveFormsModule,
    RouterLink,
    IonItem,
    IonInput,
    IonButton,
    IonIcon,
    IonSpinner
  ],
  template: `
    <main class="ec-reset">
      <div class="ec-reset-card">
        <span class="ec-reset-icon" aria-hidden="true">
          <ion-icon name="lock-closed-outline"></ion-icon>
        </span>
        <h1>Crear nueva contraseña</h1>
        @if (conToken() && tokenValido()) {
          <p class="ec-reset-sub">
            Enlace temporal de recuperación{{ tokenEmail() ? ' para ' + tokenEmail() : '' }}.
            Es de un solo uso y vence en 30 minutos.
          </p>
        } @else {
          <p class="ec-reset-sub">Elige una nueva contraseña para tu cuenta de Evento Cultural.</p>
        }

        @if (errorServidor(); as msg) {
          <div class="ec-reset-error ec-reset-error--toast" role="alert">{{ msg }}</div>
        }
        @if (listo()) {
          <div class="ec-reset-ok" role="status">
            ¡Contraseña actualizada! Ya puedes iniciar sesión con ella.
          </div>
          <ion-button expand="block" routerLink="/login" class="ec-reset-submit">
            <ion-icon slot="start" name="log-in-outline" aria-hidden="true"></ion-icon>
            Ir a iniciar sesión
          </ion-button>
        } @else if (puedeFijar()) {
          <form [formGroup]="formulario" (ngSubmit)="enviar()" class="ec-reset-form" novalidate>
            <div class="ec-field">
              <ion-item
                class="ec-reset-input"
                [class.ec-reset-input--invalid]="errorPara('password')"
                lines="none"
              >
                <ion-icon slot="start" name="lock-closed-outline" aria-hidden="true"></ion-icon>
                <ion-input
                  type="password"
                  autocomplete="new-password"
                  placeholder="Mínimo 8 caracteres"
                  label="Nueva contraseña"
                  labelPlacement="floating"
                  formControlName="password"
                  [attr.aria-invalid]="!!errorPara('password')"
                  aria-describedby="ec-reset-pass-err"
                ></ion-input>
              </ion-item>
              @if (errorPara('password'); as msg) {
                <p class="ec-field-error" id="ec-reset-pass-err" role="alert">
                  <ion-icon name="close-circle-outline" aria-hidden="true"></ion-icon>
                  {{ msg }}
                </p>
              } @else {
                <ul class="ec-pass-requisitos" aria-label="Requisitos de la contraseña" aria-live="polite">
                  <li [class.ec-req-ok]="requisito().mayus">
                    <ion-icon [name]="requisito().mayus ? 'checkmark-circle-outline' : 'ellipse-outline'" aria-hidden="true"></ion-icon>
                    Una mayúscula
                  </li>
                  <li [class.ec-req-ok]="requisito().minus">
                    <ion-icon [name]="requisito().minus ? 'checkmark-circle-outline' : 'ellipse-outline'" aria-hidden="true"></ion-icon>
                    Una minúscula
                  </li>
                  <li [class.ec-req-ok]="requisito().numero">
                    <ion-icon [name]="requisito().numero ? 'checkmark-circle-outline' : 'ellipse-outline'" aria-hidden="true"></ion-icon>
                    Un número
                  </li>
                  <li [class.ec-req-ok]="requisito().simbolo">
                    <ion-icon [name]="requisito().simbolo ? 'checkmark-circle-outline' : 'ellipse-outline'" aria-hidden="true"></ion-icon>
                    Un símbolo (¡?#$%…)
                  </li>
                  <li [class.ec-req-ok]="requisito().largo">
                    <ion-icon [name]="requisito().largo ? 'checkmark-circle-outline' : 'ellipse-outline'" aria-hidden="true"></ion-icon>
                    Al menos 8 caracteres
                  </li>
                </ul>
              }
            </div>

            <div class="ec-field">
              <ion-item
                class="ec-reset-input"
                [class.ec-reset-input--invalid]="errorPara('confirmar')"
                lines="none"
              >
                <ion-icon slot="start" name="lock-closed-outline" aria-hidden="true"></ion-icon>
                <ion-input
                  type="password"
                  autocomplete="new-password"
                  placeholder="Repite la contraseña"
                  label="Confirmar contraseña"
                  labelPlacement="floating"
                  formControlName="confirmar"
                  [attr.aria-invalid]="!!errorPara('confirmar')"
                  aria-describedby="ec-reset-conf-err"
                ></ion-input>
              </ion-item>
              @if (errorPara('confirmar'); as msg) {
                <p class="ec-field-error" id="ec-reset-conf-err" role="alert">
                  <ion-icon name="close-circle-outline" aria-hidden="true"></ion-icon>
                  {{ msg }}
                </p>
              }
            </div>

            <ion-button expand="block" type="submit" class="ec-reset-submit" [disabled]="guardando()">
              @if (guardando()) {
                <ion-spinner name="crescent" slot="start"></ion-spinner>
                Guardando…
              } @else {
                <ion-icon slot="start" name="checkmark-outline" aria-hidden="true"></ion-icon>
                Guardar contraseña
              }
            </ion-button>
          </form>
        } @else if (verificando()) {
          <div class="ec-reset-verificando" role="status">
            <ion-spinner name="crescent" slot="start"></ion-spinner>
            Verificando tu enlace…
          </div>
        } @else {
          <div class="ec-reset-error" role="alert">
            @if (conToken()) {
              Este enlace temporal es inválido, expiró o ya se usó. Vuelve a solicitar la recuperación.
            } @else {
              Este enlace ya se usó o expiró. Vuelve a solicitar la recuperación.
            }
          </div>
          <ion-button expand="block" routerLink="/login" class="ec-reset-submit">
            <ion-icon slot="start" name="log-in-outline" aria-hidden="true"></ion-icon>
            Volver al inicio de sesión
          </ion-button>
        }

        <p class="ec-reset-footer">
          <a routerLink="/home">Volver a la app sin cambiar la contraseña</a>
        </p>
      </div>
    </main>
  `,
  styles: [`
    :host { display: block; min-height: 100dvh; background: var(--ec-bg); }
    .ec-reset { display: flex; justify-content: center; padding: var(--ec-space-2xl) var(--ec-space-md); }
    .ec-reset-card {
      width: 100%; max-width: 440px; height: fit-content;
      background: var(--ec-surface); border-radius: var(--ec-radius-xl);
      box-shadow: var(--ec-shadow-md);
      border: var(--ec-border-width) solid var(--ec-border-light);
      padding: var(--ec-space-xl) var(--ec-space-lg);
      text-align: center;
    }
    .ec-reset-icon {
      display: inline-flex; align-items: center; justify-content: center;
      width: 56px; height: 56px; border-radius: 16px;
      background: var(--ec-primary-bg, rgba(43, 108, 176, 0.08));
      color: var(--ec-primary); font-size: 1.8rem; margin-bottom: var(--ec-space-md);
    }
    h1 { font-size: 1.35rem; margin: 0 0 var(--ec-space-xs); color: var(--ec-text-dark); }
    .ec-reset-sub { font-size: 0.9rem; color: var(--ec-text-muted); margin: 0 auto var(--ec-space-lg); line-height: 1.5; }
    .ec-reset-form { display: flex; flex-direction: column; gap: var(--ec-space-md); text-align: left; }
    .ec-reset-input {
      --background: var(--ec-surface-2);
      --border-radius: var(--ec-radius-md);
      --padding-start: var(--ec-space-md);
      --highlight-background: var(--ec-primary);
      border: var(--ec-border-width) solid transparent;
      border-radius: var(--ec-radius-md);
      margin: 0;
      &:focus-within { border-color: var(--ec-primary); }
      ion-icon { color: var(--ec-text-muted); font-size: 1.1rem; }
    }
    .ec-reset-input--invalid {
      --border-color: var(--ec-danger);
      --highlight-background: var(--ec-danger);
      border-color: var(--ec-danger);
      ion-icon { color: var(--ec-danger); }
    }
    .ec-field { display: flex; flex-direction: column; gap: 6px; position: relative; padding-bottom: 22px; }
    .ec-field-error {
      position: absolute; bottom: 0; inset-inline: 0; z-index: 2;
      display: flex; align-items: center; gap: 6px; margin: 0; padding: 0 8px;
      font-size: 0.82rem; font-weight: 500; color: var(--ec-danger);
      background: var(--ec-glass, rgba(255, 253, 249, 0.9));
      border-radius: var(--ec-radius-sm);
      ion-icon { font-size: 1rem; flex-shrink: 0; }
    }
    .ec-pass-requisitos {
      list-style: none; margin: 2px 0 0; padding: 8px 12px;
      display: grid; grid-template-columns: 1fr 1fr; gap: 4px 12px;
      background: var(--ec-surface-2); border-radius: var(--ec-radius-md);
      font-size: 0.76rem; color: var(--ec-text-muted);
      li { display: flex; align-items: center; gap: 5px;
        ion-icon { font-size: 0.95rem; flex-shrink: 0; color: var(--ec-border); } }
      li.ec-req-ok { color: var(--ec-success, #2e7d32);
        ion-icon { color: var(--ec-success, #2e7d32); } }
    }
    .ec-reset-submit {
      --border-radius: var(--ec-radius-full);
      margin-top: var(--ec-space-sm); font-weight: 600;
      --background: var(--ec-primary); height: 48px;
      text-transform: none; letter-spacing: 0;
    }
    .ec-reset-error {
      border: 1px solid rgba(198, 40, 40, 0.35);
      background: rgba(198, 40, 40, 0.08);
      color: var(--ec-danger, #b3261e);
      border-radius: var(--ec-radius-md);
      padding: 10px 14px; font-size: 0.88rem; line-height: 1.5;
      margin-bottom: var(--ec-space-md);
    }
    /* Toast fijo: el error del servidor no desplaza el contenido de la tarjeta.
       El estado "enlace inválido" (sin --toast) sí es contenido de la vista. */
    .ec-reset-error--toast {
      position: fixed;
      top: calc(env(safe-area-inset-top, 0px) + 12px);
      inset-inline: var(--ec-space-md);
      z-index: var(--ec-z-toast);
      max-width: 720px;
      margin: 0 auto;
      animation: ec-toast-in var(--ec-duration-slow) var(--ec-ease-out) both;

      /* En la shell de escritorio (> = 992px) el header sticky ocupa la franja
         superior: el toast fixed con top 12px lo tapaba (DEF-ERR-NAV). */
      @media (min-width: 992px) {
        top: calc(var(--ec-header-h) + var(--ec-space-md));
      }
    }
    @keyframes ec-toast-in {
      from { opacity: 0; transform: translateY(-8px); }
      to { opacity: 1; transform: none; }
    }
    .ec-reset-ok {
      border: 1px solid rgba(46, 125, 50, 0.35);
      background: rgba(46, 125, 50, 0.08);
      color: var(--ec-success, #2e7d32);
      border-radius: var(--ec-radius-md);
      padding: 10px 14px; font-size: 0.88rem; line-height: 1.5;
      margin-bottom: var(--ec-space-md);
    }
    .ec-reset-verificando {
      display: flex; align-items: center; justify-content: center; gap: var(--ec-space-sm);
      color: var(--ec-text-muted); font-size: 0.9rem; padding: var(--ec-space-lg) 0;
    }
    .ec-reset-footer { margin: var(--ec-space-lg) 0 0; font-size: 0.85rem;
      a { color: var(--ec-text-muted); font-weight: 600; text-decoration: none;
        &:hover { text-decoration: underline; } }
    }
  `]
})
export class RestablecerContrasenaPage {
  private readonly api = inject(ApiService);
  private readonly router = inject(Router);
  private readonly ruta = inject(ActivatedRoute);
  private readonly fb = inject(FormBuilder);

  readonly guardando = signal(false);
  readonly errorServidor = signal<string | null>(null);
  readonly listo = signal(false);

  // ---- Token temporal del flujo desacoplado (?token=<JWT>) ----
  /** JWT del enlace (base64 con exp); null cuando se abrió sin token. */
  readonly token = signal<string | null>(null);
  /** Claims decodificados localmente: usado SOLO para la vista (el servidor revalida). */
  private readonly claims = signal<{ email: string; exp: number } | null>(null);

  /** ¿Abrimos la pantalla con un token temporal en la URL? */
  readonly conToken = computed(() => this.token() !== null);
  /** ¿El token mira bien a nivel local? (firma/exp los revalida el servidor) */
  readonly tokenValido = computed(() => {
    const c = this.claims();
    return !!c && c.exp * 1000 > Date.now();
  });
  /** Correo cifrado en el payload para el aviso de la pantalla. */
  readonly tokenEmail = computed(() => this.claims()?.email ?? '');

  constructor() {
    // Leemos el token temporal del enlace (?token=<JWT>) una vez: si existe,
    // decodificamos sus claims para la vista (el servidor revalida firma/exp).
    const jwt = this.ruta.snapshot.queryParamMap.get('token');
    if (jwt) {
      this.token.set(jwt);
      try {
        const parte = jwt.split('.')[1];
        let base64 = parte.replace(/-/g, '+').replace(/_/g, '/');
        while (base64.length % 4 !== 0) base64 += '=';
        const payload = JSON.parse(atob(base64)) as { email?: unknown; exp?: unknown };
        this.claims.set({
          email: String(payload.email ?? ''),
          exp: Number(payload.exp ?? 0)
        });
      } catch {
        this.claims.set(null); // token malformado: la vista mostrará "enlace inválido"
      }
    }
  }

  readonly formulario = this.fb.nonNullable.group(
    {
      password: ['', {
        validators: [Validators.required, Validators.minLength(8), Validators.maxLength(72), PasswordRulesValidator.conReglasFuertes()]
      }],
      confirmar: ['', { validators: [Validators.required] }]
    },
    { validators: PasswordRulesValidator.coincide('password', 'confirmar') }
  );

  /** ¿El enlace nos dejó con sesión válida para fijar la contraseña? */
  readonly sesionActiva = computed(() => this.api.estaAutenticado());

  /** ¿Puedo mostrar el formulario? Token temporal válido O sesión del flujo legacy. */
  readonly puedeFijar = computed(() => (this.conToken() ? this.tokenValido() : this.sesionActiva()));

  /** ¿Sesión restaurada de localStorage: evita mostrar "enlace inválido" antes de tiempo. */
  readonly verificando = computed(() => !this.conToken() && !this.api.sesionLista());

  /** Requisitos de la contraseña en vivo. */
  readonly requisito = computed(() => {
    const valor = String(this.formulario.get('password')?.value ?? '');
    return {
      mayus: /[A-Z]/.test(valor),
      minus: /[a-z]/.test(valor),
      numero: /\d/.test(valor),
      simbolo: /[^A-Za-z0-9]/.test(valor),
      largo: valor.length >= 8
    };
  });

  errorPara(campo: 'password' | 'confirmar'): string | null {
    const ctrl: AbstractControl | null = this.formulario.get(campo);
    if (!ctrl || !(ctrl.dirty || ctrl.touched)) return null;
    const errors: ValidationErrors | null = ctrl.errors;
    if (!errors) return null;

    if (campo === 'password') {
      if (errors['required']) return 'Ingresa tu contraseña nueva.';
      if (errors['minlength']) return 'La contraseña debe tener al menos 8 caracteres.';
      if (errors['maxlength']) return 'La contraseña es demasiado larga (máx. 72).';
      if (errors['sinMayuscula']) return 'La contraseña debe incluir al menos una mayúscula.';
      if (errors['sinMinuscula']) return 'La contraseña debe incluir al menos una minúscula.';
      if (errors['sinNumero']) return 'La contraseña debe incluir al menos un número.';
      if (errors['sinSimbolo']) return 'La contraseña debe incluir al menos un carácter especial. Ej: !@#$%…';
    }
    if (campo === 'confirmar') {
      if (errors['required']) return 'Confirma tu contraseña.';
      if (errors['coiniden']) return 'Las contraseñas no coinciden.';
    }
    return 'Revisa este campo.';
  }

  async enviar(): Promise<void> {
    if (this.formulario.invalid) {
      this.formulario.markAllAsTouched();
      document
        .querySelector<HTMLElement>('ion-input.ng-invalid input')
        ?.focus();
      return;
    }
    this.guardando.set(true);
    this.errorServidor.set(null);
    try {
      if (this.conToken()) {
        // ---- Flujo desacoplado: el servidor (Edge Function) revalida el JWT
        // temporal (firma + exp + un solo uso) y escribe la contraseña nueva
        // en la base de datos vía Admin API. ----
        const { email } = await this.api.confirmarResetContrasena(
          this.token() as string,
          this.formulario.getRawValue().password
        );
        try {
          // Sesión automática con la contraseña nueva: directo a /home.
          await this.api.ingresar(email, this.formulario.getRawValue().password);
          void this.router.navigateByUrl('/home');
          return;
        } catch {
          // Si el auto-login falla, la pantalla de éxito da el paso manual.
          this.listo.set(true);
          return;
        }
      }
      // ---- Flujo legacy (enlace de Supabase Auth): la sesión de un solo uso
      // permite updateUser; al cambiar la contraseña, Supabase suele cerrar la
      // sesión actual (revoke tokens). ----
      await this.api.actualizarContrasena(this.formulario.getRawValue().password);
      this.listo.set(true);
      // Tras el cambio la sesión queda inválida: al login para entrar con la nueva.
      await new Promise((r) => setTimeout(r, 1200));
      void this.router.navigateByUrl('/login');
    } catch (e: unknown) {
      const err = e as { message?: string };
      this.errorServidor.set(
        err.message || 'No se pudo guardar la contraseña. Intenta de nuevo.'
      );
    } finally {
      this.guardando.set(false);
    }
  }
}
