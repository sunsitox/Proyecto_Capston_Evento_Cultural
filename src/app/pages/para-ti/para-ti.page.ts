import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { IonIcon } from '@ionic/angular';
import { EventosService } from '../../core/services/eventos.service';
import { RecomendacionService } from '../../core/services/recomendacion.service';
import { EventoCardComponent } from '../../shared/components/evento-card/evento-card.component';
import { RecommendationEmptyStateComponent } from '../../shared/components/recommendation-empty-state/recommendation-empty-state.component';
import { Recommendation } from '../../core/models/recomendacion.model';

/**
 * Para ti (reemplaza a Favoritos).
 *
 * Recomendaciones de esta visita: el orden y los motivos provienen del
 * RecomendacionService (señales + preferencias en memoria). Nada se
 * guarda de forma permanente ni existe una biblioteca de eventos
 * guardados: "No me interesa" retira la tarjeta y la señal negativa
 * baja la afinidad de categorías similares.
 *
 * Estado inicial: si no hubo onboarding ni señales, se muestra la
 * pantalla amable "Cuéntanos qué quieres descubrir".
 */
@Component({
  selector: 'app-para-ti',
  standalone: true,
  imports: [RouterLink, IonIcon, EventoCardComponent, RecommendationEmptyStateComponent],
  templateUrl: './para-ti.page.html',
  styleUrl: './para-ti.page.scss',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class ParaTiPage {
  private readonly eventosService = inject(EventosService);
  private readonly recomendacion = inject(RecomendacionService);
  private readonly router = inject(Router);

  readonly esOnboarding = computed(
    () =>
      !this.recomendacion.preferenciasConfiguradas() &&
      this.recomendacion.totalSenales() === 0
  );

  /** Recomendaciones del servicio (máx. 12, ya filtradas por vigencia). */
  readonly recomendaciones = computed<Recommendation[]>(() =>
    this.recomendacion.recomendar(this.eventosService.obtenerVigentes(), { max: 12 })
  );

  readonly totalSenales = this.recomendacion.totalSenales;

  /** Preferencias resumidas para el bloque "Sobre tus sugerencias". */
  readonly resumenPreferencias = computed(() => {
    const p = this.recomendacion.preferencias();
    const partes: string[] = [];
    if (p.categorias.length > 0) partes.push(p.categorias.join(', '));
    const zona = [...p.regiones, ...p.comunas];
    if (zona.length > 0) partes.push(zona.join(', '));
    if (p.precio === 'gratis') partes.push('gratis');
    if (p.precio === 'costo') partes.push('con costo');
    if (p.accesibilidad) partes.push('accesible');
    return partes.length > 0 ? partes.join(' · ') : 'Sin preferencias fijas: ordenadas por lo que exploras en esta visita.';
  });

  onGuardarOnboarding(): void {
    // guardarPreferencias marca la visita como configurada; la grilla
    // recomputed sola via computed().
  }

  /** Volver al onboarding limpiando señales y preferencias. */
  reiniciarIntereses(): void {
    this.recomendacion.reiniciarVisita();
  }

  onOmitirOnboarding(): void {
    // No-op: preferenciasConfiguradas ya fue marcado por el componente.
  }

  onMeInteresa(cambio: { eventoId: string; activo: boolean }): void {
    this.recomendacion.alternarMeInteresa(cambio.eventoId, cambio.activo);
  }

  onNoMeInteresa(eventoId: string): void {
    this.recomendacion.registrarSenal('no_me_interesa', eventoId);
  }

  /** "Ver similares" → Descubrir filtrado por las categorías del evento. */
  onVerSimilares(eventoId: string): void {
    const evento = this.eventosService
      .obtenerVigentes()
      .find((e) => e.id === eventoId);
    if (!evento) return;

    this.recomendacion.registrarSenal('ver_similares', eventoId);
    this.eventosService.actualizarFiltros({ categorias: evento.categorias });
    this.eventosService.limpiarOtrosFiltros('categorias');
    this.router.navigate(['/home']);
  }
}
