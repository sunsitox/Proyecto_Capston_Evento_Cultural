import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';
import { IonIcon } from '@ionic/angular';

/**
 * Acciones de interés por evento (reemplazan al botón de favoritos).
 *
 * - "Me interesa": señal alta de interés.
 * - "Ver similares": señal media/alta, navega a descubrir con filtros.
 * - "No me interesa": señal negativa que oculta la tarjeta de la vista.
 *
 * No existe "guardar" ni favoritos: sólo señales temporales de esta
 * visita que el futuro backend convertirá en recomendaciones.
 *
 * Estado (aria-pressed) se comunica también con texto y forma — nunca
 * sólo con color.
 */
@Component({
  selector: 'app-event-interest-actions',
  standalone: true,
  imports: [IonIcon],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="ec-interest" role="group" [attr.aria-label]="'Acciones de interés para ' + titulo()">
      <button
        type="button"
        class="ec-interest-btn"
        [class.ec-interest-btn--on]="activo()"
        [attr.aria-pressed]="activo()"
        (click)="toggleMeInteresa($event)"
      >
        <ion-icon [name]="activo() ? 'sparkles' : 'sparkles-outline'" aria-hidden="true"></ion-icon>
        <span>{{ activo() ? 'Te interesa' : 'Me interesa' }}</span>
      </button>

      @if (mostrarNoMeInteresa() && modo() === 'completo') {
        <button
          type="button"
          class="ec-interest-btn ec-interest-btn--quiet"
          (click)="noMeInteresa($event)"
        >
          <ion-icon name="close-circle-outline" aria-hidden="true"></ion-icon>
          <span>No me interesa</span>
        </button>
      }

      @if (mostrarVerSimilares() && modo() === 'completo') {
        <button
          type="button"
          class="ec-interest-btn ec-interest-btn--quiet"
          (click)="verSimilares($event)"
        >
          <ion-icon name="grid-outline" aria-hidden="true"></ion-icon>
          <span>Ver similares</span>
        </button>
      }
    </div>
  `,
  styles: `
    :host {
      display: block;
      min-width: 0;
    }

    .ec-interest {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      gap: var(--ec-space-xs, 6px);
    }

    .ec-interest-btn {
      display: inline-flex;
      align-items: center;
      gap: 5px;
      min-height: var(--ec-touch-target, 44px);
      padding: 0 12px;
      border: var(--ec-border-width, 1px) solid var(--ec-border-light, #ece4d7);
      border-radius: var(--ec-radius-full, 999px);
      background: var(--ec-surface, #fffdf9);
      color: var(--ec-text-dark, #211c16);
      font: inherit;
      font-size: 0.78rem;
      font-weight: 600;
      cursor: pointer;
      transition:
        background var(--ec-duration-fast, 0.15s) var(--ec-ease, ease),
        border-color var(--ec-duration-fast, 0.15s) var(--ec-ease, ease),
        transform var(--ec-duration-fast, 0.15s) var(--ec-ease, ease);

      ion-icon {
        font-size: 1rem;
        flex-shrink: 0;
      }

      &:hover {
        border-color: var(--ec-primary, #7a4f2e);
        background: var(--ec-primary-bg, #f2e9df);
      }

      &:active {
        transform: scale(0.97);
      }

      &:focus-visible {
        outline: var(--ec-focus-ring-width, 3px) solid var(--ec-focus, #5e3b21);
        outline-offset: 2px;
      }

      &--on {
        background: var(--ec-primary, #7a4f2e);
        border-color: var(--ec-primary, #7a4f2e);
        color: var(--pr-white, #fffdf9);

        &:hover {
          background: var(--ec-primary-dark, #5e3b21);
          border-color: var(--ec-primary-dark, #5e3b21);
        }
      }

      &--quiet {
        background: transparent;
      }
    }

    /* Variante compacta: iconos sólo con etiqueta accesible */
    .ec-interest--compact .ec-interest-btn {
      min-height: 40px;
      padding: 0 10px;
    }

    @media (max-width: 767px) {
      .ec-interest-btn span {
        font-size: 0.74rem;
      }
    }
  `
})
export class EventInterestActionsComponent {
  /** Título del evento (para aria-labels descriptivos). */
  readonly titulo = input.required<string>();

  /** Id del evento al que corresponden las señales. */
  readonly eventoId = input.required<string>();

  /** "Me interesa" ya activado. */
  readonly activo = input(false);

  /** Mostrar el botón "No me interesa" (señal negativa + ocultar). */
  readonly mostrarNoMeInteresa = input(true);

  /** Mostrar el botón "Ver similares". */
  readonly mostrarVerSimilares = input(true);

  /** Etiqueta del botón "Ver similares" (contextual por pantalla). */
  readonly etiquetaSimilares = input<string | null>(null);

  /**
   * 'completo': las tres acciones (ficha de evento).
   * 'compacto': sólo "Me interesa" (tarjetas; las secundarias van en
   * el menú contextual de la tarjeta).
   */
  readonly modo = input<'completo' | 'compacto'>('completo');

  readonly meInteresaCambiado = output<{ eventoId: string; activo: boolean }>();
  readonly noMeInteresaClick = output<string>();
  readonly verSimilaresClick = output<string>();

  /** Texto del botón similares (por defecto "Ver similares"). */
  readonly textoSimilares = computed(
    () => this.etiquetaSimilares() ?? 'Ver similares'
  );

  toggleMeInteresa(event: Event): void {
    // Evita que el click burbujee al enlace de la tarjeta (navegaría).
    event.preventDefault();
    event.stopPropagation();
    this.meInteresaCambiado.emit({
      eventoId: this.eventoId(),
      activo: !this.activo()
    });
  }

  noMeInteresa(event: Event): void {
    event.preventDefault();
    event.stopPropagation();
    this.noMeInteresaClick.emit(this.eventoId());
  }

  verSimilares(event: Event): void {
    event.preventDefault();
    event.stopPropagation();
    this.verSimilaresClick.emit(this.eventoId());
  }
}
