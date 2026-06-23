export default async function handler(req: any, res: any) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const GAS_URL = process.env.GAS_UPLOAD_URL || '';
    const FOLDER_ID = process.env.DRIVE_FOLDER_ID || '';

    // ← debug sementara
    console.log('GAS_URL:', GAS_URL);
    console.log('FOLDER_ID:', FOLDER_ID);

    const { fileData, fileName, mimeType, subFolder } = req.body;

    const params = new URLSearchParams();
    params.append('fileData', fileData);
    params.append('fileName', fileName);
    params.append('mimeType', mimeType);
    params.append('folderId', FOLDER_ID);
    params.append('subFolder', subFolder || 'documents');

    const response = await fetch(GAS_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: params.toString(),
    });

    const data = await response.json();
    return res.status(200).json(data);

  } catch (error) {
    return res.status(500).json({ success: false, error: String(error) });
  }
}
