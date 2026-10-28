// Edge Function: admin-eventos
//
// Moderación de eventos para el panel interno (/v00/admin/eventos). Único
// punto que LEE y ESCRIBE `events` con la clave de servicio, porque la lista
// incluye eventos NO publicados (status 'draft'), que la RLS oculta al
// cliente público (solo puede leer status = 'published').
//
// RENDIMIENTO (v2): ya NO baja el catálogo completo. Devuelve:
//   - conteos globales con 3 consultas { count: 'exact', head: true } (baratas)
//   - UNA página de filas (por defecto 60) del grupo pedido, ordenada por
//     created_at descendente, con búsqueda opcional resuelta en el motor
//     (título, recinto, nombre de fuente y nombre de comuna).
// El panel pide página por página ("Mostrar más"), así que el payload es de
// decenas de filas aunque la base tenga miles de eventos.
//
// Acciones (todas POST, cuerpo JSON { accion, ... }):
//   listar        → { conteos, filas, pagina, limite, hayMas }
//                   opcional: pestana('validados'|'en_validacion', default
//                   validados), busqueda, pagina(0-based), limite(≤200)
//   definir_visibilidad → { evento_id, visible } (is_suppressed = !visible)
//   validar             → { evento_id } (draft → published)
//   visibilidad_masiva  → { grupo('validados'|'en_validacion'|'todos'),
//                           visible } → is_suppressed = !visible en TODO el
//                           grupo, devuelve el número de filas afectadas.
//
// Seguridad del panel:
// - La sesión del panel sigue siendo DEMO (admin/admin en localStorage), así
//   que no hay JWT real que verificar. El acceso se habilita igual que
//   `registrar_confirmado` en admin-account: SOLO con ALLOW_DEMO_ADMIN=true
//   en los secretos del proyecto (desarrollo/demo) y exigiendo además la
//   cabecera ofuscada `x-ec-admin: v00-interno`. Sin ese flag, la función
//   requiere un JWT válido de un usuario con user_metadata.rol === 'admin'.
//   PENDIENTE DOCUMENTADO: reemplazar la sesión demo por Supabase Auth.
//
// Despliegue:
//   supabase functions deploy admin-eventos --project-ref ngwkehuewmjykiiujqic
//   --no-verify-jwt (el panel demo no manda JWT; la puerta es la cabecera
//   interna + el secreto ALLOW_DEMO_ADMIN)
//
// Secretos requeridos (ya configurados para las demás funciones):
//   SUPABASE_SERVICE_ROLE_KEY, SUPABASE_URL
//   ALLOW_DEMO_ADMIN=true (solo mientras el panel use la sesión demo)
// deno-lint-ignore-file no-explicit-any
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
const PROJECT_URL = Deno.env.get('SUPABASE_URL') ?? Deno.env.get('URL') ?? '';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type, x-ec-admin'
} as Record<string, string>;

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', ...CORS }
  });
}

interface FilaEvento {
  id: string;
  titulo: string;
  origen: string;
  fecha: string;
  recinto: string;
  comuna: string;
  estado: string; // proximo|hoy|en_curso|vencido
  vigente: boolean;
  visible: boolean;
  metodo: string;
  creado: string;
  actualizado: string;
}

