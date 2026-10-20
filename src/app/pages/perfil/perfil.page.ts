import { Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { IonIcon, IonButton, IonItem, IonLabel } from '@ionic/angular';
import { RecomendacionService } from '../../core/services/recomendacion.service';
import { ApiService } from '../../core/services/api.service';
import { RecommendationEmptyStateComponent } from '../../shared/components/recommendation-empty-state/recommendation-empty-state.component';

/**
 * Perfil de usuario (invitado o registrado).
 */
@Component({
  selector: 'app-perfil',
  standalone: true,
  imports: [RouterLink, FormsModule, IonIcon, IonButton, IonItem, IonLabel, RecommendationEmptyStateComponent],
  templateUrl: './perfil.page.html',
  styleUrl: './perfil.page.scss'
})
export class PerfilPage {
  readonly recomendacion = inject(RecomendacionService);
  readonly api = inject(ApiService);
  private readonly router = inject(Router);

  /** Estado del flujo de "eliminar cuenta" (doble confirmación). */
  readonly zonaPeligroAbierta = signal(false);
  readonly confirmandoEliminar = signal(false);
  readonly errorEliminar = signal<string | null>(null);
  readonly eliminando = signal(false);

  /** Texto exacto que la persona debe tipear para habilitar el botón final. */
  readonly fraseConfirmacion = 'ELIMINAR';
  textoConfirmacion = '';

  cerrarSesion(): void {
    this.api.salir();
    this.router.navigateByUrl('/home');
  }

  toggleZonaPeligro(): void {
    this.zonaPeligroAbierta.update((v) => !v);
    this.confirmandoEliminar.set(false);
    this.errorEliminar.set(null);
    this.textoConfirmacion = '';
  }

  pedirConfirmacionEliminar(): void {
    this.confirmandoEliminar.set(true);
  }

  /** La frase coincide (ignora espacios de sobra). */
  get puedeEliminar(): boolean {
    return this.textoConfirmacion.trim() === this.fraseConfirmacion;
  }

  async confirmarEliminar(): Promise<void> {
    if (!this.puedeEliminar || this.eliminando()) return;
    this.eliminando.set(true);
    this.errorEliminar.set(null);
    try {
      await this.api.eliminarCuenta();
      this.router.navigateByUrl('/home');
    } catch (e: unknown) {
      const err = e as { message?: string };
      this.errorEliminar.set(err.message || 'No se pudo eliminar la cuenta. Intenta más tarde.');
    } finally {
      this.eliminando.set(false);
    }
  }

  /** Categorías distintas exploradas vía señales (sin descartes). */
  readonly interesesExplorados = this.recomendacion.interesesExplorados;

  readonly totalSenales = this.recomendacion.totalSenales;

  /**
   * "Ver recomendaciones" desde Preferencias: el componente ya guardó la
   * selección; aquí sólo llevamos a la persona a la página Para ti (antes el
   * botón guardaba sin navegar y parecía no hacer nada).
   */
  verRecomendaciones(): void {
    void this.router.navigateByUrl('/para-ti');
  }

  /** Etiquetas de preferencias activas (para el bloque de resumen). */
  readonly preferenciasActivas = computed(() => {
    const p = this.recomendacion.preferencias();
    const chips: string[] = [];
    chips.push(...p.categorias);
    chips.push(...p.regiones, ...p.comunas);
    if (p.modalidades.length > 0) chips.push(...p.modalidades);
    if (p.precio === 'gratis') chips.push('Gratis');
    if (p.precio === 'costo') chips.push('Con costo');
    if (p.accesibilidad) chips.push('Accesible');
    return chips;
  });
}
