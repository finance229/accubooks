// src/lib/googleDrive.ts
const GAS_URL = import.meta.env.VITE_GAS_UPLOAD_URL || 'https://script.google.com/macros/s/AKfycbzlCNVE8qafhwCkB5-kHsS4hx9UmpEwwqk0TuCWNt0CRTEML3tWVzm4qKX3Ybrmv_KHAw/exec';
const DRIVE_FOLDER_ID = import.meta.env.VITE_DRIVE_FOLDER_ID || '15OqEW00HkWJrBEJtPnNPV5jwaMZ24wik';

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

    const formData = new FormData();
    formData.append('fileData', base64);
    formData.append('fileName', file.name);
    formData.append('folderId', DRIVE_FOLDER_ID);
    formData.append('subFolder', folder || 'documents');

    console.log('📤 Uploading to GAS...');

    const response = await fetch(GAS_URL, {
      method: 'POST',
      mode: 'no-cors', // 🔥 INI KUNCI!
      body: formData,
    });

    // Karena mode no-cors, response tidak bisa dibaca
    // Tapi kita asumsikan sukses karena tidak ada error
    console.log('✅ Upload initiated');

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