Deno.serve(async (req: Request): Promise<Response> => {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS });
  if (req.method !== 'POST') return json(405, { error: 'Método no permitido' });
  if (!SERVICE_KEY || !PROJECT_URL) {
    return json(503, { error: 'Edge Function sin SUPABASE_SERVICE_ROLE_KEY configurada' });
  }

  // ---- Puerta de acceso -------------------------------------------------
  const admin = createClient(PROJECT_URL, SERVICE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false }
  });
  let token = (req.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '');
  if (Deno.env.get('ALLOW_DEMO_ADMIN') === 'true') {
    if (req.headers.get('x-ec-admin') !== 'v00-interno') {
      return json(403, { error: 'Acceso no autorizado al panel.' });
    }
    token = '';
  } else if (!token) {
    return json(401, { error: 'Se requiere sesión de administrador.' });
  }

  if (token) {
    const { data: quien, error: errQuien } = await admin.auth.getUser(token);
    if (errQuien || !quien?.user) {
      return json(401, { error: 'Sesión inválida o expirada.' });
    }
    if ((quien.user.user_metadata as Record<string, unknown> | null)?.['rol'] !== 'admin') {
      return json(403, { error: 'Tu cuenta no tiene perfil de administración.' });
    }
  }

  // ---- Cuerpo -----------------------------------------------------------
  let cuerpo: {
    accion?: string;
    evento_id?: string;
    visible?: boolean;
    grupo?: string;
    pestana?: string;
    busqueda?: string;
    pagina?: number;
    limite?: number;
  };
  try {
    cuerpo = await req.json();
  } catch {
    return json(400, { error: 'Se requiere JSON' });
  }

  try {
    switch (cuerpo.accion) {
      case 'listar': {
        return json(200, await listar(admin, cuerpo));
      }

      // ------------------------------------------------------------ visibilidad
      case 'definir_visibilidad': {
        const id = (cuerpo.evento_id ?? '').trim();
        if (!id) return json(400, { error: 'Falta el identificador del evento.' });
        if (typeof cuerpo.visible !== 'boolean') {
          return json(400, { error: 'Falta el campo booleano "visible".' });
        }
        const { error } = await admin
          .from('events')
          .update({ is_suppressed: !cuerpo.visible })
          .eq('id', id);
        if (error) {
          console.error('admin-eventos: visibilidad', error);
          return json(500, { error: 'No se pudo cambiar la visibilidad.' });
        }
        return json(200, {
          mensaje: cuerpo.visible ? 'Evento activado.' : 'Evento desactivado.',
          evento_id: id,
          visible: cuerpo.visible
        });
      }

      // ------------------------------------------------------------ visibilidad masiva
      case 'visibilidad_masiva': {
        const grupo = cuerpo.grupo ?? '';
        if (grupo !== 'validados' && grupo !== 'en_validacion' && grupo !== 'todos') {
          return json(400, { error: 'grupo debe ser "validados", "en_validacion" o "todos".' });
        }
        if (typeof cuerpo.visible !== 'boolean') {
          return json(400, { error: 'Falta el campo booleano "visible".' });
        }
        let masiva = (
          admin.from('events').update(
            { is_suppressed: !cuerpo.visible },
            { count: 'exact' }
          )
        );
        if (grupo === 'validados') {
          masiva = masiva.eq('status', 'published');
        } else if (grupo === 'en_validacion') {
          masiva = masiva.eq('status', 'draft');
        } else {
          masiva = masiva.in('status', ['published', 'draft']);
        }
        const { count: afectados, error: errMasiva } = await masiva;
        if (errMasiva) {
          console.error('admin-eventos: visibilidad_masiva', errMasiva);
          return json(500, { error: 'No se pudo aplicar el cambio masivo de visibilidad.' });
        }
        return json(200, {
          mensaje: cuerpo.visible
            ? 'Grupo activado (visibilidad pública).'
            : 'Grupo desactivado (oculto al público).',
          grupo,
          visible: cuerpo.visible,
          afectados: afectados ?? 0
        });
      }

      // ------------------------------------------------------------ validar draft
      case 'validar': {
        const id = (cuerpo.evento_id ?? '').trim();
        if (!id) return json(400, { error: 'Falta el identificador del evento.' });
        const { data: actual, error: errLectura } = await admin
          .from('events')
          .select('status')
          .eq('id', id)
          .maybeSingle();
        if (errLectura || !actual) {
          return json(404, { error: 'Evento no encontrado.' });
        }
        if ((actual as { status: string }).status === 'published') {
          return json(200, { mensaje: 'El evento ya está validado.', evento_id: id });
        }
        const { error } = await admin
          .from('events')
          .update({ status: 'published' })
          .eq('id', id);
        if (error) {
          console.error('admin-eventos: validar', error);
          return json(500, { error: 'No se pudo validar el evento.' });
        }
        return json(200, { mensaje: 'Evento validado y publicado.', evento_id: id });
      }

      default:
        return json(400, { error: 'Acción no reconocida' });
    }
  } catch (e) {
    console.error('admin-eventos:', e);
    return json(500, { error: 'Error interno de la función' });
  }
});

// ---------------------------------------------------------------------------
// Listado paginado con conteos baratos (v2)
// ---------------------------------------------------------------------------

