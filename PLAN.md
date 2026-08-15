# Plan: Sitio Web PopFlame - Marca de Ropa Chile

## Resumen del Proyecto
Sitio web e-commerce para marca de ropa streetwear chilena "PopFlame" con:
- Catálogo por categorías
- Carrito de compras
- Checkout con redirect a WhatsApp para pago por transferencia bancaria
- Base de datos de productos
- Estilo visual premium/oscuro (inspirado en Milfshake)

---

## 1. Estructura del Proyecto

```
PopFlame/
├── index.html              # Página principal
├── css/
│   ├── style.css           # Estilos globales
│   ├── responsive.css      # Estilos responsive
│   └── animations.css      # Animaciones
├── js/
│   ├── app.js              # Lógica principal
│   ├── cart.js             # Funcionalidades del carrito
│   ├── products.js         # Gestión de productos
│   └── checkout.js         # Checkout y WhatsApp
├── pages/
│   ├── poleras.html        # Categoría: Poleras
│   ├── polerones.html      # Categoría: Polerones
│   ├── pantalones.html     # Categoría: Pantalones
│   ├── accesorios.html     # Categoría: Accesorios
│   └── producto.html       # Página de producto individual
├── data/
│   └── products.json       # Base de datos de productos
├── images/
│   ├── logo.png            # Logo principal
│   ├── logo-white.png      # Logo blanco
│   ├── hero-banner.jpg     # Banner principal
│   └── products/           # Imágenes de productos
│       ├── poleras/
│       ├── polerones/
│       ├── pantalones/
│       └── accesorios/
└── assets/
    └── icons/              # Iconos SVG
```

---

## 2. Tecnologías

| Componente | Tecnología |
|------------|------------|
| Frontend | HTML5, CSS3, JavaScript vanilla |
| Base de datos | JSON (productos) + localStorage (carrito) |
| Estilos | CSS custom properties, Flexbox, Grid |
| Icons | SVG inline |
| Hosting | Cualquier hosting estático (Netlify, Vercel, GitHub Pages) |

---

## 3. Páginas y Funcionalidades

### 3.1 Página Principal (index.html)
- **Hero Banner**: Imagen de fondo con texto "NUEVA COLECCIÓN" y botón CTA
- **Categorías**: Grid con 4 categorías (Poleras, Polerones, Pantalones, Accesorios)
- **Productos Destacados**: Slider o grid con 4-6 productos
- **Footer**: Redes sociales, contacto, newsletter

### 3.2 Páginas de Categoría
- Filtros por precio/talla
- Grid de productos (3-4 columnas)
- Paginación si es necesario

### 3.3 Página de Producto
- Galería de imágenes (múltiples ángulos)
- Selector de talla
- Botón "Agregar al carrito"
- Descripción y especificaciones
- Productos relacionados

### 3.4 Carrito de Compras
- **Drawer lateral** (se desliza desde la derecha)
- Lista de productos con cantidad
- Modificar cantidad / eliminar
- Resumen con subtotal, envío (opcional), total
- Botón "Finalizar Compra"

### 3.5 Checkout
- Formulario de datos del cliente:
  - Nombre completo
  - Email
  - Teléfono
  - Dirección de envío
  - Ciudad/Región
- Resumen del pedido
- **Botón "Pagar por WhatsApp"** que genera mensaje con:
  - Lista de productos
  - Totales
  - Datos del cliente
  - Link a WhatsApp Business

---

## 4. Base de Datos (products.json)

```json
{
  "products": [
    {
      "id": 1,
      "name": "Polera PopFlame Básica",
      "category": "poleras",
      "price": 29990,
      "sizes": ["S", "M", "L", "XL"],
      "colors": ["Negro", "Blanco"],
      "image": "images/products/poleras/polera-1.jpg",
      "images": ["polera-1.jpg", "polera-1-2.jpg"],
      "description": "Polera de algodón 100% con estampado PopFlame",
      "featured": true,
      "stock": 50
    }
  ],
  "categories": [
    {
      "id": "poleras",
      "name": "Poleras",
      "image": "images/categories/poleras.jpg"
    }
  ]
}
```

---

## 5. Estilo Visual

