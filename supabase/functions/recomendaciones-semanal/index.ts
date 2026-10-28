// Edge Function: recomendaciones-semanal
//
// Correos personalizados de eventos ("configuración semanal"): para cada
// destinatario registra sus señales en `user_event_interactions` (me gusta,
// clicks, views), puntaje los próximos eventos publicados por afinidad
// (categorías de las señales + comuna/región) y envía con Resend un correo
// construido con el estilo de la plantilla
// `docs/email-templates/recomendaciones-semanal.html` (3 tarjetas + motivo +
// enlaces de preferencias), con versión de texto plano de respaldo.
//
// Convocatoria: POST con cabecera `x-recs-key` == secret RECS_CRON_KEY.
// Programable (por ejemplo) con GitHub Actions/Webhook durante la semana.
//
// Request:
//   {
//     "emails": ["a@x.cl", ...]   // opcional; por defecto los últimos N usuarios
//     "dry_run": true             // opcional: calcula pero NO envía
//   }
//
// Límites: máx. 20 destinatarios por llamada; cap defensivo si `emails` no va.
//
// Despliegue (public: nadie tiene la cron key; verify_jwt DESACTIVADO porque
// el disparo lo hace el scheduler sin sesión de usuario):
//   supabase functions deploy recomendaciones-semanal \
//     --project-ref ngwkehuewmjykiiujqic --no-verify-jwt
//
// Secretos requeridos (ya configurados salvo RECS_CRON_KEY):
//   SUPABASE_SERVICE_ROLE_KEY, SUPABASE_URL, RESEND_API_KEY,
//   APP_ORIGIN, RECS_CRON_KEY  ← nuevo
// deno-lint-ignore-file no-explicit-any
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
const PROJECT_URL = Deno.env.get('SUPABASE_URL') ?? Deno.env.get('URL') ?? '';
const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY') ?? '';
const RESEND_FROM = Deno.env.get('RESEND_FROM') ?? 'Evento Cultural <onboarding@resend.dev>';
const APP_ORIGIN = (Deno.env.get('APP_ORIGIN') ?? 'http://localhost:53679').replace(/\/$/, '');
const RECS_CRON_KEY = Deno.env.get('RECS_CRON_KEY') ?? '';

const MAX_USUARIOS = 20;
const CANDIDATOS = 60;
const EVENTOS_POR_CORREO = 3;

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body, null, 2), {
    status,
    headers: { 'Content-Type': 'application/json' }
  });
}

const pliega = (s: string): string =>
  (s ?? '').trim().toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');

