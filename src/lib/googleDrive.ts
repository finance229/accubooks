import { supabase } from './supabase';

export type UploadResult = {
  success: boolean;
  fileId?: string;
  fileUrl?: string;
  fileName?: string;
  error?: string;
};

export async function uploadToGoogleDrive(file: File, folder?: string): Promise<UploadResult> {
  try {
    // Gunakan Supabase Storage
    const filePath = `${folder || 'documents'}/${Date.now()}_${file.name}`;
    
    const { data, error } = await supabase.storage
      .from('documents')
      .upload(filePath, file, {
        cacheControl: '3600',
        upsert: false,
      });

    if (error) {
      console.error('Upload error:', error);
      return { success: false, error: error.message };
    }

    // Dapatkan public URL
    const { data: publicUrlData } = supabase.storage
      .from('documents')
      .getPublicUrl(data?.path || filePath);

    return {
      success: true,
      fileId: data?.path || filePath,
      fileUrl: publicUrlData?.publicUrl || '',
      fileName: file.name,
    };
  } catch (error) {
    console.error('Upload error:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

export function getGoogleDrivePreviewUrl(fileId: string): string {
  return fileId; // untuk Supabase, fileId adalah path
}

export function getGoogleDriveDownloadUrl(fileId: string): string {
  const { data } = supabase.storage.from('documents').getPublicUrl(fileId);
  return data?.publicUrl || '';
}

export function openGoogleDriveFile(fileId: string): void {
  const url = getGoogleDriveDownloadUrl(fileId);
  window.open(url, '_blank');
}
