# Depas CDMX

Aplicación estática para registrar y comparar opciones de renta entre Benja y Caro.

## Abrir la aplicación

Desde la carpeta del proyecto, inicien un servidor local:

```sh
python3 -m http.server 8000
```

Después visiten <http://localhost:8000>. Se necesita el servidor porque el navegador restringe la lectura de archivos JSON al abrir `index.html` directamente.

## Datos y respaldo

- Los cambios se guardan automáticamente en el almacenamiento local del navegador.
- **Exportar JSON** descarga `inmuebles.json`; pueden reemplazar con ese archivo `data/inmuebles.json` para actualizar la copia fuente.
- **Importar JSON** reemplaza los datos del navegador con el contenido del archivo seleccionado.
- Los datos locales de un navegador no se comparten automáticamente entre Benja y Caro. Intercambien el JSON exportado para sincronizarlo.
- Las calificaciones son individuales (1–7); **Top 3** muestra las mejores calificadas y usa el promedio de quienes ya calificaron.
- En **Inmuebles**, pulsen **Comparar** en las opciones que quieran poner lado a lado. También pueden elegirlas desde la vista **Comparar**; admite hasta cuatro opciones.
- La comparación incluye total mensual, costo estimado para entrar, espacios, amenidades, disponibilidad y calificaciones.

## Uso en celular

La interfaz se adapta a pantallas pequeñas. Para que Benja pueda abrirla desde WhatsApp, primero hay que publicarla en un hosting estático; `localhost` solo funciona en el dispositivo donde corre el servidor. El almacenamiento seguirá siendo propio de cada navegador, así que para compartir cambios entre ambos tendrán que intercambiar el JSON.

## Datos guardados

Cada inmueble conserva ubicación, renta y mantenimiento, características, amenidades, gastos iniciales, disponibilidad, estatus y seguimiento, contacto, notas y calificaciones.

El catálogo postal local se usa para sugerir alcaldía y colonias al ingresar el CP. Si no encuentra una coincidencia, se pueden capturar ambos campos manualmente. El origen y licencia de esos datos están en [data/NOTICE.txt](data/NOTICE.txt).
