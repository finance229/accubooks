const GAS_UPLOAD_URL = import.meta.env.VITE_GAS_UPLOAD_URL || '';
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
    if (!GAS_UPLOAD_URL) {
      throw new Error('Google Apps Script URL not configured');
    }
    const base64 = await fileToBase64(file);
    const payload = {
      fileName: file.name,
      fileData: base64,
      mimeType: file.type,
      folderId: DRIVE_FOLDER_ID,
      subFolder: folder || 'documents',
    };
    const response = await fetch(GAS_UPLOAD_URL, {
      method: 'POST',
      body: JSON.stringify(payload),
      headers: { 'Content-Type': 'application/json' },
    });
    if (!response.ok) throw new Error(`Upload failed: ${response.statusText}`);
    const result = await response.json();
    if (result.success) {
      return {
        success: true,
        fileId: result.fileId,
        fileUrl: result.fileUrl || `https://drive.google.com/file/d/${result.fileId}/view`,
        fileName: file.name,
      };
    } else {
      throw new Error(result.error || 'Upload failed');
    }
  } catch (error) {
    console.error('Error uploading to Google Drive:', error);
    return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
  }
}

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = () => {
      const result = reader.result as string;
      const base64 = result.split(',')[1];
      resolve(base64);
    };
    reader.onerror = (error) => reject(error);
  });
}

export function getGoogleDrivePreviewUrl(fileId: string): string {
  return `https://drive.google.com/file/d/${fileId}/preview`;
}

export function getGoogleDriveDownloadUrl(fileId: string): string {
  return `https://drive.google.com/uc?export=download&id=${fileId}`;
}

export function openGoogleDriveFile(fileId: string): void {
  window.open(`https://drive.google.com/file/d/${fileId}/view`, '_blank');
}
