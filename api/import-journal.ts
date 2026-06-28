import type { VercelRequest, VercelResponse } from '@vercel/node';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  console.log('📥 import-journal API called');
  
  // CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { action } = req.body;
    console.log('Action received:', action);

    // Test response dulu
    return res.status(200).json({
      success: true,
      message: 'import-journal API is working!',
      action: action,
      received: req.body
    });

  } catch (error: any) {
    console.error('❌ Error:', error);
    return res.status(500).json({ 
      error: error.message || 'Internal error' 
    });
  }
}
