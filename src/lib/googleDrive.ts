// src/lib/googleDrive.ts
const API_URL = '/api/upload';

export type UploadResult = {
  success: boolean;
  fileId?: string;
  fileUrl?: string;
  fileName?: string;
  error?: string;
};

export async function uploadToGoogleDrive(file: File, folder?: string): Promise<UploadResult> {
  try {
    const formData = new FormData();
    formData.append('fileData', file);
    formData.append('fileName', file.name);
    formData.append('subFolder', folder || 'documents');

    console.log('📤 Uploading to proxy:', API_URL);

    const response = await fetch(API_URL, {
      method: 'POST',
      body: formData,
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || `HTTP ${response.status}`);
    }

    const result = await response.json();
    console.log('✅ Upload result:', result);
    return result;
  } catch (error) {
    console.error('❌ Upload error:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}
