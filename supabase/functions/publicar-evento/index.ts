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

    // ---- 2. Validación del borrador (misma regla que la UI) ---------------
    let cuerpo: Partial<Draft>;
    try {
      cuerpo = await req.json();
    } catch {
      return json(400, { error: 'Se requiere JSON' });
    }

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

    // ---- 3. source_id obligatorio: fila estable del catálogo --------------
    const NOMBRE_FUENTE = 'Publicación de organizador';
    let { data: fuente } = await admin
      .from('sources')
      .select('id')
      .eq('name', NOMBRE_FUENTE)
      .maybeSingle();
    if (!fuente) {
      const { data: creada, error: errFuente } = await admin
        .from('sources')
        .insert({ id: crypto.randomUUID(), name: NOMBRE_FUENTE, is_active: true })
        .select('id')
        .single();
      if (errFuente) {
        // Carrera con otra creación: reintentar lectura antes de fallar.
        const reintento = await admin.from('sources').select('id').eq('name', NOMBRE_FUENTE).maybeSingle();
        if (!reintento.data) {
          console.error('publicar-evento: no se pudo crear la fuente', errFuente);
          return json(500, { error: 'No se pudo preparar la publicación. Intenta de nuevo.' });
        }
        fuente = reintento.data;
      } else {
        fuente = creada;
      }
    }

    // ---- 4. organizer_id: entidad por nombre del organizador --------------
    const meta = (usuario.user_metadata ?? {}) as Record<string, any>;
    const nombreOrg = limpia(meta.nombre || meta.nombre_display || usuario.email, 120);
    let { data: organizador } = await admin
      .from('organizers')
      .select('id')
      .eq('name', nombreOrg)
      .maybeSingle();
    if (!organizador) {
      const { data: creado, error: errOrg } = await admin
        .from('organizers')
        .insert({ id: crypto.randomUUID(), name: nombreOrg })
        .select('id')
        .single();
      if (errOrg) {
        const reintento = await admin.from('organizers').select('id').eq('name', nombreOrg).maybeSingle();
        if (!reintento.data) {
          console.error('publicar-evento: no se pudo registrar el organizador', errOrg);
          organizador = null; // Evento queda con organizer_id NULL (opcional en el schema).
        } else {
          organizador = reintento.data;
        }
      } else {
        organizador = creado;
      }
    }

    // ---- 5. commune_id + region por nombre de comuna ----------------------
    // Sin case/acento-dependencia del seed: se pliegan ambos lados
    // (minúsculas + sin diacríticos) sobre la lista completa de comunas.
    const pliega = (s: string): string =>
      s.trim().toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    let communeId: string | null = null;
    let region: string | null = null;
    const comuna = limpia(cuerpo.comuna, 120);
    if (comuna) {
      const { data: filas, error: errComunas } = await admin
        .from('communes')
        .select('id, name, region');
      const objetivo = pliega(comuna);
      const fila = (filas ?? []).find(
        (c: { name: string }) => pliega(c.name) === objetivo
      );
      if (errComunas) console.error('publicar-evento: listando comunas', errComunas);
      if (fila) {
        communeId = fila.id as string;
        region = (fila.region as string) ?? null;
      }
    }

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

    const { data: evento, error: errInsert } = await admin
      .from('events')
      .insert({
        id: crypto.randomUUID(),
        external_key: `org:${usuario.id}:${Date.now()}:${crypto.randomUUID().slice(0, 8)}`,
        source_id: (fuente as { id: string }).id,
        organizer_id: organizador ? (organizador as { id: string }).id : null,
        commune_id: communeId,
        title: titulo,
        start_at: startAt,
        end_at: endAtRaw,
        venue,
        address: address || venue,
        city: null,
        region,
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
      })
      .select('id, external_key')
      .single();
    if (errInsert || !evento) {
      console.error('publicar-evento: insert del evento', errInsert);
      return json(500, {
        error: 'No se pudo guardar el evento. Intenta de nuevo.',
        detalle: errInsert?.message ?? 'sin datos'
      });
    }

    // ---- 7. Categorías (N:M): buscar por nombre o crearla -----------------
    const categoriasPedidas = Array.isArray(cuerpo.categories) ? cuerpo.categories.slice(0, 3) : [];
    for (const cruda of categoriasPedidas) {
      const nombre = limpia(cruda, 80);
      if (!nombre) continue;
      const { data: cat } = await admin
        .from('categories')
        .select('id')
        .eq('name', nombre)
        .maybeSingle();
      const catId =
        (cat as { id: string } | null)?.id ??
        ((
          await admin
            .from('categories')
            .insert({ id: crypto.randomUUID(), name: nombre })
            .select('id')
            .single()
        ).data as { id: string } | null)?.id;
      if (!catId) continue;
      await admin
        .from('event_categories')
        .upsert({ event_id: evento.id, category_id: catId }, { onConflict: 'event_id,category_id' });
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
