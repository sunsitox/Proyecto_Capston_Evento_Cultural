import { Component, computed, signal, inject } from '@angular/core';
import {
  AbstractControl,
  FormBuilder,
  ReactiveFormsModule,
  ValidationErrors,
  Validators
} from '@angular/forms';
import { RouterLink, Router } from '@angular/router';
import { ApiService } from '../../core/services/api.service';
import {
  PasswordRulesValidator,
  sinNumerosNiRaros
} from '../../shared/validators/password-rules.validator';
import {
  IonItem,
  IonInput,
  IonButton,
  IonIcon,
  IonCheckbox,
  IonSegment,
  IonSegmentButton,
  IonLabel,
  IonSpinner
} from '@ionic/angular';

@Component({
  selector: 'app-login',
  standalone: true,
  imports: [
    ReactiveFormsModule,
    RouterLink,
    IonItem,
    IonInput,
    IonButton,
    IonIcon,
    IonCheckbox,
    IonSegment,
    IonSegmentButton,
    IonLabel,
    IonSpinner
  ],
  templateUrl: './login.page.html',
  styleUrl: './login.page.scss'
})
export class LoginPage {
  readonly modo = signal<'ingresar' | 'registrarse'>('ingresar');
  readonly cargando = signal(false);
  readonly errorServidor = signal<string | null>(null);
  private readonly api = inject(ApiService);

  private readonly fb = inject(FormBuilder);
  private readonly router = inject(Router);

  readonly formulario = this.fb.nonNullable.group(
    {
      nombre: ['', { validators: [Validators.required, Validators.minLength(3), Validators.maxLength(80), sinNumerosNiRaros] }],
      email: ['', { validators: [Validators.required, Validators.email] }],
      password: ['', {
        validators: [Validators.required, Validators.minLength(8), Validators.maxLength(72), PasswordRulesValidator.conReglasFuertes()]
      }],
      confirmar: ['', { validators: [Validators.required] }],
      esOrganizador: [false]
    },
    { validators: PasswordRulesValidator.coincide('password', 'confirmar') }
  );

  /**
   * La página arranca en modo 'ingresar': deshabilita los controles de
   * registro para que no bloqueen la validación del login (bug: el form
   * quedaba ng-invalid y enviar() no llamaba nunca a /api/auth/login).
   */
  constructor() {
    this.cambiarModo('ingresar');
  }

  cambiarModo(valor: string | number | undefined): void {
    this.modo.set(valor === 'registrarse' ? 'registrarse' : 'ingresar');
    this.errorServidor.set(null);
    // En modo ingresar solo email+password aplican: los demás controles se
    // deshabilitan para que sus validadores no bloqueen el envío del login.
    if (this.modo() === 'ingresar') {
      this.formulario.get('nombre')?.disable();
      this.formulario.get('esOrganizador')?.disable();
      this.formulario.get('confirmar')?.reset();
      this.formulario.get('confirmar')?.disable();
    } else {
      this.formulario.get('nombre')?.enable();
      this.formulario.get('esOrganizador')?.enable();
      this.formulario.get('confirmar')?.enable();
    }
  }

  /** Requisitos de la contraseña cumplidos en vivo (solo registro). */
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

  /** Mensaje de error específico por campo, devuelve null si todo OK. */
  errorPara(campo: 'nombre' | 'email' | 'password' | 'confirmar'): string | null {
    const ctrl: AbstractControl | null = this.formulario.get(campo);
    if (!ctrl || !(ctrl.dirty || ctrl.touched)) return null;
    const errors: ValidationErrors | null = ctrl.errors;
    if (!errors) return null;

    if (campo === 'nombre') {
      if (errors['required']) return 'Ingresa tu nombre.';
      if (errors['minlength']) return 'El nombre debe tener al menos 3 caracteres.';
      if (errors['maxlength']) return 'El nombre es demasiado largo (máx. 80).';
      if (errors['formatoNombre']) return 'El nombre solo puede contener letras, espacios, acentos, ñ, guiones y puntos.';
    }
    if (campo === 'email') {
      if (errors['required']) return 'Ingresa tu correo electrónico.';
      if (errors['email']) return 'El formato del correo no es válido.';
    }
    if (campo === 'password') {
      if (errors['required']) return 'Ingresa tu contraseña.';
      if (errors['minlength']) return 'La contraseña debe tener al menos 8 caracteres.';
      if (errors['maxlength']) return 'La contraseña es demasiado larga (máx. 72).';
      if (errors['sinMayuscula']) return 'La contraseña debe incluir al menos una mayúscula.';
      if (errors['sinMinuscula']) return 'La contraseña debe incluir al menos una minúscula.';
      if (errors['sinNumero']) return 'La contraseña debe incluir al menos un número.';
      if (errors['sinSimbolo']) return 'La contraseña debe incluir al menos un carácter especial.Ej: !@#$%…';
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
      // Enfocar el primer control inválido para soporte de teclado / screen readers.
      const primerInvalido = document.querySelector<HTMLElement>(
        'ion-input.ec-auth-input.ng-invalid input, ion-input.ec-auth-input.ng-invalid textarea'
      );
      primerInvalido?.focus();
      return;
    }

    this.cargando.set(true);
    this.errorServidor.set(null);
    const { nombre, email, password, esOrganizador } = this.formulario.getRawValue();
    try {
      if (this.modo() === 'registrarse') {
        // El rol elegido en el registro debe persistir en la cuenta: es lo que
        // decide si luego ve el formulario de publicación.
        const { correoAConfirmar } = await this.api.registrar(
          email!,
          password!,
          nombre!,
          esOrganizador ? 'organizador' : 'usuario'
        );
        if (correoAConfirmar) {
          // Supabase con "Confirm email" activado: el usuario existe, falta
          // verificar el buzón; no intentamos login todavía.
          this.errorServidor.set(
            'Cuenta creada. Te enviamos un correo de confirmación: ' +
            'revísalo (y la carpeta de spam) e inicia sesión después de confirmar.'
          );
          this.formulario.get('password')?.reset();
          this.formulario.get('confirmar')?.reset();
          return;
        }
      }
      const usuario = await this.api.ingresar(email!, password!);
      await this.router.navigateByUrl(usuario.rol === 'organizador' ? '/publicar' : '/home');
    } catch (e: unknown) {
      const err = e as { message?: string; error_description?: string };
      const mensaje = err.error_description || err.message || '';
      if (/not confirmed/i.test(mensaje)) {
        this.errorServidor.set(
          'Correo sin confirmar: revisa tu email (o spam) y confirma tu cuenta antes de iniciar sesión.'
        );
      } else if (/invalid login|invalid credentials/i.test(mensaje)) {
        this.errorServidor.set('Correo o contraseña incorrectos.');
      } else if (/already registered/i.test(mensaje)) {
        this.errorServidor.set('Este correo ya está registrado. Inicia sesión.');
      } else {
        this.errorServidor.set(
          mensaje || 'No fue posible conectar con Supabase. Verifica tu conexión e intenta de nuevo.'
        );
      }
    } finally {
      this.cargando.set(false);
    }
  }

  /**
   * Inicia sesión con proveedor externo (OAuth). PREPARADO: requiere que el
   * proveedor esté activado en Supabase Auth y que la URL de redirección
   * (http://localhost:4200/auth/callback) esté registrada en Redirect URLs.
   */
  ingresarConOAuth(): void {
    this.errorServidor.set(null);
    this.api.iniciarOAuth('google');
  }
}

