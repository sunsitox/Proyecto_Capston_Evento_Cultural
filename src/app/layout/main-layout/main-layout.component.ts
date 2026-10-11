import { Component, NgZone, inject, signal } from '@angular/core';
import {
  NavigationEnd,
  Router,
  RouterLink,
  RouterLinkActive,
  RouterOutlet
} from '@angular/router';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import {
  IonContent,
  IonHeader,
  IonToolbar,
  IonButton,
  IonIcon,
  IonTabBar,
  IonTabButton,
  IonLabel
} from '@ionic/angular';
import { DiscoverLayoutComponent } from '../../features/home/discover/discover-layout.component';
import { ApiService } from '../../core/services/api.service';

/**
 * Shell principal con dos presentaciones según viewport:
 * - Web (>= 992px): header + página Descubrir en rutas de descubrimiento,
 *   router-outlet para el resto de rutas, y footer institucional.
 * - Móvil (< 992px): ion-content + tab bar.
 *
 * La presencia en el DOM se controla con esEscritorio() (matchMedia) y no con
 * clases ion-hide-*, porque las clases CSS ocultan pero no retiran el nodo:
 * dos <router-outlet> primarios simultáneos provocan contenido en blanco
 * según el orden de registro.
 */
@Component({
  selector: 'app-main-layout',
  standalone: true,
  imports: [
    RouterOutlet,
    RouterLink,
    RouterLinkActive,
    IonContent,
    IonHeader,
    IonToolbar,
    IonButton,
    IonIcon,
    IonTabBar,
    IonTabButton,
    IonLabel,
    DiscoverLayoutComponent
  ],
  templateUrl: './main-layout.component.html',
  styleUrl: './main-layout.component.scss'
})
export class MainLayoutComponent {
  private readonly zone = inject(NgZone);
  private readonly router = inject(Router);
  readonly api = inject(ApiService);

  /** true cuando el viewport corresponde al shell web (>= 992px) */
  readonly esEscritorio = signal(this.calcularEscritorio());

  /** true en rutas de descubrimiento, donde el shell web muestra Descubrir */
  readonly esVistaDescubrir = signal(this.esUrlDescubrir(this.router.url));

  /**
   * Hay ficha de evento activa: el <main> se marca con .ec-vt-detalle
   * para que la View Transition entre/salga lateralmente (slide).
   */
  readonly esFichaActiva = signal(this.esUrlFicha(this.router.url));

  constructor() {
    this.router.events.pipe(takeUntilDestroyed()).subscribe((evento) => {
      if (evento instanceof NavigationEnd) {
        this.esVistaDescubrir.set(this.esUrlDescubrir(evento.urlAfterRedirects));
        this.esFichaActiva.set(this.esUrlFicha(evento.urlAfterRedirects));
      }
    });

    if (typeof matchMedia !== 'undefined') {
      const mq = matchMedia('(min-width: 992px)');
      mq.addEventListener('change', (ev) => {
        this.zone.run(() => this.esEscritorio.set(ev.matches));
      });
    }
  }

  private calcularEscritorio(): boolean {
    return typeof matchMedia === 'undefined'
      ? true
      : matchMedia('(min-width: 992px)').matches;
  }

  private esUrlDescubrir(url: string): boolean {
    return url === '/' || url.startsWith('/home') || url.startsWith('/buscar');
  }

  private esUrlFicha(url: string): boolean {
    return url.startsWith('/evento/');
  }
}

