# Checklist de Lanzamiento a Produccion

## 1. Supabase (hacer ANTES del deploy)
- [ ] Proyecto Supabase creado en supabase.com
- [ ] Ejecutar migraciones: `supabase/migrations/00001_schema.sql`
- [ ] Ejecutar migraciones: `supabase/migrations/00002_rls.sql`
- [ ] Ejecutar migraciones: `supabase/migrations/00003_functions.sql`
- [ ] Google OAuth configurado en Supabase -> Authentication -> Providers
- [ ] URL de redirect configurada: `https://tudominio.com/dashboard`
- [ ] Copiar: Project URL, Anon Key, JWT Secret

## 2. Fly.io Secrets (ejecutar antes de fly deploy)
```bash
fly secrets set DATABASE_URL="postgresql://..."
fly secrets set SUPABASE_JWT_SECRET="..."
fly secrets set OPENROUTER_API_KEY="..."
fly secrets set STRIPE_SECRET_KEY="sk_live_..."
fly secrets set STRIPE_WEBHOOK_SECRET="whsec_..."
fly secrets set APP_URL="https://crm-inmobiliario.fly.dev"
```

## 3. GitHub Secrets (para CI/CD)
- [ ] `FLY_API_TOKEN` -> obtenido con `fly tokens create deploy`

## 4. Stripe (produccion)
- [ ] Cuenta Stripe en modo live
- [ ] Webhook configurado apuntando a `https://tudominio.com/webhooks/stripe`
- [ ] Eventos del webhook: `customer.subscription.created`, `customer.subscription.updated`, `invoice.payment_succeeded`, `invoice.payment_failed`
- [ ] Copiar Webhook Secret -> `STRIPE_WEBHOOK_SECRET`

## 5. Frontend (.env.production)
- [ ] `VITE_SUPABASE_URL` configurada
- [ ] `VITE_SUPABASE_ANON_KEY` configurada
- [ ] `VITE_API_URL=/api`

## 6. Primer deploy
```bash
fly launch  # solo la primera vez
# o
fly deploy  # si ya existe el app
```

## 7. Verificacion post-deploy
- [ ] `curl https://tudominio.com/api/health` devuelve `{"status":"ok","db":"connected"}`
- [ ] Login con email/password funciona
- [ ] Login con Google OAuth funciona
- [ ] Crear un lead funciona
- [ ] Webhook de Stripe responde 200

## 8. DNS (si dominio propio)
- [ ] `fly certs add tudominio.com`
- [ ] Apuntar CNAME/A record a la IP de Fly.io
