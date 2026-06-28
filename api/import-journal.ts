import type { VercelRequest, VercelResponse } from '@vercel/node';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  // CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  // Handle OPTIONS
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  // Hanya POST
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // BALIKAN JSON PASTI
  try {
    const body = req.body || {};
    console.log('📥 Received:', body);

    return res.status(200).json({
      success: true,
      message: 'API import-journal bekerja!',
      received: body
    });
  } catch (err: any) {
    return res.status(500).json({
      success: false,
      error: err.message || 'Error'
    });
  }
}
