-- ═══════════════════════════════════════════════════════
-- Bucket de imágenes de propiedades
--
-- Motivo: el campo 'images' de properties solo aceptaba URLs pegadas a
-- mano (texto), sin ninguna forma de subir fotos reales desde el
-- navegador/móvil. Para el cliente objetivo (agente inmobiliario que
-- fotografía la vivienda con el móvil) esto es fricción real de
-- adopción: la mayoría no tiene sus fotos alojadas en ningún sitio
-- público de antemano.
--
-- Público en lectura (las fotos deben poder mostrarse directamente en
-- la ficha y en los portales sin necesidad de URLs firmadas). Solo
-- escritura/borrado para usuarios autenticados, restringido a la
-- carpeta de su propia agencia (primer segmento de la ruta = agency_id),
-- reutilizando la función agency_id() ya usada en el resto de políticas
-- RLS de la base de datos.
-- ═══════════════════════════════════════════════════════

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('property-images', 'property-images', true, 8388608, ARRAY['image/jpeg','image/png','image/webp','image/gif'])
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS "property_images_public_read" ON storage.objects;
CREATE POLICY "property_images_public_read" ON storage.objects
  FOR SELECT USING (bucket_id = 'property-images');

DROP POLICY IF EXISTS "property_images_agency_write" ON storage.objects;
CREATE POLICY "property_images_agency_write" ON storage.objects
  FOR INSERT WITH CHECK (
    bucket_id = 'property-images'
    AND (storage.foldername(name))[1] = agency_id()::text
  );

DROP POLICY IF EXISTS "property_images_agency_delete" ON storage.objects;
CREATE POLICY "property_images_agency_delete" ON storage.objects
  FOR DELETE USING (
    bucket_id = 'property-images'
    AND (storage.foldername(name))[1] = agency_id()::text
  );
