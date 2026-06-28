import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createGeneralJournal } from '../src/lib/accountingHelpers';
import { parseExcelFile } from '../src/lib/excelParser';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  // ============ CORS ============
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  // ============ LOG ============
  console.log('========================================');
  console.log('📥 [import-journal] API DIPANGGIL');
  console.log('📌 Method:', req.method);
  console.log('📌 URL:', req.url);
  console.log('📌 Body:', req.body);
  console.log('========================================');

  // ============ OPTIONS ============
  if (req.method === 'OPTIONS') {
    console.log('✅ OPTIONS request handled');
    return res.status(200).end();
  }

  // ============ METHOD CHECK ============
  if (req.method !== 'POST') {
    console.log('❌ Method not allowed:', req.method);
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // ============ MAIN TRY ============
  try {
    const { action } = req.body;
    console.log('🎯 Action:', action);

    // ===== PREVIEW =====
    if (action === 'preview') {
      console.log('🔍 [PREVIEW] Processing...');
      const { fileBase64, companyId } = req.body;

      if (!fileBase64) {
        console.log('❌ fileBase64 is missing');
        return res.status(400).json({ error: 'fileBase64 wajib diisi' });
      }
      if (!companyId) {
        console.log('❌ companyId is missing');
        return res.status(400).json({ error: 'companyId wajib diisi' });
      }

      console.log('✅ fileBase64 length:', fileBase64.length);
      console.log('✅ companyId:', companyId);

      // Parse base64 ke buffer
      const buffer = Buffer.from(fileBase64, 'base64');
      console.log('✅ Buffer size:', buffer.length, 'bytes');

      // Buat File object
      const file = new File([buffer], 'upload.xlsx', {
        type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      });
      console.log('✅ File object created');

      // Parse Excel
      console.log('⏳ Calling parseExcelFile...');
      const preview = await parseExcelFile(file, companyId);
      console.log('✅ parseExcelFile success:', preview);

      return res.status(200).json({ success: true, preview });
    }

    // ===== IMPORT =====
    if (action === 'import') {
      console.log('📥 [IMPORT] Processing...');
      const { groups, companyId } = req.body;

      if (!groups) {
        console.log('❌ groups is missing');
        return res.status(400).json({ error: 'groups wajib diisi' });
      }
      if (!companyId) {
        console.log('❌ companyId is missing');
        return res.status(400).json({ error: 'companyId wajib diisi' });
      }

      console.log('✅ groups count:', groups.length);
      console.log('✅ companyId:', companyId);

      const results: any[] = [];
      let successCount = 0;
      let failCount = 0;

      for (const group of groups) {
        console.log(`⏳ Processing group: ${group.keterangan || 'untitled'}`);

        if (!group.valid) {
          console.log(`❌ Group invalid: ${group.error}`);
          results.push({ success: false, error: group.error || 'Group tidak valid' });
          failCount++;
          continue;
        }

        try {
          const [day, month, year] = group.tanggal.split('/');
          const isoDate = `${year}-${month}-${day}`;
          console.log(`📅 Date: ${group.tanggal} -> ${isoDate}`);

          const entries = group.rows.map((row: any) => ({
            account_id: row.coaId,
            account_code: row.coaCode,
            account_name: row.coaName,
            debit: row.debit,
            credit: row.kredit,
          }));
          console.log(`📊 Entries count: ${entries.length}`);

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
            console.log(`✅ Journal created: ${journalId}`);
            results.push({ success: true, journalId });
            successCount++;
          } else {
            console.log('❌ Failed to create journal');
            results.push({ success: false, error: 'Gagal membuat jurnal' });
            failCount++;
          }
        } catch (err: any) {
          console.error(`❌ Error in group:`, err);
          results.push({ success: false, error: err.message || 'Error' });
          failCount++;
        }
      }

      console.log(`📊 SUMMARY: Total=${results.length}, Success=${successCount}, Failed=${failCount}`);
      return res.status(200).json({
        success: true,
        results,
        summary: { total: results.length, success: successCount, failed: failCount },
      });
    }

    // ===== UNKNOWN ACTION =====
    console.log(`❌ Unknown action: ${action}`);
    return res.status(400).json({ error: `Action "${action}" tidak dikenal` });

  } catch (error: any) {
    console.error('========================================');
    console.error('❌ [import-journal] UNHANDLED ERROR:');
    console.error('❌ Message:', error.message);
    console.error('❌ Stack:', error.stack);
    console.error('========================================');

    return res.status(500).json({
      success: false,
      error: error.message || 'Internal server error',
      stack: process.env.NODE_ENV === 'development' ? error.stack : undefined,
    });
  }
}
