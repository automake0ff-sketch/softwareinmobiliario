
async function main() {
  const apiKey = process.env.OPENROUTER_API_KEY || '';
  const res = await fetch('https://openrouter.ai/api/v1/models', {
    headers: {
      'Authorization': `Bearer ${apiKey}`
    }
  });
  if (!res.ok) {
    console.error('Failed to fetch models:', res.status, await res.text());
    return;
  }
  const data = await res.json();
  const freeModels = data.data.filter(m => m.id.includes('free'));
  console.log('Free Models found:');
  freeModels.forEach(m => console.log(`- ${m.id} (${m.name})`));
}

main().catch(console.error);
