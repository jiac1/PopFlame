# Correcciones de seguridad antes de staging

Rama `feature/phase1-rbac`, sobre `5c55a1c`. Se conservan vanilla JS, Supabase Auth/JWT, `profiles` y la matriz de Fase 1. No se ha contactado Supabase productivo, aplicado SQL remoto, creado productos, hecho push, merge ni despliegue. Los únicos datos escritos para comprobar SQL son pedidos/cuentas y metadatos ficticios en PostgreSQL local desechable. `schema.sql` y las migraciones históricas no se ejecutan completos ni se reescriben.

## Pedidos: UPDATE operativo solamente

Se eligieron **privilegios por columna + trigger defensivo**, en lugar de un RPC de estado nuevo, porque el panel existente solo escribe `{status}`. `authenticated` comparte permisos SQL entre los roles de aplicación: ambos Admin y Super Admin pueden cambiar estados bajo RLS, ninguno puede editar directamente `total`, `subtotal`, `items`, `stock_applied`, identidades, fechas o datos del comprador. La configuración de pagos sigue siendo exclusiva de Super Admin; no equivale a reescribir importes de pedidos.

`2026-11-07_security_orders_media.sql` revoca UPDATE de tabla y todos los grants directos por columna de PUBLIC/anon/authenticated, concede solo `UPDATE(status)` a authenticated y aborta si quedan permisos financieros heredados desde otro rol. Antes de aplicarlo revisar `relacl`, `attacl`, memberships y el resultado de `has_column_privilege`: retirar un GRANT por columna no limita un GRANT de tabla.

`trg_orders_00_client_update` compara todo el registro salvo `status`, antes de los triggers comerciales. Bloquea cambios de otros campos incluso si posteriormente se otorga por accidente UPDATE de tabla. No reemplaza ni modifica `orders_auto_processing`, `orders_apply_stock` ni sus triggers: estos pueden cambiar `updated_at`/`stock_applied` internamente después del guard. La migración exige que los triggers comerciales conocidos estén presentes y habilitados. SQL propietario/service_role conserva las capacidades administrativas del servidor; ningún cliente recibe esos privilegios. RLS sigue negando pending/anon y DELETE de pedidos sigue siendo solo Super Admin.

## Identidad de imágenes técnicas

`panel_technical_media` registra por cada campo técnico de config (`logo_url`, `logo_white_url`, `hero_banner_url`) el par canónico **bucket_id + object_name**. Lo mantiene un trigger SECURITY DEFINER de config, incluida una carga inicial solo de ese registro nuevo. No mueve archivos ni modifica productos/config existentes. Los clientes no pueden escribir el registro; su lectura se reserva a Super Admin.

`technical_media_identity` admite rutas Supabase públicas, autenticadas, firmadas y transformadas (`object/public|sign|authenticated`, `render/image/public|sign|authenticated`). Separa query/fragment antes de decodificar UTF-8 una sola vez. Mantiene `+` literal, Unicode, `%25`, `%2F`, `%3F` y `%23` correctamente. Rechaza rutas con codificación inválida, separadores ambiguos, controles, `..` y formatos Storage desconocidos: un error aborta la transacción completa, sin dejar una protección parcial.

`can_manage_panel_media` consulta esa identidad almacenada. Admin conserva INSERT/UPDATE/DELETE de objetos operativos en ambos buckets; no puede modificar/borrar ni renombrar otro objeto sobre una identidad técnica. Super Admin conserva gestión de ambos. Los archivos externos/locales no son objetos mutables de Storage. La normalización es conservadora respecto del host: una URL con ruta Storage reconocida protege el par local correspondiente. Aliases de CDN sin ruta Supabase reconocible requieren inventario/mapeo revisado; no se deben asumir cubiertos automáticamente. Revisar estas referencias en staging antes de aceptar el backfill.

## Checkout e idempotencia

La respuesta exige `order_number` no vacío y `total` finito no negativo, de tipo number o cadena decimal no vacía. Rechaza null, undefined, vacío/blancos, booleanos, objetos, negativos, NaN e Infinity. Conserva exactamente el total devuelto por el servidor y no lo reemplaza con el carrito.

La firma pública sigue siendo `create_order(jsonb,jsonb)`. El cliente añade un UUID v4 `p_customer.idempotencyKey`, guardado **antes** del envío junto al intento en localStorage, con namespace del proyecto. Usa Web Locks cuando están disponibles para coordinar preparación entre pestañas. Si el almacenamiento o la generación segura de UUID no está disponible, falla antes de enviar. No usa `Math.random` para estas claves.

`2026-11-07_security_checkout.sql` conserva el creador validado de Fase 1 como `create_order_validated_internal` y le retira EXECUTE público/anon/authenticated. El RPC público nuevo serializa por clave, calcula SHA-256 del payload JSONB y conserva el comprobante en `order_requests`. Misma clave/mismo payload retorna el mismo comprobante antes de volver a validar límites/stock; misma clave/otro payload se rechaza. Pedido y comprobante se confirman en una sola transacción. La PK también protege frente a carreras. El registro no expone datos del comprador ni admite acceso directo de clientes.

