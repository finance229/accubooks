import { useState, useEffect } from 'react';
import { Search, Calendar, Download, Printer, Loader2 } from 'lucide-react';
import { motion } from 'framer-motion';
import { supabase } from '../lib/supabase';
import { useCompany } from '../contexts/CompanyContext';
import { useAuth } from '../contexts/AuthContext';

type LedgerEntry = {
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
  suffix: string;
  name: string;
  type: string;
};

export default function Ledger() {
  const { currentCompany } = useCompany();
  const { user } = useAuth();
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
  }, [selectedAccount, startDate, endDate, currentCompany]);

  const fetchAccounts = async () => {
    if (!currentCompany?.id) return;
    
    const { data } = await supabase
      .from('coa')
      .select('id, code, suffix, name, type')
      .eq('company_id', currentCompany.id)
      .eq('is_active', true)
      .order('code', { ascending: true });
    
    if (data && data.length > 0) {
      setAccounts(data);
      setSelectedAccount(data[0]);
    }
    setLoading(false);
  };

  const fetchLedgerData = async () => {
    if (!selectedAccount || !currentCompany?.id) return;
    
    setLoading(true);
    
    const { data: journalLines } = await supabase
      .from('journal_lines')
      .select(`
        *,
        journals!inner (
          journal_number,
          journal_date,
          description,
          status
        )
      `)
      .eq('coa_id', selectedAccount.id)
      .gte('journals.journal_date', startDate)
      .lte('journals.journal_date', endDate)
      .eq('journals.status', 'posted')
      .order('journals.journal_date', { ascending: true });
    
    if (journalLines) {
      let runningBalance = 0;
      const entries: LedgerEntry[] = [];
      
      const { data: allPreviousLines } = await supabase
        .from('journal_lines')
        .select(`
          *,
          journals!inner (
            journal_date
          )
        `)
        .eq('coa_id', selectedAccount.id)
        .lt('journals.journal_date', startDate)
        .eq('journals.status', 'posted');
      
      let openingBalance = 0;
      if (allPreviousLines) {
        openingBalance = allPreviousLines.reduce((sum, line) => {
          return sum + (line.debit - line.credit);
        }, 0);
      }
      
      runningBalance = openingBalance;
      
      if (openingBalance !== 0) {
        entries.push({
          date: startDate,
          description: 'Saldo Awal',
          ref: '-',
          debit: 0,
          credit: 0,
          balance: openingBalance,
        });
      }
      
      journalLines.forEach(line => {
        runningBalance = runningBalance + (line.debit - line.credit);
        entries.push({
          date: line.journals.journal_date,
          description: line.journals.description,
          ref: line.journals.journal_number,
          debit: line.debit,
          credit: line.credit,
          balance: runningBalance,
        });
      });
      
      setLedgerData(entries);
    }
    
    setLoading(false);
  };

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('id-ID', {
      style: 'currency',
      currency: 'IDR',
      minimumFractionDigits: 0,
    }).format(Math.abs(amount));
  };

  const formatDate = (date: string) => {
    return new Date(date).toLocaleDateString('id-ID', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
    });
  };

  const totalDebit = ledgerData.reduce((sum, item) => sum + item.debit, 0);
  const totalCredit = ledgerData.reduce((sum, item) => sum + item.credit, 0);
  const endingBalance = ledgerData[ledgerData.length - 1]?.balance || 0;

  const handlePrint = () => window.print();
  
  const handleExport = () => {
    const csvContent = [['Tanggal', 'Deskripsi', 'Ref', 'Debit', 'Kredit', 'Saldo'], ...ledgerData.map(item => [item.date, item.description, item.ref, item.debit, item.credit, item.balance])].map(row => row.join(',')).join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `ledger_${selectedAccount?.code}_${startDate}_to_${endDate}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const getAccountTypeColor = (type: string) => {
    const colors: Record<string, string> = { asset: 'text-blue-600', liability: 'text-red-600', equity: 'text-purple-600', revenue: 'text-green-600', expense: 'text-orange-600' };
    return colors[type] || 'text-gray-600';
  };

  if (!currentCompany) {
    return <div className="flex justify-center py-12">Loading...</div>;
  }

  return (
    <div className="space-y-6">
      <div className="animate-slide-in-up">
        <h1 className="font-display text-3xl font-bold text-text">Buku Besar</h1>
        <p className="text-text-muted mt-1">Lihat mutasi dan saldo per akun dalam rentang tanggal tertentu</p>
      </div>

      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }} className="bg-surface rounded-xl border border-border p-6">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <div className="md:col-span-2">
            <label className="block text-sm font-medium text-text mb-2">Pilih Akun</label>
            <select value={selectedAccount?.id || ''} onChange={(e) => { const account = accounts.find(a => a.id === parseInt(e.target.value)); setSelectedAccount(account || null); }} className="w-full px-4 py-2.5 border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-accent focus:border-transparent bg-surface">
              {accounts.map((acc) => (<option key={acc.id} value={acc.id}>{acc.code}{acc.suffix ? `-${acc.suffix}` : ''} - {acc.name}</option>))}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-text mb-2">Dari Tanggal</label>
            <div className="relative"><Calendar className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-text-muted" /><input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} className="w-full pl-10 pr-4 py-2.5 border border-border rounded-lg" /></div>
          </div>
          <div>
            <label className="block text-sm font-medium text-text mb-2">Sampai Tanggal</label>
            <div className="relative"><Calendar className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-text-muted" /><input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} className="w-full pl-10 pr-4 py-2.5 border border-border rounded-lg" /></div>
          </div>
        </div>
      </motion.div>

      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }} className="bg-surface rounded-xl border border-border overflow-hidden">
        <div className="p-6 border-b border-border flex items-center justify-between flex-wrap gap-4">
          <div>{selectedAccount && (<><h2 className="font-display text-xl font-bold text-text">{selectedAccount.code}{selectedAccount.suffix ? `-${selectedAccount.suffix}` : ''} - {selectedAccount.name}</h2><p className={`text-sm mt-1 ${getAccountTypeColor(selectedAccount.type)}`}>{selectedAccount.type === 'asset' ? 'Aset' : selectedAccount.type === 'liability' ? 'Kewajiban' : selectedAccount.type === 'equity' ? 'Ekuitas' : selectedAccount.type === 'revenue' ? 'Pendapatan' : 'Beban'}</p></>)}<p className="text-sm text-text-muted mt-2">Periode: {formatDate(startDate)} s/d {formatDate(endDate)}</p></div>
          <div className="flex gap-2"><button onClick={handleExport} className="flex items-center gap-2 px-4 py-2 border border-border rounded-lg hover:bg-background transition-colors"><Download className="w-4 h-4" />Export</button><button onClick={handlePrint} className="flex items-center gap-2 px-4 py-2 border border-border rounded-lg hover:bg-background transition-colors"><Printer className="w-4 h-4" />Print</button></div>
        </div>

        {loading ? <div className="flex justify-center py-12"><Loader2 className="w-8 h-8 animate-spin text-accent" /></div> : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-background"><tr><th className="px-6 py-3 text-left text-xs font-semibold text-text-muted uppercase">Tanggal</th><th className="px-6 py-3 text-left text-xs font-semibold text-text-muted uppercase">Deskripsi</th><th className="px-6 py-3 text-center text-xs font-semibold text-text-muted uppercase">Ref</th><th className="px-6 py-3 text-right text-xs font-semibold text-text-muted uppercase">Debit</th><th className="px-6 py-3 text-right text-xs font-semibold text-text-muted uppercase">Kredit</th><th className="px-6 py-3 text-right text-xs font-semibold text-text-muted uppercase">Saldo</th></tr></thead>
                <tbody className="divide-y divide-border">
                  {ledgerData.length === 0 ? <tr><td colSpan={6} className="text-center py-12 text-text-muted">Tidak ada transaksi untuk periode ini</td></tr> : ledgerData.map((item, index) => (<motion.tr key={index} initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: index * 0.02 }} className={`hover:bg-background transition-colors ${item.description === 'Saldo Awal' ? 'bg-background/50 font-semibold' : ''}`}>
                    <td className="px-6 py-3 whitespace-nowrap text-sm text-text">{formatDate(item.date)}</td>
                    <td className="px-6 py-3 text-sm text-text">{item.description}</td>
                    <td className="px-6 py-3 text-center text-sm text-text-muted">{item.ref}</td>
                    <td className="px-6 py-3 whitespace-nowrap text-right text-sm font-mono text-success">{item.debit > 0 ? formatCurrency(item.debit) : '-'}</td>
                    <td className="px-6 py-3 whitespace-nowrap text-right text-sm font-mono text-danger">{item.credit > 0 ? formatCurrency(item.credit) : '-'}</td>
                    <td className="px-6 py-3 whitespace-nowrap text-right text-sm font-mono font-bold text-info">{formatCurrency(item.balance)}</td>
                  </motion.tr>))}
                </tbody>
                {ledgerData.length > 0 && (<tfoot className="bg-accent/10 font-bold border-t border-border"><tr><td colSpan={3} className="px-6 py-4 text-sm text-text">TOTAL</td><td className="px-6 py-4 text-right text-sm font-mono text-success">{formatCurrency(totalDebit)}</td><td className="px-6 py-4 text-right text-sm font-mono text-danger">{formatCurrency(totalCredit)}</td><td className="px-6 py-4 text-right text-sm font-mono text-info">{formatCurrency(endingBalance)}</td></tr></tfoot>)}
              </table>
            </div>
            {ledgerData.length > 0 && (<div className="p-6 border-t border-border bg-background"><div className="grid grid-cols-1 md:grid-cols-3 gap-4"><div><p className="text-xs text-text-muted mb-1">Total Debit</p><p className="text-lg font-bold font-mono text-success">{formatCurrency(totalDebit)}</p></div><div><p className="text-xs text-text-muted mb-1">Total Kredit</p><p className="text-lg font-bold font-mono text-danger">{formatCurrency(totalCredit)}</p></div><div><p className="text-xs text-text-muted mb-1">Saldo Akhir</p><p className="text-lg font-bold font-mono text-info">{formatCurrency(endingBalance)}</p></div></div></div>)}
          </>
        )}
      </motion.div>

      <div className="bg-info/10 border border-info/30 rounded-xl p-6"><h3 className="font-semibold text-text mb-2">💡 Informasi Buku Besar</h3><p className="text-sm text-text-muted">Buku besar menampilkan semua mutasi transaksi untuk akun yang dipilih dalam periode tertentu. Saldo akhir akan berubah sesuai dengan posting jurnal yang telah dilakukan.</p></div>
    </div>
  );
}
