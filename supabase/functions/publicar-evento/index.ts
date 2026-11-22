// Edge Function: publicar-evento
//
// Persistencia de eventos publicados por organizadores.
//
// Antes el frontend hacía INSERT directo a `events` con el JWT del usuario
// (RLS), pero NO funcionaba y no iba a funcionar: la tabla exige
// `external_key` NOT NULL + único, `source_id` NOT NULL (FK a `sources`),
// y el constraint de `status` solo admite published|cancelled|draft|archived
// (el cliente enviaba 'pending_review', que viola el constraint). Esta función
// hace el INSERT con la clave de servicio (service_role) generando los campos
// obligatorios que el cliente no manda.
//
// Seguridad:
//  - Exige Authorization: Bearer <JWT de sesión>; la identidad sale del token
//    verificado con Admin API (auth.getUser): nunca del cuerpo.
//  - Solo `user_metadata.rol === 'organizador'` puede publicar (además del
//    guard del cliente).
//  - Lista blanca de campos: el cuerpo no puede fijar id/external_key/
//    source_id/status ni otros campos sensibles.
//
// Despliegue (verify_jwt ACTIVADO por defecto: la plataforma valida la firma
// y esta función revalida contra Admin API):
//   supabase functions deploy publicar-evento --project-ref ngwkehuewmjykiiujqic
//
// Secretos requeridos (ya configurados en el proyecto):
//   SUPABASE_SERVICE_ROLE_KEY, SUPABASE_URL
// deno-lint-ignore-file no-explicit-any
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
const PROJECT_URL = Deno.env.get('SUPABASE_URL') ?? Deno.env.get('URL') ?? '';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type'
} as Record<string, string>;

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', ...CORS }
  });
}

const limpia = (v: unknown, max = 500): string => String(v ?? '').trim().slice(0, max);

interface Draft {
  titulo: string;
  descripcion: string;
  start_at: string;
  end_at: string | null;
  venue: string;
  address: string;
  comuna: string | null;
  modalidad: string | null;
  is_free: boolean;
  price_text: string | null;
  image_url: string | null;
  official_url: string | null;
  audience: string | null;
  categories: string[];
}

