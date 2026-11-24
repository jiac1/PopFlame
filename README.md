# PopFlame — Tienda online de streetwear

Sitio e-commerce estático (HTML/CSS/JS, sin build) conectado a **Supabase** (base de datos, login y
archivos) con un panel de administración con dos roles: **Super Admin** y **Admin** (dueño).

## 1. Configurar Supabase

1. En tu proyecto de [supabase.com](https://supabase.com) → **SQL Editor** → *New query*.
2. Pega **todo** [`db/schema.sql`](db/schema.sql) y dale **Run**. Crea tablas, seguridad (RLS), funciones,
   categorías y productos iniciales. Se puede volver a correr sin duplicar nada.
3. **Authentication → Users → Add user → Create new user** (marca *Auto Confirm User*).
   - Toda cuenta nueva queda con acceso **Pendiente** (sin acceso), incluida la primera. Así nadie puede
     darse acceso solo registrándose con la clave pública del sitio.
   - Activa la **primera** cuenta como Super Admin en el SQL Editor:
     `update public.profiles set role = 'super_admin', status = 'active' where id = (select id from auth.users where lower(email) = lower('tu-correo@popflame.cl'));`
   - Las siguientes se activan desde el panel (**Usuarios** → Acceso: *Activa* → Guardar).
   - Para entrar al panel se usa el **correo completo** (ej. `admin@popflame.cl`) y la contraseña.
     (Antes también servía solo el usuario, pero eso exigía una función pública que revelaba el correo
     de cada cuenta a cualquier visitante.)

Si la base ya existía, en vez del schema completo corre solo los scripts nuevos de `db/` que falten, en
orden de fecha. Los últimos son:

| Script | Qué hace |
| --- | --- |
| [`2026-11-23_correcciones.sql`](db/2026-11-23_correcciones.sql) | Los productos *Agotado* no se pueden comprar; el login no revela correos de cuentas pendientes |
| [`2026-11-24_baja_con_codigo.sql`](db/2026-11-24_baja_con_codigo.sql) | Link de baja del newsletter con código secreto |
| [`2026-11-25_auditoria.sql`](db/2026-11-25_auditoria.sql) | Newsletter de un solo envío por producto, reposición exacta de stock al cancelar, pedidos pagados que no se borran sin cancelarlos, login solo con correo, buckets sin SVG (después, volver a desplegar la Edge Function `notify-new-product`) |
| [`2026-11-26_permisos_produccion.sql`](db/2026-11-26_permisos_produccion.sql) | Nadie crea pedidos directo por la API; del pedido solo se edita el estado; Admin gestiona categorías y fotos; guardas restrictivas |
| [`2026-11-27_stock_por_talla.sql`](db/2026-11-27_stock_por_talla.sql) | Stock por talla (ver sección 4) |

**No vuelvas a correr scripts antiguos de `db/` sobre una base que ya tiene los nuevos:** algunos
reemplazan funciones por versiones anteriores. Para revisar que la base publicada esté bien:
`node tests/produccion.check.mjs` (también corre solo en GitHub Actions todos los días).

> En **Authentication → Sign In / Providers** conviene desactivar *Allow new users to sign up*: las
> cuentas se crean desde el dashboard y así nadie puede crear cuentas pendientes con la clave pública.

La URL del proyecto y la clave pública (`sb_publishable_...`) están en
[`js/supabaseClient.js`](js/supabaseClient.js): es seguro tenerlas en el frontend, todo el acceso lo
controla RLS.

> **Plan gratis de Supabase:** si el proyecto pasa ~1 semana sin visitas, Supabase lo **pausa** y la
> tienda deja de cargar productos. Se reactiva desde el dashboard con *Restore project*.

## 2. Publicación (Vercel)

La tienda está publicada en **https://pop-flame.vercel.app**, conectada a este repositorio (público: no subas claves secretas):
cada `git push` a `main` la actualiza sola en ~1 minuto (panel en vercel.com → proyecto *pop-flame*).
No necesita build: Vercel sirve los archivos tal cual (preset *Other*).

Si más adelante usas un dominio propio (ej. `popflame.cl`, se agrega en Vercel → Settings → Domains),
cambia la URL de `og:image` en los `<head>` de las páginas (es la imagen que aparece al compartir el link).

[`vercel.json`](vercel.json) envía una **Content-Security-Policy**: el sitio solo ejecuta scripts propios
y `supabase-js` desde jsDelivr (fijado con hash SRI), y solo se conecta a este proyecto de Supabase.
Por eso **no se pueden usar `<script>` ni `onclick=""` dentro del HTML** (todo va en archivos `.js`). Si
cambias de proyecto de Supabase, actualiza su URL en `connect-src`; si subes la versión de `supabase-js`,
actualiza también su `integrity` (`openssl dgst -sha384 -binary supabase.js | openssl base64 -A`).

## 3. Ejecutar localmente

```bash
python -m http.server 8000
```

Abre `http://localhost:8000` (no uses `file://`, Supabase necesita un servidor).

## 4. Panel de administración

`/admin/` → login con correo y contraseña → `/admin/panel.html`.

- **Super Admin**: todo (además de lo del Admin: suscriptores, páginas, configuración y usuarios).
- **Admin**: resumen de ventas, pedidos, inventario, productos, banners, guía de tallas y categorías.

Cada cuenta tiene un **rol** (Admin / Super Admin) y un **acceso** (Activa / Pendiente): una cuenta
pendiente no entra al panel ni ve datos, tenga el rol que tenga.

Estados de producto: **Disponible**, **Agotado** (no se puede comprar aunque tenga stock cargado),
**A Pedido** (se acepta sin límite de stock y no lo descuenta) y **Pocas Unidades** (stock normal, con aviso).

Al marcar un pedido como **pagado** el stock se descuenta solo, y se repone si se cancela.

**Stock por talla.** Además del stock total, cada producto puede llevar cuántas unidades hay de cada
talla (editor del producto → *Stock por talla*, o los contadores pequeños en **Inventario**). Ejemplo:
30 polerones en total = 5 S + 10 M + 10 L + 5 XL. Al pagar un pedido de 1 polerón M se descuenta 1 del
total **y** 1 de la talla M; al cancelarlo se reponen los dos. El total y las tallas se ajustan por
separado (el panel avisa si no cuadran). Las tallas sin número propio solo dependen del total, así que
los productos antiguos funcionan igual. En la tienda, una talla en 0 aparece tachada; si todas las
tallas están en 0, el producto se ve agotado. Los productos *A Pedido* no usan stock.
Los **datos de transferencia** (Configuración → Pagos) se muestran al cliente al confirmar la compra y
se le envían por WhatsApp desde el pedido con un clic.

Las fotos que subas desde el panel se **comprimen automáticamente** (máx. 2000 px) antes de subirlas.

Cada persona puede cambiar su propia contraseña desde el panel: botón **Cambiar contraseña** en el
menú lateral (pide la contraseña actual).

Para recuperar una contraseña olvidada: en el login, escribir el correo y tocar **¿Olvidaste tu
contraseña?**. Llega un correo con un link a `/admin/restablecer.html` para crear una nueva. Requiere que
en Supabase → Authentication → URL Configuration estén `https://pop-flame.vercel.app` como *Site URL* y
`https://pop-flame.vercel.app/admin/restablecer.html` en *Redirect URLs*. El correo que usa Supabase por
defecto tiene un límite de pocos envíos por hora; para más, configurar un SMTP propio (ej. Resend).

## 5. Estructura

```
index.html                Portada (hero con banners, lo nuevo, categorías, editoriales)
404.html                  Página de error
pages/
  categoria.html          Catálogo y categorías (?cat=<id>), filtros y orden
  producto.html           Ficha de producto (?id=<id>), galería con zoom, tallas, relacionados
  checkout.html           Datos + pedido por WhatsApp (pago por transferencia)
  info.html               Páginas de ayuda editables (?slug=envios|devoluciones|guia-de-talles|contacto)
  poleras.html, ...       Redirecciones de links antiguos
css/style.css             Todo el diseño (variables de marca al inicio)
js/
  layout.js               Header, menú, buscador, carrito y footer compartidos (se carga sin defer)
  supabaseClient.js       Cliente Supabase
  safety.js               Limpieza de HTML y validación de links/imágenes (tienda y panel)
  products.js             Datos (con caché local), tarjetas de producto, guía de tallas
  cart.js                 Carrito (localStorage), validación de stock, mensaje de WhatsApp
  app.js                  Núcleo común (menús, búsqueda, redes, animaciones)
  home.js / category.js / product.js / checkout.js / info.js   Lógica de cada página
admin/                    Panel de administración
db/                       schema.sql + scripts de cambios
supabase/functions/       Edge Functions de correo (bienvenida y producto nuevo)
```

Al cambiar CSS/JS, sube el número `?v=` en los `<link>`/`<script>` de las páginas para que los
navegadores descarguen la versión nueva.

### Pruebas

```bash
node --test tests/*.test.cjs        # pruebas del repositorio
node tests/produccion.check.mjs     # revisa los permisos de la base REAL de producción
```

GitHub Actions ([`pruebas.yml`](.github/workflows/pruebas.yml)) corre las primeras en cada push y pull
request, y la revisión de producción en `main` y una vez al día.

Revisan permisos del panel, la lógica de la tienda (stock, estados, mensaje de WhatsApp), que
`db/schema.sql` mantenga las protecciones de seguridad de los scripts de `db/` y que no haya scripts
en línea que la Content-Security-Policy bloquearía.

## 6. Instagram en el pie de página

El pie de página invita a seguir la cuenta de Instagram, con el link de **Configuración → Redes**.
Si ese campo está vacío, el bloque no se muestra.

Antes había un formulario de newsletter. Se quitó porque sin dominio propio los correos no llegan a
los clientes. Los correos que ya se habían guardado siguen en el panel (**Suscriptores**), y las
Edge Functions de correo siguen en `supabase/functions/` por si más adelante se activa con un dominio
(requieren `RESEND_API_KEY` y un dominio verificado en Resend). Sus correos traen el link
**Darme de baja** con un código secreto por suscriptor (`pages/baja.html?t=...`): sin ese código no
se puede dar de baja a otra persona.
