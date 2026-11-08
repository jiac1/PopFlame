# PopFlame: Fase 1

**Actualización antes de staging:** [correcciones de pedidos, imágenes, idempotencia y entornos](security-before-staging.md). Sus instrucciones de conexión, secuencia SQL, pruebas y reversión son las actuales. Este documento conserva el contexto de la primera implementación. El runner actual no crea productos; los resultados de 71 checks que aparecen abajo son históricos.

Rama: `feature/phase1-rbac`. HTML/CSS/JavaScript vanilla, Supabase Auth y JWT existentes. No se ha aplicado SQL a Supabase, usado cuentas reales, hecho push ni desplegado. `db/schema.sql` y las migraciones históricas se conservan intactos.

## Revisión inicial y decisiones

Se revisaron `admin/index.html`, `admin/panel.html`, `admin/js/admin.js`, `views-ventas.js`, `views-catalogo.js`, `views-sitio.js`, `db/schema.sql`, `db/2026-09-29_panel.sql`, `db/2026-09-26_create_order_rpc.sql` y `js/checkout.js`. También se comprobaron sus dependencias `supabaseClient.js`, `cart.js`, `products.js`, `product.js` y `pages/checkout.html`.

Ya existían: lectura de `profiles` al entrar, filtro `superOnly` del menú/router, permisos operativos de productos/banners/tallas, Storage para ambos roles, DELETE de pedidos solo Super Admin, y un trigger que protegía cambios de rol/último Super Admin. Se mantienen esos permisos y los triggers comerciales. Categorías estaba limitada a Super Admin tanto en interfaz como en RLS. La sesión solo se comprobaba inicialmente y el trigger de registro concedía Super Admin si no quedaba ninguno.

La interfaz usa una matriz común (`permissions.js`) y `PanelData`, un adaptador pequeño sobre los builders de supabase-js. Cada consulta revalida identidad con `getUser()` y perfil vigente antes de ejecutarse; el rol no se toma de metadata ni de claims editables. Cada render también comprueba su permiso. La protección definitiva está en RLS, incluso ante llamadas REST fuera del navegador. Los resultados de consultas que terminan después de invalidar el acceso se descartan.

| Operación | Admin | Super Admin | Pending / anónimo |
| --- | --- | --- | --- |
| Ventas, pedidos, actualizar estado, exportar | Sí | Sí | No |
| Eliminar pedidos definitivamente | No | Sí | No |
| CRUD productos, categorías, inventario general | Sí | Sí | No |
| Fotos, banners, guía de tallas | Sí | Sí | No |
| Configuración, pagos, páginas, usuarios, suscriptores | No | Sí | No |
| Supervisión, diagnóstico y auditoría de roles | No | Sí | No |
| Leer catálogo/contenido público | Sí | Sí | Sí |
| Crear pedido validado por RPC como comprador | Sí | Sí | Sí |

Admin entra a operaciones (ventas, entregas, stock, catálogo). Super Admin entra a supervisión (cuentas pendientes, configuración, diagnóstico de contacto/pagos y últimos 20 cambios de roles) y conserva operaciones. Se reutilizan tarjetas, hojas laterales, menú y estilos existentes. El diagnóstico no certifica RLS ni suplanta herramientas administrativas de Supabase.

Al navegar, ejecutar consultas, recuperar foco/visibilidad, renovar la sesión y cada 30 segundos se actualiza el perfil. Una degradación cierra editores/confirmaciones, elimina datos sensibles del DOM/caché y reconstruye permisos; `pending`, sesión inválida o error de verificación bloquea el panel y redirige al login. RLS consulta `profiles` en cada sentencia: el permiso cambia sin esperar un nuevo JWT. No se registran tokens ni contraseñas. El cierre usa `signOut({scope:'local'})` y notifica errores en vez de simular éxito.

## Archivos

