import { Component } from '@angular/core';

/**
 * Skeleton de la ficha de evento.
 *
 * Replica la estructura final del detalle (hero, aviso de fuente,
 * título, chips, texto y tarjeta lateral de datos clave) para evitar
 * saltos visuales al cargar. Es un estado transitorio de carga: nunca
 * sustituye un estado vacío o de error. Sin animación si el sistema
 * pide reducir movimiento (ver @media al final).
 */
@Component({
  selector: 'app-evento-detail-skeleton',
  standalone: true,
  template: `
    <div class="ec-dsk" aria-hidden="true">
      <div class="ec-dsk__hero"></div>
      <div class="ec-container ec-dsk__body">
        <div class="ec-dsk__line ec-dsk__line--nota"></div>
        <div class="ec-dsk__line ec-dsk__line--fecha"></div>
        <div class="ec-dsk__line ec-dsk__line--titulo"></div>
        <div class="ec-dsk__chips">
          <span class="ec-dsk__chip"></span>
          <span class="ec-dsk__chip ec-dsk__chip--corto"></span>
        </div>
        <div class="ec-dsk__grid">
          <div class="ec-dsk__main">
            <div class="ec-dsk__line ec-dsk__line--sub"></div>
            <div class="ec-dsk__line"></div>
            <div class="ec-dsk__line"></div>
            <div class="ec-dsk__line ec-dsk__line--corto"></div>
            <div class="ec-dsk__line ec-dsk__line--ficha"></div>
          </div>
          <div class="ec-dsk__side">
            <div class="ec-dsk__card"></div>
          </div>
        </div>
      </div>
    </div>
  `,
  styles: `
    :host {
      display: block;
      min-height: 60vh;
    }

    .ec-dsk__hero {
      height: 240px;
      background: var(--ec-surface-2);
    }

    .ec-dsk__body {
      padding-block: var(--ec-space-lg);
    }

    .ec-dsk__grid {
      display: grid;
      grid-template-columns: 1fr;
      gap: var(--ec-space-lg);

      @media (min-width: 992px) {
        grid-template-columns: 1fr 320px;
      }
    }

    .ec-dsk__line {
      height: 14px;
      margin-bottom: 10px;
      border-radius: var(--ec-radius-full);
      background-color: var(--ec-surface-2);
      background-image: linear-gradient(
        90deg,
        var(--ec-surface-2) 0px,
        var(--ec-surface-hover) 80px,
        var(--ec-surface-2) 160px
      );
      background-size: 400px 100%;
      animation: ec-dsk-shimmer 1.4s infinite linear;
    }

    .ec-dsk__line--nota { width: 90%; height: 34px; margin-bottom: var(--ec-space-md); border-radius: var(--ec-radius-md); }
    .ec-dsk__line--fecha { width: 55%; height: 11px; }
    .ec-dsk__line--titulo { width: 75%; height: 26px; margin-block: 12px; }
    .ec-dsk__line--sub { width: 45%; margin-top: var(--ec-space-md); }
    .ec-dsk__line--corto { width: 62%; }
    .ec-dsk__line--ficha { width: 100%; height: 120px; margin-top: var(--ec-space-md); border-radius: var(--ec-radius-md); }

    .ec-dsk__chips {
      display: flex;
      gap: 8px;
      margin-bottom: var(--ec-space-lg);
    }

    .ec-dsk__chip {
      width: 92px;
      height: 24px;
      border-radius: var(--ec-radius-full);
      background-color: var(--ec-surface-2);
      background-image: linear-gradient(
        90deg,
        var(--ec-surface-2) 0px,
        var(--ec-surface-hover) 80px,
        var(--ec-surface-2) 160px
      );
      background-size: 400px 100%;
      animation: ec-dsk-shimmer 1.4s infinite linear;

      &--corto { width: 64px; }
    }

    .ec-dsk__card {
      height: 260px;
      border-radius: var(--ec-radius-lg);
      background-color: var(--ec-surface-2);
      background-image: linear-gradient(
        90deg,
        var(--ec-surface-2) 0px,
        var(--ec-surface-hover) 80px,
        var(--ec-surface-2) 160px
      );
      background-size: 400px 100%;
      animation: ec-dsk-shimmer 1.4s infinite linear;
    }

    @keyframes ec-dsk-shimmer {
      0% { background-position: -400px 0; }
      100% { background-position: 400px 0; }
    }

    @media (prefers-reduced-motion: reduce) {
      .ec-dsk__line,
      .ec-dsk__chip,
      .ec-dsk__card {
        animation: none;
        background: var(--ec-surface-2);
      }
    }
  `
})
export class EventoDetailSkeletonComponent {}
