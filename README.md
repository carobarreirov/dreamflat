# Depas CDMX

Aplicación para registrar, calificar y comparar opciones de renta entre Benja y Caro. La interfaz es estática; para compartir cambios entre celulares se conecta a Supabase con acceso privado por correo.

## Probar localmente

```sh
python3 -m http.server 8000
```

Visiten <http://localhost:8000>. Con `config.js` sin credenciales, los cambios se guardan en el almacenamiento local de ese navegador. No se comparten entre dispositivos.

## Activar la lista compartida

1. Creen un proyecto de Supabase.
2. En su SQL Editor, ejecuten [data/schema.sql](data/schema.sql).
3. En el mismo SQL Editor, autoricen solo sus dos correos. Sustituyan los marcadores por las direcciones acordadas y no publiquen esta consulta:

   ```sql
   insert into public.allowed_users (email)
   values ('CORREO_DE_CARO'), ('CORREO_DE_BENJA')
   on conflict (email) do nothing;
   ```

4. En Supabase, agreguen `https://carobarreirov.github.io/dreamflat/` como **Site URL** y URL permitida de redirección para los enlaces mágicos.
5. En GitHub, vayan a **Settings → Pages** y elijan GitHub Actions como fuente.
6. En **Settings → Secrets and variables → Actions**, creen los secretos `SUPABASE_URL` y `SUPABASE_ANON_KEY` con los valores del proyecto de Supabase. Usen la clave pública `anon`/publishable, nunca la `service_role`.
7. Publiquen la rama `main`. El workflow de [pages.yml](.github/workflows/pages.yml) construye la configuración sin guardar las claves en el repositorio y despliega la página.

Sin los dos secretos, GitHub Pages mostrará un aviso de configuración y no conectará a la base. La tabla activa RLS y solo los correos incluidos en `allowed_users` pueden consultar o modificar sus datos. Los correos autorizados no se guardan en este repositorio.

Para mover los inmuebles que ya estén guardados localmente a Supabase, exporten el JSON desde el modo local e impórtenlo desde la aplicación publicada; la importación reemplaza la lista compartida.

## Uso

- **Inmuebles** permite filtrar, ordenar, agrupar, editar y seleccionar opciones para comparar.
- **Comparar** muestra de 2 a 4 opciones lado a lado, incluido el costo mensual y una estimación del gasto inicial.
- **Top 3** ordena las mejores calificadas. Si solo una persona calificó, usa esa calificación hasta recibir la otra.
- **Calificar** guarda una calificación de Benja y otra de Caro, de 1 a 7.
- **Exportar/Importar JSON** sirve como respaldo y para reemplazar la lista compartida.
- Los cambios se reflejan en vivo en ambas sesiones.

La vista es adaptable a celular; el catálogo postal local sugiere alcaldía y colonias a partir del CP. Si no encuentra una coincidencia, se pueden capturar manualmente. El origen y licencia del catálogo están en [data/NOTICE.txt](data/NOTICE.txt).
