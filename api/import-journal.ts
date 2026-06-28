import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createGeneralJournal } from '../src/lib/accountingHelpers';
import { parseExcelFile } from '../src/lib/excelParser';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  // CORS headers
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
    console.log('📥 Import API hit:', req.body);

    const { action } = req.body;

    if (!action) {
      return res.status(400).json({ error: 'Action is required' });
    }

    if (action === 'preview') {
      const { fileBase64, companyId } = req.body;

      if (!fileBase64 || !companyId) {
        return res.status(400).json({ 
          error: 'fileBase64 dan companyId wajib',
          received: { fileBase64: !!fileBase64, companyId }
        });
      }

      const buffer = Buffer.from(fileBase64, 'base64');
      const file = new File([buffer], 'upload.xlsx', {
        type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      });

      const preview = await parseExcelFile(file, companyId);
      return res.status(200).json({ success: true, preview });
    }

    if (action === 'import') {
      const { groups, companyId } = req.body;

      if (!groups || !companyId) {
        return res.status(400).json({ error: 'groups dan companyId wajib' });
      }

      const results = [];
      let successCount = 0;
      let failCount = 0;

      for (const group of groups) {
        if (!group.valid) {
          results.push({ success: false, error: group.error || 'Group tidak valid', group });
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
            results.push({ success: true, journalId, group });
            successCount++;
          } else {
            results.push({ success: false, error: 'Gagal membuat jurnal', group });
            failCount++;
          }
        } catch (err: any) {
          results.push({ success: false, error: err.message || 'Error', group });
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
    console.error('❌ Import error:', error);
    return res.status(500).json({ 
      error: error.message || 'Internal server error',
      stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });
  }
}
