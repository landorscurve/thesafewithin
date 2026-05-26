export default async function handler(req, res) {
  // CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  // Preflight
  if (req.method === 'OPTIONS') {
    return res.status(204).end();
  }

  // Only allow POST
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // Check API key
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: 'ANTHROPIC_API_KEY not set in environment' });
  }

  // Parse body — Vercel Node runtime parses JSON automatically
  // but we guard against it being missing
  const body = req.body;
  if (!body || !Array.isArray(body.messages)) {
    return res.status(400).json({ error: 'Request must include a messages array' });
  }

  // Build Anthropic request
  const anthropicPayload = {
    model: 'claude-haiku-4-5',           // backend controls model — never from frontend
    max_tokens: body.max_tokens || 1000,
    messages: body.messages,
  };

  // Only include system if provided and non-empty
  if (body.system && typeof body.system === 'string' && body.system.trim().length > 0) {
    anthropicPayload.system = body.system;
  }

  try {
    const anthropicRes = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify(anthropicPayload),
    });

    const data = await anthropicRes.json();
    return res.status(anthropicRes.status).json(data);

  } catch (err) {
    return res.status(500).json({
      error: 'Failed to reach Anthropic API',
      detail: err.message,
    });
  }
}
