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

    // ✅ Fetch ke /api/upload (Vercel proxy), bukan langsung ke GAS
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
