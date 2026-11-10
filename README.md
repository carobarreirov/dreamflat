# Depas CDMX

Aplicación para registrar, calificar y comparar opciones de renta entre Benja y Caro. La interfaz es estática; para compartir cambios entre celulares se conecta a Supabase.

## Probar localmente

```sh
python3 -m http.server 8000
```

Visiten <http://localhost:8000>. Con `config.js` sin credenciales, los cambios se guardan en el almacenamiento local de ese navegador. No se comparten entre dispositivos.

## Activar la lista compartida

1. Creen un proyecto de Supabase.
2. En su SQL Editor, ejecuten [data/schema.sql](data/schema.sql). Esto permite acceso anónimo de lectura y escritura para la tabla de inmuebles.
3. En [config.js](config.js), cambien `sharedMode` a `true` y configuren la URL del proyecto y la clave pública `anon`/publishable de Supabase. Nunca usen la clave `service_role`.
4. Configuren GitHub Pages manualmente desde **Settings → Pages**.

La publicación se administra desde la interfaz de GitHub; este repositorio no incluye un workflow de despliegue. **La lista compartida no tiene inicio de sesión ni control de acceso: cualquier persona que encuentre la URL pública puede ver, modificar o reemplazar los inmuebles.** La URL no funciona como contraseña. No guarden datos sensibles en esta lista.

Para mover los inmuebles que ya estén guardados localmente a Supabase, exporten el JSON desde el modo local e impórtenlo desde la aplicación publicada; la importación reemplaza la lista compartida.

## Uso

- **Inmuebles** permite filtrar, ordenar, agrupar, editar y seleccionar opciones para comparar.
- **Comparar** muestra de 2 a 4 opciones lado a lado, incluido el costo mensual y una estimación del gasto inicial.
- **Top 3** ordena las mejores calificadas. Si solo una persona calificó, usa esa calificación hasta recibir la otra.
- **Calificar** guarda una calificación de Benja y otra de Caro, de 1 a 7.
- **Exportar/Importar JSON** sirve como respaldo y para reemplazar la lista compartida.
- Los cambios se reflejan en vivo en ambas sesiones.

La vista es adaptable a celular; el catálogo postal local sugiere alcaldía y colonias a partir del CP. Si no encuentra una coincidencia, se pueden capturar manualmente. El origen y licencia del catálogo están en [data/NOTICE.txt](data/NOTICE.txt).