/** Escapa HTML para el correo. */
function esc(s: unknown): string {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/** "2026-11-03T20:00:00" → "3 nov 2026" y "20:00" en es-CL. */
function fechaHora(iso: string | null): { fecha: string; hora: string } {
  if (!iso) return { fecha: 'Por confirmar', hora: '' };
  const d = new Date(iso);
  if (isNaN(d.getTime())) return { fecha: 'Por confirmar', hora: '' };
  const meses = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
  return {
    fecha: `${d.getUTCDate()} ${meses[d.getUTCMonth()]} ${d.getUTCFullYear()}`,
    hora: iso.slice(11, 16) || ''
  };
}

interface EventoCandidato {
  id: string;
  title: string;
  description: string;
  start_at: string | null;
  end_at: string | null;
  venue: string | null;
  address: string | null;
  region: string | null;
  commune_id: string | null;
  communes: { name: string; region: string | null }[] | null;
  is_free: boolean | null;
  price_text: string | null;
  image_url: string | null;
  official_url: string | null;
  source_url: string | null;
  categorias: Set<string>;
  puntaje: number;
  motivos: string[];
}

Deno.serve(async (req: Request): Promise<Response> => {
  if (req.method !== 'POST') return json(405, { error: 'Método no permitido' });
  if (!SERVICE_KEY || !PROJECT_URL) {
    return json(503, { error: 'Edge Function sin SUPABASE_SERVICE_ROLE_KEY configurada' });
  }
  if (!RESEND_API_KEY) return json(503, { error: 'Edge Function sin RESEND_API_KEY configurada' });
  if (!RECS_CRON_KEY) return json(503, { error: 'Edge Function sin RECS_CRON_KEY configurada' });
  if ((req.headers.get('x-recs-key') ?? '') !== RECS_CRON_KEY) {
    return json(401, { error: 'Clave del correo semanal inválida' });
  }

  let cuerpo: { emails?: string[]; dry_run?: boolean } = {};
  try {
    cuerpo = await req.json();
  } catch {
    /* cuerpo vacío: todos los usuarios recentes */
  }

  const admin = createClient(PROJECT_URL, SERVICE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false }
  });

  try {
    // ---- 1. Destinatarios ---------------------------------------------------
    let destinatarios: { id: string; email: string; nombre: string }[] = [];
    if (Array.isArray(cuerpo.emails) && cuerpo.emails.length > 0) {
      const pedidos = cuerpo.emails.slice(0, MAX_USUARIOS).map((e) => String(e).trim().toLowerCase());
      for (let pagina = 1; pagina <= 20 && pedidos.length > destinatarios.length; pagina++) {
        const { data, error } = await admin.auth.admin.listUsers({ page: pagina, perPage: 200 });
        if (error) break;
        for (const u of data.users ?? []) {
          const correo = String(u.email ?? '').trim().toLowerCase();
          if (pedidos.includes(correo)) {
            const meta = (u.user_metadata ?? {}) as Record<string, any>;
            const nombre = String(
              meta.nombre || meta.nombre_display || correo.split('@')[0]
            ).trim();
            destinatarios.push({ id: u.id, email: correo, nombre });
          }
        }
        if ((data.users?.length ?? 0) < 200) break;
      }
    } else {
      // Sin lista: últimos MAX_USUARIOS usuarios creados en la Auth. El filtro
      // real de relevancia lo hace el paso 3 (sin señales, motivo genérico).
      const { data, error } = await admin.auth.admin.listUsers({ page: 1, perPage: MAX_USUARIOS });
      if (error) return json(500, { error: 'No se pudo listar usuarios: ' + error.message });
      for (const u of data.users ?? []) {
        if (!u.email) continue;
        const meta = (u.user_metadata ?? {}) as Record<string, any>;
        destinatarios.push({
          id: u.id,
          email: String(u.email).trim().toLowerCase(),
          nombre: String(meta.nombre || meta.nombre_display || String(u.email).split('@')[0]).trim()
        });
      }
    }
    destinatarios = destinatarios.slice(0, MAX_USUARIOS);
    if (destinatarios.length === 0) {
      return json(200, { mensaje: 'Sin destinatarios para este envío.', envios: [] });
    }

    // ---- 2. Catálogo vigente (embed comunas) -------------------------------
    const hoyInicio = new Date().toISOString();
    const { data: crudos, error: errCatalogo } = await admin
      .from('events')
      .select(
        'id, title, description, start_at, end_at, venue, address, region, commune_id, ' +
          'communes(name, region), is_free, price_text, image_url, official_url, source_url'
      )
      .eq('status', 'published')
      .gte('start_at', hoyInicio)
      .order('start_at', { ascending: true })
      .limit(CANDIDATOS);
    if (errCatalogo) {
      return json(500, { error: 'No se pudo leer el catálogo: ' + errCatalogo.message });
    }

    const candidatos: EventoCandidato[] = (crudos ?? []).map((r: any) => ({
      id: r.id,
      title: r.title ?? '',
      description: (r.description ?? '').slice(0, 220),
      start_at: r.start_at,
      end_at: r.end_at,
      venue: r.venue,
      address: r.address,
      region: r.region,
      commune_id: r.commune_id,
      communes: r.communes,
      is_free: r.is_free,
      price_text: r.price_text,
      image_url: r.image_url,
      official_url: r.official_url,
      source_url: r.source_url,
      categorias: new Set(),
      puntaje: 0,
      motivos: []
    }));
    const idsCatalogo = candidatos.map((c) => c.id);

    // ---- 3. Categorías del catálogo (una sola consulta con embed) ----------
    const catPorEvento = new Map<string, string[]>();
    if (idsCatalogo.length > 0) {
      const lista = `(${idsCatalogo.slice(0, 60).join(',')})`;
      const { data: rels } = await admin
        .from('event_categories')
        .select('event_id, categories(name)')
        .in('event_id', idsCatalogo);
      for (const rel of rels ?? []) {
        const nombre = (rel as any)?.categories?.name;
        if (!nombre) continue;
        const l = catPorEvento.get(rel.event_id) ?? [];
        l.push(nombre);
        catPorEvento.set(rel.event_id, l);
      }
      for (const c of candidatos) c.categorias = new Set(catPorEvento.get(c.id) ?? []);
    }

    // ---- 4. Por usuario: señales → puntaje → correo ------------------------
    const envios: unknown[] = [];
    for (const dest of destinatarios) {
      try {
        const { data: señales } = await admin
          .from('user_event_interactions')
          .select('event_id, interaction_type, occurred_at')
          .eq('user_id', dest.id)
          .order('occurred_at', { ascending: false })
          .limit(80);

        const exclusion = new Set<string>();
        const catsSenal = new Map<string, number>();
        const communesSenal = new Set<string>();
        const regionsSenal = new Map<string, number>();
        for (const s of señales ?? []) {
          if (String(s.interaction_type) === 'not_interested') exclusion.add(s.event_id);
        }
        const idsSenal = [...new Set((señales ?? []).map((s) => String(s.event_id)))].filter(
          (id) => !exclusion.has(id)
        );
        if (idsSenal.length > 0) {
          const { data: eventosSenal } = await admin
            .from('events')
            .select('id, commune_id, region, event_categories(categories(name))')
            .in('id', idsSenal.slice(0, 60));
          for (const ev of eventosSenal ?? []) {
            for (const rel of ev.event_categories ?? []) {
              const nombre = rel?.categories?.name;
              if (nombre) catsSenal.set(pliega(nombre), (catsSenal.get(pliega(nombre)) ?? 0) + 1);
            }
            if (ev.commune_id) communesSenal.add(ev.commune_id);
            if (ev.region) regionsSenal.set(ev.region, (regionsSenal.get(ev.region) ?? 0) + 1);
          }
        }

        for (const c of candidatos) {
          c.puntaje = 0;
          c.motivos = [];
          let mejorCat = '';
          let mejorHits = 0;
          for (const cat of c.categorias) {
            const hits = catsSenal.get(pliega(cat)) ?? 0;
            if (hits > mejorHits) {
              mejorHits = hits;
              mejorCat = cat;
            }
          }
          if (mejorCat) {
            c.puntaje += 4 + Math.min(mejorHits, 3);
            c.motivos.push(`Por tu interés previo en ${mejorCat}`);
          }
          const comunasCandidata = c.communes?.[0]?.name ?? '';
          if (c.commune_id && communesSenal.has(c.commune_id)) {
            c.puntaje += 3;
            c.motivos.push(`Por los eventos que sigues en ${comunasCandidata}`);
          } else if (c.region && (regionsSenal.get(c.region) ?? 0) > 0) {
            c.puntaje += 1;
            c.motivos.push(`Por tu interés en la región ${c.region}`);
          }
        }

        const elegidos = candidatos
          .filter((c) => !exclusion.has(c.id))
          .sort((a, b) => b.puntaje - a.puntaje)
          .slice(0, EVENTOS_POR_CORREO);
        if (elegidos.length === 0) {
          envios.push({ email: dest.email, estado: 'sin-eventos-proximos' });
          continue;
        }

        if (cuerpo.dry_run) {
          envios.push({
            email: dest.email,
            estado: 'dry-run',
            eventos: elegidos.map((e) => ({
              id: e.id,
              titulo: e.title,
              motivo: e.motivos[0] ?? 'Próximo a tu alrededor esta semana'
            }))
          });
          continue;
        }

        const resulado = await enviarCorreo(dest, elegidos);
        envios.push({ email: dest.email, ...resulado });
      } catch (e) {
        envios.push({ email: dest.email, estado: 'error', detalle: String(e) });
      }
    }

    return json(200, {
      mensaje: `Proceso terminado: ${destinatarios.length} destinatario(s).`,
      dry_run: !!cuerpo.dry_run,
      envios
    });
  } catch (e) {
    console.error('recomendaciones-semanal:', e);
    return json(500, { error: 'Error interno de la función' });
  }
});

