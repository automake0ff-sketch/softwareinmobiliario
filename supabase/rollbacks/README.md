# Reversión de migraciones
Cada `NNNNN_down.sql` deshace la migración con ese número. Hazlo en una copia o con una copia de seguridad:
las columnas/tablas eliminadas pierden sus datos. Las migraciones 00009 y 00010 se revierten con `00009_down.sql` y `00010_down.sql`.
