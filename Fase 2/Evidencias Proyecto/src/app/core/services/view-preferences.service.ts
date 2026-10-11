import { Injectable, signal } from '@angular/core';

export type VistaType = 'grid' | 'lista';
export type OrdenType = 'fecha' | 'nombre' | 'categoria' | 'cercania' | 'actualizacion';

const STORAGE_KEY = 'ec:view-prefs:v1';

interface PersistedPrefs {
  vista: VistaType;
  ordenPor: OrdenType;
}

const ORDENES_VALIDOS: OrdenType[] = [
  'fecha',
  'nombre',
  'categoria',
  'cercania',
  'actualizacion'
];

/**
 * Preferencias de visualización de la lista de eventos.
 * Compartidas entre MainLayout (web) y HomePage (mobile) para evitar
 * acoplamiento cruzado entre vistas.
 */
@Injectable({ providedIn: 'root' })
export class ViewPreferencesService {
  private readonly _vista = signal<VistaType>('grid');
  private readonly _ordenPor = signal<OrdenType>('fecha');

  readonly vista = this._vista.asReadonly();
  readonly ordenPor = this._ordenPor.asReadonly();

  constructor() {
    this.load();
  }

  setVista(v: VistaType): void {
    this._vista.set(v);
    this.persist();
  }

  setOrden(o: OrdenType): void {
    this._ordenPor.set(o);
    this.persist();
  }

  private load(): void {
    if (typeof localStorage === 'undefined') return;
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw) as Partial<PersistedPrefs>;
      if (parsed.vista === 'grid' || parsed.vista === 'lista') {
        this._vista.set(parsed.vista);
      }
      if (ORDENES_VALIDOS.includes(parsed.ordenPor as OrdenType)) {
        this._ordenPor.set(parsed.ordenPor as OrdenType);
      }
    } catch {
      // Ignorar: storage corrupto o no disponible.
    }
  }

  private persist(): void {
    if (typeof localStorage === 'undefined') return;
    try {
      const data: PersistedPrefs = {
        vista: this._vista(),
        ordenPor: this._ordenPor()
      };
      localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
    } catch {
      // Ignorar: cuota llena o sin permisos.
    }
  }
}
