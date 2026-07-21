// El schema tiene columnas JSONB (Postgres/pg las devuelve YA parseadas como
// objeto/array de JS) mezcladas con columnas TEXT que guardan JSON como string
// (hay que hacer JSON.parse a mano). Ha habido más de un desajuste entre el
// schema canónico (supabase/migrations) y versiones ad-hoc del mismo — por eso
// esta función es defensiva: si ya es un objeto/array, lo devuelve tal cual;
// si es un string, intenta parsearlo; si falla, devuelve el valor original en
// vez de tirar la petición entera con una excepción no capturada.
export function safeJsonParse(value) {
  if (value === null || value === undefined) return value;
  if (typeof value !== 'string') return value;
  try {
    return JSON.parse(value);
  } catch {
    return value;
  }
}