| Archivos | Cambio |
| --- | --- |
| `admin/js/permissions.js` | Matriz común y autorización antes/después de ejecutar consultas |
| `admin/js/admin.js` | Identidad validada, sesión y cambio de roles, router, limpieza de acceso, subidas autorizadas |
| `admin/index.html`, `admin/panel.html` | Carga compartida de permisos y versiones de scripts; experiencia según rol |
| `admin/js/views-ventas.js` | Portada operativa, consultas autorizadas, permiso explícito para eliminar pedidos |
| `admin/js/views-catalogo.js` | Categorías para ambos roles; conservación de productos, fotos, banners y tallas |
| `admin/js/views-sitio.js` | Supervisión y auditoría; secciones y acciones avanzadas autorizadas |
| `js/checkout.js`, `js/cart.js`, `pages/checkout.html` | RPC obligatorio, sin INSERT directo; total del servidor en confirmación/WhatsApp; versiones actualizadas |
| `db/2026-11-07_phase1_rbac.sql` | RLS operativa/avanzada, perfiles, registro pending, último Super Admin y auditoría |
| `db/2026-11-07_checkout_rpc.sql` | RPC validado y cierre de INSERT directo a orders |
| `db/2026-11-07_phase1_verify.sql` | Inspección y respaldo de definiciones antes/después, solo lectura |
| `tests/phase1.test.cjs` | Pruebas JavaScript sin red/dependencias |
| `tests/phase1-rls.sql`, `tests/run-sql-tests.py` | RLS y checkout sobre PostgreSQL local con fixtures desechables |
| `README.md`, `docs/phase1-rbac.md` | Bootstrap/permisos actualizados y guía de entrega/validación/reversión |

## SQL necesario y orden de validación

1. Preparar un proyecto Supabase de staging con esquema compatible y cuentas ficticias. Desactivar webhooks/correos externos antes de crear productos de prueba. No usar el SQL de tests sobre producción: aunque haga ROLLBACK, puede activar integraciones y avanzar secuencias.
2. Ejecutar **solo lectura** `db/2026-11-07_phase1_verify.sql`. Guardar de forma privada resultados, ACL/grants, policies y definiciones de funciones/triggers. Confirmar que ya existen las columnas/migraciones históricas necesarias (`pending`, `stock_applied`, `transfer_info`) y un Super Admin conocido. Si falta algo, revisar su DDL individualmente; no ejecutar `schema.sql` ni el backfill histórico sobre pedidos reales.
3. Revisar especialmente la definición **instalada** de `create_order(jsonb,jsonb)`, propietario y `SECURITY DEFINER`, grants y todos los RPC alternativos que puedan escribir `orders`. El repositorio contiene el RPC y su actualización de septiembre, pero su estado remoto no se verificó en esta tarea. No publicar el checkout nuevo hasta completar esta comprobación en staging.
4. Aplicar `2026-11-07_phase1_rbac.sql` en staging. Agrega permisos CRUD operativos, guards **RESTRICTIVE** que limitan policies permisivas heredadas, y auditoría. No desactiva RLS ni modifica filas comerciales. Toda cuenta nueva queda `pending`. La recuperación del primer Super Admin es manual por el dueño en SQL Editor, con el UUID previamente comprobado. No hay ascenso automático por registro ni cambio del propio rol desde la API.
5. Aplicar `2026-11-07_checkout_rpc.sql` en staging. Conserva firma y salida `order_number,total`; valida cliente/carrito/cantidades antes de sumar stock, toma nombres/precios del catálogo y costos desde config. Serializa el límite de pedidos para evitar bypass concurrente. No reserva stock: conserva descuento al pagar y reposición al cancelar. En la misma transacción retira `orders_insert_public`, revoca INSERT y agrega guard restrictivo. El propietario del RPC debe tener capacidad de insertar bajo SECURITY DEFINER (comprobar que no está sujeto a FORCE RLS).
6. Ejecutar consultas de verificación otra vez y pruebas de cuentas/Storage/checkout indicadas abajo. Los scripts son transaccionales e idempotentes; un error debe abortar la transacción completa. No continuar tras un error.
7. Usar el servidor de staging descrito en `security-before-staging.md`: inyecta la configuración en memoria y bloquea producción. No editar el cliente para pegar credenciales ni abrir la app local con backend productivo. No colocar una service key en el frontend. Publicar/mergear solo tras validación humana y autorización correspondiente.

