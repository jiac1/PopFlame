-- =========================================================
-- PopFlame - Páginas legales (Términos y condiciones + Política de privacidad)
-- Ejecutar en: Supabase Dashboard > SQL Editor > New query > Run  (se puede correr más de una vez)
--
-- Quedan editables desde el panel (Páginas). Redactadas según la Ley 19.496 (Protección de los
-- Derechos de los Consumidores, con los cambios de la Ley 21.398 "Pro Consumidor") y la Ley 19.628
-- (Protección de la Vida Privada). Son una base: conviene que las revise un abogado y completar
-- los datos del vendedor (nombre o razón social, RUT y correo de contacto) donde se indica.
-- =========================================================

insert into public.pages (slug, title, content) values
('terminos', 'Términos y condiciones', $html$
<p>Estos términos regulan las compras realizadas en la tienda online de <strong>PopFlame</strong>. Al enviar un pedido declaras haberlos leído y aceptado. Se rigen por la legislación chilena, en especial la Ley N° 19.496 sobre Protección de los Derechos de los Consumidores.</p>

<h2>1. Quién vende</h2>
<p>PopFlame es una marca de ropa streetwear con base en Santiago, Chile. Puedes contactarnos por WhatsApp o Instagram, disponibles en la página de <a href="info.html?slug=contacto">Contacto</a>.</p>

<h2>2. Cómo comprar</h2>
<ol>
<li>Eliges tus productos, talla y color, y los agregas al carrito.</li>
<li>Completas tus datos en la página de compra y envías el pedido. Recibes un número de pedido (por ejemplo, PF-0001).</li>
<li>Nos envías el pedido por WhatsApp y te compartimos los datos para pagar por transferencia bancaria.</li>
<li>Tu compra queda confirmada cuando verificamos el pago.</li>
</ol>
<p>El pedido queda reservado por <strong>24 horas</strong>. Si en ese plazo no recibimos el pago, podemos liberar el stock.</p>

<h2>3. Precios y stock</h2>
<p>Los precios están en pesos chilenos e incluyen IVA. El precio que se cobra es el que aparece en la tienda al enviar el pedido. Los productos están sujetos a disponibilidad de stock; si un producto se agota antes de confirmar tu pago, te avisamos y te devolvemos el 100% de lo pagado.</p>

<h2>4. Entregas</h2>
<p>Las entregas en Santiago son <strong>presenciales y sin costo en estaciones de Metro</strong>, en el día y hora que coordinemos por WhatsApp. Los envíos a regiones o zonas alejadas se coordinan caso a caso y su costo depende del destino y del courier; te lo informamos antes de que pagues.</p>

<h2>5. Derecho a retracto</h2>
<p>Como la compra se hace a distancia, tienes derecho a arrepentirte dentro de los <strong>10 días</strong> siguientes a recibir el producto, conforme al artículo 3 bis de la Ley 19.496. Para ejercerlo, avísanos por WhatsApp dentro de ese plazo y devuelve el producto sin uso, con sus etiquetas y en su empaque original. Te reembolsamos el precio pagado en un máximo de 10 días desde que recibimos el producto.</p>

<h2>6. Garantía legal</h2>
<p>Si un producto presenta una falla o defecto de fabricación, tienes <strong>6 meses</strong> desde que lo recibes para elegir entre su cambio, reparación o la devolución del dinero, según la ley. Escríbenos con fotos del problema y lo resolvemos.</p>

<h2>7. Cambios de talla</h2>
<p>Si la talla no te queda, puedes pedir un cambio dentro de 10 días desde la entrega, con el producto sin uso y con etiquetas. Los cambios dependen del stock disponible.</p>

<h2>8. Uso de la marca y contenido</h2>
<p>Los diseños, fotos, logos y textos de este sitio pertenecen a PopFlame y no pueden usarse sin autorización.</p>

<h2>9. Cambios a estos términos</h2>
<p>Podemos actualizar estos términos. Siempre aplican los vigentes al momento de enviar tu pedido.</p>
$html$),
('privacidad', 'Política de privacidad', $html$
<p>En <strong>PopFlame</strong> cuidamos tus datos personales. Esta política explica qué datos recopilamos, para qué los usamos y cuáles son tus derechos, de acuerdo con la Ley N° 19.628 sobre Protección de la Vida Privada.</p>

<h2>1. Qué datos recopilamos</h2>
<ul>
<li><strong>Al hacer un pedido:</strong> nombre, apellido, correo electrónico, teléfono, estación de Metro preferida, notas que agregues y el detalle de tu compra.</li>
<li><strong>Al suscribirte al club PopFlame:</strong> tu correo electrónico.</li>
<li><strong>En tu navegador:</strong> guardamos tu carrito y tus datos de compra para que no tengas que escribirlos de nuevo. Esa información queda solo en tu dispositivo y puedes borrarla limpiando los datos del navegador.</li>
</ul>
<p>No pedimos ni guardamos datos de tarjetas ni de cuentas bancarias. Tampoco usamos cookies de publicidad ni de seguimiento.</p>

<h2>2. Para qué los usamos</h2>
<ul>
<li>Procesar tu pedido, coordinar el pago y la entrega, y contactarte por WhatsApp o correo sobre tu compra.</li>
<li>Si te suscribiste, enviarte novedades y lanzamientos. Puedes darte de baja cuando quieras.</li>
<li>Cumplir obligaciones legales, como la emisión de comprobantes y la atención de garantías.</li>
</ul>
<p>No vendemos ni compartimos tus datos con terceros para fines publicitarios.</p>

<h2>3. Dónde se guardan</h2>
<p>Los pedidos y suscripciones se guardan en <strong>Supabase</strong>, un proveedor de bases de datos con servidores en Estados Unidos, con acceso restringido solo al equipo de PopFlame. El sitio se aloja en <strong>Vercel</strong>.</p>

<h2>4. Cuánto tiempo</h2>
<p>Conservamos los datos de tus pedidos mientras sean necesarios para atender la compra, garantías y obligaciones legales. Los datos del newsletter se guardan hasta que te des de baja.</p>

<h2>5. Tus derechos</h2>
<p>Puedes pedir en cualquier momento <strong>acceder</strong> a tus datos, <strong>corregirlos</strong>, <strong>eliminarlos</strong> u <strong>oponerte</strong> a su uso para novedades. Escríbenos por los canales de <a href="info.html?slug=contacto">Contacto</a> y te respondemos a la brevedad.</p>

<h2>6. Cambios a esta política</h2>
<p>Si cambiamos esta política, publicaremos la nueva versión en esta misma página.</p>
$html$)
on conflict (slug) do nothing;

-- La página de Devoluciones decía solo "48 horas para fallas", menos de lo que exige la ley
-- (10 días de retracto y 6 meses de garantía legal). Se reemplaza SOLO si sigue con el texto original.
update public.pages
set content = $html$
<p><strong>Derecho a retracto:</strong> tienes 10 días desde que recibes tu compra para arrepentirte. Avísanos por WhatsApp y devuelve el producto sin uso, con etiquetas y en su empaque original; te devolvemos el dinero en un máximo de 10 días desde que lo recibimos.</p>
<p><strong>Cambios de talla:</strong> dentro de 10 días desde la entrega, con el producto sin uso y con etiquetas. Sujeto a stock disponible.</p>
<p><strong>Productos con falla:</strong> tienes 6 meses de garantía legal. Escríbenos con fotos del problema y eliges entre cambio, reparación o devolución del dinero.</p>
<p>Más detalles en nuestros <a href="info.html?slug=terminos">Términos y condiciones</a>.</p>
$html$
where slug = 'devoluciones'
  and content like '%dentro de las 48 horas%';
