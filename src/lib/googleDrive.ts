// src/lib/googleDrive.ts
const GAS_URL = import.meta.env.VITE_GAS_UPLOAD_URL || '';
const DRIVE_FOLDER_ID = import.meta.env.VITE_DRIVE_FOLDER_ID || '';

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

    // ✅ Pakai URLSearchParams, bukan FormData
    const params = new URLSearchParams();
    params.append('fileData', base64);
    params.append('fileName', file.name);
    params.append('mimeType', file.type);
    params.append('folderId', DRIVE_FOLDER_ID);
    params.append('subFolder', folder || 'documents');

    console.log('📤 Uploading to GAS...');

    const response = await fetch(GAS_URL, {
      method: 'POST',
      mode: 'no-cors',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: params.toString(),
    });

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
