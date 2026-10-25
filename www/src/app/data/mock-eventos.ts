import { Evento, EstadoEvento } from '../core/models/evento.model';

/**
 * Datos de DEMOSTRACIÓN (maqueta). No corresponden a eventos reales.
 * Cada registro declara la fuente de donde provendría la información,
 * la fecha de última comprobación y el estado — la ficha nunca oculta
 * que la información proviene de terceros.
 *
 * Las fechas son RELATIVAS al día de ejecución (D(0) = hoy) para que la
 * maqueta siempre muestre eventos vigentes: los datos rotan y vencen,
 * nunca queda un catálogo con eventos pasados.
 */

/** yyyy-mm-dd local para hoy + N días (admite negativos). */
function D(dias: number): string {
  const d = new Date();
  d.setDate(d.getDate() + dias);
  const y = d.getFullYear();
  const m = `${d.getMonth() + 1}`.padStart(2, '0');
  const day = `${d.getDate()}`.padStart(2, '0');
  return `${y}-${m}-${day}`;
}

const HOY = D(0);

/**
 * Estado derivado de las fechas (los eventos rotan cada día de ejecución):
 * - Termina hoy y empezó antes → en curso.
 * - Es hoy (un día) → hoy.
 * - Futuro → próximo.
 * `estadoManual` fuerza suspendido/cancelado.
 */
function estadoAuto(
  fecha: string,
  fechaTermino?: string,
  estadoManual?: EstadoEvento
): EstadoEvento {
  if (estadoManual) return estadoManual;
  const fin = fechaTermino ?? fecha;
  if (fecha <= HOY && fin >= HOY) {
    return fechaTermino ? 'en_curso' : 'hoy';
  }
  return 'proximo';
}

