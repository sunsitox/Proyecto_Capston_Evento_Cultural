import {
  Component,
  ElementRef,
  NgZone,
  effect,
  inject,
  signal,
  viewChild
} from '@angular/core';
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
  private readonly host = inject(ElementRef<HTMLElement>);
  readonly api = inject(ApiService);

  private readonly tabbarRef = viewChild<ElementRef<HTMLElement>>('tabbarRef');

  /**
   * DEF-QA-002 (robusto): mide la altura REAL de la tab bar (iconos +
   * labels + safe-area del dispositivo) y la publica como --ec-tabbar-h.
   * CSS reserva esa altura exacta bajo el contenido móvil, así el mapa,
   * calendario y perfil nunca quedan bajo la barra, aunque cambie el zoom
   * del sistema o el tamaño de la fuente.
   */
  private readonly medirTabbar = effect(() => {
    const barra = this.tabbarRef()?.nativeElement;
    if (!barra || typeof ResizeObserver === 'undefined') return;
    const host = this.host.nativeElement;
    const publicar = (): void => {
      const altura = Math.round(barra.getBoundingClientRect().height);
      if (altura > 0) {
        host.style.setProperty('--ec-tabbar-h', `${altura}px`);
      }
    };
    publicar();
    const observador = new ResizeObserver(() => {
      this.zone.runOutsideAngular(() => publicar());
    });
    observador.observe(barra);
    return () => observador.disconnect();
  });

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
        // DEF-QA-004: cada ruta arranca arriba (antes conservaba el scroll).
        this.volverArriba();
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

  /** DEF-QA-004: reinicia el scroll del contenedor que corresponda
   *  (ion-content en móvil, .ec-web-layout en escritorio, ventana). */
  private volverArriba(): void {
    try {
      const contenido = document.querySelector('ion-content');
      (contenido as unknown as { scrollToTop?: (dur: number) => void })?.scrollToTop?.(0);
    } catch {
      /* sin ion-content visible, siguen los otros contenedores */
    }
    try {
      document.querySelector('.ec-web-layout')?.scrollTo(0, 0);
    } catch {
      /* shell móvil: no existe este nodo */
    }
    if (typeof window !== 'undefined') {
      window.scrollTo(0, 0);
    }
  }
}

