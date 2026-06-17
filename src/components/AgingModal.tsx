import { X, Clock, AlertTriangle, CheckCircle } from 'lucide-react';

type AgingItem = {
  customer: string;
  invoice: string;
  dueDate: string;
  remaining: number;
  agingCategory: string;
  diffDays: number;
};

type AgingModalProps = {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  data: Record<string, { count: number; total: number; items: AgingItem[] }>;
  type: 'AR' | 'AP';
};

export default function AgingModal({ isOpen, onClose, title, data, type }: AgingModalProps) {
  if (!isOpen) return null;

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('id-ID', {
      style: 'currency',
      currency: 'IDR',
      minimumFractionDigits: 0,
    }).format(amount);
  };

  const formatDate = (date: string) => {
    return new Date(date).toLocaleDateString('id-ID', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
    });
  };

  const totalAging = Object.values(data).reduce((sum, cat) => sum + cat.total, 0);

  const getStatusColor = (category: string) => {
    switch (category) {
      case 'Belum Jatuh Tempo': return 'text-green-600 bg-green-50';
      case '1-30 Hari': return 'text-yellow-600 bg-yellow-50';
      case '31-60 Hari': return 'text-orange-600 bg-orange-50';
      case '61-90 Hari': return 'text-red-500 bg-red-50';
      case '> 90 Hari': return 'text-red-700 bg-red-100';
      default: return 'text-gray-600 bg-gray-50';
    }
  };

  const getStatusIcon = (category: string) => {
    switch (category) {
      case 'Belum Jatuh Tempo': return <CheckCircle className="w-4 h-4 text-green-600" />;
      case '1-30 Hari': return <Clock className="w-4 h-4 text-yellow-600" />;
      case '31-60 Hari': return <Clock className="w-4 h-4 text-orange-600" />;
      case '61-90 Hari': return <AlertTriangle className="w-4 h-4 text-red-500" />;
      case '> 90 Hari': return <AlertTriangle className="w-4 h-4 text-red-700" />;
      default: return <Clock className="w-4 h-4 text-gray-600" />;
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-surface rounded-xl w-full max-w-4xl max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-border">
          <div>
            <h2 className="font-display text-2xl font-bold text-text">{title}</h2>
            <p className="text-sm text-text-muted">
              Total {type === 'AR' ? 'Piutang' : 'Hutang'}: {formatCurrency(totalAging)}
            </p>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-background rounded-lg">
            <X className="w-6 h-6 text-text-muted" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6">
          {Object.keys(data).length === 0 || Object.values(data).every(cat => cat.count === 0) ? (
            <div className="text-center py-12 text-text-muted">
              <CheckCircle className="w-12 h-12 mx-auto mb-3 text-success opacity-50" />
              <p>Tidak ada {type === 'AR' ? 'piutang' : 'hutang'} yang outstanding</p>
            </div>
          ) : (
            <div className="space-y-6">
              {Object.entries(data).map(([category, categoryData]) => {
                if (categoryData.count === 0) return null;
                
                return (
                  <div key={category} className="border border-border rounded-lg overflow-hidden">
                    <div className={`px-4 py-3 flex justify-between items-center ${getStatusColor(category)}`}>
                      <div className="flex items-center gap-2">
                        {getStatusIcon(category)}
                        <span className="font-semibold">{category}</span>
                        <span className="text-sm text-text-muted">({categoryData.count} item)</span>
                      </div>
                      <span className="font-bold">{formatCurrency(categoryData.total)}</span>
                    </div>
                    <div className="overflow-x-auto">
                      <table className="w-full">
                        <thead className="bg-background">
                          <tr>
                            <th className="px-4 py-2 text-left text-xs text-text-muted">
                              {type === 'AR' ? 'Customer' : 'Vendor'}
                            </th>
                            <th className="px-4 py-2 text-left text-xs text-text-muted">No. Invoice</th>
                            <th className="px-4 py-2 text-left text-xs text-text-muted">Jatuh Tempo</th>
                            <th className="px-4 py-2 text-right text-xs text-text-muted">Sisa</th>
                            <th className="px-4 py-2 text-center text-xs text-text-muted">Hari</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-border">
                          {categoryData.items.map((item, idx) => (
                            <tr key={idx} className="hover:bg-background transition-colors">
                              <td className="px-4 py-3 text-sm text-text">
                                {type === 'AR' ? item.customer : item.vendor}
                              </td>
                              <td className="px-4 py-3 text-sm font-mono text-text">{item.invoice}</td>
                              <td className="px-4 py-3 text-sm text-text">{formatDate(item.dueDate)}</td>
                              <td className="px-4 py-3 text-right font-mono font-semibold text-text">
                                {formatCurrency(item.remaining)}
                              </td>
                              <td className={`px-4 py-3 text-center text-sm font-mono ${
                                item.diffDays > 0 ? 'text-danger font-bold' : 'text-text-muted'
                              }`}>
                                {item.diffDays > 0 ? `+${item.diffDays}` : item.diffDays}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-6 border-t border-border flex justify-end gap-3">
          <button onClick={onClose} className="px-4 py-2 border border-border rounded-lg hover:bg-background">
            Tutup
          </button>
        </div>
      </div>
    </div>
  );
}
