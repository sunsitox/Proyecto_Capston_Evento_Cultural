import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  input,
  output,
  signal
} from '@angular/core';
import { IonIcon } from '@ionic/angular';
import { RecomendacionService } from '../../../core/services/recomendacion.service';
import { UserPreferences } from '../../../core/models/recomendacion.model';
import { CATEGORIAS, COMUNAS, REGIONES, MOCK_EVENTOS } from '../../../data/mock-eventos';

/**
 * Pantalla amable de personalización temporal ("Cuéntanos qué quieres
 * descubrir") + sección de ajustes de Perfil ("Preferencias de
 * descubrimiento").
 *
 * Variante 'onboarding': flujo progresivo en 4 pasos.
 * Variante 'ajustes': mismos controles de una vez, encabezado compacto.
 *
 * Nada se persiste: las preferencias viven sólo durante esta visita.
 */
@Component({
  selector: 'app-recommendation-empty-state',
  standalone: true,
  imports: [IonIcon],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="ec-onb" [class.ec-onb--ajustes]="variante() === 'ajustes'">
      <div class="ec-onb__icon" aria-hidden="true">
        <ion-icon name="sparkles-outline"></ion-icon>
      </div>

      @if (variante() === 'onboarding') {
        <h2 class="ec-onb__title">Cuéntanos qué quieres descubrir</h2>
        <p class="ec-onb__subtitle">
          Elige al menos una categoría o zona y armamos recomendaciones para
          esta visita. Puedes saltarlo y explorar libremente.
        </p>
      } @else {
        <h2 class="ec-onb__title ec-onb__title--compact">Preferencias de descubrimiento</h2>
      }

      @if (variante() === 'onboarding') {
        <div class="ec-onb__progreso" role="group" aria-label="Progreso: paso {{ paso() }} de {{ pasosTotales }}">
          @for (n of [1, 2, 3, 4]; track n) {
            <button
              type="button"
              class="ec-onb__punto"
              [class.ec-onb__punto--activo]="n <= paso()"
              [disabled]="n > paso()"
              [attr.aria-label]="'Ir al paso ' + n"
              (click)="irAPaso(n)"
            ></button>
          }
        </div>
      }

      @if (variante() === 'ajustes' || paso() === 1) {
        <fieldset class="ec-onb__field">
          <legend>Categorías de interés</legend>
          <div class="ec-onb__chips" role="group" aria-label="Categorías de interés">
            @for (cat of categorias; track cat) {
              <button
                type="button"
                class="ec-chip"
                [class.ec-chip--active]="seleccion().categorias.includes(cat)"
                [attr.aria-pressed]="seleccion().categorias.includes(cat)"
                (click)="toggle('categorias', cat)"
              >
                {{ cat }}
              </button>
            }
          </div>
        </fieldset>
      }

      @if (variante() === 'ajustes' || paso() === 2) {
        <fieldset class="ec-onb__field">
          <legend>Regiones preferidas</legend>
          <div class="ec-onb__chips" role="group" aria-label="Regiones preferidas">
            @for (r of regiones; track r) {
              <button
                type="button"
                class="ec-chip"
                [class.ec-chip--active]="seleccion().regiones.includes(r)"
                [attr.aria-pressed]="seleccion().regiones.includes(r)"
                (click)="toggle('regiones', r)"
              >
                {{ r }}
              </button>
            }
          </div>
        </fieldset>
      }

      @if (variante() === 'ajustes' || paso() === 3) {
        <fieldset class="ec-onb__field">
          <legend>Comunas (opcional, según tus regiones)</legend>
          <div class="ec-onb__chips" role="group" aria-label="Comunas preferidas">
            @for (c of comunasSugeridas(); track c) {
              <button
                type="button"
                class="ec-chip ec-chip--soft"
                [class.ec-chip--active]="seleccion().comunas.includes(c)"
                [attr.aria-pressed]="seleccion().comunas.includes(c)"
                (click)="toggle('comunas', c)"
              >
                {{ c }}
              </button>
            }
          </div>
          @if (comunasSugeridas().length === 0) {
            <p class="ec-onb__hint">Elige al menos una región para ver comunas.</p>
          }
        </fieldset>
      }

      @if (variante() === 'ajustes' || paso() === 4) {
        <fieldset class="ec-onb__field">
          <legend>¿Hasta dónde te moverías?</legend>
          <div class="ec-onb__chips" role="group" aria-label="Alcance de traslado">
            <button
              type="button"
              class="ec-chip"
              [class.ec-chip--active]="seleccion().alcance === 'comuna'"
              [attr.aria-pressed]="seleccion().alcance === 'comuna'"
              (click)="setAlcance('comuna')"
            >
              Cerca: mi comuna
            </button>
            <button
              type="button"
              class="ec-chip"
              [class.ec-chip--active]="seleccion().alcance === 'region'"
              [attr.aria-pressed]="seleccion().alcance === 'region'"
              (click)="setAlcance('region')"
            >
              Mi región
            </button>
            <button
              type="button"
              class="ec-chip"
              [class.ec-chip--active]="seleccion().alcance === 'pais'"
              [attr.aria-pressed]="seleccion().alcance === 'pais'"
              (click)="setAlcance('pais')"
            >
              Todo Chile
            </button>
          </div>
        </fieldset>

        <fieldset class="ec-onb__field">
          <legend>¿Cuándo prefieres asistir?</legend>
          <div class="ec-onb__chips" role="group" aria-label="Momentos del día preferidos">
            <button
              type="button"
              class="ec-chip"
              [class.ec-chip--active]="seleccion().momentos.includes('manana')"
              [attr.aria-pressed]="seleccion().momentos.includes('manana')"
              (click)="toggleMomento('manana')"
            >
              Mañana
            </button>
            <button
              type="button"
              class="ec-chip"
              [class.ec-chip--active]="seleccion().momentos.includes('tarde')"
              [attr.aria-pressed]="seleccion().momentos.includes('tarde')"
              (click)="toggleMomento('tarde')"
            >
              Tarde
            </button>
            <button
              type="button"
              class="ec-chip"
              [class.ec-chip--active]="seleccion().momentos.includes('noche')"
              [attr.aria-pressed]="seleccion().momentos.includes('noche')"
              (click)="toggleMomento('noche')"
            >
              Noche
            </button>
          </div>
          @if (seleccion().momentos.length === 0) {
            <p class="ec-onb__hint">Sin preferencia: te mostramos de todo el día.</p>
          }
        </fieldset>

        <fieldset class="ec-onb__field">
          <legend>Preferencia de precio</legend>
          <div class="ec-onb__chips" role="group" aria-label="Preferencia de precio">
            <button
              type="button"
              class="ec-chip"
              [class.ec-chip--active]="seleccion().precio === 'gratis'"
              [attr.aria-pressed]="seleccion().precio === 'gratis'"
              (click)="setPrecio('gratis')"
            >
              Gratis
            </button>
            <button
              type="button"
              class="ec-chip"
              [class.ec-chip--active]="seleccion().precio === 'costo'"
              [attr.aria-pressed]="seleccion().precio === 'costo'"
              (click)="setPrecio('costo')"
            >
              Con costo
            </button>
            <button
              type="button"
              class="ec-chip"
              [class.ec-chip--active]="seleccion().precio === 'ambos'"
              [attr.aria-pressed]="seleccion().precio === 'ambos'"
              (click)="setPrecio('ambos')"
            >
              Ambos
            </button>
          </div>
        </fieldset>

        <fieldset class="ec-onb__field">
          <legend>Modalidad</legend>
          <div class="ec-onb__chips" role="group" aria-label="Modalidad preferida">
            @for (m of modalidades; track m) {
              <button
                type="button"
                class="ec-chip"
                [class.ec-chip--active]="seleccion().modalidades.includes(m)"
                [attr.aria-pressed]="seleccion().modalidades.includes(m)"
                (click)="toggle('modalidades', m)"
              >
                {{ m }}
              </button>
            }
          </div>
        </fieldset>

        <fieldset class="ec-onb__field">
          <legend>Accesibilidad</legend>
          <button
            type="button"
            class="ec-chip ec-chip--wide"
            [class.ec-chip--active]="seleccion().accesibilidad"
            [attr.aria-pressed]="seleccion().accesibilidad"
            (click)="toggleAccesibilidad()"
          >
            Priorizar eventos con información de accesibilidad
          </button>
        </fieldset>
      }

      <div class="ec-onb__actions">
        @if (variante() === 'onboarding' && paso() < pasosTotales) {
          @if (paso() > 1) {
            <button type="button" class="ec-onb__skip" (click)="retroceder()">
              Atrás
            </button>
          }
          <button
            type="button"
            class="ec-onb__primary"
            [disabled]="!puedeContinuar()"
            (click)="continuar()"
          >
            Continuar
            <ion-icon name="arrow-forward-outline" aria-hidden="true"></ion-icon>
          </button>
          <button type="button" class="ec-onb__skip" (click)="omitir()">
            Explorar sin personalizar
          </button>
        } @else {
          <button
            type="button"
            class="ec-onb__primary"
            [disabled]="variante() === 'onboarding' && !haySeleccion()"
            (click)="guardar()"
          >
            <ion-icon name="sparkles" aria-hidden="true"></ion-icon>
            Ver recomendaciones
          </button>
          @if (variante() === 'onboarding') {
            <button type="button" class="ec-onb__skip" (click)="retroceder()">
              Atrás
            </button>
          }
          @if (variante() === 'ajustes') {
            <button type="button" class="ec-onb__skip" (click)="reiniciar()">
              <ion-icon name="refresh-outline" aria-hidden="true"></ion-icon>
              Reiniciar intereses de esta visita
            </button>
          }
        }
      </div>

      <p class="ec-onb__nota">
        <ion-icon name="information-circle-outline" aria-hidden="true"></ion-icon>
        Estas preferencias se usan sólo durante esta visita en el prototipo.
        No se guardan de forma permanente.
      </p>
    </div>
  `,
  styles: `
    :host {
      display: block;
      min-width: 0;
    }

    .ec-onb {
      max-width: 640px;
      margin: 0 auto;
      padding: var(--ec-space-xl, 32px) var(--ec-space-md, 16px);
      background: var(--ec-surface, #fffdf9);
      border: 1px solid var(--ec-border-light, #ece4d7);
      border-radius: var(--ec-radius-lg, 16px);
      text-align: center;
    }

    .ec-onb__icon {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      width: 52px;
      height: 52px;
      border-radius: var(--ec-radius-circle, 50%);
      background: var(--ec-primary-bg, #f2e9df);
      color: var(--ec-primary-dark, #5e3b21);
      margin-bottom: var(--ec-space-sm, 8px);

      ion-icon {
        font-size: 1.6rem;
      }
    }

    .ec-onb__title {
      margin: 0 0 var(--ec-space-xs, 6px);
      font-family: var(--ec-font-serif, serif);
      font-size: 1.5rem;
      color: var(--ec-text-dark, #211c16);
    }

    .ec-onb__title--compact {
      font-size: 1.25rem;
    }

    .ec-onb__subtitle {
      margin: 0 auto var(--ec-space-md, 16px);
      max-width: 46ch;
      color: var(--ec-text-muted, #5d564a);
      font-size: 0.92rem;
      line-height: 1.5;
    }

    .ec-onb__progreso {
      display: flex;
      justify-content: center;
      gap: 8px;
      margin-bottom: var(--ec-space-md, 16px);
    }

    .ec-onb__punto {
      width: 10px;
      height: 10px;
      padding: 0;
      border: none;
      border-radius: 50%;
      background: var(--ec-border, #e3d9ca);
      cursor: pointer;
      transition: background var(--ec-duration-fast, 0.15s) var(--ec-ease, ease);

      &--activo {
        background: var(--ec-primary, #7a4f2e);
        transform: scale(1.15);
      }

      &:disabled {
        cursor: default;
        opacity: 0.6;
      }

      &:focus-visible {
        outline: 3px solid var(--ec-primary-dark, #5e3b21);
        outline-offset: 2px;
      }
    }

    .ec-onb__hint {
      margin: 6px 0 0;
      font-size: 0.78rem;
      color: var(--ec-text-muted, #5d564a);
    }

    .ec-onb__field {
      border: none;
      margin: 0 0 var(--ec-space-md, 16px);
      padding: 0;
      min-width: 0;

      legend {
        font-size: 0.72rem;
        font-weight: 700;
        letter-spacing: 0.07em;
        text-transform: uppercase;
        color: var(--ec-text-light, #6d6557);
        margin-bottom: var(--ec-space-xs, 6px);
        padding: 0;
        text-align: left;
      }
    }

    .ec-onb__chips {
      display: flex;
      flex-wrap: wrap;
      gap: 8px;
      justify-content: center;
    }

    .ec-chip {
      min-height: 40px;
      padding: 0 14px;
      border: 1px solid var(--ec-border-light, #ece4d7);
      border-radius: var(--ec-radius-full, 999px);
      background: var(--ec-surface, #fffdf9);
      color: var(--ec-text-dark, #211c16);
      font: inherit;
      font-size: 0.8rem;
      font-weight: 600;
      cursor: pointer;
      transition:
        background var(--ec-duration-fast, 0.15s) var(--ec-ease, ease),
        border-color var(--ec-duration-fast, 0.15s) var(--ec-ease, ease);

      &:hover {
        border-color: var(--ec-primary, #7a4f2e);
      }

      &:focus-visible {
        outline: 3px solid var(--ec-primary-dark, #5e3b21);
        outline-offset: 2px;
      }

      &--active {
        background: var(--ec-primary, #7a4f2e);
        border-color: var(--ec-primary, #7a4f2e);
        color: var(--pr-white, #fffdf9);
      }

      &--soft {
        background: var(--ec-surface-2, #f0e9df);
      }

      &--wide {
        width: 100%;
        max-width: 420px;
      }
    }

    .ec-onb__actions {
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: var(--ec-space-xs, 6px);
      margin-top: var(--ec-space-md, 16px);
    }

    .ec-onb__primary {
      display: inline-flex;
      align-items: center;
      gap: 8px;
      min-height: 48px;
      padding: 0 24px;
      border: none;
      border-radius: var(--ec-radius-full, 999px);
      background: var(--ec-primary, #7a4f2e);
      color: var(--pr-white, #fffdf9);
      font: inherit;
      font-size: 0.95rem;
      font-weight: 700;
      cursor: pointer;

      &:hover:not(:disabled) {
        background: var(--ec-primary-dark, #5e3b21);
      }

      &:focus-visible {
        outline: 3px solid var(--ec-primary-dark, #5e3b21);
        outline-offset: 2px;
      }

      &:disabled {
        opacity: 0.55;
        cursor: not-allowed;
      }
    }

    .ec-onb__skip {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      min-height: 44px;
      padding: 0 12px;
      border: none;
      background: transparent;
      color: var(--ec-primary-dark, #5e3b21);
      font: inherit;
      font-size: 0.85rem;
      font-weight: 600;
      cursor: pointer;
      text-decoration: underline;

      &:focus-visible {
        outline: 3px solid var(--ec-primary-dark, #5e3b21);
        outline-offset: 2px;
        border-radius: 4px;
      }
    }

    .ec-onb__nota {
      margin: var(--ec-space-md, 16px) auto 0;
      max-width: 48ch;
      display: flex;
      align-items: flex-start;
      gap: 6px;
      font-size: 0.78rem;
      color: var(--ec-text-muted, #5d564a);
      line-height: 1.45;
      text-align: left;

      ion-icon {
        flex-shrink: 0;
        font-size: 1rem;
        margin-top: 1px;
      }
    }
  `
})
export class RecommendationEmptyStateComponent {
  private readonly recomendacion = inject(RecomendacionService);

  /** 'onboarding' (Para ti inicial) o 'ajustes' (Perfil). */
  readonly variante = input<'onboarding' | 'ajustes'>('onboarding');

  readonly guardarClick = output<UserPreferences>();
  readonly omitirClick = output<void>();

  readonly categorias = CATEGORIAS;
  readonly regiones = REGIONES;
  readonly comunas = COMUNAS;
  readonly modalidades = ['Presencial', 'Virtual', 'Híbrido'];

  /**
   * Flujo progresivo del onboarding (sólo variante 'onboarding'):
   * 1 categorías · 2 región · 3 comuna (opcional) · 4 precio/modalidad.
   * La variante 'ajustes' muestra todo de una vez.
   */
  readonly paso = signal(1);
  readonly pasosTotales = 4;

  /** Comunas de las regiones elegidas (no todas las del catálogo). */
  readonly comunasSugeridas = computed(() => {
    const regiones = this.seleccion().regiones;
    if (regiones.length === 0) return [];
    return COMUNAS.filter((comuna) =>
      MOCK_EVENTOS.some((e) => e.comuna === comuna && regiones.includes(e.region))
    );
  });

  readonly puedeContinuar = computed(() => {
    switch (this.paso()) {
      case 1:
        return this.seleccion().categorias.length > 0;
      case 2:
        return this.seleccion().regiones.length > 0;
      default:
        return true;
    }
  });

  continuar(): void {
    if (!this.puedeContinuar()) return;
    this.paso.update((p) => Math.min(p + 1, this.pasosTotales));
  }

  retroceder(): void {
    this.paso.update((p) => Math.max(p - 1, 1));
  }

  irAPaso(n: number): void {
    if (n <= this.paso()) this.paso.set(n);
  }

  /** Copia editable de las preferencias actuales de la visita. */
  readonly seleccion = signal<UserPreferences>({
    ...this.recomendacion.preferencias()
  });

  readonly haySeleccion = computed(
    () =>
      this.seleccion().categorias.length > 0 ||
      this.seleccion().regiones.length > 0 ||
      this.seleccion().comunas.length > 0
  );

  toggle(
    clave: 'categorias' | 'regiones' | 'comunas' | 'modalidades',
    valor: string
  ): void {
    this.seleccion.update((s) => {
      const lista = s[clave];
      return {
        ...s,
        [clave]: lista.includes(valor)
          ? lista.filter((v) => v !== valor)
          : [...lista, valor]
      };
    });
  }

  setPrecio(precio: UserPreferences['precio']): void {
    this.seleccion.update((s) => ({ ...s, precio }));
  }

  setAlcance(alcance: UserPreferences['alcance']): void {
    this.seleccion.update((s) => ({ ...s, alcance }));
  }

  toggleMomento(momento: UserPreferences['momentos'][number]): void {
    this.seleccion.update((s) => ({
      ...s,
      momentos: s.momentos.includes(momento)
        ? s.momentos.filter((m) => m !== momento)
        : [...s.momentos, momento]
    }));
  }

  toggleAccesibilidad(): void {
    this.seleccion.update((s) => ({ ...s, accesibilidad: !s.accesibilidad }));
  }

  guardar(): void {
    this.recomendacion.guardarPreferencias(this.seleccion());
    this.guardarClick.emit(this.seleccion());
  }

  /** "Explorar sin personalizar": marca la visita como configurada. */
  omitir(): void {
    this.recomendacion.guardarPreferencias({});
    this.omitirClick.emit();
  }

  /** "Reiniciar intereses de esta visita" (Perfil). */
  reiniciar(): void {
    this.recomendacion.reiniciarVisita();
    this.seleccion.set({ ...this.recomendacion.preferencias() });
    this.paso.set(1);
  }
}
