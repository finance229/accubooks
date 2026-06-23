// src/lib/googleDrive.ts
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
    const fileExt = file.name.split('.').pop();
    const fileName = `${folder || 'documents'}/${Date.now()}.${fileExt}`;
    
    console.log('📤 Uploading to Supabase Storage...');
    
    const { data, error } = await supabase.storage
      .from('accubooks')
      .upload(fileName, file);

    if (error) {
      console.error('❌ Upload error:', error);
      return { success: false, error: error.message };
    }

    const { data: urlData } = supabase.storage
      .from('accubooks')
      .getPublicUrl(data.path);

    console.log('✅ Upload success:', urlData.publicUrl);
    
    return {
      success: true,
      fileUrl: urlData.publicUrl,
      fileName: file.name,
    };
  } catch (error) {
    console.error('❌ Upload error:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Upload failed',
    };
  }
}
