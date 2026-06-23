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
    const base64 = await new Promise<string>((resolve) => {
      const reader = new FileReader();
      reader.onload = () => {
        const result = reader.result as string;
        resolve(result.split(',')[1]);
      };
      reader.readAsDataURL(file);
    });

    const params = {
      fileData: base64,
      fileName: file.name,
      mimeType: file.type,
      folderId: DRIVE_FOLDER_ID,
      subFolder: folder || 'documents',
    };

    const response = await fetch('/api/upload', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(params),
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
