import { useState, useRef } from 'react';
import { X, Upload, Download, FileSpreadsheet, CheckCircle, XCircle, AlertCircle, Loader2 } from 'lucide-react';
import { motion } from 'framer-motion';
import { useCompany } from '../contexts/CompanyContext';
import { parseExcelFile, generateTemplateExcel, ImportPreview } from '../lib/excelParser';
import { formatCurrency } from '../lib/accountingHelpers';

type ImportJournalModalProps = {
  isOpen: boolean;
  onClose: () => void;
  onImportSuccess: () => void;
};

export default function ImportJournalModal({ isOpen, onClose, onImportSuccess }: ImportJournalModalProps) {
  const { currentCompany } = useCompany();
  const [step, setStep] = useState<'upload' | 'preview' | 'importing'>('upload');
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<ImportPreview | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [importing, setImporting] = useState(false);
  const [importResult, setImportResult] = useState<{ success: number; failed: number; total: number } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  if (!isOpen) return null;

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const selected = e.target.files?.[0];
    if (!selected) return;
    setFile(selected);
    setError(null);
    setStep('upload');
  };

  const handlePreview = async () => {
    if (!file || !currentCompany?.id) return;
    setStep('preview');
    try {
      const previewData = await parseExcelFile(file, currentCompany.id);
      setPreview(previewData);
    } catch (err: any) {
      setError(err.message || 'Gagal membaca file');
      setStep('upload');
    }
  };

  const handleImport = async () => {
    if (!preview || !currentCompany?.id) return;
    setImporting(true);
    setStep('importing');

    try {
      const validGroups = preview.groups.filter(g => g.valid);

      const response = await fetch('/api/import-journal', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'import',
          groups: validGroups.map(g => ({
            ...g,
            rows: g.rows.map(r => ({
              coaId: r.coaId,
              coaCode: r.coaCode,
              coaName: r.coaName,
              debit: r.debit,
              kredit: r.kredit,
              valid: r.valid,
            })),
          })),
          companyId: currentCompany.id,
        }),
      });

      const result = await response.json();
      if (result.success) {
        setImportResult({
          success: result.summary.success,
          failed: result.summary.failed,
          total: result.summary.total,
        });
        onImportSuccess();
      } else {
        setError(result.error || 'Gagal import');
      }
    } catch (err: any) {
      setError(err.message || 'Gagal import');
    } finally {
      setImporting(false);
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
    setStep('upload');
    setFile(null);
    setPreview(null);
    setError(null);
    setImportResult(null);
    setImporting(false);
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
        className="bg-surface rounded-xl w-full max-w-4xl max-h-[90vh] flex flex-col"
      >
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-border">
          <div>
            <h2 className="font-display text-xl font-bold text-text">Import Jurnal dari Excel</h2>
            <p className="text-sm text-text-muted">Upload file Excel dengan format yang sesuai</p>
          </div>
          <button onClick={handleClose} className="p-2 hover:bg-background rounded-lg text-text-muted">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6">
          {error && (
            <div className="bg-danger/10 border border-danger/30 text-danger p-4 rounded-lg mb-4 flex items-start gap-3">
              <AlertCircle className="w-5 h-5 flex-shrink-0 mt-0.5" />
              <div>
                <p className="font-medium">Error</p>
                <p className="text-sm">{error}</p>
              </div>
            </div>
          )}

          {step === 'upload' && (
            <div className="space-y-6">
              <div className="bg-background rounded-lg p-8 text-center border-2 border-dashed border-border">
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".xlsx,.xls,.csv"
                  onChange={handleFileChange}
                  className="hidden"
                  id="file-upload"
                />
                <label htmlFor="file-upload" className="cursor-pointer flex flex-col items-center">
                  <FileSpreadsheet className="w-12 h-12 text-text-muted mb-3" />
                  <p className="text-text font-medium">Klik untuk pilih file Excel</p>
                  <p className="text-text-muted text-sm mt-1">.xlsx, .xls, atau .csv</p>
                </label>
                {file && (
                  <div className="mt-4 p-3 bg-surface rounded-lg border border-border inline-flex items-center gap-3">
                    <FileSpreadsheet className="w-5 h-5 text-accent" />
                    <span className="text-sm font-medium">{file.name}</span>
                    <span className="text-xs text-text-muted">({(file.size / 1024).toFixed(0)} KB)</span>
                  </div>
                )}
              </div>

              <div className="flex justify-between items-center">
                <button
                  onClick={handleDownloadTemplate}
                  className="flex items-center gap-2 px-4 py-2 border border-border rounded-lg hover:bg-background transition-colors"
                >
                  <Download className="w-4 h-4" />
                  Download Template
                </button>
                <button
                  onClick={handlePreview}
                  disabled={!file}
                  className="px-6 py-2.5 bg-accent text-white rounded-lg hover:bg-accent-hover transition-colors disabled:opacity-50"
                >
                  Preview & Validasi
                </button>
              </div>
            </div>
          )}

          {step === 'preview' && preview && (
            <div className="space-y-6">
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div className="bg-surface border border-border rounded-lg p-4">
                  <p className="text-text-muted text-xs">Total Baris</p>
                  <p className="text-2xl font-bold">{preview.totalRows}</p>
                </div>
                <div className="bg-surface border border-border rounded-lg p-4">
                  <p className="text-text-muted text-xs">Baris Valid</p>
                  <p className="text-2xl font-bold text-success">{preview.validRows}</p>
                </div>
                <div className="bg-surface border border-border rounded-lg p-4">
                  <p className="text-text-muted text-xs">Baris Error</p>
                  <p className="text-2xl font-bold text-danger">{preview.errorRows}</p>
                </div>
                <div className="bg-surface border border-border rounded-lg p-4">
                  <p className="text-text-muted text-xs">Jurnal Valid</p>
                  <p className="text-2xl font-bold text-info">{preview.validGroups}</p>
                </div>
              </div>

              <div className="border border-border rounded-lg overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead className="bg-background">
                      <tr>
                        <th className="px-4 py-2 text-left text-xs font-semibold text-text-muted uppercase">#</th>
                        <th className="px-4 py-2 text-left text-xs font-semibold text-text-muted uppercase">Tanggal</th>
                        <th className="px-4 py-2 text-left text-xs font-semibold text-text-muted uppercase">KETERANGAN</th>
                        <th className="px-4 py-2 text-right text-xs font-semibold text-text-muted uppercase">Total Debit</th>
                        <th className="px-4 py-2 text-right text-xs font-semibold text-text-muted uppercase">Total Kredit</th>
                        <th className="px-4 py-2 text-center text-xs font-semibold text-text-muted uppercase">Status</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border">
                      {preview.groups.map((group, idx) => (
                        <tr key={idx} className="hover:bg-background transition-colors">
                          <td className="px-4 py-2 text-sm">{idx + 1}</td>
                          <td className="px-4 py-2 text-sm">{group.tanggal}</td>
                          <td className="px-4 py-2 text-sm">{group.keterangan}</td>
                          <td className="px-4 py-2 text-right font-mono">{formatCurrency(group.totalDebit)}</td>
                          <td className="px-4 py-2 text-right font-mono">{formatCurrency(group.totalCredit)}</td>
                          <td className="px-4 py-2 text-center">
                            {group.valid ? (
                              <CheckCircle className="w-5 h-5 text-success inline" />
                            ) : (
                              <XCircle className="w-5 h-5 text-danger inline" />
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                {preview.errorGroups > 0 && (
                  <div className="p-4 bg-danger/5 border-t border-border text-sm text-danger">
                    ⚠️ {preview.errorGroups} jurnal tidak valid (total debit ≠ kredit atau ada baris error). Jurnal yang valid akan diimport.
                  </div>
                )}
              </div>

              <div className="flex justify-end gap-3">
                <button
                  onClick={() => setStep('upload')}
                  className="px-4 py-2 border border-border rounded-lg hover:bg-background"
                >
                  Kembali
                </button>
                <button
                  onClick={handleImport}
                  disabled={preview.validGroups === 0}
                  className="px-6 py-2.5 bg-accent text-white rounded-lg hover:bg-accent-hover transition-colors disabled:opacity-50"
                >
                  Import {preview.validGroups} Jurnal
                </button>
              </div>
            </div>
          )}

          {step === 'importing' && (
            <div className="text-center py-12">
              {importing ? (
                <>
                  <Loader2 className="w-12 h-12 animate-spin text-accent mx-auto mb-4" />
                  <p className="text-text font-medium">Sedang mengimport jurnal...</p>
                  <p className="text-text-muted text-sm">Mohon tunggu sebentar</p>
                </>
              ) : importResult ? (
                <>
                  <div className="w-16 h-16 rounded-full bg-success/10 flex items-center justify-center mx-auto mb-4">
                    <CheckCircle className="w-8 h-8 text-success" />
                  </div>
                  <p className="text-text font-medium text-lg">Import Selesai!</p>
                  <p className="text-text-muted">
                    Berhasil: <span className="text-success font-bold">{importResult.success}</span> &nbsp;|&nbsp;
                    Gagal: <span className="text-danger font-bold">{importResult.failed}</span> &nbsp;|&nbsp;
                    Total: <span className="font-bold">{importResult.total}</span>
                  </p>
                  <button
                    onClick={handleClose}
                    className="mt-6 px-6 py-2.5 bg-accent text-white rounded-lg hover:bg-accent-hover"
                  >
                    Tutup
                  </button>
                </>
              ) : null}
            </div>
          )}
        </div>
      </motion.div>
    </div>
  );
}
