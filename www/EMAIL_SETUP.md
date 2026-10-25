# Envío de correos del Auth (verificación y recuperación)

## Decisión actual (24-10-2026)

El proyecto usa el **SMTP integrado de Supabase** (panel → Authentication →
SMTP Settings, con "Custom SMTP" DESACTIVADO).

### Proveedor externo: evaluado y descartado por ahora

- **Brevo**: descartado — errores 535/500 vía custom SMTP de Supabase no
  resueltos (la clave autenticaba OK directo contra el relay de Brevo).
- **Resend** (3.000/mes, 100/día): primera opción técnica, pero exige
  **dominio propio verificado** para enviar a destinatarios arbitrarios.
- **Mailtrap** (4.000/mes, 150/día): también exige dominio verificado.
- **Mailgun** (100/día): sin tarjeta limita el envío a destinatarios
  autorizados; para producción exige dominio.
- **Amazon SES**: free tier de 3.000/mes no aplicable a clientes nuevos desde
  21-07-2026; setup con sandbox y solicitud de producción.
- **Postmark** (100/mes): insuficiente para el flujo de prueba + fricción de
  verificación de remitente.

Conclusión: sin dominio propio no hay alternativa gratuita viable para
taloneos de signup/recuperación a correos reales; se mantiene el builtin
hasta que el proyecto disponga de dominio (luego se recomienda Resend).

## Límite del SMTP integrado

~2 correos por hora. Suficiente para pruebas puntuales del flujo; NO apto
para uso en producción.

## Flujo de recuperación de contraseña (verificado 24-10-2026)

1. `supabase.auth.resetPasswordForEmail(email, { redirectTo:
   '<origin>/auth/callback?type=recovery' })` desde el panel de login.
2. El enlace del correo aterriza en `/auth/callback?type=recovery` y de ahí la
   app redirige a `/restablecer-contrasena`.
3. El usuario fija la contraseña nueva (`updateUser({ password })`) y puede
   iniciar sesión inmediatamente con ella.

Estado de la verificación: pasos 2 y 3 completos (enlace → pantalla →
cambio de contraseña → login OK).
Paso 1 pendiente de validar con un correo real (Gmail/Outlook): los buzones
temporales de prueba descartan el correo del remitente integrado.
