// api/upload.js
export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(204).end();
  }

  try {
    const formData = await req.formData();
    const file = formData.get('fileData');
    const fileName = formData.get('fileName');
    const folderId = formData.get('folderId') || process.env.DRIVE_FOLDER_ID;
    const subFolder = formData.get('subFolder') || 'documents';

    if (!file) {
      return res.status(400).json({ success: false, error: 'No file provided' });
    }

    const gasFormData = new FormData();
    gasFormData.append('fileData', file);
    gasFormData.append('fileName', fileName);
    gasFormData.append('folderId', folderId);
    gasFormData.append('subFolder', subFolder);

    const gasResponse = await fetch(process.env.GAS_UPLOAD_URL, {
      method: 'POST',
      body: gasFormData,
    });

    const result = await gasResponse.json();
    res.status(200).json(result);
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
}
