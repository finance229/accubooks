import type { VercelRequest, VercelResponse } from '@vercel/node';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  // CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  console.log('📥 import-journal API dipanggil!');
  console.log('Method:', req.method);
  console.log('Action:', req.body?.action);

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  // Biar gampang: semua request POST dikasih response JSON
  try {
    return res.status(200).json({
      success: true,
      message: 'API import-journal berhasil dipanggil!',
      data: req.body || {}
    });
  } catch (err: any) {
    return res.status(500).json({
      success: false,
      error: err.message || 'Error'
    });
  }
}
