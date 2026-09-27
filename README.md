# PopFlame — Tienda online de streetwear

Sitio e-commerce estático (HTML/CSS/JS, sin build) conectado a **Supabase** (base de datos, login y
archivos) con un panel de administración con dos roles: **Super Admin** y **Admin** (dueño).

## 1. Configurar Supabase

1. En tu proyecto de [supabase.com](https://supabase.com) → **SQL Editor** → *New query*.
2. Pega **todo** [`db/schema.sql`](db/schema.sql) y dale **Run**. Crea tablas, seguridad (RLS), funciones,
   categorías y productos iniciales. Se puede volver a correr sin duplicar nada.
3. **Authentication → Users → Add user** (marca *Auto Confirm User*):

   | Usuario del panel | Email en Supabase | Rol |
   |---|---|---|
   | `k1llu4` | `k1llu4@popflame.cl` | `super_admin` |
   | `ariaspopflame` | `ariaspopflame@popflame.cl` | `admin` |

   El rol se asigna solo (trigger `handle_new_user()`).

Si la base ya existía, en vez del schema completo corre solo los scripts nuevos de `db/` que falten
(ej. [`db/2026-09-26_create_order_rpc.sql`](db/2026-09-26_create_order_rpc.sql), que hace que el
servidor calcule precios y totales de cada pedido).

La URL del proyecto y la clave pública (`sb_publishable_...`) están en
[`js/supabaseClient.js`](js/supabaseClient.js): es seguro tenerlas en el frontend, todo el acceso lo
controla RLS.

> **Plan gratis de Supabase:** si el proyecto pasa ~1 semana sin visitas, Supabase lo **pausa** y la
> tienda deja de cargar productos. Se reactiva desde el dashboard con *Restore project*.

## 2. Publicación (Vercel)

La tienda está publicada en **https://pop-flame.vercel.app**, conectada a este repositorio privado:
cada `git push` a `main` la actualiza sola en ~1 minuto (panel en vercel.com → proyecto *pop-flame*).
No necesita build: Vercel sirve los archivos tal cual (preset *Other*).

Si más adelante usas un dominio propio (ej. `popflame.cl`, se agrega en Vercel → Settings → Domains),
cambia la URL de `og:image` en los `<head>` de las páginas (es la imagen que aparece al compartir el link).

## 3. Ejecutar localmente

```bash
python -m http.server 8000
```

Abre `http://localhost:8000` (no uses `file://`, Supabase necesita un servidor).

## 4. Panel de administración

`/admin/` → login con usuario y contraseña → `/admin/panel.html`.

- **Super Admin**: todo (productos, categorías, banners, páginas, tallas, configuración, usuarios).
- **Admin (dueño)**: pedidos, inventario, productos, banners y tallas.

Las fotos que subas desde el panel se **comprimen automáticamente** (máx. 2000 px) antes de subirlas.

Para recuperar una contraseña olvidada: SQL Editor →
`update auth.users set encrypted_password = extensions.crypt('NUEVA', extensions.gen_salt('bf')) where email = '...';`

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
  products.js             Datos (con caché local), tarjetas de producto, guía de tallas
  cart.js                 Carrito (localStorage), validación de stock, mensaje de WhatsApp
  app.js                  Núcleo común (menús, búsqueda, newsletter, animaciones)
  home.js / category.js / product.js / checkout.js / info.js   Lógica de cada página
admin/                    Panel de administración
db/                       schema.sql + scripts de cambios
supabase/functions/       Edge Functions de correo (bienvenida y producto nuevo)
```

Al cambiar CSS/JS, sube el número `?v=` en los `<link>`/`<script>` de las páginas para que los
navegadores descarguen la versión nueva.

## 6. Correos automáticos (opcional)

El newsletter guarda los correos en `subscribers`. Para enviar correos de bienvenida y de "producto
nuevo" hay que conectar [Resend](https://resend.com) y desplegar las dos Edge Functions de
`supabase/functions/` (Supabase → Edge Functions), con los secretos `RESEND_API_KEY` y `FROM_EMAIL`.
Mientras no verifiques un dominio en Resend, solo llegan al correo con que te registraste.