### Paleta de Colores
```css
:root {
  --primary: #FF0000;        /* Rojo PopFlame */
  --primary-dark: #CC0000;
  --secondary: #000000;      /* Negro */
  --accent: #FFD700;         /* Dorado (opcional) */
  --bg-dark: #0A0A0A;
  --bg-card: #1A1A1A;
  --text-primary: #FFFFFF;
  --text-secondary: #B0B0B0;
  --border: #333333;
}
```

### Tipografía
- **Headings**: Arial Black, Impact o font similar
- **Body**: Inter, Roboto o similar

### Diseño
- Fondo oscuro (#0A0A0A)
- Cards con borde sutil
- Hover effects con transiciones suaves
- Animaciones de entrada al scroll

---

## 6. Carrito de Compras (localStorage)

### Estructura del Carrito
```javascript
cart = [
  {
    productId: 1,
    name: "Polera PopFlame Básica",
    price: 29990,
    size: "M",
    color: "Negro",
    quantity: 2,
    image: "images/products/poleras/polera-1.jpg"
  }
]
```

### Funcionalidades
- Agregar producto (con selección de talla/color)
- Modificar cantidad (+/-)
- Eliminar producto
- Calcular totales
- Persistir en localStorage
- Sincronizar entre páginas

---

## 7. Checkout y WhatsApp

### Flujo
1. Usuario hace clic en "Finalizar Compra"
2. Se muestra formulario de datos
3. Usuario completa datos y envía
4. Se genera mensaje formateado
5. Se redirige a WhatsApp con el mensaje

### Mensaje de WhatsApp (ejemplo)
```
🔥 *Nuevo Pedido PopFlame* 🔥

📦 *Productos:*
1. Polera PopFlame Básica x2 - $59.980
2. Poleron Urban Negro x1 - $49.990

💰 *Total: $109.970*

👤 *Datos del Cliente:*
- Nombre: Juan Pérez
- Email: juan@email.com
- Teléfono: +56912345678
- Dirección: Av. Principal 123, Santiago

📝 *Nota:* Pago por transferencia bancaria
```

### Link de WhatsApp
```
https://wa.me/569XXXXXXXX?text={mensaje编码}
```

---

## 8. Imágenes del Proyecto

### Disponibles
- Logo principal (calavera de joyas) - `image00001.png`
- Logo fondo blanco - `image00002.jpeg`
- Foto de producto/artística - `image00001.jpg`

### Necesitas Agregar
- Imágenes de productos individuales por categoría
- Banner hero para la página principal
- Fotos de lifestyle/modelos (opcionales)

---

## 9. Pasos de Implementación

### Fase 1: Estructura Base
1. Crear estructura de carpetas
2. Configurar `index.html` con layout base
3. Crear hojas de estilo globales
4. Implementar variables CSS y reset

### Fase 2: Páginas Principales
1. Diseñar Hero Banner
2. Crear sección de categorías
3. Implementar grid de productos destacados
4. Diseñar footer

### Fase 3: Catálogo
1. Crear `products.json` con productos de ejemplo
2. Implementar páginas de categoría
3. Crear página de producto individual
4. Implementar filtros y paginación

### Fase 4: Carrito
1. Crear drawer lateral del carrito
2. Implementar funciones de agregar/eliminar
3. Sincronizar con localStorage
4. Calcular totales

### Fase 5: Checkout
1. Crear formulario de datos
2. Validar campos
3. Generar mensaje de WhatsApp
4. Implementar redirect a WhatsApp

### Fase 6: Pulir
1. Animaciones y transiciones
2. Optimización responsive
3. Pruebas en diferentes dispositivos
4. SEO básico (meta tags)

---

## 10. Hosting y Dominio

### Opciones de Hosting (Gratis)
- **Netlify**: Deploy automático desde Git
- **Vercel**: Ideal para proyectos estáticos
- **GitHub Pages**: Simple y gratuito

### Dominio
- Comprar en: **nic.cl** (dominios .cl)
- O usar subdominio del hosting

---

## Preguntas para el Usuario

1. ¿Tienes más imágenes de productos para agregar?
2. ¿Cuál es tu número de WhatsApp para ventas?
3. ¿Tienes定义ida la paleta de colores de la marca?
4. ¿Necesitas integración con redes sociales?
5. ¿Quieres que agregue un blog o sección de noticias?
