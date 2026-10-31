import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  HostListener,
  effect,
  input,
  output,
  viewChild
} from '@angular/core';
import { IonIcon } from '@ionic/angular';

/**
 * Bottom sheet reutilizable (patrón móvil nativo).
 *
 * Panel inferior con overlay suave: entra/sale desde abajo en ~200 ms,
 * con asa visual, título y cierre accesible (Escape, backdrop, botón).
 * El contenido se proyecta; un bloque con el atributo `sheetFooter`
 * queda fijo como pie del panel (para "Aplicar" / "Limpiar").
 *
 * Accesibilidad: role=dialog + aria-modal, foco al abrir, foco
 * atrapado dentro del panel mientras está abierto y devolución del
 * foco al cerrar. Bloqueo de scroll del body. Respeta
 * prefers-reduced-motion vía tokens globales.
 */
@Component({
  selector: 'app-bottom-sheet',
  standalone: true,
  imports: [IonIcon],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (abierto()) {
      <div class="ec-sheet-backdrop" (click)="cerrar.emit()" aria-hidden="true"></div>
    }

    <div
      class="ec-sheet"
      [class.ec-sheet--open]="abierto()"
      role="dialog"
      aria-modal="true"
      [attr.aria-label]="titulo() || 'Panel'"
      (keydown)="trapFocus($event)"
    >
      <span class="ec-sheet__asa" aria-hidden="true"></span>

      <header class="ec-sheet__header">
        <h2 class="ec-sheet__titulo">{{ titulo() }}</h2>
        <button
          #btnCerrar
          type="button"
          class="ec-sheet__cerrar"
          aria-label="Cerrar panel"
          (click)="cerrar.emit()"
        >
          <ion-icon name="close-outline" aria-hidden="true"></ion-icon>
        </button>
      </header>

      <div class="ec-sheet__contenido">
        <ng-content></ng-content>
      </div>

      <div class="ec-sheet__pie" [class.ec-sheet__pie--vacio]="!conPie()">
        <ng-content select="[sheetFooter]"></ng-content>
      </div>
    </div>
  `,
  styles: `
    .ec-sheet-backdrop {
      position: fixed;
      inset: 0;
      background: var(--ec-backdrop, rgba(33, 28, 22, 0.45));
      backdrop-filter: blur(2px);
      z-index: var(--ec-z-backdrop, 1000);
      animation: ec-sheet-fade var(--ec-duration-medium, 200ms) var(--ec-ease, ease) both;
    }

    .ec-sheet {
      position: fixed;
      left: 0;
      right: 0;
      bottom: 0;
      max-width: 640px;
      margin: 0 auto;
      max-height: min(86vh, 720px);
      display: flex;
      flex-direction: column;
      background: var(--ec-surface);
      border: var(--ec-border-width, 1px) solid var(--ec-border-light);
      border-bottom: none;
      border-radius: var(--ec-radius-xl, 22px) var(--ec-radius-xl, 22px) 0 0;
      box-shadow: var(--ec-shadow-lg, 0 14px 40px rgba(60, 47, 33, 0.12));
      z-index: var(--ec-z-overlay, 1001);
      transform: translateY(100%);
      visibility: hidden;
      transition:
        transform var(--ec-duration-medium, 200ms) var(--ec-ease, ease),
        visibility 0s linear var(--ec-duration-medium, 200ms);
    }

    .ec-sheet--open {
      transform: translateY(0);
      visibility: visible;
      transition: transform var(--ec-duration-medium, 200ms) var(--ec-ease, ease);
    }

    .ec-sheet__asa {
      flex-shrink: 0;
      width: 44px;
      height: 4px;
      margin: 10px auto 2px;
      border-radius: 999px;
      background: var(--ec-border);
    }

    .ec-sheet__header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 8px;
      padding: 6px 16px 10px;
      border-bottom: var(--ec-border-width, 1px) solid var(--ec-border-light);
      flex-shrink: 0;
    }

    .ec-sheet__titulo {
      margin: 0;
      font-family: var(--ec-font-serif, serif);
      font-size: 1.05rem;
      color: var(--ec-text-dark);
    }

    .ec-sheet__cerrar {
      display: flex;
      align-items: center;
      justify-content: center;
      width: var(--ec-touch-target, 44px);
      height: var(--ec-touch-target, 44px);
      padding: 0;
      border: none;
      border-radius: 50%;
      background: var(--ec-surface-2);
      color: var(--ec-text-muted);
      cursor: pointer;

      ion-icon {
        font-size: 1.3rem;
      }

      &:hover {
        background: var(--ec-surface-hover);
        color: var(--ec-text-dark);
      }

      &:focus-visible {
        outline: var(--ec-focus-ring-width, 3px) solid var(--ec-focus);
        outline-offset: 2px;
      }
    }

    .ec-sheet__contenido {
      flex: 1;
      overflow-y: auto;
      -webkit-overflow-scrolling: touch;
      padding: 16px 16px 8px;
    }

    .ec-sheet__pie {
      display: flex;
      gap: 8px;
      padding: 12px 16px calc(12px + env(safe-area-inset-bottom, 0px));
      border-top: var(--ec-border-width, 1px) solid var(--ec-border-light);
      background: var(--ec-surface);
      border-radius: 0 0 0 0;
      flex-shrink: 0;

      .ec-btn {
        flex: 1;
      }
    }

    /* Sin footer proyectado, no reservar espacio */
    .ec-sheet__pie--vacio {
      display: none;
    }

    @keyframes ec-sheet-fade {
      from {
        opacity: 0;
      }
    }

    /* En escritorio el sheet se presenta centrado como panel modal suave */
    @media (min-width: 992px) {
      .ec-sheet {
        bottom: auto;
        top: 50%;
        left: 50%;
        right: auto;
        width: min(560px, 92vw);
        max-height: 82vh;
        border-radius: var(--ec-radius-lg, 16px);
        border-bottom: var(--ec-border-width, 1px) solid var(--ec-border-light);
        transform: translate(-50%, -40%) scale(0.98);
        opacity: 0;
        transition:
          transform var(--ec-duration-fast, 120ms) var(--ec-ease, ease),
          opacity var(--ec-duration-fast, 120ms) var(--ec-ease, ease),
          visibility 0s linear var(--ec-duration-fast, 120ms);
      }

      .ec-sheet--open {
        transform: translate(-50%, -50%) scale(1);
        opacity: 1;
        transition:
          transform var(--ec-duration-fast, 120ms) var(--ec-ease, ease),
          opacity var(--ec-duration-fast, 120ms) var(--ec-ease, ease);
      }

      .ec-sheet__asa {
        display: none;
      }
    }
  `
})
export class BottomSheetComponent {
  /** Estado abierto/cerrado (controlado por el padre). */
  readonly abierto = input.required<boolean>();

  /** Título del panel (aria-label del diálogo). */
  readonly titulo = input('');

  /** Renderizar el pie (falso si el panel no lleva acciones). */
  readonly conPie = input(true);
  readonly cerrar = output<void>();

  private readonly btnCerrar = viewChild<ElementRef<HTMLButtonElement>>('btnCerrar');

  private focoPrevio: HTMLElement | null = null;

  constructor() {
    // Bloquea el scroll del body, guarda el foco previo y lo mueve al
    // botón de cierre al abrir; lo devuelve al cerrar.
    effect(() => {
      const abierto = this.abierto();
      if (typeof document === 'undefined') return;

      document.body.style.overflow = abierto ? 'hidden' : '';

      if (abierto) {
        this.focoPrevio = document.activeElement as HTMLElement | null;
        setTimeout(() => this.btnCerrar()?.nativeElement.focus(), 30);
      } else if (this.focoPrevio) {
        // Devolver el foco al control que abrió el panel (WCAG 2.4.3).
        const destino = this.focoPrevio;
        this.focoPrevio = null;
        setTimeout(() => destino.focus(), 30);
      }
    });
  }

  /** Focus trap: Tab / Shift+Tab ciclan dentro del panel (WCAG 2.4.3). */
  trapFocus(event: KeyboardEvent): void {
    if (event.key !== 'Tab' || !this.abierto()) return;

    const panel = event.currentTarget as HTMLElement;
    const nodos = Array.from(
      panel.querySelectorAll<HTMLElement>(
        'button:not([disabled]), a[href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
      )
    ).filter((el) => el.offsetParent !== null || el === document.activeElement);

    if (nodos.length === 0) return;

    const primero = nodos[0];
    const ultimo = nodos[nodos.length - 1];
    const activo = document.activeElement;

    if (event.shiftKey && (activo === primero || !panel.contains(activo))) {
      event.preventDefault();
      ultimo.focus();
    } else if (!event.shiftKey && (activo === ultimo || !panel.contains(activo))) {
      event.preventDefault();
      primero.focus();
    }
  }

  /** Cierre con Escape (WCAG 2.1.2: todo diálogo se puede cerrar). */
  @HostListener('document:keydown.escape')
  onEscape(): void {
    if (this.abierto()) {
      this.cerrar.emit();
    }
  }
}