// ---------------------------------------------------------------------------
// Envío con Resend
// ---------------------------------------------------------------------------
function enlaceEvento(c: EventoCandidato): string {
  return c.official_url || c.source_url || `${APP_ORIGIN}/detalle-evento?id=${c.id}`;
}

async function enviarCorreo(
  dest: { email: string; nombre: string },
  elegidos: EventoCandidato[]
): Promise<{ estado: string; id_email?: string; detalle?: string }> {
  const tarjetas = elegidos
    .map(
      (c) => {
        const fh = fechaHora(c.start_at || ((c as any).end_at ?? null));
        const comuna = c.communes?.[0]?.name ?? c.address ?? 'Chile';
        const region = c.communes?.[0]?.region ?? c.region ?? '';
        const precio = c.is_free ? 'GRATIS' : (c.price_text || 'Entrada con costo');
        const motivo = esc(c.motivos[0] ?? 'Próximo a tu alrededor esta semana');
        return `
<tr style="height:16px"><td></td></tr>
<tr><td style="height:1px;background:#3a3a3a"></td></tr>
<tr><td style="padding:14px 0 10px;color:#9e9e9e;font-size:12px;font-weight:600;letter-spacing:.5px;text-transform:uppercase">SEMANA CULTURAL</td></tr>
<tr><td>
  <table role="presentation" width="100%" style="background-color:#333;border-radius:8px;overflow:hidden"><tr><td style="padding:14px 16px">
    ${c.image_url ? `<a href="${esc(enlaceEvento(c))}"><img src="${esc(c.image_url)}" alt="${esc(c.title)}" style="width:100%;height:auto;display:block;border-radius:6px;background:#4a4a4a" width="568"/></a>` : ''}
    <a href="${esc(enlaceEvento(c))}" style="text-decoration:none;color:#fff;font-size:17px;font-weight:600;line-height:1.35;display:block;margin:14px 0 6px">${esc(c.title)}</a>
    <div style="color:#9e9e9e;font-size:13px;line-height:1.45;padding-bottom:10px">${esc(fh.fecha)}${fh.hora ? ' · ' + esc(fh.hora) : ''} · ${esc(comuna)}${region ? ', ' + esc(region) : ''}</div>
    <span style="display:inline-block;font-size:13px;color:#fff;background:#43a047;padding:6px 10px;border-radius:20px;font-weight:600">${esc(precio)}</span>
    <div style="color:#b0b0b0;font-size:14px;line-height:1.5;padding-top:10px">${esc(c.description)}</div>
    <div style="padding-top:14px"><a href="${esc(enlaceEvento(c))}" style="text-decoration:none;color:#fff;background:#1db954;font-size:14px;font-weight:600;padding:10px 14px;border-radius:6px;display:inline-block">Ver detalles</a></div>
    <div style="padding-top:10px;color:#8a8a8a;font-size:12px;line-height:1.45">${motivo}</div>
  </td></tr></table>
</td></tr>`;
      }
    )
    .join('\n');

  const html = `<!DOCTYPE html>
<html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Eventos para ti esta semana</title></head>
<body style="margin:0;background-color:#242424;font-family:'Helvetica Neue',Helvetica,Arial,sans-serif">
<table role="presentation" width="100%" style="background-color:#242424"><tr><td style="padding:32px 20px 48px">
<table role="presentation" width="100%" style="max-width:600px;margin:0 auto">
  <tr><td style="text-align:center;padding-bottom:16px"><a href="${esc(APP_ORIGIN)}" style="font-size:20px;font-weight:700;color:#fff;text-decoration:none">Evento Cultural</a></td></tr>
  <tr><td style="color:#fff;font-size:15px;line-height:1.55;padding-bottom:8px">Hola ${esc(dest.nombre)},</td></tr>
  <tr><td style="color:#ccc;font-size:15px;line-height:1.55;padding-bottom:24px">Te traemos una selección de eventos cercanos a lo que suele interesarte. Puedes verlos, guardarlos y ajustar tus preferencias desde la app.</td></tr>
  ${tarjetas}
  <tr><td style="height:24px"></td></tr>
  <tr><td style="height:1px;background:#3a3a3a"></td></tr>
  <tr><td style="padding:16px"><a href="${esc(APP_ORIGIN)}" style="text-decoration:none;color:#fff;background:#1db954;font-size:14px;font-weight:600;padding:12px 16px;border-radius:6px;display:inline-block">Abrir evento cultural</a></td></tr>
  <tr><td style="padding:6px 16px"><a href="${esc(APP_ORIGIN)}/perfil" style="color:#9e9e9e;font-size:13px;text-decoration:none">Cambiar preferencias de correo</a></td></tr>
  <tr><td style="padding:6px 16px"><a href="${esc(APP_ORIGIN)}/perfil" style="color:#9e9e9e;font-size:13px;text-decoration:none">Cerrar sesión o cambiar cuenta</a></td></tr>
  <tr><td style="padding:24px 16px 12px;color:#666;font-size:12px;line-height:1.55">Este correo es automático. No respondas este mensaje, pues las respuestas no se conectan con tu cuenta.</td></tr>
  <tr><td style="padding:0 16px 24px;color:#666;font-size:12px;line-height:1.55">Evento Cultural<br/>Escuela de Informática · Duoc UC (Maipú)<br/>© ${new Date().getUTCFullYear()} Evento Cultural. Todos los derechos reservados.</td></tr>
</table>
</td></tr></table></body></html>`;

  const texto = [
    `Hola ${dest.nombre},`,
    '',
    'Te compartimos una selección de eventos cerca de tus intereses.',
    '',
    'Sugerencias para esta semana',
    ...elegidos.map((c, i) => {
      const fh = fechaHora(c.start_at);
      const comuna = c.communes?.[0]?.name ?? c.address ?? 'Chile';
      const precio = c.is_free ? 'GRATIS' : c.price_text || 'Entrada con costo';
      return [
        `📅 ${i + 1}. ${c.title}`,
        `   ${fh.fecha} · ${fh.hora} · ${comuna}`,
        `   ${precio}`,
        `   ${c.description}`,
        `   ${c.motivos[0] ?? 'Próximo a tu alrededor esta semana'}`,
        `   ${enlaceEvento(c)}`
      ].join('\n');
    }),
    '',
    'Qué puedes hacer desde la app:',
    '- Ver detalles y ubicación de cada evento',
    '- Decir “me interesa” para seguir guardando opciones',
    '- Decir “no me interesa” para que no vuelva a aparecer',
    '',
    'Ver agenda: ' + APP_ORIGIN,
    'Preferencias: ' + APP_ORIGIN + '/perfil',
    '',
    'Este correo es automático. No respondas este mensaje.',
    `© ${new Date().getUTCFullYear()} Evento Cultural.`
  ].join('\n');

  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${RESEND_API_KEY}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      from: RESEND_FROM,
      to: [dest.email],
      subject: `Eventos para ti esta semana — Evento Cultural (${fechaHora(elegidos[0].start_at).fecha})`,
      html,
      text: texto
    })
  });
  if (!res.ok) {
    const detalle = await res.text().catch(() => '');
    console.error('recomendaciones-semanal: Resend rechazó el envío', res.status, detalle);
    return { estado: 'error-envio', detalle: `${res.status} ${detalle.slice(0, 300)}` };
  }
  const datos = await res.json().catch(() => ({}));
  return { estado: 'enviado', id_email: String((datos as any).id ?? '') };
}