Storage mantiene buckets, rutas y lectura pública. Ambos roles pueden gestionar fotos operativas. Los archivos de esos buckets referenciados por `config.logo_url`, `logo_white_url` y `hero_banner_url` quedan reservados a Super Admin para impedir que un Admin cambie configuración técnica sobrescribiendo/borrando el archivo. Se contempla la forma de URL pública que produce el uploader actual; revisar referencias legacy, codificación de rutas y posibles URLs firmadas/transformadas en el inventario previo.

## Pruebas ejecutables

```powershell
node --test tests/phase1.test.cjs
python tests/run-sql-tests.py --pg-bin 'C:/Program Files/PostgreSQL/18/bin' --port 55481
git diff --check
```

El runner SQL acepta solo `127.0.0.1`, crea una base `popflame_phase1_test_*` y la elimina al terminar. Requiere un PostgreSQL local ya iniciado. Extrae únicamente DDL, helpers, políticas y triggers de los archivos históricos; excluye seeds reales, webhooks/pg_net y backfills. Simula `auth.users`, `auth.uid()` y metadatos de Storage. Aplica cada migración dos veces, prueba ambos roles y rechazos `pending`/anónimo, y usa dos conexiones para degradaciones concurrentes. No prueba el servicio HTTP de Supabase Storage ni Auth real.

La suite JS usa VM de Node con DOM/Auth simulados: matriz, validación de identidad, router, consultas encadenadas, callbacks antiguos, degradación, cierre, foco, polling, uploads y checkout. No equivale a una prueba visual en navegador ni a iniciar sesión con cuentas reales.

Resultados ejecutados el 7 de noviembre de 2026:

- **12/12 pruebas JavaScript aprobadas** en Node, incluyendo login, sesión inválida, cierre fallido y descarte de respuestas posteriores al cierre.
- **71 comprobaciones RLS/checkout aprobadas** en PostgreSQL 18.6 local; incluyen Admin/Super Admin/pending/anónimo, CRUD, autoascenso, drift de policies, protección de imágenes técnicas y triggers de stock.
- **Concurrencia aprobada** con dos conexiones: solo una degradación puede completarse y queda un Super Admin.
- **Idempotencia aprobada**: ambas migraciones se aplicaron dos veces en cada base de prueba.
- **Sintaxis aprobada** de los siete archivos JavaScript de aplicación afectados; `git diff --check` sin errores.

No se ejecutaron pruebas contra Supabase remoto, Auth real, servicio HTTP Storage ni QA visual en navegador. Reejecutar las suites después de cualquier modificación de políticas o guards.

## Validación manual antes del merge

| Caso en staging | Resultado esperado |
| --- | --- |
| Anónimo / pending abre `/admin/panel.html#usuarios` | Login; no consulta ni contenido privado |
| Admin entra y pega hashes `#usuarios`, `#configuracion`, `#supervision` | Vuelve a operaciones; llamadas REST de escritura avanzada rechazadas |
| Admin / Super Admin crean, editan y borran producto/categoría ficticios | Permitido; categoría con productos rechazada por FK |
| Ambos suben, reemplazan y borran imagen ficticia en ambos buckets | Permitido para contenido operativo; Admin no toca logos/portada referenciados por config |
| Ambos editan precio, stock general, descripción, tallas/colores, banners, guía | Permitido; comprobar resultado almacenado, sin inventario por talla |
| Admin intenta borrar pedido ficticio por UI/REST | No permitido; Super Admin sí puede borrarlo |
| Admin intenta cambiar rol propio/ajeno por REST o insertar perfil | Rechazado, incluso manipulando metadata del usuario |
| Super Admin aprueba pending o cambia otro Admin a pending | Auditoría nueva; acceso actualizado en pestaña abierta en siguiente acción/foco o hasta 30 s |
| Super Admin degradado a Admin con editor de pagos abierto | Editor/cachés eliminados; guardar desde callback antiguo rechazado |
| Cerrar sesión, repetir desde otra pestaña y abrir historial | Datos privados eliminados, vuelve al login |
| JWT expirado, sesión sin red, error al leer perfil | Acceso bloqueado, sin acciones privadas |
| Pedido ficticio con precio/total adulterados o cantidades inválidas | RPC rechaza cantidades o recalcula importes; INSERT directo rechazado |
| RPC ausente o falla | Mensaje controlado; carrito conservado, no confirmación falsa, no inserción directa |
| Marcar pagado → entregado → cancelado | Descuento una vez y reposición; confirmar solo en fixtures |
| Producto bajo consulta | Mismo enlace/flujo comercial previo; no agregar compra ni cambiar cantidades |

