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

    const response = await fetch(API_URL, {
      method: 'POST',
      body: formData,
    });

    const result = await response.json();
    return result;
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}
