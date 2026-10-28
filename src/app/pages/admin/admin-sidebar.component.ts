import {
  ChangeDetectionStrategy,
  Component,
  Input,
  OnDestroy,
  effect,
  inject,
  signal
} from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { AdminAuthService } from '../../core/services/admin-auth.service';
import { AdminUiService } from './admin-ui.service';

/**
 * Ventana lateral del panel de administración, compartida por todas las
 * páginas internas. Fija a la ventana (top 0 → bottom 0) y, en pantallas
 * angostas, se vuelve drawer con el botón ☰ del encabezado de cada página.
 *
 * En pantallas anchas también se puede CONTRAER a un riel delgado (72 px
 * con solo las iniciales del menú) con el botón del borde derecho; el
 * contenido se reencola con la clase global `ec-admin-contraido` (global.scss).
 */
@Component({
  selector: 'app-admin-sidebar',
  standalone: true,
  imports: [RouterLink],
  templateUrl: './admin-sidebar.component.html',
  styleUrl: './admin-sidebar.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class AdminSidebarComponent implements OnDestroy {
  /** Sección activa del menú (página actual). */
  @Input() activo: 'dashboard' | 'eventos' | 'paginas' | 'organizadores' = 'dashboard';

  private readonly admin = inject(AdminAuthService);
  private readonly router = inject(Router);

  /** Servicio de interfaz compartido (drawer + riel contraído). */
  readonly ui = inject(AdminUiService);

  /** Identidad de la sesión (usuario + rol) para el pie del lateral. */
  readonly sesion = this.admin.sesion;

  /** Menú de opciones bajo el usuario (salir, etc.). */
  readonly menuAbierto = signal(false);

  /**
   * Refleja el riel contraído como clase del <body>: la re-encoladura del
   * contenido pertenence a las páginas (admin-panel.shared.scss) y a la
   * regla global de global.scss, no al encapsulamiento de este componente.
   */
  private readonly reflejarContraido = effect(() => {
    document.body.classList.toggle(
      'ec-admin-contraido',
      this.ui.lateralContraido()
    );
  });

  /** Sin el sidebar en el árbol, la clase ya no debe condicionar el body. */
  ngOnDestroy(): void {
    document.body.classList.remove('ec-admin-contraido');
  }

  abrirMenu(): void {
    this.menuAbierto.update((v) => !v);
  }

  cerrarMenu(): void {
    this.menuAbierto.set(false);
  }

  salir(): void {
    this.admin.salir();
    // Al salir se vuelve al sitio público, no a la URL de ingreso ofuscada.
    this.ui.lateralAbierto.set(false);
    void this.router.navigateByUrl('/home');
  }

  /** Ir al sitio público sin cerrar la sesión del panel. */
  irAlSitio(): void {
    this.cerrarMenu();
    this.ui.lateralAbierto.set(false);
    void this.router.navigateByUrl('/home');
  }
}
