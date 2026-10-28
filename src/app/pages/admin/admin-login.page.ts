import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { IonButton, IonInput } from '@ionic/angular';
import { AdminAuthService } from '../../core/services/admin-auth.service';

/**
 * Ingreso del panel de administración.
 *
 * PROVISIONAL: valida contra credenciales fijas (admin / admin) definidas en
 * AdminAuthService; el plan es migrar a Supabase Auth con rol 'admin'.
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

  readonly usuario = signal('');
  readonly clave = signal('');
  readonly error = signal('');
  readonly cargando = signal(false);

  constructor() {
    // Si la sesión del panel ya está activa, esta URL es directamente el
    // dashboard (una sola URL para quien gestiona).
    if (this.admin.autenticado()) {
      void this.router.navigateByUrl('/v00/admin/panel', { replaceUrl: true });
    }
  }

  async ingresar(): Promise<void> {
    this.error.set('');
    this.cargando.set(true);
    // Pequeña pausa deliberada: evita que el botón parpadee y amortigua fuerza bruta.
    await new Promise((r) => setTimeout(r, 250));
    const ok = this.admin.ingresar(this.usuario(), this.clave());
    this.cargando.set(false);
    if (ok) {
      void this.router.navigateByUrl('/v00/admin/panel');
    } else {
      this.error.set('Usuario o contraseña incorrectos.');
    }
  }
}
