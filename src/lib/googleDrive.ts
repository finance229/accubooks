// src/lib/googleDrive.ts
const GAS_URL = import.meta.env.VITE_GAS_UPLOAD_URL || 'https://script.google.com/macros/s/AKfycbzXoR8IaDvRqfpjL3OpO2nxNYkqNGlLy6GnuEi3cDrbS66_QZwfdNSwUsgMgTZScPhNSQ/exec';
const DRIVE_FOLDER_ID = import.meta.env.VITE_DRIVE_FOLDER_ID || '	15OqEW00HkWJrBEJtPnNPV5jwaMZ24wik';

export type UploadResult = {
  success: boolean;
  fileId?: string;
  fileUrl?: string;
  fileName?: string;
  error?: string;
};

export async function uploadToGoogleDrive(file: File, folder?: string): Promise<UploadResult> {
  try {
    // Convert file ke base64
    const base64 = await new Promise<string>((resolve) => {
      const reader = new FileReader();
      reader.onload = () => {
        const result = reader.result as string;
        resolve(result.split(',')[1]);
      };
      reader.readAsDataURL(file);
    });

    const payload = {
      fileData: base64,
      fileName: file.name,
      folderId: DRIVE_FOLDER_ID,
      subFolder: folder || 'documents',
    };

    console.log('📤 Uploading to GAS via JSON...');

    const response = await fetch(GAS_URL, {
      method: 'POST',
      mode: 'no-cors', // 🔥 INI KUNCI!
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    });

    // Karena mode no-cors, response tidak bisa dibaca
    console.log('✅ Upload initiated (check Google Drive)');

    return {
      success: true,
      fileUrl: `Uploaded: ${file.name} (check Google Drive)`,
      fileName: file.name,
    };
  } catch (error) {
    console.error('❌ Upload error:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}
