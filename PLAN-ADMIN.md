# Plan: Paneles de Administración PopFlame

## Resumen

Crear dos paneles de administración:

1. **Super Admin** (`/admin/super/`) - Para programador
   - CRUD completo de productos
   - Gestión de categorías
   - Configuración del sitio (WhatsApp, envíos, etc.)
   - Gestión de banners/hero
   - Backup/restore de datos
   - Gestión de usuarios admin

2. **Admin** (`/admin/`) - Para dueño de la marca
   - Dashboard con estadísticas
   - Gestión de pedidos (estados: pendiente → pagado → despachado → completado)
   - Control de stock/inventario
   - Historial de ventas
   - Exportar datos

---

## Estructura de Archivos

```
admin/
├── index.html              # Login page
├── dashboard.html          # Admin - Dashboard principal
├── pedidos.html            # Admin - Gestión de pedidos
├── inventory.html          # Admin - Control de stock
├── super/
│   ├── index.html          # Super Admin - Dashboard
│   ├── products.html       # Super Admin - CRUD productos
│   ├── categories.html     # Super Admin - CRUD categorías
│   ├── config.html         # Super Admin - Configuración
│   ├── banner.html         # Super Admin - Gestión banners
│   ├── users.html          # Super Admin - Gestión admins
│   └── backup.html         # Super Admin - Backup/restore
├── css/
│   └── admin.css           # Estilos del admin
└── js/
    ├── auth.js             # Autenticación
    ├── admin-app.js        # Lógica admin
    └── super-admin-app.js  # Lógica super admin
```

---

## Base de Datos (localStorage)

### Estructura de Usuarios
```json
{
  "users": [
    {
      "id": 1,
      "username": "admin",
      "password": "hash_password",
      "role": "super_admin",
      "name": "Programador"
    },
    {
      "id": 2,
      "username": "popflame",
      "password": "hash_password",
      "role": "admin",
      "name": "Dueño PopFlame"
    }
  ]
}
```

### Estructura de Pedidos
```json
{
  "orders": [
    {
      "id": "PF-001",
      "date": "2026-08-15T10:30:00",
      "customer": {
        "name": "Juan Pérez",
        "email": "juan@email.com",
        "phone": "+56912345678",
        "address": "Av. Principal 123",
        "city": "Santiago",
        "region": "Metropolitana"
      },
      "items": [
        {
          "productId": 1,
          "name": "Polera PopFlame Básica",
          "size": "M",
          "color": "Negro",
          "quantity": 2,
          "price": 29990
        }
      ],
      "subtotal": 59980,
      "shipping": 0,
      "total": 59980,
      "status": "pending",
      "paymentMethod": "transfer",
      "note": "",
      "createdAt": "2026-08-15T10:30:00",
      "updatedAt": "2026-08-15T10:30:00"
    }
  ]
}
```

### Estados del Pedido
```
pending    → Pendiente (recién creado)
confirmed  → Confirmado (pago verificado)
processing → En preparación
shipped    → Despachado
delivered  → Entregado
cancelled  → Cancelado
```

### Estructura de Configuración
```json
{
  "config": {
    "storeName": "PopFlame",
    "whatsappNumber": "569XXXXXXXX",
    "shippingCost": 5990,
    "freeShippingMin": 50000,
    "currency": "CLP",
    "heroTitle": "NUEVA COLECCIÓN",
    "heroSubtitle": "Streetwear que quema",
    "bannerImages": [],
    "socialLinks": {
      "instagram": "",
      "tiktok": "",
      "twitter": ""
    }
  }
}
```

---

## Funcionalidades por Panel

### Super Admin

#### 1. Gestión de Productos
- Crear nuevo producto
- Editar producto existente
- Eliminar producto
- Subir imágenes (base64 en localStorage)
- Cambiar precio, stock, tallas, colores
- Marcar como destacado
- Agregar badges (Nuevo, Oferta, etc.)

#### 2. Gestión de Categorías
- Crear nueva categoría
- Editar nombre/descripción
- Eliminar categoría
- Reordenar categorías

#### 3. Configuración
- Número de WhatsApp
- Costo de envío
- Monto mínimo para envío gratis
- Título/ subtítulo del hero
- Links de redes sociales

#### 4. Backup/Restore
- Exportar todos los datos a JSON
- Importar datos desde JSON
- Resetear a valores por defecto

#### 5. Gestión de Usuarios
- Crear nuevos admins
- Cambiar contraseñas
- Eliminar usuarios
- Asignar roles

