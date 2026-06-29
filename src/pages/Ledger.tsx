import { useState, useEffect } from 'react';
import { Search, Calendar, Download, Printer, Loader2, ChevronLeft, ChevronRight } from 'lucide-react';
import { motion } from 'framer-motion';
import { supabase } from '../lib/supabase';
import { useCompany } from '../contexts/CompanyContext';
import { formatCurrency } from '../lib/accountingHelpers';

type LedgerEntry = {
  id: number;
  date: string;
  description: string;
  ref: string;
  debit: number;
  credit: number;
  balance: number;
};

type Account = {
  id: number;
  code: string;
  name: string;
  type: string;
  normal_balance: string;
};

export default function Ledger() {
  const { currentCompany } = useCompany();
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [selectedAccount, setSelectedAccount] = useState<Account | null>(null);
  const [ledgerData, setLedgerData] = useState<LedgerEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [startDate, setStartDate] = useState(() => {
    const date = new Date();
    date.setMonth(date.getMonth() - 1);
    return date.toISOString().split('T')[0];
  });
  const [endDate, setEndDate] = useState(new Date().toISOString().split('T')[0]);

  useEffect(() => {
    if (currentCompany?.id) {
      fetchAccounts();
    }
  }, [currentCompany]);

  useEffect(() => {
    if (selectedAccount && currentCompany?.id) {
      fetchLedgerData();
    }
  }, [selectedAccount, startDate, endDate]);

  const fetchAccounts = async () => {
    if (!currentCompany?.id) return;
    
    const { data, error } = await supabase
      .from('coa')
      .select('id, code, name, type')
      .eq('company_id', currentCompany.id)
      .eq('is_active', true)
      .order('code', { ascending: true });
    
    if (error) {
      console.error('Error fetching accounts:', error);
    } else if (data && data.length > 0) {
      setAccounts(data);
      setSelectedAccount(data[0]);
    }
    setLoading(false);
  };

 const fetchLedgerData = async () => {
  if (!selectedAccount || !currentCompany?.id) return;
  
  setLoading(true);
  
  try {
    // Ambil semua jurnal lines untuk akun yang dipilih
    const { data: journalLines, error } = await supabase
      .from('journal_lines')
      .select(`
        id,
        debit,
        credit,
        journal_id
      `)
      .eq('coa_id', selectedAccount.id);

    if (error) {
      console.error('Error fetching journal lines:', error);
      setLedgerData([]);
      setLoading(false);
      return;
    }

    if (!journalLines || journalLines.length === 0) {
      console.log('Tidak ada journal lines untuk akun ini');
      setLedgerData([]);
      setLoading(false);
      return;
    }

    // Ambil data journals
    const journalIds = journalLines.map(jl => jl.journal_id);
    const { data: journals, error: journalsError } = await supabase
      .from('journals')
      .select('id, journal_number, journal_date, description, status')
      .in('id', journalIds)
      .eq('status', 'posted')
      .gte('journal_date', startDate)
      .lte('journal_date', endDate)
      .order('journal_date', { ascending: true });

    if (journalsError) {
      console.error('Error fetching journals:', journalsError);
      setLedgerData([]);
      setLoading(false);
      return;
    }

    const journalMap = new Map();
    journals?.forEach(j => {
      journalMap.set(j.id, j);
    });

    // 🔥 HITUNG SALDO AWAL DENGAN NORMAL BALANCE
    const { data: openingLines } = await supabase
      .from('journal_lines')
      .select('debit, credit, journal_id')
      .eq('coa_id', selectedAccount.id);

    let openingBalance = 0;
    if (openingLines && openingLines.length > 0) {
      const openingJournalIds = [...new Set(openingLines.map(jl => jl.journal_id))];
      const { data: openingJournals } = await supabase
        .from('journals')
        .select('id, journal_date')
        .in('id', openingJournalIds)
        .lt('journal_date', startDate);

      const openingJournalIdsSet = new Set(openingJournals?.map(j => j.id) || []);
      
      openingLines.forEach(line => {
        if (openingJournalIdsSet.has(line.journal_id)) {
          // 🔥 UNTUK ASET: Debit - Credit
          // 🔥 UNTUK LIABILITAS & EKUITAS: Credit - Debit
          if (selectedAccount.type === 'asset') {
            openingBalance += (line.debit - line.credit);
          } else if (selectedAccount.type === 'liability' || selectedAccount.type === 'equity') {
            openingBalance += (line.credit - line.debit);
          } else {
            openingBalance += (line.debit - line.credit);
          }
        }
      });
    }

    // Bangun ledger entries
    const entries: LedgerEntry[] = [];
    let runningBalance = openingBalance;

    // Tambah saldo awal
    if (openingBalance !== 0) {
      entries.push({
        id: 0,
        date: startDate,
        description: 'Saldo Awal',
        ref: '-',
        debit: 0,
        credit: 0,
        balance: openingBalance,
      });
    }

    // Tambah transaksi
    journals?.forEach(journal => {
      const lines = journalLines.filter(jl => jl.journal_id === journal.id);
      lines.forEach(line => {
        // 🔥 HITUNG SALDO BERJALAN SESUAI NORMAL BALANCE
        if (selectedAccount.type === 'asset') {
          runningBalance += (line.debit - line.credit);
        } else if (selectedAccount.type === 'liability' || selectedAccount.type === 'equity') {
          runningBalance += (line.credit - line.debit);
        } else {
          runningBalance += (line.debit - line.credit);
        }
        
        entries.push({
          id: line.id,
          date: journal.journal_date,
          description: journal.description,
          ref: journal.journal_number,
          debit: line.debit,
          credit: line.credit,
          balance: runningBalance,
        });
      });
    });

    setLedgerData(entries);
  } catch (error) {
    console.error('Error:', error);
  } finally {
    setLoading(false);
  }
};

  const totalDebit = ledgerData.reduce((sum, item) => sum + item.debit, 0);
  const totalCredit = ledgerData.reduce((sum, item) => sum + item.credit, 0);
  const endingBalance = ledgerData[ledgerData.length - 1]?.balance || 0;

  const handlePrint = () => window.print();
  
  const handleExportCSV = () => {
    const rows = [
      ['BUKU BESAR'],
      [`Akun: ${selectedAccount?.code} - ${selectedAccount?.name}`],
      [`Periode: ${formatDate(startDate)} s/d ${formatDate(endDate)}`],
      [''],
      ['Tanggal', 'Deskripsi', 'Ref', 'Debit', 'Kredit', 'Saldo'],
      ...ledgerData.map(item => [
        item.date,
        item.description,
        item.ref,
        item.debit,
        item.credit,
        item.balance,
      ]),
    ];
    
    const csvContent = rows.map(row => row.join(',')).join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `buku_besar_${selectedAccount?.code}_${startDate}_to_${endDate}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const formatDate = (date: string) => {
    return new Date(date).toLocaleDateString('id-ID', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
    });
  };

  const getAccountTypeIcon = (type: string) => {
    switch (type) {
      case 'asset': return '💰';
      case 'liability': return '📝';
      case 'equity': return '🏦';
      case 'revenue': return '📈';
      case 'expense': return '📉';
      default: return '📊';
    }
  };

  if (!currentCompany) {
    return <div className="flex justify-center py-12">Loading...</div>;
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="animate-slide-in-up">
        <h1 className="font-display text-3xl font-bold text-text">Buku Besar</h1>
        <p className="text-text-muted mt-1">Lihat mutasi dan saldo per akun dalam rentang tanggal tertentu</p>
      </div>

      {/* Filters */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.1 }}
        className="bg-surface rounded-xl border border-border p-6"
      >
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <div className="md:col-span-2">
            <label className="block text-sm font-medium text-text mb-2">Pilih Akun</label>
            <select
              value={selectedAccount?.id || ''}
              onChange={(e) => {
                const account = accounts.find(a => a.id === parseInt(e.target.value));
                setSelectedAccount(account || null);
              }}
              className="w-full px-4 py-2.5 border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-accent bg-surface"
            >
              {accounts.map((acc) => (
                <option key={acc.id} value={acc.id}>
                  {acc.code} - {acc.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-text mb-2">Dari Tanggal</label>
            <div className="relative">
              <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-text-muted" />
              <input
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className="w-full pl-10 pr-4 py-2.5 border border-border rounded-lg"
              />
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-text mb-2">Sampai Tanggal</label>
            <div className="relative">
              <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-text-muted" />
              <input
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                className="w-full pl-10 pr-4 py-2.5 border border-border rounded-lg"
              />
            </div>
          </div>
        </div>
      </motion.div>

      {/* Ledger Report */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.2 }}
        className="bg-surface rounded-xl border border-border overflow-hidden"
      >
        {/* Header */}
        <div className="p-6 border-b border-border">
          <div className="flex items-center justify-between flex-wrap gap-4">
            <div>
              {selectedAccount && (
                <>
                  <div className="flex items-center gap-2">
                    <span className="text-2xl">{getAccountTypeIcon(selectedAccount.type)}</span>
                    <h2 className="font-display text-xl font-bold text-text">
                      {selectedAccount.code} - {selectedAccount.name}
                    </h2>
                  </div>
                  <p className="text-sm text-text-muted mt-1 capitalize">
                    Tipe Akun: {selectedAccount.type === 'asset' ? 'Aset' : 
                               selectedAccount.type === 'liability' ? 'Kewajiban' :
                               selectedAccount.type === 'equity' ? 'Ekuitas' :
                               selectedAccount.type === 'revenue' ? 'Pendapatan' : 'Beban'}
                  </p>
                </>
              )}
              <p className="text-sm text-text-muted mt-2">
                Periode: {formatDate(startDate)} s/d {formatDate(endDate)}
              </p>
            </div>
            <div className="flex gap-2">
              <button
                onClick={handleExportCSV}
                className="flex items-center gap-2 px-4 py-2 border border-border rounded-lg hover:bg-background transition-colors"
              >
                <Download className="w-4 h-4" />
                Export CSV
              </button>
              <button
                onClick={handlePrint}
                className="flex items-center gap-2 px-4 py-2 border border-border rounded-lg hover:bg-background transition-colors"
              >
                <Printer className="w-4 h-4" />
                Print
              </button>
            </div>
          </div>
        </div>

        {/* Table */}
        {loading ? (
          <div className="flex justify-center py-12">
            <Loader2 className="w-8 h-8 animate-spin text-accent" />
          </div>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-background">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-semibold text-text-muted uppercase">Tanggal</th>
                    <th className="px-6 py-3 text-left text-xs font-semibold text-text-muted uppercase">Deskripsi</th>
                    <th className="px-6 py-3 text-center text-xs font-semibold text-text-muted uppercase">Ref</th>
                    <th className="px-6 py-3 text-right text-xs font-semibold text-text-muted uppercase">Debit</th>
                    <th className="px-6 py-3 text-right text-xs font-semibold text-text-muted uppercase">Kredit</th>
                    <th className="px-6 py-3 text-right text-xs font-semibold text-text-muted uppercase">Saldo</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {ledgerData.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="text-center py-12 text-text-muted">
                        Tidak ada transaksi untuk periode ini
                       </td>
                     </tr>
                  ) : (
                    ledgerData.map((item, index) => (
                      <motion.tr
                        key={index}
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        transition={{ delay: Math.min(index * 0.02, 0.5) }}
                        className={`hover:bg-background transition-colors ${
                          item.description === 'Saldo Awal' ? 'bg-background/50 font-semibold' : ''
                        }`}
                      >
                        <td className="px-6 py-3 whitespace-nowrap text-sm text-text">
                          {formatDate(item.date)}
                        </td>
                        <td className="px-6 py-3 text-sm text-text">
                          {item.description}
                        </td>
                        <td className="px-6 py-3 text-center text-sm text-text-muted">
                          {item.ref}
                        </td>
                        <td className="px-6 py-3 whitespace-nowrap text-right text-sm font-mono text-success">
                          {item.debit > 0 ? formatCurrency(item.debit) : '-'}
                        </td>
                        <td className="px-6 py-3 whitespace-nowrap text-right text-sm font-mono text-danger">
                          {item.credit > 0 ? formatCurrency(item.credit) : '-'}
                        </td>
                        {/* 🔥 SALDO - TAMPILKAN MINUS JIKA NEGATIF */}
                        <td className={`px-6 py-3 whitespace-nowrap text-right text-sm font-mono font-bold ${
                          item.balance < 0 ? 'text-danger' : 'text-info'
                        }`}>
                          {item.balance < 0 ? '- ' : ''}{formatCurrency(Math.abs(item.balance))}
                        </td>
                      </motion.tr>
                    ))
                  )}
                </tbody>
                {ledgerData.length > 0 && (
                  <tfoot className="bg-accent/10 font-bold border-t border-border">
                    <tr>
                      <td colSpan={3} className="px-6 py-4 text-sm text-text">TOTAL</td>
                      <td className="px-6 py-4 text-right text-sm font-mono text-success">
                        {formatCurrency(totalDebit)}
                      </td>
                      <td className="px-6 py-4 text-right text-sm font-mono text-danger">
                        {formatCurrency(totalCredit)}
                      </td>
                      {/* 🔥 ENDING BALANCE - TAMPILKAN MINUS JIKA NEGATIF */}
                      <td className={`px-6 py-4 text-right text-sm font-mono font-bold ${
                        endingBalance < 0 ? 'text-danger' : 'text-info'
                      }`}>
                        {endingBalance < 0 ? '- ' : ''}{formatCurrency(Math.abs(endingBalance))}
                      </td>
                    </tr>
                  </tfoot>
                )}
               </table>
            </div>

            {/* Summary */}
            {ledgerData.length > 0 && (
              <div className="p-6 border-t border-border bg-background">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div>
                    <p className="text-xs text-text-muted mb-1">Total Debit</p>
                    <p className="text-lg font-bold font-mono text-success">{formatCurrency(totalDebit)}</p>
                  </div>
                  <div>
                    <p className="text-xs text-text-muted mb-1">Total Kredit</p>
                    <p className="text-lg font-bold font-mono text-danger">{formatCurrency(totalCredit)}</p>
                  </div>
                  <div>
                    <p className="text-xs text-text-muted mb-1">Saldo Akhir</p>
                    <p className={`text-lg font-bold font-mono ${endingBalance < 0 ? 'text-danger' : 'text-info'}`}>
                      {endingBalance < 0 ? '- ' : ''}{formatCurrency(Math.abs(endingBalance))}
                    </p>
                  </div>
                </div>
              </div>
            )}
          </>
        )}
      </motion.div>

      {/* Info Box */}
      <div className="bg-info/10 border border-info/30 rounded-xl p-6">
        <h3 className="font-semibold text-text mb-2">💡 Informasi Buku Besar</h3>
        <p className="text-sm text-text-muted">
          Buku besar menampilkan semua mutasi transaksi untuk akun yang dipilih dalam periode tertentu.
          Saldo akhir akan berubah sesuai dengan posting jurnal yang telah dilakukan.
        </p>
      </div>
    </div>
  );
}
