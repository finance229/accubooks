import { useState, useEffect } from 'react';
import { FileText, Upload, Search, Filter, Trash2, Eye, Download, X } from 'lucide-react';
import { motion } from 'framer-motion';
import { supabase } from '../lib/supabase';
import { useCompany } from '../contexts/CompanyContext';
import { useAuth } from '../contexts/AuthContext';
import { uploadToGoogleDrive } from '../lib/googleDrive';
import { useNavigate } from 'react-router-dom';

type Document = {
  id: string;
  name: string;
  file_id: string;
  file_url: string;
  type: string;
  created_at: string;
  reference_type: string | null;
  reference_id: number | null;
  reference_number: string | null;
};

export default function Documents() {
  const navigate = useNavigate();
  const { currentCompany } = useCompany();
  const { user } = useAuth();
  const [documents, setDocuments] = useState<Document[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterType, setFilterType] = useState('all');
  const [showUpload, setShowUpload] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [selectedType, setSelectedType] = useState<'invoice' | 'ap' | 'payment_request' | 'other'>('other');

  useEffect(() => {
    if (currentCompany?.id) {
      fetchDocuments();
    }
  }, [currentCompany]);

  const fetchDocuments = async () => {
    if (!currentCompany?.id) return;
    setLoading(true);
    const { data } = await supabase
      .from('documents')
      .select('*')
      .eq('company_id', currentCompany.id)
      .order('created_at', { ascending: false });
    setDocuments(data || []);
    setLoading(false);
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) setSelectedFile(file);
  };

  const handleUpload = async () => {
    if (!selectedFile) return;
    if (!currentCompany?.id) return;

    setUploading(true);
    try {
      const result = await uploadToGoogleDrive(selectedFile, selectedType);

      if (result.success) {
        const { data, error } = await supabase
          .from('documents')
          .insert([{
            company_id: currentCompany.id,
            name: selectedFile.name,
            type: selectedType,
            file_id: result.fileId,
            file_url: result.fileUrl,
            mime_type: selectedFile.type,
            size_bytes: selectedFile.size,
          }])
          .select();

        if (!error && data) {
          setDocuments([data[0], ...documents]);
          setShowUpload(false);
          setSelectedFile(null);
        }
      } else {
        alert('Gagal upload: ' + (result.error || 'Unknown error'));
      }
    } catch (error) {
      console.error('Upload error:', error);
      alert('Gagal upload file');
    } finally {
      setUploading(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (confirm('Yakin ingin menghapus dokumen ini?')) {
      const { error } = await supabase
        .from('documents')
        .delete()
        .eq('id', id);
      if (!error) {
        setDocuments(documents.filter(d => d.id !== id));
      }
    }
  };

  const getReferenceLink = (doc: Document) => {
    if (!doc.reference_type || !doc.reference_id) return null;

    const routes: Record<string, string> = {
      'invoice': '/invoices',
      'ap': '/purchase-invoices',
      'payment_request': '/payment-requests',
    };

    const basePath = routes[doc.reference_type];
    if (!basePath) return null;

    return {
      path: `${basePath}/${doc.reference_id}`,
      label: doc.reference_number || `#${doc.reference_id}`,
      typeLabel: doc.reference_type === 'invoice' ? 'Invoice' :
                 doc.reference_type === 'ap' ? 'Account Payable' :
                 'Payment Request'
    };
  };

  const getTypeLabel = (type: string) => {
    const labels: Record<string, string> = {
      invoice: 'Invoice AR',
      ap: 'Account Payable',
      payment_request: 'Payment Request',
      other: 'Lainnya',
    };
    return labels[type] || type;
  };

  const getTypeColor = (type: string) => {
    const colors: Record<string, string> = {
      invoice: 'bg-green-100 text-green-800',
      ap: 'bg-blue-100 text-blue-800',
      payment_request: 'bg-purple-100 text-purple-800',
      other: 'bg-gray-100 text-gray-800',
    };
    return colors[type] || 'bg-gray-100 text-gray-800';
  };

  const filteredDocuments = documents.filter(doc => {
    const matchesSearch = doc.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         (doc.reference_number && doc.reference_number.toLowerCase().includes(searchTerm.toLowerCase()));
    const matchesFilter = filterType === 'all' || doc.type === filterType;
    return matchesSearch && matchesFilter;
  });

  const formatDate = (date: string) => {
    return new Date(date).toLocaleDateString('id-ID', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
    });
  };

  const stats = {
    total: documents.length,
    invoices: documents.filter(d => d.type === 'invoice').length,
    ap: documents.filter(d => d.type === 'ap').length,
    paymentRequests: documents.filter(d => d.type === 'payment_request').length,
  };

  const documentTypes = [
    { value: 'all', label: 'Semua' },
    { value: 'invoice', label: 'Invoice AR', color: 'green' },
    { value: 'ap', label: 'Account Payable', color: 'blue' },
    { value: 'payment_request', label: 'Payment Request', color: 'purple' },
    { value: 'other', label: 'Lainnya', color: 'gray' },
  ];

  if (!currentCompany) {
    return <div className="flex justify-center py-12">Loading...</div>;
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between animate-slide-in-up">
        <div>
          <h1 className="font-display text-3xl font-bold text-text">Dokumen</h1>
          <p className="text-text-muted mt-1">Kelola semua dokumen dan bukti transaksi</p>
        </div>
        <button
          onClick={() => setShowUpload(!showUpload)}
          className="flex items-center gap-2 px-4 py-2.5 bg-accent hover:bg-accent-hover text-white rounded-lg font-medium transition-colors shadow-lg shadow-accent/30"
        >
          <Upload className="w-5 h-5" strokeWidth={2} />
          Upload Dokumen
        </button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
        {[
          { label: 'Total Dokumen', value: stats.total, icon: FileText, color: 'blue' },
          { label: 'Invoice AR', value: stats.invoices, icon: FileText, color: 'green' },
          { label: 'Account Payable', value: stats.ap, icon: FileText, color: 'purple' },
          { label: 'Payment Request', value: stats.paymentRequests, icon: FileText, color: 'orange' },
        ].map((stat, index) => (
          <motion.div
            key={stat.label}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: index * 0.1 }}
            className="bg-surface rounded-xl border border-border p-6"
          >
            <div className="flex items-center justify-between">
              <div>
                <p className="text-text-muted text-sm font-medium">{stat.label}</p>
                <p className="text-text text-2xl font-bold font-display mt-1">{stat.value}</p>
              </div>
              <div className={`w-12 h-12 rounded-lg bg-${stat.color}-500/10 flex items-center justify-center`}>
                <stat.icon className={`w-6 h-6 text-${stat.color}-500`} strokeWidth={2} />
              </div>
            </div>
          </motion.div>
        ))}
      </div>

      {/* Upload Form */}
      {showUpload && (
        <motion.div
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-surface rounded-xl border border-border p-6"
        >
          <h2 className="font-display text-xl font-bold text-text mb-4">Upload Dokumen Baru</h2>

          <div className="mb-6">
            <label className="block text-sm font-medium text-text mb-3">Tipe Dokumen</label>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              {documentTypes.filter(t => t.value !== 'all').map((type) => (
                <button
                  key={type.value}
                  onClick={() => setSelectedType(type.value as any)}
                  className={`p-4 rounded-lg border-2 transition-all ${
                    selectedType === type.value
                      ? 'border-accent bg-accent/5'
                      : 'border-border hover:border-accent/50'
                  }`}
                >
                  <p className="text-sm font-medium text-text">{type.label}</p>
                </button>
              ))}
            </div>
          </div>

          <div className="border-2 border-dashed border-border rounded-lg p-8 text-center">
            <input
              type="file"
              accept=".pdf,.jpg,.jpeg,.png"
              onChange={handleFileSelect}
              className="hidden"
              id="file-upload"
            />
            <label htmlFor="file-upload" className="cursor-pointer flex flex-col items-center">
              <Upload className="w-12 h-12 text-text-muted mb-3" />
              <span className="text-text font-medium">Klik untuk pilih file</span>
              <span className="text-text-muted text-sm mt-1">PDF, JPG, PNG (max 10MB)</span>
            </label>
            {selectedFile && (
              <div className="mt-4 p-3 bg-background rounded-lg">
                <p className="text-sm text-text">{selectedFile.name}</p>
                <p className="text-xs text-text-muted">{(selectedFile.size / 1024 / 1024).toFixed(2)} MB</p>
              </div>
            )}
          </div>

          <div className="flex justify-end gap-3 mt-6">
            <button
              onClick={() => { setShowUpload(false); setSelectedFile(null); }}
              className="px-4 py-2 border border-border rounded-lg"
            >
              Batal
            </button>
            <button
              onClick={handleUpload}
              disabled={!selectedFile || uploading}
              className="px-4 py-2 bg-accent text-white rounded-lg disabled:opacity-50"
            >
              {uploading ? 'Uploading...' : 'Upload'}
            </button>
          </div>
        </motion.div>
      )}

      {/* Search & Filter */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.3 }}
        className="bg-surface rounded-xl border border-border p-6"
      >
        <div className="flex flex-col md:flex-row gap-4">
          <div className="flex-1 relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-text-muted" />
            <input
              type="text"
              placeholder="Cari dokumen atau nomor referensi..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-10 pr-4 py-2.5 border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-accent focus:border-transparent"
            />
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <Filter className="w-5 h-5 text-text-muted" />
            {documentTypes.map((type) => (
              <button
                key={type.value}
                onClick={() => setFilterType(type.value)}
                className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                  filterType === type.value
                    ? 'bg-accent text-white'
                    : 'border border-border hover:bg-background'
                }`}
              >
                {type.label}
              </button>
            ))}
          </div>
        </div>
      </motion.div>

      {/* Table */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.4 }}
        className="bg-surface rounded-xl border border-border overflow-hidden"
      >
        {loading ? (
          <div className="text-center py-12 text-text-muted">Loading...</div>
        ) : filteredDocuments.length === 0 ? (
          <div className="text-center py-12 text-text-muted">
            <FileText className="w-12 h-12 mx-auto mb-3 opacity-50" />
            <p>Belum ada dokumen</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-background">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-semibold text-text-muted uppercase">Nama Dokumen</th>
                  <th className="px-6 py-3 text-left text-xs font-semibold text-text-muted uppercase">Tipe</th>
                  <th className="px-6 py-3 text-left text-xs font-semibold text-text-muted uppercase">Referensi</th>
                  <th className="px-6 py-3 text-left text-xs font-semibold text-text-muted uppercase">Tanggal Upload</th>
                  <th className="px-6 py-3 text-center text-xs font-semibold text-text-muted uppercase">Aksi</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {filteredDocuments.map((doc) => {
                  const ref = getReferenceLink(doc);
                  return (
                    <tr key={doc.id} className="hover:bg-background transition-colors">
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-3">
                          <div className="w-10 h-10 rounded-lg bg-accent/10 flex items-center justify-center">
                            <FileText className="w-5 h-5 text-accent" />
                          </div>
                          <span className="text-sm font-medium text-text">{doc.name}</span>
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <span className={`inline-flex px-2.5 py-1 rounded-full text-xs font-medium ${getTypeColor(doc.type)}`}>
                          {getTypeLabel(doc.type)}
                        </span>
                      </td>
                      <td className="px-6 py-4">
                        {ref ? (
                          <button
                            onClick={() => navigate(ref.path)}
                            className="text-sm text-blue-600 hover:underline flex items-center gap-1"
                          >
                            <FileText className="w-3 h-3" />
                            {ref.label}
                            <span className="text-xs text-text-muted ml-1">({ref.typeLabel})</span>
                          </button>
                        ) : (
                          <span className="text-sm text-text-muted">-</span>
                        )}
                      </td>
                      <td className="px-6 py-4 text-sm text-text-muted">
                        {formatDate(doc.created_at)}
                      </td>
                      <td className="px-6 py-4">
                        <div className="flex items-center justify-center gap-2">
                          <button
                            onClick={() => window.open(doc.file_url, '_blank')}
                            className="p-2 text-text-muted hover:text-info hover:bg-info/10 rounded-lg transition-colors"
                            title="Lihat"
                          >
                            <Eye className="w-4 h-4" />
                          </button>
                          <a
                            href={doc.file_url}
                            download
                            className="p-2 text-text-muted hover:text-success hover:bg-success/10 rounded-lg transition-colors"
                            title="Download"
                          >
                            <Download className="w-4 h-4" />
                          </a>
                          <button
                            onClick={() => handleDelete(doc.id)}
                            className="p-2 text-text-muted hover:text-danger hover:bg-danger/10 rounded-lg transition-colors"
                            title="Hapus"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </motion.div>
    </div>
  );
}