---

### Admin (Dueño)

#### 1. Dashboard
- Total de ventas del mes
- Pedidos pendientes
- Productos con stock bajo
- Gráfico de ventas últimos 30 días

#### 2. Gestión de Pedidos
- Lista de todos los pedidos
- Filtrar por estado/fecha
- Ver detalle del pedido
- Cambiar estado del pedido
- Marcar como pagado
- Generar nota de despacho
- Buscar por ID o cliente

#### 3. Control de Stock
- Ver inventario completo
- Alertas de stock bajo
- Actualizar stock rápido
- Productos agotados

#### 4. Historial
- Ventas por período
- Producto más vendido
- Clientes frecuentes
- Exportar a CSV

---

## Seguridad

### Contraseñas
- Guardadas con hash SHA-256 (simple pero suficiente para frontend)
- Nunca en texto plano

### Sesiones
- Token aleatorio en localStorage
- Expira después de 24 horas
- Logout automático

---

## Estilos Admin

### Paleta de Colores - Página Principal
```css
:root {
    /* Degradado de rojos */
    --primary: #E31837;           /* Rojo principal */
    --primary-light: #FF4D6A;     /* Rojo claro */
    --primary-dark: #8B0000;      /* Rojo oscuro */
    --primary-gradient: linear-gradient(135deg, #FF0000 0%, #8B0000 100%);
    
    /* Blancos y grises */
    --bg-primary: #FFFFFF;        /* Fondo principal blanco */
    --bg-secondary: #F8F9FA;      /* Fondo secundario gris claro */
    --bg-tertiary: #F1F3F5;       /* Fondo terciario */
    --text-primary: #1A1A1A;      /* Texto principal oscuro */
    --text-secondary: #6C757D;    /* Texto secundario */
    --border: #E9ECEF;            /* Bordes */
    
    /* Admin sidebar */
    --admin-sidebar: #1A1A1A;     /* Sidebar oscuro */
    --admin-sidebar-hover: #2D2D2D;
}
```

### Paleta de Colores - Admin Panel
```css
:root {
    --admin-primary: #E31837;     /* Rojo principal */
    --admin-success: #10B981;     /* Verde */
    --admin-warning: #F59E0B;     /* Amarillo */
    --admin-danger: #EF4444;      /* Rojo */
    --admin-bg: #F8F9FA;          /* Fondo claro */
    --admin-card: #FFFFFF;        /* Cards blancas */
}
```

### Tipografías
```css
/* Títulos principales */
font-family: 'Aurora Pro', sans-serif;
/* Nota: Aurora Pro es gratuita solo para uso personal
   Para uso comercial necesitas licencia: https://www.myfonts.com/fonts/lazy-holiday-studio/aurora-lights/
   Alternativa gratuita para uso comercial: 'Bebas Neue' o 'Oswald' */

/* Títulos secundarios / Headings elegantes */
font-family: 'Playfair Display', serif;

/* Cuerpo de texto / UI */
font-family: 'Inter', sans-serif;
```

### Fuentes de Tipografías
- **Aurora Pro**: Descargar de https://www.dafont.com/aurora-pro.font (uso personal)
- **Playfair Display**: Google Fonts (gratis)
- **Inter**: Google Fonts (gratis)

### Layout
- Sidebar izquierdo con navegación
- Header con usuario y logout
- Contenido principal con cards
- Tablas para listados
- Modales para formularios

---

## Credenciales por Defecto

### Super Admin
- Usuario: `superadmin`
- Contraseña: `popflame2026`

### Admin
- Usuario: `admin`
- Contraseña: `popflame2026`

---

## Pasos de Implementación

1. Crear estructura de carpetas admin
2. Crear sistema de autenticación (auth.js)
3. Crear estilos del admin (admin.css)
4. Crear Super Admin:
   - Dashboard
   - CRUD Productos
   - CRUD Categorías
   - Configuración
   - Backup/Restore
   - Gestión de usuarios
5. Crear Admin:
   - Dashboard con estadísticas
   - Gestión de pedidos
   - Control de stock
   - Historial
6. Integrar checkout existente con sistema de pedidos
7. Probar flujo completo

---

## Notas Técnicas

- Todo funciona en frontend puro (HTML/CSS/JS)
- Datos persistidos en localStorage
- Exportar/importar permite migrar datos
- Sin dependencias de backend
- Compatible con hosting estático (Netlify, Vercel, etc.)
