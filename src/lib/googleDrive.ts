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
  return new Promise((resolve) => {
    if (!GAS_UPLOAD_URL) {
      resolve({ success: false, error: 'GAS URL not configured' });
      return;
    }
    if (!DRIVE_FOLDER_ID) {
      resolve({ success: false, error: 'Drive Folder ID not configured' });
      return;
    }

    const formData = new FormData();
    formData.append('fileData', file);
    formData.append('fileName', file.name);
    formData.append('mimeType', file.type);
    formData.append('folderId', DRIVE_FOLDER_ID);
    formData.append('subFolder', folder || 'documents');

    // 🔥 PAKAI XMLHttpRequest (yang sudah terbukti berhasil sebelumnya)
    const xhr = new XMLHttpRequest();
    xhr.open('POST', GAS_UPLOAD_URL, true);
    
    xhr.onload = function () {
      try {
        // Response dari GAS sekarang pakai callback
        let responseText = xhr.responseText;
        // Hapus callback wrapper: callback({...})
        const jsonMatch = responseText.match(/callback\((.*)\)/);
        if (jsonMatch) {
          responseText = jsonMatch[1];
        }
        const result = JSON.parse(responseText);
        
        if (result.success) {
          resolve({
            success: true,
            fileId: result.fileId,
            fileUrl: result.fileUrl,
            fileName: file.name,
          });
        } else {
          resolve({ success: false, error: result.error || 'Upload failed' });
        }
      } catch (error) {
        resolve({ success: false, error: 'Invalid response from server' });
      }
    };

    xhr.onerror = function () {
      resolve({ success: false, error: 'Network error' });
    };

    xhr.ontimeout = function () {
      resolve({ success: false, error: 'Upload timeout' });
    };

    xhr.timeout = 60000;
    xhr.send(formData);
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
