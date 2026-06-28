import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createGeneralJournal } from '../src/lib/accountingHelpers';
import { parseExcelFile } from '../src/lib/excelParser';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  console.log('📥 import-journal API called');
  console.log('Method:', req.method);
  
  // CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  // Handle OPTIONS (preflight)
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  // Hanya terima POST
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { action } = req.body;
    console.log('Action:', action);

    // === PREVIEW ===
    if (action === 'preview') {
      const { fileBase64, companyId } = req.body;

      if (!fileBase64 || !companyId) {
        return res.status(400).json({ 
          error: 'fileBase64 dan companyId wajib' 
        });
      }

      // Parse Excel
      const buffer = Buffer.from(fileBase64, 'base64');
      const file = new File([buffer], 'upload.xlsx', {
        type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      });

      const preview = await parseExcelFile(file, companyId);
      return res.status(200).json({ success: true, preview });
    }

    // === IMPORT ===
    if (action === 'import') {
      const { groups, companyId } = req.body;

      if (!groups || !companyId) {
        return res.status(400).json({ error: 'groups dan companyId wajib' });
      }

      const results: any[] = [];
      let successCount = 0;
      let failCount = 0;

      for (const group of groups) {
        if (!group.valid) {
          results.push({ success: false, error: group.error || 'Group tidak valid' });
          failCount++;
          continue;
        }

        try {
          const [day, month, year] = group.tanggal.split('/');
          const isoDate = `${year}-${month}-${day}`;

          const entries = group.rows.map((row: any) => ({
            account_id: row.coaId,
            account_code: row.coaCode,
            account_name: row.coaName,
            debit: row.debit,
            credit: row.kredit,
          }));

          const journalId = await createGeneralJournal(
            companyId,
            isoDate,
            group.keterangan || 'Import Excel',
            `IMPORT-${Date.now()}`,
            'IMPORT',
            0,
            entries
          );

          if (journalId) {
            results.push({ success: true, journalId });
            successCount++;
          } else {
            results.push({ success: false, error: 'Gagal membuat jurnal' });
            failCount++;
          }
        } catch (err: any) {
          results.push({ success: false, error: err.message || 'Error' });
          failCount++;
        }
      }

      return res.status(200).json({
        success: true,
        results,
        summary: { total: results.length, success: successCount, failed: failCount },
      });
    }

    return res.status(400).json({ error: `Action "${action}" tidak dikenal` });

  } catch (error: any) {
    console.error('❌ API Error:', error);
    return res.status(500).json({ 
      error: error.message || 'Internal server error',
      stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });
  }
}
