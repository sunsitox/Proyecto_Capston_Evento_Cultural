import { Injectable, signal } from '@angular/core';

const CLAVE_CONTRAIDO = 'ec-admin-lateral-contraido';

function leerContraidoInicial(): boolean {
  try {
    return localStorage.getItem(CLAVE_CONTRAIDO) === '1';
  } catch {
    return false;
  }
}

/**
 * Estado de interfaz compartido por las páginas del panel de administración:
 * la ventana lateral es un componente único (AdminSidebarComponent), de modo
 * que el botón ☰ del encabezado de cada página y el drawer comparten estado.
 */
@Injectable({ providedIn: 'root' })
export class AdminUiService {
  /** Ventana lateral visible en pantallas angostas (drawer). */
  readonly lateralAbierto = signal(false);

  /**
   * Riel contraído: en pantallas anchas el lateral se reduce a 72 px con
   * solo las iniciales del menú. Se recuerda entre visitas al panel.
   */
  readonly lateralContraido = signal(leerContraidoInicial());

  /** Cambia el estado del riel y lo persiste para el próximo ingreso. */
  alternarLateralContraido(): void {
    this.lateralContraido.update((contraido) => {
      const nuevo = !contraido;
      try {
        localStorage.setItem(CLAVE_CONTRAIDO, nuevo ? '1' : '0');
      } catch {
        /* sin almacenamiento disponible, vive solo en memoria */
      }
      return nuevo;
    });
  }
}
