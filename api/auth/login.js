export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();
  // Auth is handled by Supabase on the frontend - this is just a compatibility stub
  return res.status(401).json({ error: 'Use Supabase Auth directly.' });
}
