# SMTP personalizado — verificación de cuenta y recuperación de contraseña

> Alcance acordado: usar el intermediario de correo **solo** para los dos correos
> de Auth. No hay mailing de recomendaciones ni marketing.

## Idea base (menos código, más configuración)

Supabase Auth ya envía ambos correos. Lo único que hace falta es reemplazar el
SMTP integrado de Supabase (límite muy bajo, solo sirve para desarrollo) por
el de un proveedor real. **El frontend no necesita nueva integración.**

- **Confirmación de cuenta**: ya funciona — `signUp` en `supabase.service.ts`
  incluyó `emailRedirectTo: ${location.origin}/auth/callback`.
- **Recuperación de contraseña**: la plantilla se configura acá, pero el flujo
  en la app **aún no existe** (ver paso 5).

Elegido: **Brevo (Sendinblue)** — plan gratis 300 correos/día (de sobra para
Auth), no exige tener dominio propio, solo verificar el remitente.

## 1. Crear la clave SMTP en Brevo

1. Cuenta gratis en `https://app.brevo.com` → **Senders & Accounts**.
2. Verificar el remitente (ej. `noreply@tucorreo.cl`): llega un correo de
   confirmación que hay que abrir.
3. En la misma sección, pestaña **SMTP & API** → **Crear clave SMTP**. Copia la
   clave (empieza con `xsmtpsib-`). Es UN SECRETO: no va en el repo ni en chat.

## 2. Configurar el SMTP en Supabase

Dashboard del proyecto (`ngwkehuewmjykiiujqic`) → **Authentication → SMTP
Settings → Enable Custom SMTP**, con:

| Campo Supabase | Valor |
|---|---|
| Host | `smtp-relay.brevo.com` |
| Port | `587` |
| Username | el correo de la cuenta Brevo |
| Password | la clave completa `xsmtpsib-…` |
| Sender email | el remitente verificado del paso 1 (debe coincidir) |
| Sender name | `Evento Cultural` |

## 3. Plantilla: Confirmación de cuenta

Authentication → Email Templates → **Confirm signup**. Cuerpo mínimo:

```html
<p>Hola,</p>
<p>Confirma tu cuenta para empezar a descubrir eventos:</p>
<p><a href="{{ .ConfirmationURL }}">Confirmar mi cuenta</a></p>
<p>Si no creaste esta cuenta, puedes ignorar este mensaje.</p>
<p>— Evento Cultural</p>
```

`{{ .ConfirmationURL }}` aterriza en `/auth/callback` (ya configurado en el
signUp), que intercambia el código por sesión y deja al usuario autenticado.

## 4. Plantilla: Recuperación de contraseña

Authentication → Email Templates → **Reset Password**:

```html
<p>Recibimos una solicitud para restablecer tu contraseña.</p>
<p><a href="{{ .ConfirmationURL }}">Crear una contraseña nueva</a></p>
<p>Si no fuiste tú, ignora este mensaje; tu contraseña sigue igual.</p>
<p>— Evento Cultural</p>
```

## 5. Flujo en la app (pendiente, pequeño)

El servicio y la pantalla de recuperación no existen todavía. Cuando se agregue,
el mínimo es:

```ts
await supabase.cliente.auth.resetPasswordForEmail(email, {
  // Reutiliza el callback existente: el token llega y la sesión se restaura.
  redirectTo: `${location.origin}/auth/callback`
});
```

+ una vista de "nueva contraseña" para luego hacer
`supabase.cliente.auth.updateUser({ password })` con sesión ya restaurada.

## 6. Límites y pruebas

- Brevo free: 300/día — para Auth es holgado; el SMTP de Supabase por defecto
  tenía un límite de desarrollo (~2 por hora), esto lo elimina.
- Probar: `signUp` con un correo real → debe llegar el correo de confirmación
  en segundos; luego "forgot password" desde la plantilla.
- **Regla de prueba**: crear una cuenta de prueba nueva sí es aceptable (es el
  objetivo del envío); borrarla después con "Eliminar cuenta" de la app.
