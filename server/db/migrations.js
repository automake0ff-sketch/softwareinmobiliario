export function runMigrations(db) {
  const migrations = []

  // Helper: check if a column exists in a table
  function columnExists(table, column) {
    const cols = db.exec(`PRAGMA table_info(${table})`)
    if (!cols.length) return false
    const rows = cols[0].values
    return rows.some(r => r[1] === column)
  }

  // Helper: add column if not exists
  function addColumn(table, column, type, def) {
    if (columnExists(table, column)) return false
    const sql = def
      ? `ALTER TABLE ${table} ADD COLUMN ${column} ${type} DEFAULT ${def}`
      : `ALTER TABLE ${table} ADD COLUMN ${column} ${type}`
    db.run(sql)
    migrations.push(`Added ${table}.${column}`)
    return true
  }

  // ── agencies columns ──
  addColumn('agencies', 'email', 'TEXT')
  addColumn('agencies', 'phone', 'TEXT')
  addColumn('agencies', 'whatsapp_token', 'TEXT')
  addColumn('agencies', 'whatsapp_phone_id', 'TEXT')
  addColumn('agencies', 'whatsapp_number', 'TEXT')
  addColumn('agencies', 'address', 'TEXT')
  addColumn('agencies', 'city', 'TEXT')
  addColumn('agencies', 'website', 'TEXT')
  addColumn('agencies', 'instagram', 'TEXT')
  addColumn('agencies', 'facebook', 'TEXT')
  addColumn('agencies', 'linkedin', 'TEXT')
  addColumn('agencies', 'tiktok', 'TEXT')
  addColumn('agencies', 'cif', 'TEXT')
  addColumn('agencies', 'legal_name', 'TEXT')
  addColumn('agencies', 'sendgrid_api_key', 'TEXT')
  addColumn('agencies', 'sendgrid_from_email', 'TEXT')
  addColumn('agencies', 'sendgrid_from_name', 'TEXT')
  addColumn('agencies', 'smtp_host', 'TEXT')
  addColumn('agencies', 'smtp_port', 'INTEGER')
  addColumn('agencies', 'smtp_user', 'TEXT')
  addColumn('agencies', 'smtp_password', 'TEXT')
  addColumn('agencies', 'telegram_bot_token', 'TEXT')
  addColumn('agencies', 'telegram_chat_id', 'TEXT')
  addColumn('agencies', 'slack_webhook_url', 'TEXT')
  addColumn('agencies', 'notion_api_key', 'TEXT')
  addColumn('agencies', 'notion_database_id', 'TEXT')
  addColumn('agencies', 'airtable_api_key', 'TEXT')
  addColumn('agencies', 'airtable_base_id', 'TEXT')
  addColumn('agencies', 'airtable_table', 'TEXT')
  addColumn('agencies', 'google_sheets_id', 'TEXT')
  addColumn('agencies', 'google_service_account', 'TEXT')
  addColumn('agencies', 'zapier_webhook_url', 'TEXT')
  addColumn('agencies', 'make_webhook_url', 'TEXT')
  addColumn('agencies', 'n8n_webhook_url', 'TEXT')
  addColumn('agencies', 'onboarding_completed', 'INTEGER')
  addColumn('agencies', 'onboarding_step', 'INTEGER')

  // ── users columns ──
  // Some might already exist (phone)
  addColumn('users', 'whatsapp_number', 'TEXT')
  addColumn('users', 'telegram_chat_id', 'TEXT')
  addColumn('users', 'slack_user_id', 'TEXT')
  addColumn('users', 'notification_email', 'TEXT')
  addColumn('users', 'signature', 'TEXT')
  addColumn('users', 'timezone', 'TEXT', "'Europe/Madrid'")
  addColumn('users', 'working_hours', 'TEXT', "'{\"start\":\"09:00\",\"end\":\"20:00\",\"days\":[1,2,3,4,5]}'")
  addColumn('users', 'preferences', 'TEXT', "'{}'")

  // ── agency_full_context view ──
  db.run('DROP VIEW IF EXISTS agency_full_context')
  db.run(`
    CREATE VIEW agency_full_context AS
    SELECT
      a.id                    AS agency_id,
      a.name                  AS agency_name,
      a.city                  AS agency_city,
      a.email                 AS agency_email,
      a.phone                 AS agency_phone,
      a.whatsapp_number       AS agency_whatsapp,
      a.website               AS agency_website,
      a.instagram             AS agency_instagram,
      a.facebook              AS agency_facebook,
      a.address               AS agency_address,
      a.whatsapp_token        AS wa_token,
      a.whatsapp_phone_id     AS wa_phone_id,
      a.sendgrid_api_key      AS sg_api_key,
      a.sendgrid_from_email   AS sg_from_email,
      a.sendgrid_from_name    AS sg_from_name,
      a.smtp_host, a.smtp_port, a.smtp_user, a.smtp_password,
      a.telegram_bot_token, a.telegram_chat_id,
      a.slack_webhook_url,
      a.notion_api_key, a.notion_database_id,
      a.airtable_api_key, a.airtable_base_id, a.airtable_table,
      a.google_sheets_id,
      a.zapier_webhook_url, a.make_webhook_url, a.n8n_webhook_url
    FROM agencies a
  `)
  migrations.push('Created view agency_full_context')

  if (migrations.length > 0) {
    console.log(`[DB] Migrations executed: ${migrations.length}`)
    migrations.forEach(m => console.log(`  ✓ ${m}`))
  }

  return migrations
}