async function listar(
  admin: ReturnType<typeof createClient>,
  cuerpo: {
    pestana?: string;
    busqueda?: string;
    pagina?: number;
    limite?: number;
  }
): Promise<unknown> {
  const pestana = cuerpo.pestana === 'en_validacion' ? 'draft' : 'published';
  const busqueda = String(cuerpo.busqueda ?? '').trim().slice(0, 120);
  const limite = Math.min(Math.max(Number(cuerpo.limite) || 60, 1), 200);
  const pagina = Math.max(Math.floor(Number(cuerpo.pagina) || 0), 0);
  const desde = pagina * limite;

  // --- Conteos globales: 3 consultas índice-count, sin traer filas --------
  const contar = async (
    filtro: (consulta: any) => any
  ): Promise<number> => {
    const { count, error } = await filtro(
      admin.from('events').select('id', { count: 'exact', head: true })
    );
    if (error) throw new Error(error.message);
    return count ?? 0;
  };
  const [nValidados, nEnValidacion, nOcultos] = await Promise.all([
    contar((c) => c.eq('status', 'published')),
    contar((c) => c.eq('status', 'draft')),
    contar((c) => c.in('status', ['published', 'draft']).eq('is_suppressed', true))
  ]);

  // --- Página de filas del grupo pedido -----------------------------------
  let consulta = admin
    .from('events')
    .select(
      'id,title,start_at,end_at,venue,status,is_suppressed,extraction_method,source_id,commune_id,created_at,updated_at,sources(name),communes(name)'
    )
    .eq('status', pestana)
    .order('created_at', { ascending: false })
    .range(desde, desde + limite - 1);

  // Búsqueda opcional en el MOTOR: título, recinto, fuente y comuna.
  // Fuente y comuna se resuelven antes a ids para filtrar sólo columnas
  // propias (evita filtros sobre recursos embebidos dentro de or()).
  const patron = busqueda.replace(/[%_,\\()]/g, ' ').trim();
  if (patron) {
    const [respFuentes, respComunas] = await Promise.all([
      admin.from('sources').select('id').ilike('name', `%${patron}%`).limit(50),
      admin.from('communes').select('id').ilike('name', `%${patron}%`).limit(50)
    ]);
    const fuentesIds = ((respFuentes.data ?? []) as { id: string }[]).map((f) => f.id);
    const comunasIds = ((respComunas.data ?? []) as { id: string }[]).map((c) => c.id);
    const clausulas = [`title.ilike.%${patron}%`, `venue.ilike.%${patron}%`];
    if (fuentesIds.length) clausulas.push(`source_id.in.(${fuentesIds.join(',')})`);
    if (comunasIds.length) clausulas.push(`commune_id.in.(${comunasIds.join(',')})`);
    consulta = consulta.or(clausulas.join(','));
  }

  const { data, error } = await consulta;
  if (error) {
    console.error('admin-eventos: listar', error);
    throw new Error(error.message);
  }

  // PostgREST devuelve los embeds uno-a-uno como OBJETO ({name}) y el SDK
  // como ARREGLO según el rol/campo; se aceptan ambas formas.
  const nombreEmbebido = (valor: unknown): string => {
    if (Array.isArray(valor)) return (valor[0] as { name?: string } | undefined)?.name ?? '';
    if (valor && typeof valor === 'object') {
      return (valor as { name?: string }).name ?? '';
    }
    return '';
  };
  const filas = ((data ?? []) as any[]).map((f) => {
    const nombreFuente = nombreEmbebido(f.sources);
    const nombreComuna = nombreEmbebido(f.communes);
    return { filaCruda: f, nombreFuente, nombreComuna };
  });

  const hoy = new Date().toISOString().slice(0, 10);
  const filaEvento = (f: any, nombreFuente: string, nombreComuna: string): FilaEvento => {
    const inicio = (f.start_at ?? '').slice(0, 10);
    const termino = (f.end_at ?? '').slice(0, 10);
    let vigente = false;
    if (!inicio) vigente = true;
    else if (!termino) vigente = inicio >= hoy;
    else vigente = termino >= hoy;
    let estado: string;
    if (!inicio) estado = 'proximo';
    else if (termino && inicio <= hoy && termino >= hoy) estado = 'en_curso';
    else if (inicio === hoy) estado = 'hoy';
    else if (vigente) estado = 'proximo';
    else estado = 'vencido';
    return {
      id: f.id,
      titulo: f.title ?? 'Evento sin título',
      origen: nombreFuente || 'SIN FUENTE',
      fecha: inicio,
      recinto: f.venue ?? '',
      comuna: nombreComuna,
      estado,
      vigente,
      visible: f.is_suppressed === false,
      metodo: f.extraction_method ?? '',
      creado: (f.created_at ?? '').slice(0, 10),
      actualizado: (f.updated_at ?? '').slice(0, 10)
    };
  };

  const filasEventos = filas.map((x) =>
    filaEvento(x.filaCruda, x.nombreFuente, x.nombreComuna)
  );

  return {
    mensaje: 'OK',
    conteos: {
      total: nValidados + nEnValidacion,
      validados: nValidados,
      enValidacion: nEnValidacion,
      ocultos: nOcultos
    },
    filas: filasEventos,
    pagina,
    limite,
    hayMas: filasEventos.length === limite
  };
}