export const MOCK_EVENTOS: Evento[] = [
  {
    id: 'ev-001',
    titulo: 'Feria Costumbrista de Vendimia',
    descripcion:
      'Celebra la cosecha con productores locales: degustaciones de vino, música en vivo, artesanía y gastronomía típica del Valle Central. Actividades para toda la familia durante todo el fin de semana.',
    imagen: 'https://picsum.photos/seed/vendimia/800/600',
    fecha: D(-1),
    fechaTermino: D(1),
    hora: '11:00',
    horaTermino: '20:00',
    recinto: 'Plaza de Armas de Pirque',
    direccion: 'Plaza de Armas s/n',
    comuna: 'Pirque',
    region: 'Metropolitana',
    modalidad: 'Presencial',
    categoria: 'Ferias y Mercados',
    categorias: ['Ferias y Mercados', 'Gastronomía', 'Familiar'],
    organizador: 'Municipalidad de Pirque',
    precio: '',
    gratuito: true,
    publico: 'Todo público',
    accesibilidad: 'Plaza con rampas y baños accesibles. Piso firme en el recorrido.',
    inscripcion: 'Sin inscripción. Aforo limitado del recinto.',
    enlaceInscripcion: '#',
    fuente: 'Sitio web Municipalidad de Pirque',
    paginaOficial: '#',
    ultimaComprobacion: D(-1),
    estado: estadoAuto(D(-1), D(1)),
    coordenadas: { lat: -33.6836, lng: -70.5836 }
  },
  {
    id: 'ev-002',
    titulo: 'Festival de Jazz en el Parque',
    descripcion:
      'Una noche al aire libre con agrupaciones nacionales e internacionales de jazz. Trae tu manta y disfruta de un atardecer con buena música y foodtrucks locales.',
    imagen: 'https://picsum.photos/seed/jazzfest/800/600',
    fecha: D(7),
    hora: '19:30',
    horaTermino: '23:00',
    recinto: 'Parque Bustamante',
    direccion: 'Av. Pedro de Valdivia con Av. Providencia',
    comuna: 'Providencia',
    region: 'Metropolitana',
    modalidad: 'Presencial',
    categoria: 'Música',
    categorias: ['Música', 'Gastronomía'],
    organizador: 'Corporación Cultural de Providencia',
    precio: '',
    gratuito: true,
    publico: 'Jóvenes y adultos',
    accesibilidad: 'Zona reservada para sillas de ruedas frente al escenario.',
    inscripcion: 'Sin inscripción. Capacidad del parque.',
    enlaceInscripcion: '#',
    fuente: 'Redes de la Corporación Cultural de Providencia',
    paginaOficial: '#',
    ultimaComprobacion: D(-2),
    estado: estadoAuto(D(7)),
    coordenadas: { lat: -33.4372, lng: -70.612 }
  },
  {
    id: 'ev-003',
    titulo: 'Expo Artesanos del Sur',
    descripcion:
      'Más de 80 artesanos exhiben y venden trabajos en madera, lana y cerámica. Talleres abiertos de tejido a telar y demostraciones en vivo.',
    imagen: 'https://picsum.photos/seed/artesanossur/800/600',
    fecha: D(14),
    fechaTermino: D(15),
    hora: '10:00',
    horaTermino: '19:00',
    recinto: 'Costanera de Puerto Varas',
    direccion: 'Costanera Puerto Varas',
    comuna: 'Puerto Varas',
    region: 'Los Lagos',
    modalidad: 'Presencial',
    categoria: 'Arte y Cultura',
    categorias: ['Arte y Cultura', 'Ferias y Mercados'],
    organizador: 'Agrupación Artesanal del Lago',
    precio: 'Entrada general $3.000',
    gratuito: false,
    publico: 'Todo público',
    accesibilidad: '',
    inscripcion: 'Entrada pagada en el acceso del recinto.',
    enlaceInscripcion: '#',
    fuente: 'Página de Facebook de la agrupación',
    paginaOficial: '#',
    ultimaComprobacion: D(-3),
    estado: estadoAuto(D(14), D(15)),
    coordenadas: { lat: -41.32, lng: -72.94 }
  },
  {
    id: 'ev-004',
    titulo: 'Ruta Gastronómica: Sabores de Valparaíso',
    descripcion:
      'Recorrido por los cerros porteños visitando cocinerías y bares tradicionales, con degustaciones incluidas y guía patrimonial.',
    imagen: 'https://picsum.photos/seed/sabovalpo/800/600',
    fecha: D(21),
    hora: '13:00',
    horaTermino: '18:00',
    recinto: 'Plaza Sotomayor',
    direccion: 'Plaza Sotomayor, punto de encuentro',
    comuna: 'Valparaíso',
    region: 'Valparaíso',
    modalidad: 'Presencial',
    categoria: 'Gastronomía',
    categorias: ['Gastronomía'],
    organizador: 'Ruta Patrimonial Valparaíso',
    precio: 'Desde $15.000 por persona',
    gratuito: false,
    publico: 'Jóvenes y adultos',
    accesibilidad:
      'Ruta con pendientes; consultar alternativa accesible por correo del organizador.',
    inscripcion: 'Reserva previa en el sitio web del organizador. Cupos de 15 personas.',
    enlaceInscripcion: '#',
    fuente: 'Sitio web Ruta Patrimonial Valparaíso',
    paginaOficial: '#',
    ultimaComprobacion: D(-4),
    estado: estadoAuto(D(21)),
    coordenadas: { lat: -33.0423, lng: -71.623 }
  },
  {
    id: 'ev-005',
    titulo: 'Semana Municipal de la Cultura',
    descripcion:
      'Programa de teatro, cine al aire libre y talleres infantiles organizados por la corporación municipal, con entrada liberada para todo público.',
    imagen: 'https://picsum.photos/seed/semanamunicipal/800/600',
    fecha: D(3),
    fechaTermino: D(8),
    hora: '17:00',
    horaTermino: '21:00',
    recinto: 'Centro Cultural de Ñuñoa',
    direccion: 'Plaza Ñuñoa s/n',
    comuna: 'Ñuñoa',
    region: 'Metropolitana',
    modalidad: 'Presencial',
    categoria: 'Municipal',
    categorias: ['Municipal', 'Arte y Cultura', 'Familiar'],
    organizador: 'Municipalidad de Ñuñoa',
    precio: '',
    gratuito: true,
    publico: 'Todo público',
    accesibilidad: 'Recinto accesible con señalética y talleres con apoyo sonoro.',
    inscripcion: 'Talleres con inscripción en el centro cultural; funciones libres.',
    enlaceInscripcion: '#',
    fuente: 'Sitio web Municipalidad de Ñuñoa',
    paginaOficial: '#',
    ultimaComprobacion: D(-1),
    estado: estadoAuto(D(3), D(8)),
    coordenadas: { lat: -33.4559, lng: -70.5979 }
  },
  {
    id: 'ev-006',
    titulo: 'Carnaval de Invierno Familiar',
    descripcion:
      'Juegos tradicionales, comparsas, música en vivo y zona de juegos para niños. Actividad pensada para disfrutar en familia durante todo el día.',
    imagen: 'https://picsum.photos/seed/carnavalinvierno/800/600',
    fecha: D(8),
    hora: '12:00',
    horaTermino: '20:00',
    recinto: 'Parque Pedro de Valdivia',
    direccion: 'Av. del Mar, Parque Pedro de Valdivia',
    comuna: 'La Serena',
    region: 'Coquimbo',
    modalidad: 'Presencial',
    categoria: 'Familiar',
    categorias: ['Familiar', 'Música'],
    organizador: 'Casa de la Cultura La Serena',
    precio: '',
    gratuito: true,
    publico: 'Familiar',
    accesibilidad: 'Caminos internos planos y zonas de descanso.',
    inscripcion: 'Sin inscripción.',
    enlaceInscripcion: '#',
    fuente: 'Sitio web Casa de la Cultura La Serena',
    paginaOficial: '#',
    ultimaComprobacion: D(-5),
    estado: estadoAuto(D(8)),
    coordenadas: { lat: -29.9027, lng: -71.2519 }
  },
  {
    id: 'ev-007',
    titulo: 'Maratón Patrimonial de Concepción',
    descripcion:
      'Carrera de 5K y 10K por el circuito patrimonial del centro penquista, con corredores de todas las edades. Incluye hidratación y kit del corredor.',
    imagen: 'https://picsum.photos/seed/maratonconce/800/600',
    fecha: D(28),
    hora: '09:00',
    horaTermino: '13:00',
    recinto: 'Plaza Independencia',
    direccion: 'Plaza Independencia, Concepción',
    comuna: 'Concepción',
    region: 'Biobío',
    modalidad: 'Presencial',
    categoria: 'Deportivo',
    categorias: ['Deportivo'],
    organizador: 'Club Deportivo Runners Bío Bío',
    precio: 'Inscripción $8.000',
    gratuito: false,
    publico: 'Jóvenes y adultos',
    accesibilidad: '',
    inscripcion:
      'Inscripción previa obligatoria en el sitio web del club, hasta una semana antes.',
    enlaceInscripcion: '#',
    fuente: 'Sitio web del club organizador',
    paginaOficial: '#',
    ultimaComprobacion: D(-2),
    estado: estadoAuto(D(28)),
    coordenadas: { lat: -36.827, lng: -73.0503 }
  },
  {
    id: 'ev-008',
    titulo: 'Noche de Cortos: Cine Chileno Independiente',
    descripcion:
      'Muestra audiovisual de realizadores emergentes chilenos, con conversatorio posterior junto a los directores invitados.',
    imagen: 'https://picsum.photos/seed/cinecorto/800/600',
    fecha: D(12),
    hora: '20:00',
    horaTermino: '22:30',
    recinto: 'Centro Cultural Gabriela Mistral (GAM)',
    direccion: 'Av. Libertador Bernardo O’Higgins 227',
    comuna: 'Santiago',
    region: 'Metropolitana',
    modalidad: 'Presencial',
    categoria: 'Arte y Cultura',
    categorias: ['Arte y Cultura'],
    organizador: 'Cineteca Independiente',
    precio: '',
    gratuito: true,
    publico: 'Todo público',
    accesibilidad:
      'Sala accesible para sillas de ruedas. Función con audiodescripción y subtítulos proyectados.',
    inscripcion: 'Retiro de entradas en la boletería del GAM desde las 18:00.',
    enlaceInscripcion: '#',
    fuente: 'Sitio web del GAM',
    paginaOficial: '#',
    ultimaComprobacion: D(-1),
    estado: estadoAuto(D(12)),
    coordenadas: { lat: -33.4476, lng: -70.6558 }
  },
  {
    id: 'ev-009',
    titulo: 'Mercado Persa de Antigüedades',
    descripcion:
      'Feria de coleccionismo, antigüedades y vinilos con más de 50 expositores. Ideal para buscar tesoros únicos un domingo por la mañana.',
    imagen: 'https://picsum.photos/seed/mercadopersa/800/600',
    fecha: D(1),
    hora: '09:30',
    horaTermino: '14:00',
    recinto: 'Avenida Recoleta (troncal peatonal)',
    direccion: 'Av. Recoleta, sector Metro Cementerios',
    comuna: 'Independencia',
    region: 'Metropolitana',
    modalidad: 'Presencial',
    categoria: 'Ferias y Mercados',
    categorias: ['Ferias y Mercados', 'Familiar'],
    organizador: 'Asociación de Anticuarios de Santiago',
    precio: '',
    gratuito: true,
    publico: 'Todo público',
    accesibilidad: '',
    inscripcion: 'Sin inscripción.',
    enlaceInscripcion: '#',
    fuente: 'Redes de la Asociación de Anticuarios',
    paginaOficial: '#',
    ultimaComprobacion: HOY,
    estado: estadoAuto(D(1)),
    coordenadas: { lat: -33.4196, lng: -70.6554 }
  },
  {
    id: 'ev-010',
    titulo: 'Festival Folclórico de Chiloé',
    descripcion:
      'Danzas y música tradicional chilota, curanto en hoyo y venta de artesanía local en un ambiente familiar junto al mar.',
    imagen: 'https://picsum.photos/seed/chiloefest/800/600',
    fecha: D(35),
    hora: '12:30',
    horaTermino: '22:00',
    recinto: 'Costanera de Castro',
    direccion: 'Costanera Pedro Montt',
    comuna: 'Castro',
    region: 'Los Lagos',
    modalidad: 'Presencial',
    categoria: 'Familiar',
    categorias: ['Familiar', 'Música', 'Gastronomía'],
    organizador: 'Agrupación Folclórica de Chiloé',
    precio: '',
    gratuito: true,
    publico: 'Familiar',
    accesibilidad: 'Costanera plana; estacionamiento accesible cercano.',
    inscripcion: 'Sin inscripción.',
    enlaceInscripcion: '#',
    fuente: 'Sitio web Agrupación Folclórica de Chiloé',
    paginaOficial: '#',
    ultimaComprobacion: D(-6),
    estado: estadoAuto(D(35)),
    coordenadas: { lat: -42.4699, lng: -73.7634 }
  },
  {
    id: 'ev-011',
    titulo: 'Ciclo de Cine de Mediodía: Chile en Línea',
    descripcion:
      'Proyección mensual de documentales chilenos con conversatorio por videollamada, para ver desde cualquier parte del país.',
    imagen: 'https://picsum.photos/seed/cineonline/800/600',
    fecha: D(5),
    hora: '12:30',
    horaTermino: '13:30',
    recinto: 'Plataforma de transmisión (en línea)',
    direccion: 'En línea — enlace tras registrarse',
    comuna: 'Ñuñoa',
    region: 'Metropolitana',
    modalidad: 'Virtual',
    categoria: 'Arte y Cultura',
    categorias: ['Arte y Cultura'],
    organizador: 'Cineteca Independiente',
    precio: '',
    gratuito: true,
    publico: 'Todo público',
    accesibilidad: 'Videos con subtítulos en español y audiodescripción.',
    inscripcion: 'Registro previo en el sitio de la cineteca; el enlace llega por correo.',
    enlaceInscripcion: '#',
    fuente: 'Boletín mensual de la cineteca',
    paginaOficial: '#',
    ultimaComprobacion: D(-3),
    estado: estadoAuto(D(5)),
    coordenadas: { lat: -33.4559, lng: -70.5979 }
  },
  {
    id: 'ev-012',
    titulo: 'Feria del Libro Usado Penquista',
    descripcion:
      'Dos días de venta de libros usados y de colección, con stands de librerías independientes y lectura abierta al mediodía.',
    imagen: 'https://picsum.photos/seed/ferialibro/800/600',
    fecha: D(6),
    fechaTermino: D(7),
    hora: '10:30',
    horaTermino: '19:00',
    recinto: 'Plaza Independencia',
    direccion: 'Plaza Independencia, Concepción',
    comuna: 'Concepción',
    region: 'Biobío',
    modalidad: 'Presencial',
    categoria: 'Ferias y Mercados',
    categorias: ['Ferias y Mercados', 'Arte y Cultura'],
    organizador: 'Red de Librerías Independientes',
    precio: 'Entrada $2.000',
    gratuito: false,
    publico: 'Todo público',
    accesibilidad: 'Plaza con senderos accesibles.',
    inscripcion: 'Entrada pagada en el acceso.',
    enlaceInscripcion: '#',
    fuente: 'Redes de la Red de Librerías',
    paginaOficial: '#',
    ultimaComprobacion: D(-3),
    estado: estadoAuto(D(6), D(7)),
    coordenadas: { lat: -36.827, lng: -73.0503 }
  },
  {
    id: 'ev-013',
    titulo: 'Taller de Cueca para Toda la Familia',
    descripcion:
      'Clase abierta de cueca brava y campesina con folkloristas locales, presencial y con transmisión simultánea para quien no pueda asistir.',
    imagen: 'https://picsum.photos/seed/tallerdanza/800/600',
    fecha: D(9),
    hora: '18:00',
    horaTermino: '19:30',
    recinto: 'Casa de la Cultura La Serena',
    direccion: 'Los Carrera 1150',
    comuna: 'La Serena',
    region: 'Coquimbo',
    modalidad: 'Híbrido',
    categoria: 'Familiar',
    categorias: ['Familiar', 'Música'],
    organizador: 'Casa de la Cultura La Serena',
    precio: 'Taller $2.000 · transmisión gratuita',
    gratuito: false,
    publico: 'Familiar',
    accesibilidad:
      'Sala en primer piso accesible; intérprete de lengua de señas en la transmisión.',
    inscripcion: 'Inscripción previa presencial u online. Cupo de 60 personas.',
    enlaceInscripcion: '#',
    fuente: 'Sitio web Casa de la Cultura La Serena',
    paginaOficial: '#',
    ultimaComprobacion: D(-2),
    estado: estadoAuto(D(9)),
    coordenadas: { lat: -29.9027, lng: -71.2519 }
  },
  {
    id: 'ev-014',
    titulo: 'Festival de Verano La Granja',
    descripcion:
      'Gran festival con artistas nacionales en el anfiteatro municipal. CANCELADO por reparaciones del recinto: se informará nueva fecha.',
    imagen: 'https://picsum.photos/seed/festivalgranja/800/600',
    fecha: D(14),
    hora: '19:00',
    horaTermino: '23:00',
    recinto: 'Anfiteatro Municipal',
    direccion: 'Av. Padre Esteban Gumucio',
    comuna: 'La Granja',
    region: 'Metropolitana',
    modalidad: 'Presencial',
    categoria: 'Música',
    categorias: ['Música', 'Familiar'],
    organizador: 'Municipalidad de La Granja',
    precio: '',
    gratuito: true,
    publico: 'Todo público',
    accesibilidad: '',
    inscripcion: 'Evento cancelado: no aplica.',
    enlaceInscripcion: '#',
    fuente: 'Comunicado oficial de la municipalidad',
    paginaOficial: '#',
    ultimaComprobacion: HOY,
    estado: 'cancelado',
    coordenadas: { lat: -33.5417, lng: -70.6542 }
  },
  {
    id: 'ev-015',
    titulo: 'Exposición de Cerámica Greda del Maule',
    descripcion:
      'Muestra de cerámica tradicional del Maule con demostraciones de torno. SUSPENDIDA temporalmente por fallas en el recinto.',
    imagen: 'https://picsum.photos/seed/ceramica/800/600',
    fecha: HOY,
    fechaTermino: D(22),
    hora: '10:00',
    horaTermino: '18:00',
    recinto: 'Galería Municipal de Valparaíso',
    direccion: 'Condell 1550',
    comuna: 'Valparaíso',
    region: 'Valparaíso',
    modalidad: 'Presencial',
    categoria: 'Arte y Cultura',
    categorias: ['Arte y Cultura', 'Ferias y Mercados'],
    organizador: 'Corporación Cultural de Valparaíso',
    precio: '',
    gratuito: true,
    publico: 'Todo público',
    accesibilidad: 'Galería con acceso sin escalones.',
    inscripcion: 'Sin inscripción.',
    enlaceInscripcion: '#',
    fuente: 'Sitio web de la corporación cultural',
    paginaOficial: '#',
    ultimaComprobacion: HOY,
    estado: 'suspendido',
    coordenadas: { lat: -33.0445, lng: -71.6104 }
  },
  {
    id: 'ev-016',
    titulo: 'Concierto de Cámara en la Biblioteca',
    descripcion:
      'Sesión de cámara con quinteto de cuerdas: obras chilenas y latinoamericanas en el patio central de la biblioteca, con entrada liberada.',
    imagen: 'https://picsum.photos/seed/camarabiblio/800/600',
    fecha: D(2),
    hora: '19:00',
    horaTermino: '20:30',
    recinto: 'Biblioteca de Santiago',
    direccion: 'Matucana 151',
    comuna: 'Santiago',
    region: 'Metropolitana',
    modalidad: 'Presencial',
    categoria: 'Música',
    categorias: ['Música', 'Arte y Cultura'],
    organizador: 'Biblioteca de Santiago',
    precio: '',
    gratuito: true,
    publico: 'Todo público',
    accesibilidad: 'Acceso sin escalones y bucles magnéticos en primeras filas.',
    inscripcion: 'Entradas en boletería desde 1 hora antes.',
    enlaceInscripcion: '#',
    fuente: 'Sitio web Biblioteca de Santiago',
    paginaOficial: '#',
    ultimaComprobacion: HOY,
    estado: estadoAuto(D(2)),
    coordenadas: { lat: -33.4429, lng: -70.6839 }
  },
  {
    id: 'ev-017',
    titulo: 'Feria de Emprendimiento y Sabor Local',
    descripcion:
      'Feria con emprendedores de la comuna: comida preparada, productos de huerta y talleres cortos de cocina en vivo.',
    imagen: 'https://picsum.photos/seed/feriaemprende/800/600',
    fecha: D(4),
    fechaTermino: D(5),
    hora: '11:00',
    horaTermino: '18:00',
    recinto: 'Plaza de Maipú',
    direccion: 'Plaza de Armas de Maipú',
    comuna: 'Maipú',
    region: 'Metropolitana',
    modalidad: 'Presencial',
    categoria: 'Gastronomía',
    categorias: ['Gastronomía', 'Ferias y Mercados'],
    organizador: 'Municipalidad de Maipú',
    precio: '',
    gratuito: true,
    publico: 'Todo público',
    accesibilidad: 'Plaza plana, con senderos accesibles y baños adaptados.',
    inscripcion: 'Sin inscripción.',
    enlaceInscripcion: '#',
    fuente: 'Redes de la Municipalidad de Maipú',
    paginaOficial: '#',
    ultimaComprobacion: D(-1),
    estado: estadoAuto(D(4), D(5)),
    coordenadas: { lat: -33.5, lng: -70.7594 }
  },
  {
    id: 'ev-018',
    titulo: 'Taller de Ilustración para Jóvenes',
    descripcion:
      'Taller práctico de ilustración urbana: boceto, trazo y color, con materiales incluidos. Modalidad híbrida: presencial con transmisión.',
    imagen: 'https://picsum.photos/seed/ilustracion/800/600',
    fecha: D(10),
    hora: '16:00',
    horaTermino: '18:30',
    recinto: 'Centro Cultural de Talca',
    direccion: '1 Sur y 2 Oriente',
    comuna: 'Talca',
    region: 'Maule',
    modalidad: 'Híbrido',
    categoria: 'Arte y Cultura',
    categorias: ['Arte y Cultura', 'Familiar'],
    organizador: 'Corporación Cultural de Talca',
    precio: 'Taller $1.500',
    gratuito: false,
    publico: 'Jóvenes y adultos',
    accesibilidad: 'Sala en primer piso con acceso sin escalones.',
    inscripcion: 'Inscripción en el centro cultural o por formulario online.',
    enlaceInscripcion: '#',
    fuente: 'Sitio web Corporación Cultural de Talca',
    paginaOficial: '#',
    ultimaComprobacion: D(-2),
    estado: estadoAuto(D(10)),
    coordenadas: { lat: -35.4264, lng: -71.6553 }
  }
];

export const CATEGORIAS: Evento['categoria'][] = [
  'Música',
  'Arte y Cultura',
  'Gastronomía',
  'Ferias y Mercados',
  'Municipal',
  'Familiar',
  'Deportivo'
];

export const MODALIDADES: Evento['modalidad'][] = ['Presencial', 'Virtual', 'Híbrido'];

export const REGIONES: string[] = Array.from(
  new Set(MOCK_EVENTOS.map((e) => e.region))
).sort();

export const COMUNAS: string[] = Array.from(
  new Set(MOCK_EVENTOS.map((e) => e.comuna))
).sort();

export const PUBLICOS: string[] = Array.from(
  new Set(MOCK_EVENTOS.map((e) => e.publico))
).sort();

/** Fecha de la última actualización del compilado (demo: hoy). */
export const DATA_ACTUALIZACION = HOY;

/** Punto de referencia para "ordenar por cercanía" (Plaza de Armas, Santiago) */
export const PUNTO_REFERENCIA = { lat: -33.4489, lng: -70.6693 };