Deno.serve(async (req: Request): Promise<Response> => {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS });
  if (req.method !== 'POST') return json(405, { error: 'Método no permitido' });
  if (!SERVICE_KEY || !PROJECT_URL) {
    return json(503, { error: 'Edge Function sin SUPABASE_SERVICE_ROLE_KEY configurada' });
  }

  // ---- 1. Identidad: JWT válido + rol organizador ------------------------
  const token = (req.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '');
  if (!token) return json(401, { error: 'Se requiere sesión (Authorization: Bearer)' });

  const admin = createClient(PROJECT_URL, SERVICE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false }
  });

  try {
    const { data: quien, error: errQuien } = await admin.auth.getUser(token);
    if (errQuien || !quien?.user) {
      return json(401, { error: 'Sesión inválida o expirada. Inicia sesión de nuevo.' });
    }
    const usuario = quien.user;
    if ((usuario.user_metadata as Record<string, unknown> | null)?.['rol'] !== 'organizador') {
      return json(403, { error: 'Tu cuenta es de usuario. Activa el perfil de organizador para publicar eventos.' });
    }

    let cuerpo: (Partial<Draft> & { accion?: string; evento_id?: string }) | null = null;
    try {
      cuerpo = await req.json();
    } catch {
      return json(400, { error: 'Se requiere JSON' });
    }
    if (!cuerpo) return json(400, { error: 'Se requiere JSON' });

    // ---- Mis eventos: listar / actualizar / eliminar propios --------------
    // (CP-F3-OWN-001). La titularidad vive en external_key = org:<uid>:…
    // escrita al crear. Cualquier otro evento (scraper u otro organizador)
    // responde 403: nadie edita ni borra lo ajeno.
    const esMio = (externalKey: unknown) =>
      typeof externalKey === 'string' &&
      externalKey.startsWith(`org:${usuario.id}:`);

    if (cuerpo.accion === 'listar_mios') {
      const { data, error } = await admin
        .from('events')
        .select(
          'id,title,description,status,start_at,end_at,venue,address,is_free,price_text,' +
            'image_url,official_url,audience,location_precision,created_at,' +
            'communes(name),event_categories(categories(name))'
        )
        .like('external_key', `org:${usuario.id}:%`)
        .order('created_at', { ascending: false })
        .limit(50);
      if (error) return json(500, { error: 'No se pudieron listar tus eventos.' });
      return json(200, { eventos: data ?? [] });
    }

    if (cuerpo.accion === 'actualizar' || cuerpo.accion === 'eliminar') {
      const eventoId = limpia(cuerpo.evento_id, 80);
      if (!eventoId) return json(400, { error: 'Falta el identificador del evento.' });
      const { data: previo, error: errPrevio } = await admin
        .from('events')
        .select('id,external_key')
        .eq('id', eventoId)
        .maybeSingle();
      if (errPrevio) return json(500, { error: 'No se pudo consultar el evento.' });
      if (!previo) return json(404, { error: 'El evento no existe.' });
      if (!esMio((previo as { external_key: unknown }).external_key)) {
        return json(403, { error: 'Solo puedes editar o eliminar tus propios eventos.' });
      }
      if (cuerpo.accion === 'eliminar') {
        await admin.from('event_categories').delete().eq('event_id', eventoId);
        const { error: errDel } = await admin.from('events').delete().eq('id', eventoId);
        if (errDel) return json(500, { error: 'No se pudo eliminar el evento.' });
        return json(200, { mensaje: 'Evento eliminado.' });
      }
      // Editar: mismas reglas que crear, sin tocar status ni external_key.
      const tit = limpia(cuerpo.titulo);
      const des = limpia(cuerpo.descripcion, 20_000);
      const ven = limpia(cuerpo.venue);
      const dir = limpia(cuerpo.address);
      const ini = limpia(cuerpo.start_at, 40);
      const fin = limpia(cuerpo.end_at, 40) || null;
      if (tit.length < 4) return json(400, { error: 'El nombre debe tener al menos 4 caracteres.' });
      if (des.length < 20) return json(400, { error: 'La descripción debe tener al menos 20 caracteres.' });
      if (!ven) return json(400, { error: 'Indica la dirección o lugar de referencia.' });
      if (Number.isNaN(Date.parse(ini)) || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(ini)) {
        return json(400, { error: 'Fecha del evento inválida.' });
      }
      if (fin && Number.isNaN(Date.parse(fin))) {
        return json(400, { error: 'Fecha de término inválida.' });
      }
      const comunaUp = limpia(cuerpo.comuna, 120);
      if (!Array.isArray(cuerpo.categories) || !cuerpo.categories.length ||
          cuerpo.categories.some(c => typeof c !== 'string' || !c.trim() || c.trim().length > 80)) {
        return json(400, { error: 'Selecciona categorías válidas.' });
      }
      // Modalidad: no se guarda como columna; se deriva en los campos de ubicación.
      const modalidadUp = limpia(cuerpo.modalidad, 30);
      const esOnlineUp = /online|virtual|stream/i.test(modalidadUp);
      const locationUp = esOnlineUp ? comunaUp || 'Online' : dir || ven;
      const precisionUp = esOnlineUp ? 'online' : dir ? 'exact' : 'venue';
      const sourceUp = esOnlineUp ? 'source-default' : 'source-data';
      const precioLibreUp = cuerpo.is_free === true || limpia(cuerpo.price_text, 120) === '';
      // Un único RPC: evento, catálogos y relaciones se confirman o revierten juntos.
      const { error: errUp } = await admin.rpc('update_organizer_event_atomic', {
        p_event_id: eventoId,
        p_owner_id: usuario.id,
        p_commune: comunaUp || null,
        p_categories: [...new Set(cuerpo.categories.map(c => c.trim()))],
        p_changes: {
          title: tit,
          description: des,
          start_at: ini,
          end_at: fin,
          venue: ven,
          address: dir || ven,
          location: locationUp,
          location_precision: precisionUp,
          location_source: sourceUp,
          audience: limpia(cuerpo.audience, 60) || 'Todo público',
          is_free: precioLibreUp,
          price_text: precioLibreUp ? null : limpia(cuerpo.price_text, 120),
          image_url: limpia(cuerpo.image_url, 2_000) || null,
          official_url: limpia(cuerpo.official_url, 2_000) || null
        }
      });
      if (errUp) {
        const status = errUp.code === '22023' ? 400 : errUp.code === '42501' ? 403 : errUp.code === 'P0002' ? 404 : 500;
        return json(status, { error: status === 500
          ? 'No se pudo guardar el cambio completo. No se aplicaron cambios.'
          : errUp.message });
      }
      return json(200, { mensaje: 'Evento actualizado.' });
    }

    // ---- 2. Validación del borrador (misma regla que la UI) ---------------

    const titulo = limpia(cuerpo.titulo);
    const descripcion = limpia(cuerpo.descripcion, 20_000);
    const venue = limpia(cuerpo.venue);
    const address = limpia(cuerpo.address);
    const startAt = limpia(cuerpo.start_at, 40);
    const endAtRaw = limpia(cuerpo.end_at, 40) || null;

    if (titulo.length < 4) return json(400, { error: 'El nombre debe tener al menos 4 caracteres.' });
    if (descripcion.length < 20) return json(400, { error: 'La descripción debe tener al menos 20 caracteres.' });
    if (!venue) return json(400, { error: 'Indica la dirección o lugar de referencia.' });
    if (Number.isNaN(Date.parse(startAt)) || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(startAt)) {
      return json(400, { error: 'Fecha del evento inválida.' });
    }
    if (endAtRaw && Number.isNaN(Date.parse(endAtRaw))) {
      return json(400, { error: 'Fecha de término inválida.' });
    }

    if (!Array.isArray(cuerpo.categories) || !cuerpo.categories.length ||
        cuerpo.categories.some(c => typeof c !== 'string' || !c.trim() || c.trim().length > 80)) {
      return json(400, { error: 'Selecciona categorías válidas.' });
    }
    const meta = (usuario.user_metadata ?? {}) as Record<string, any>;
    const nombreOrg = limpia(meta.nombre || meta.nombre_display || usuario.email, 120);
    const comuna = limpia(cuerpo.comuna, 120);
    // ---- 6. INSERT del evento --------------------------------------------
    const precioLibre = cuerpo.is_free === true || limpia(cuerpo.price_text, 120) === '';
    const imagen = limpia(cuerpo.image_url, 2_000) ||
      `https://picsum.photos/seed/${crypto.randomUUID().slice(0, 8)}/800/600`;

    // Columnas NOT NULL de locations (constraint events_location_*_check):
    //   precision ∈ exact|coordinates|venue|commune|city|region|online|country
    //   source    ∈ source-data|source-default|deterministic-inference|
    //               nvidia-nim|geographic-fallback
    const modalidad = limpia(cuerpo.modalidad, 30);
    const esOnline = /online|virtual|stream/i.test(modalidad);
    const location = esOnline
      ? comuna || 'Online'
      : address || venue;
    const precision = esOnline ? 'online' : address ? 'exact' : 'venue';
    const source = esOnline ? 'source-default' : 'source-data';

    // Creación y categorías también deben ser indivisibles: sin recorte ni
    // éxito parcial cuando falla una asociación o el catálogo.
    const { data: evento, error: errInsert } = await admin.rpc('create_organizer_event_atomic', {
      p_owner_id: usuario.id,
      p_organizer_name: nombreOrg,
      p_commune: comuna || null,
      p_categories: [...new Set(cuerpo.categories.map(c => c.trim()))],
      p_changes: {
        title: titulo,
        start_at: startAt,
        end_at: endAtRaw,
        venue,
        address: address || venue,
        city: null,
        country: 'Chile',
        location,
        location_precision: precision,
        location_source: source,
        is_suppressed: false,
        // Moderación: la publicación entra "en validación" (draft). El
        // usuario ve el aviso de éxito y el evento pasa a la bandeja
        // "En validación" del panel; un administrador lo publica desde ahí
        // con la acción 'validar' de admin-eventos.
        status: 'draft',
        audience: limpia(cuerpo.audience, 60) || 'Todo público',
        is_free: precioLibre,
        description: descripcion,
        price_text: precioLibre ? null : limpia(cuerpo.price_text, 120),
        currency: 'CLP',
        image_url: imagen,
        source_url: null,
        official_url: limpia(cuerpo.official_url, 2_000) || null,
        extraction_method: 'app_organizador',
        scraped_at: new Date().toISOString(),
        last_seen_at: new Date().toISOString()
      }
    });
    if (errInsert || !evento) {
      console.error('publicar-evento: insert del evento', errInsert);
      return json(errInsert?.code === '22023' ? 400 : 500, {
        error: 'No se pudo guardar el evento completo. No se aplicaron cambios.'
      });
    }

    return json(201, {
      mensaje: 'Evento publicado.',
      evento: evento
    });
  } catch (e) {
    console.error('publicar-evento:', e);
    return json(500, { error: 'Error interno de la función' });
  }
});
