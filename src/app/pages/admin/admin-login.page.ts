import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { IonButton, IonInput } from '@ionic/angular';
import { AdminAccesoError, AdminAuthService } from '../../core/services/admin-auth.service';

/**
 * Ingreso del panel de administración con Supabase Auth real:
 * correo + contraseña de una cuenta cuyo rol en public.profiles sea 'admin'
 * y que NO provenga de un proveedor OAuth. Las cuentas 'visitor' y 'editor'
 * se rechazan con un mensaje específico.
 */
@Component({
  selector: 'app-admin-login',
  standalone: true,
  imports: [FormsModule, IonButton, IonInput],
  templateUrl: './admin-login.page.html',
  styleUrl: './admin-login.page.scss',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class AdminLoginPage {
  private readonly admin = inject(AdminAuthService);
  private readonly router = inject(Router);

  readonly correo = signal('');
  readonly clave = signal('');
  readonly error = signal('');
  readonly cargando = signal(false);

  constructor() {
    // Si ya hay una sesión de administrador vigente (Supabase la mantiene
    // entre recargas), esta URL actúa como el dashboard directamente.
    void this.admin.validarSesionActual().then((ok) => {
      if (ok) {
        void this.router.navigateByUrl('/v00/admin/panel', { replaceUrl: true });
      }
    });
  }

  async ingresar(): Promise<void> {
    if (this.cargando()) return;
    this.error.set('');
    if (!this.correo().trim() || !this.clave()) {
      this.error.set('Ingresa tu correo y contraseña.');
      return;
    }
    this.cargando.set(true);
    try {
      await this.admin.ingresar(this.correo().trim(), this.clave());
      void this.router.navigateByUrl('/v00/admin/panel');
    } catch (e: unknown) {
      if (e instanceof AdminAccesoError) {
        this.error.set(e.message);
      } else {
        this.error.set('No se pudo iniciar sesión. Intenta de nuevo.');
      }
    } finally {
      this.cargando.set(false);
    }
  }
}
