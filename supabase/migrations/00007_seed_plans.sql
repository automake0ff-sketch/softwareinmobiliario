-- ═══════════════════════════════════════════════════════
-- Siembra de la tabla plans + columna slug
--
-- Motivo: subscriptions.plan_id es UUID NOT NULL REFERENCES plans(id),
-- pero la tabla plans nunca se sembró (0 filas desde la migración inicial).
-- Cualquier intento de completar un checkout escribía el slug de la app
-- ('starter', 'profesional', 'agencia') directamente en esa columna UUID,
-- lo que Postgres rechaza con:
--   invalid input syntax for type uuid: "starter"
-- bloqueando TODOS los pagos sin excepción.
--
-- 'slug' permite que el backend traduzca el identificador que usa el
-- resto de la app (server/services/plans.js, agencies.plan, frontend)
-- al UUID real que exige la FK, sin hardcodear UUIDs en el código.
-- ═══════════════════════════════════════════════════════

ALTER TABLE plans ADD COLUMN IF NOT EXISTS slug TEXT;
-- Nota: un índice único PARCIAL (WHERE slug IS NOT NULL) no sirve como
-- objetivo de ON CONFLICT (slug) a menos que el INSERT repita el mismo
-- WHERE -- Postgres lo rechaza con "no unique or exclusion constraint
-- matching the ON CONFLICT specification". Constraint UNIQUE normal:
-- permite múltiples NULLs igualmente (NULL <> NULL), así que no hace
-- falta el índice parcial para este caso.
ALTER TABLE plans ADD CONSTRAINT plans_slug_unique UNIQUE (slug);

INSERT INTO plans (slug, name, description, price_monthly, price_yearly, max_offices, max_users, max_leads_per_month, max_agents, max_automations, feature_whatsapp, feature_meta_ads, feature_white_label, feature_api_access, feature_analytics_advanced, feature_priority_support, feature_dedicated_support, sort_order)
VALUES
  ('starter', 'Starter', 'Para agentes y pequeñas agencias', 79, 69, 1, 5, 500, 3, 10, TRUE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 1),
  ('profesional', 'Profesional', 'Para agencias en crecimiento', 199, 166, 3, 15, 2000, 8, -1, TRUE, TRUE, FALSE, TRUE, TRUE, TRUE, FALSE, 2),
  ('agencia', 'Agencia', 'Para agencias consolidadas', 499, 416, -1, -1, -1, 12, -1, TRUE, TRUE, TRUE, TRUE, TRUE, TRUE, TRUE, 3)
ON CONFLICT (slug) DO UPDATE SET
  name = EXCLUDED.name,
  description = EXCLUDED.description,
  price_monthly = EXCLUDED.price_monthly,
  price_yearly = EXCLUDED.price_yearly,
  max_offices = EXCLUDED.max_offices,
  max_users = EXCLUDED.max_users,
  max_leads_per_month = EXCLUDED.max_leads_per_month,
  max_agents = EXCLUDED.max_agents,
  max_automations = EXCLUDED.max_automations,
  feature_whatsapp = EXCLUDED.feature_whatsapp,
  feature_meta_ads = EXCLUDED.feature_meta_ads,
  feature_white_label = EXCLUDED.feature_white_label,
  feature_api_access = EXCLUDED.feature_api_access,
  feature_analytics_advanced = EXCLUDED.feature_analytics_advanced,
  feature_priority_support = EXCLUDED.feature_priority_support,
  feature_dedicated_support = EXCLUDED.feature_dedicated_support,
  sort_order = EXCLUDED.sort_order;
