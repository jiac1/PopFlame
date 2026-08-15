# PopFlame - Sitio Web de Ropa Streetwear

Sitio e-commerce (HTML/CSS/JS) conectado a **Supabase** (base de datos + autenticación) con un
panel de administración con dos roles: **Super Admin** (control total) y **Admin** (dueño de la
tienda, permisos acotados a pedidos/inventario).

## 1. Configurar Supabase (una sola vez)

1. Entra a tu proyecto en [supabase.com](https://supabase.com) → **SQL Editor** → *New query*.
2. Copia y pega **todo** el contenido de [`db/schema.sql`](db/schema.sql) y dale **Run**.
   Esto crea las tablas, la seguridad a nivel de fila (RLS), las funciones y carga los
   15 productos de ejemplo.
3. Ve a **Authentication → Users → Add user** y crea las dos cuentas de acceso:

   | Usuario visible | Email a usar en Supabase | Rol asignado |
   |---|---|---|
   | `k1llu4` (tú, Super Admin) | `k1llu4@popflame.cl` | `super_admin` |
   | `ariaspopflame` (dueño, Admin) | `ariaspopflame@popflame.cl` | `admin` |

   Define la contraseña que quieras para cada una y marca **"Auto Confirm User"**.
   El trigger de la base de datos crea automáticamente el perfil con el rol correcto en cuanto
   se crea el usuario (ver `handle_new_user()` en `db/schema.sql`).
4. Cuando tengas los emails reales de cada persona, puedes cambiarlos desde
   **Authentication → Users → (seleccionar usuario) → Edit** en Supabase. El `username` con el
   que inician sesión en el panel (`k1llu4` / `ariaspopflame`) no cambia.

La URL del proyecto y la clave pública (`sb_publishable_...`) ya están cargadas en
[`js/supabaseClient.js`](js/supabaseClient.js) — es seguro tenerlas en el frontend, todo el
acceso real lo controla RLS en Supabase.

## 2. Configurar el número de WhatsApp

Todavía no está definido. Cuando lo tengas:

1. Entra al panel: `/admin/` → inicia sesión como `k1llu4` (Super Admin).
2. Ve a **Configuración** y completa el campo **WhatsApp de ventas** en formato `569XXXXXXXX`.

Mientras no esté configurado, el checkout sigue funcionando: los pedidos quedan guardados en la
base de datos igual, solo que no se abre WhatsApp automáticamente.

## 2.5 Correos automáticos (bienvenida + producto nuevo)

El formulario de newsletter ya guarda los emails en la tabla `subscribers`, pero **para que
efectivamente les llegue un correo** hay que conectar [Resend](https://resend.com) (gratis hasta
3.000 emails/mes) y desplegar dos Edge Functions. No requiere instalar nada en tu computador,
todo se hace desde el navegador:

1. **Crea tu cuenta en [resend.com](https://resend.com)** y saca tu API key (Dashboard → API Keys →
   Create API Key).
2. En tu proyecto de Supabase, ve a **Edge Functions → Deploy a new function**:
   - Crea una llamada `welcome-email` y pega el contenido de
     [`supabase/functions/welcome-email/index.ts`](supabase/functions/welcome-email/index.ts).
   - Crea otra llamada `notify-new-product` y pega el contenido de
     [`supabase/functions/notify-new-product/index.ts`](supabase/functions/notify-new-product/index.ts).
3. Ve a **Project Settings → Edge Functions → Secrets** y agrega:
   - `RESEND_API_KEY` = tu API key de Resend
   - `FROM_EMAIL` (opcional) = un remitente verificado en Resend, ej. `PopFlame <ventas@tudominio.cl>`.
     Si lo dejas vacío, se manda desde el remitente de pruebas de Resend (`onboarding@resend.dev`),
     que funciona pero se ve menos profesional.
4. Para el aviso de "producto nuevo", ve a **Database → Webhooks → Create a new hook**:
   - Tabla: `products` — Evento: solo **Insert** — Tipo: **Supabase Edge Functions** —
     Función: `notify-new-product`.

Desde ese momento: cualquiera que se suscriba en el sitio recibe el correo de bienvenida al
instante, y cada producto nuevo que crees en **Productos → Nuevo producto** le llega por correo a
todos los suscriptores activos (en copia oculta entre ellos).

## 3. Panel de administración

URL: `/admin/` (login) → `/admin/panel.html` (dashboard).

- **Super Admin** (`k1llu4`): Dashboard, Pedidos, Inventario, Productos (CRUD completo),
  Categorías (CRUD), Configuración de la tienda, gestión de Usuarios/roles.
- **Admin / dueño** (`ariaspopflame`): Dashboard, Pedidos (ver y cambiar estado), Inventario
  (solo puede actualizar el stock, no precio/nombre/descripción — esto se aplica también del
  lado del servidor con Postgres, no solo ocultando botones en la interfaz).

## 4. Ejecutar el sitio localmente

```bash
# Con Python
python -m http.server 8000

# Con Node.js
npx serve
```

Ábrelo con un servidor local (no con `file://`) para que las peticiones a Supabase funcionen
correctamente.

## 5. Estructura del proyecto

```
PopFlame/
├── index.html              # Página principal
├── css/                     # Estilos globales y responsive
├── js/
│   ├── supabaseClient.js   # Cliente de Supabase compartido
│   ├── products.js         # Carga productos/categorías/config desde Supabase
│   ├── cart.js              # Carrito (localStorage) + mensaje de WhatsApp
│   └── app.js
├── pages/                   # Categorías, producto, checkout
├── db/
│   └── schema.sql           # Migración completa de Supabase (tablas, RLS, seed data)
├── admin/
│   ├── index.html            # Login (usuario + contraseña)
│   ├── panel.html             # Dashboard con pestañas según el rol
│   ├── css/admin.css
│   └── js/admin.js            # Auth + lógica de todas las pestañas del panel
└── data/products.json         # (legado, ya no se usa — los datos viven en Supabase)
```

## 6. Hosting

El sitio es estático, así que sirve cualquier hosting gratuito: **Netlify**, **Vercel** o
**GitHub Pages**, conectado a este mismo repositorio de GitHub.

## Funcionalidades

- ✅ Catálogo por categorías con filtros (datos reales desde Supabase)
- ✅ Carrito de compras persistente (localStorage)
- ✅ Checkout que crea el pedido en la base de datos
- ✅ Redirect a WhatsApp para pago por transferencia (cuando el número esté configurado)
- ✅ Login con usuario/contraseña vía Supabase Auth
- ✅ Panel Super Admin: productos, categorías, configuración, usuarios
- ✅ Panel Admin (dueño): pedidos, inventario, dashboard de ventas
- ✅ Seguridad a nivel de fila (RLS) — los permisos se cumplen en la base de datos, no solo en
  la interfaz
- ✅ Diseño responsive (móvil, tablet, desktop)