Una pérdida de respuesta, 5xx, timeout, RPC ausente o comprobante inválido conserva el intento para reintentar/recargar. Un rechazo de negocio P0001 libera el intento porque esa transacción se abortó. No se crea una clave nueva automáticamente para un carrito modificado mientras hay un resultado incierto: aparece “Recuperar pedido anterior”, que reenvía el snapshot guardado con su misma clave. No se confirma una compra desde el cliente sin respuesta válida. Un fallo al renderizar el comprobante conserva el carrito/intento. Recuperar un pedido anterior tampoco borra un carrito distinto creado después.

No hay caducidad/limpieza automática de `order_requests`. El borrado definitivo de un pedido no borra su comprobante de idempotencia ni permite recrearlo por retry. Nunca limpiar este registro indiscriminadamente. La deduplicación corresponde al mismo intento/clave; otro navegador o almacenamiento borrado no puede recuperar una clave perdida. Una compra deliberadamente nueva usa otra clave después de confirmar la anterior. La clave/snapshot pendiente debe tratarse como información privada del comprador y no registrarse en logs.

No se reserva stock al crear el pedido. El cuerpo validado conserva precios/stock del servidor y el descuento continúa al confirmar pago. No se introduce inventario por talla.

## Entornos y efectos externos

`runtime-config.js` selecciona automáticamente producción **solo** en `https://pop-flame.vercel.app`, dominio registrado en el README. Mantiene URL, clave pública, namespaces de carrito y sesión Supabase existentes allí. Localhost, otros dominios y previews quedan sin backend por defecto. Antes de cualquier eventual release confirmar todos los aliases reales: cualquier dominio adicional requiere un allowlist revisado. No basta con crear un `.env`: el sitio es estático.

`supabaseClient.js` rechaza producción desde staging, credenciales secret/service_role y URLs ambiguas. Los caches/carrito/comprador/intentos staging se separan por proyecto y los helpers de imagen rechazan orígenes externos. Se retiraron los preconnect productivos de todos los HTML conectados. Los HTML cargan runtime-config antes del cliente, con versiones nuevas.

Para staging usar el servidor de biblioteca estándar de Python; inyecta configuración pública en memoria, sin editar el archivo productivo:

```powershell
$env:POPFLAME_STAGING_SUPABASE_URL = 'https://REF_STAGING.supabase.co'
$env:POPFLAME_STAGING_PUBLISHABLE_KEY = 'CLAVE_PUBLICA_DE_STAGING'
python tools/serve-staging.py --check
python tools/serve-staging.py --port 8041
```

Sustituir los placeholders por un proyecto staging distinto. También admite Supabase local explícito `http://127.0.0.1:54321`. Nunca introducir service_role. El servidor enlaza solo 127.0.0.1, no lista directorios ni sirve `.git`, SQL o herramientas. CSP restringe connect/img/media al proyecto staging y recursos locales; fonts/CDN del SDK actuales siguen permitidos. Sirve `no-store`. Usar un perfil de navegador nuevo y comprobar Network/CSP; complementar con bloqueo de salida al host productivo en el entorno de QA. No sustituye auditar extensiones/proxies externos al proyecto.

La migración `2026-11-07_security_environment.sql` sustituye el destino fijo de `notify_new_product` por configuración SQL `panel_environment`, inicialmente deshabilitada. Staging no puede habilitar notificaciones externas. La identidad de despliegue se administra por el dueño SQL, fuera del cliente; Super Admin sigue gestionando la configuración técnica comercial existente. Ambas Edge Functions también requieren explícitamente `POPFLAME_ENV=production` y `POPFLAME_NOTIFICATIONS_ENABLED=true` antes de leer payloads o llamar a servicios. No copiar keys de correo/service_role a staging. El workflow keepalive solo puede ejecutar el job desde `main`.

No se han cambiado las funciones ni configuración remotas de producción. En una eventual promoción, las notificaciones quedarían desactivadas hasta configurar/revisar **ambos** controles (fila SQL y flags Edge), URL/key pública y SITE_URL. Es un paso obligatorio para conservar los correos actuales; no activarlos ahora ni desplegar automáticamente.

## Orden de staging y verificación

