export type CategoriaEvento =
  | 'Música'
  | 'Arte y Cultura'
  | 'Gastronomía'
  | 'Ferias y Mercados'
  | 'Municipal'
  | 'Familiar'
  | 'Deportivo';

export type ModalidadEvento = 'Presencial' | 'Virtual' | 'Híbrido';

export type EstadoEvento = 'proximo' | 'hoy' | 'en_curso' | 'suspendido' | 'cancelado';

export interface Coordenadas {
  lat: number;
  lng: number;
}

export interface Evento {
  id: string;
  titulo: string;
  descripcion: string;
  imagen: string;
  /** Fecha de inicio (ISO yyyy-mm-dd) */
  fecha: string;
  /** Fecha de término para eventos de más de un día */
  fechaTermino?: string;
  /** Horario de inicio */
  hora: string;
  /** Horario de término */
  horaTermino?: string;
  /** Recinto o lugar de referencia */
  recinto: string;
  direccion: string;
  comuna: string;
  region: string;
  /** Presencial, Virtual o Híbrido */
  modalidad: ModalidadEvento;
  /** Categoría principal (color del sello/badge) */
  categoria: CategoriaEvento;
  /** Categorías múltiples */
  categorias: CategoriaEvento[];
  organizador: string;
  /** Precio en texto ('' si gratuito) */
  precio: string;
  gratuito: boolean;
  /** Público objetivo recomendado */
  publico: string;
  /** Datos de accesibilidad ('' si no hay información) */
  accesibilidad?: string;
  /** Requisitos de inscripción o compra */
  inscripcion?: string;
  /** Enlace de inscripción o compra (demo: '#') */
  enlaceInscripcion?: string;
  /** Fuente desde la que se obtuvo la información */
  fuente: string;
  /** Página oficial del evento */
  paginaOficial?: string;
  /** Fecha de la última comprobación (ISO) */
  ultimaComprobacion: string;
  estado: EstadoEvento;
  coordenadas?: Coordenadas;
}

