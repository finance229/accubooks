import { useState, useRef } from 'react';
import { X, Upload, Download, FileSpreadsheet, Loader2 } from 'lucide-react';
import { motion } from 'framer-motion';
import { useCompany } from '../contexts/CompanyContext';
import { generateTemplateExcel } from '../lib/excelParser';

type ImportJournalModalProps = {
  isOpen: boolean;
  onClose: () => void;
  onImportSuccess: () => void;
};

export default function ImportJournalModal({ isOpen, onClose, onImportSuccess }: ImportJournalModalProps) {
  const { currentCompany } = useCompany();
  const [file, setFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<any>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  if (!isOpen) return null;

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selected = e.target.files?.[0];
    if (selected) {
      setFile(selected);
      setError(null);
      setResult(null);
    }
  };

  const handleUpload = async () => {
    if (!file || !currentCompany?.id) {
      setError('Pilih file terlebih dahulu');
      return;
    }

    setLoading(true);
    setError(null);

    try {
      console.log('📤 Uploading file:', file.name);
      
      // Convert to base64
      const reader = new FileReader();
      const base64 = await new Promise<string>((resolve, reject) => {
        reader.onload = () => {
          const result = reader.result as string;
          resolve(result.split(',')[1]);
        };
        reader.onerror = reject;
        reader.readAsDataURL(file);
      });

      console.log('📤 Sending to API...');
      
      const response = await fetch('/api/import-journal', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'preview',
          fileBase64: base64,
          companyId: currentCompany.id,
        }),
      });

      console.log('📥 Response status:', response.status);

      if (!response.ok) {
        const text = await response.text();
        console.error('❌ Response error:', text);
        throw new Error(`Server error: ${response.status}`);
      }

      const data = await response.json();
      console.log('📥 Response data:', data);

      if (data.success) {
        setResult(data.preview);
        alert(`✅ Preview berhasil! ${data.preview.totalRows} baris ditemukan.`);
        onImportSuccess();
      } else {
        setError(data.error || 'Gagal preview');
      }
    } catch (err: any) {
      console.error('❌ Error:', err);
      setError(err.message || 'Gagal upload file');
    } finally {
      setLoading(false);
    }
  };

  const handleDownloadTemplate = () => {
    const blob = generateTemplateExcel();
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'template_jurnal.xlsx';
    a.click();
    URL.revokeObjectURL(url);
  };

  const resetModal = () => {
    setFile(null);
    setError(null);
    setResult(null);
    setLoading(false);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleClose = () => {
    resetModal();
    onClose();
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        className="bg-surface rounded-xl w-full max-w-md p-6"
      >
        <div className="flex justify-between items-center mb-4">
          <h2 className="font-display text-xl font-bold text-text">Import Jurnal dari Excel</h2>
          <button onClick={handleClose} className="text-text-muted hover:text-text">
            <X className="w-5 h-5" />
          </button>
        </div>

        {error && (
          <div className="bg-red-50 border border-red-200 text-red-700 p-3 rounded-lg mb-4 text-sm">
            ❌ {error}
          </div>
        )}

        <div className="space-y-4">
          <div className="bg-background rounded-lg p-6 text-center border-2 border-dashed border-border">
            <input
              ref={fileInputRef}
              type="file"
              accept=".xlsx,.xls,.csv"
              onChange={handleFileChange}
              className="hidden"
              id="file-upload-simple"
            />
            <label htmlFor="file-upload-simple" className="cursor-pointer flex flex-col items-center">
              <FileSpreadsheet className="w-12 h-12 text-text-muted mb-3" />
              <p className="text-text font-medium">Klik untuk pilih file Excel</p>
              <p className="text-text-muted text-sm mt-1">.xlsx, .xls, atau .csv</p>
            </label>
            {file && (
              <div className="mt-3 text-sm text-text">
                📄 {file.name} ({(file.size / 1024).toFixed(0)} KB)
              </div>
            )}
          </div>

          <div className="flex justify-between items-center gap-3">
            <button
              onClick={handleDownloadTemplate}
              className="flex items-center gap-2 px-4 py-2 border border-border rounded-lg hover:bg-background transition-colors text-sm"
            >
              <Download className="w-4 h-4" />
              Template
            </button>
            <button
              onClick={handleUpload}
              disabled={!file || loading}
              className="px-6 py-2.5 bg-accent text-white rounded-lg hover:bg-accent-hover transition-colors disabled:opacity-50 flex items-center gap-2"
            >
              {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Upload & Preview'}
            </button>
          </div>
        </div>
      </motion.div>
    </div>
  );
}