## Reversión

- Antes del commit SQL, cualquier error se revierte con `ROLLBACK`; no continuar dentro de una transacción abortada.
- Para un problema de interfaz: revertir únicamente los commits/archivos de esta fase en la rama de release y mantener las protecciones SQL. El frontend anterior ya llama a `create_order`; con el RPC instalado no necesita el fallback. No reabrir INSERT público para recuperar el checkout.
- Para un problema del RPC: restaurar **solo** la definición `create_order` guardada antes de migrar y sus grants revisados; mantener bloqueada la inserción directa. Probar un pedido ficticio en staging antes de liberar.
- Si se requiere revertir RLS: comparar el snapshot previo y retirar/restaurar solo las policies `phase1_*` y grants afectados dentro de una transacción revisada. Mantener explícitamente la protección contra autoascenso, el registro pending y DELETE de pedidos solo Super Admin. Nunca resolver un fallo deshabilitando RLS o ejecutando el schema completo.
- Conservar `panel_role_audit` y sus registros para investigación; si se retira la vista, revocar SELECT a clientes y mantener RLS. El trigger de auditoría puede deshabilitarse/retirarse selectivamente tras revisión. No borrar los registros como parte de un rollback rutinario.

## Riesgos y límites pendientes

- Es necesario validar el esquema/policies/RPC **realmente instalados** y Auth/Storage HTTP en staging. El servidor local reproduce SQL y permisos, no todo Supabase. Falta QA visual y pruebas reales de sesión entre pestañas.
- Los JWT de acceso ya emitidos pueden seguir siendo válidos hasta expirar tras `signOut`; la revocación del rol en `profiles` sí restringe RLS en nuevas sentencias. No se implementa consulta de `auth.sessions` en todas las políticas. Ajustar expiración/revocación a las necesidades del proyecto antes de una fase posterior.
- El contador global (20/minuto) y por cliente (5/hora) son un freno básico, no protección completa frente a bots/denegación de servicio. El bloqueo del RPC serializa creación de pedidos; medir latencia con carga de staging. No hay CAPTCHA, identidad obligatoria del comprador ni reserva de stock.
- Dos pedidos pendientes pueden solicitar el mismo stock: el negocio descuenta al pagar. Se conserva ese comportamiento. El total de WhatsApp es autoritativo; las líneas descriptivas usan el snapshot local del carrito y podrían quedar antiguas si cambian los productos durante la compra.
- `email_for_username` conserva la resolución pública usada por el login; puede permitir enumeración de usuarios. Su sustitución requiere un diseño aparte para no romper el login por usuario.
- La auditoría cubre altas/bajas/cambios de roles desde esta migración; no es una auditoría completa de pedidos, productos o acciones del sistema. El dueño SQL/service_role sigue teniendo privilegios administrativos.
- No se modifica ningún producto, cantidad, imagen, precio o pedido real. No se implementa inventario por tallas, frameworks nuevos ni dependencias de aplicación.

Referencias verificadas: [validación de identidad con getUser](https://supabase.com/docs/reference/javascript/auth-getuser), [RLS de Supabase](https://supabase.com/docs/guides/database/postgres/row-level-security), [policies restrictivas de PostgreSQL](https://www.postgresql.org/docs/current/ddl-rowsecurity.html), [control de acceso de Storage](https://supabase.com/docs/guides/storage/security/access-control).