1. Preparar proyecto vacío/aislado y baseline DDL revisado, sin seeds, webhooks, `pg_net` activo hacia producción ni ejecutar el schema completo. No crear productos durante esta etapa. Crear cuentas solo ficticias mediante Auth cuando se habilite la prueba real; bootstrap Super Admin manual y controlado.
2. Guardar el snapshot de Fase 1: funciones, triggers, policies, propietarios, relacl/attacl y grants de secuencias. Revisar RLS Storage, roles pending y columnas/migraciones históricas. No copiar `auth`/`storage` gestionados de otro proyecto ni datos reales.
3. Si ya se aplicó Fase 1, aplicar **solo** las tres migraciones incrementales nuevas, en este orden: `security_orders_media`, `security_checkout`, `security_environment`. En una base nueva, antes se requieren `2026-11-07_phase1_rbac.sql` y `2026-11-07_checkout_rpc.sql`. No reaplicar scripts históricos después de estas correcciones: pueden reemplazar guards/RPC nuevos.
4. La prueba local aplica cada archivo dos veces. En staging repetir la comprobación de idempotencia y ejecutar `2026-11-07_phase1_verify.sql` + `2026-11-07_security_verify.sql` (este último después de las nuevas migraciones). Para authenticated solo status debe tener UPDATE; anon ninguno. RPC público ejecutable y RPC interno/ledger inaccesibles a ambos. Verificar el orden de triggers de pedidos, el registro técnico y notificaciones deshabilitadas.
5. Confirmar primero el cliente nuevo que envía clave y después exigirla en el servidor. La firma se conserva, pero un cliente viejo sin clave será rechazado; pestañas/assets antiguos deben recargarse. Coordinar ese cambio antes de cualquier release. En staging comprobar falta de RPC/clave, respuesta perdida tras commit y recuperación posterior; no añadir un fallback inseguro.
6. Probar Auth real, dos pestañas, Admin/Super Admin/pending/anon y HTTP Storage con metadatos/objetos ficticios autorizados. Intentos de editar total/subtotal/items/stock_applied/status y payloads mixtos; estados permitidos; perfiles y cambios de rol; configuración avanzada; URLs técnicas en cada forma. HTTP 200 con cero filas no es una modificación exitosa: observar el estado final por separado. Nunca usar service_role como identidad del usuario bajo prueba.
7. Antes de probar CRUD real de catálogo o stock cuantitativo, obtener la autorización de la etapa siguiente. Aquí se comprobó la planificación SQL de CRUD, los flags del trigger y que sus definiciones no cambian, **sin insertar productos**.

## Pruebas y límites

```powershell
node --test tests/phase1.test.cjs tests/security.test.cjs
python tests/staging-server.test.py
python tests/run-sql-tests.py --pg-bin 'C:/Program Files/PostgreSQL/18/bin' --port 55483
git diff --check
```

Requiere un PostgreSQL local desechable ya iniciado en el puerto indicado. El runner fuerza 127.0.0.1, crea/elimina su base y no usa la suite histórica `phase1-rls.sql`, que crea productos. Usa `security-rls.sql`: pedidos con items vacíos y objetos de Storage simulados, sin binarios. Verifica estado/stock_applied, privilegios, drift de GRANT, URLs y efectos externos deshabilitados. Para comprobar concurrencia/idempotencia sustituye el creador interno **solo dentro de la base desechable** por un generador de recibos ficticios; el wrapper, ledger y transacciones son los reales. No altera el cuerpo validado en los archivos del proyecto. Un fallo de GRANT heredado prueba el aborto transaccional de la migración.

Resultados locales: 26 pruebas Node, 5 pruebas HTTP/configuración Python y 110 comprobaciones SQL aprobadas, además de concurrencia de roles/idempotencia, atomicidad, repetición de las migraciones, definiciones de stock intactas y cero productos creados. Se ejecutó también el preámbulo real de los handlers Edge en VM sin primitivas de red para verificar sus flags; no equivale a ejecutar Deno o la función remota. No se ha validado todavía Auth/Storage remoto, navegadores reales, recuperación entre pestañas real, payload de un carrito válido con catálogo, carga/rate limits ni correos. Esos resultados no deben deducirse de los mocks. No se instalaron dependencias de aplicación.

## Reversión segura

- Cada migración nueva es transaccional. Si falla el parser de una referencia legacy o un GRANT heredado, no continuar: ROLLBACK y revisar el snapshot/copia staging. No corregir datos reales para poder aplicar una prueba.
- Conservar status-only y su guard, el registro técnico y RLS. Para problemas de compatibilidad diseñar un RPC específico o ajustar el componente afectado; no devolver UPDATE financiero amplio ni desactivar RLS.
- Conservar `order_requests` y las claves pendientes. Para corregir validación comercial restaurar **solo** el creador interno validado desde el snapshot, manteniendo wrapper/idempotencia y sus grants cerrados. No restaurar clientes sin clave sobre un servidor que la exige ni reabrir INSERT público. Ensayar este retorno en una copia staging antes de promover.
- Para problemas de assets, corregir/revisar la referencia canónica de la copia staging y regenerar el registro de forma transaccional. No sustituir el registro por comparaciones incompletas de URL.
- Mantener notificaciones deshabilitadas durante un rollback de QA. No restaurar automáticamente el trigger con destino productivo hardcodeado.

Archivos nuevos: tres migraciones de seguridad, `security_verify.sql`, `runtime-config.js`, `tools/serve-staging.py`, `tests/security.test.cjs`, `tests/security-rls.sql`, `tests/staging-server.test.py` y este informe. Se actualizaron cliente compartido, checkout, namespaces de carrito/cache, helpers de imágenes, adaptador del panel, ocho HTML, dos Edge Functions, keepalive y runner/documentación. El login y las vistas por rol se conservan.

Referencias: [privilegios por columna](https://www.postgresql.org/docs/current/sql-grant.html), [funciones y SECURITY DEFINER](https://supabase.com/docs/guides/database/functions), [URLs de transformación](https://supabase.com/docs/guides/storage/serving/image-transformations).
