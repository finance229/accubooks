// src/pages/ClosingBook.tsx

import { useState, useEffect } from 'react';
import { 
  Lock, Unlock, Eye, Calendar, CheckCircle, XCircle, 
  AlertTriangle, FileText, History, RefreshCw, Loader2
} from 'lucide-react';
import { motion } from 'framer-motion';
import { supabase } from '../lib/supabase';
import { useCompany } from '../contexts/CompanyContext';
import { useAuth } from '../contexts/AuthContext';
import { formatCurrency, createGeneralJournal } from '../lib/accountingHelpers';

type ClosingHistory = {
  id: number;
  company_id: number;
  period: string;
  closed_by: string;
  closed_at: string;
  status: string;
  notes: string;
  summary: any;
  created_at: string;
};

type PreviewData = {
  depreciationCount: number;
  depreciationTotal: number;
  amortizationCount: number;
  amortizationTotal: number;
  draftJournalsCount: number;
  draftJournalsList: any[];
  period: string;
  alreadyClosed: boolean;
};

export default function ClosingBook() {
  const { currentCompany } = useCompany();
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [histories, setHistories] = useState<ClosingHistory[]>([]);
  const [showPreviewModal, setShowPreviewModal] = useState(false);
  const [showConfirmModal, setShowConfirmModal] = useState(false);
  const [showReportModal, setShowReportModal] = useState(false);
  const [selectedHistory, setSelectedHistory] = useState<ClosingHistory | null>(null);
  const [preview, setPreview] = useState<PreviewData | null>(null);
  const [lastReport, setLastReport] = useState<any>(null);
  
  const [selectedPeriod, setSelectedPeriod] = useState(() => {
    const now = new Date();
    // Default: bulan lalu (karena baru bisa tutup di akhir bulan)
    if (now.getDate() >= 28) {
      return now.toISOString().slice(0, 7);
    } else {
      const lastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      return lastMonth.toISOString().slice(0, 7);
    }
  });

  // 🔥 CEK AKSES
  const canAccess = user?.role === 'super_admin' || user?.role === 'direktur' || user?.role === 'finance';
  const canReverse = user?.role === 'super_admin';

  useEffect(() => {
    if (currentCompany?.id && canAccess) {
      fetchHistories();
    }
  }, [currentCompany, canAccess]);

  const fetchHistories = async () => {
    if (!currentCompany?.id) return;
    setLoading(true);
    const { data } = await supabase
      .from('closing_periods')
      .select('*')
      .eq('company_id', currentCompany.id)
      .order('period', { ascending: false });
    setHistories(data || []);
    setLoading(false);
  };

  // 🔥 CEK APAKAH BISA TUTUP BUKU (TGL 28 s/d H+7 SETELAH AKHIR BULAN, JAM 23:59)
  const canCloseBook = (period?: string) => {
    const targetPeriod = period || selectedPeriod;
    const [year, month] = targetPeriod.split('-').map(Number);
    
    // Awal bulan periode (tanggal 28)
    const startDate = new Date(year, month - 1, 28);  // month JS 0-index
    startDate.setHours(0, 0, 0, 0);
    
    // Akhir bulan
    const lastDayOfMonth = new Date(year, month, 0);
    lastDayOfMonth.setHours(23, 59, 59, 999);
    
    // Deadline H+7
    const deadline = new Date(lastDayOfMonth);
    deadline.setDate(deadline.getDate() + 7);
    deadline.setHours(23, 59, 59, 999);
    
    const now = new Date();
    
    // Bisa tutup buku kalau:
    // 1. Sudah lewat tanggal 28 bulan itu
    // 2. Belum lewat deadline H+7
    return now >= startDate && now <= deadline;
  };

  // 🔥 CEK APAKAH SUDAH LEWAT DEADLINE
  const isPastDeadline = (period?: string) => {
    const targetPeriod = period || selectedPeriod;
    const [year, month] = targetPeriod.split('-').map(Number);
    
    const lastDayOfMonth = new Date(year, month, 0);
    const deadline = new Date(lastDayOfMonth);
    deadline.setDate(deadline.getDate() + 7);
    deadline.setHours(23, 59, 59, 999);
    
    return new Date() > deadline;
  };

  // 🔥 CEK APAKAH BELUM WAKTUNYA
  const isBeforeStart = (period?: string) => {
    const targetPeriod = period || selectedPeriod;
    const [year, month] = targetPeriod.split('-').map(Number);
    
    const startDate = new Date(year, month - 1, 28);
    startDate.setHours(0, 0, 0, 0);
    
    return new Date() < startDate;
  };

  // 🔥 FORMAT DEADLINE
  const getDeadlineText = (period?: string) => {
    const targetPeriod = period || selectedPeriod;
    const [year, month] = targetPeriod.split('-').map(Number);
    
    const lastDayOfMonth = new Date(year, month, 0);
    const deadline = new Date(lastDayOfMonth);
    deadline.setDate(deadline.getDate() + 7);
    
    return deadline.toLocaleDateString('id-ID', {
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    }) + ' 23:59';
  };

  // 🔥 FORMAT START DATE
  const getStartDateText = (period?: string) => {
    const targetPeriod = period || selectedPeriod;
    const [year, month] = targetPeriod.split('-').map(Number);
    
    const startDate = new Date(year, month - 1, 28);
    
    return startDate.toLocaleDateString('id-ID', {
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    });
  };

  // 🔥 PREVIEW TUTUP BUKU
  const handlePreview = async () => {
    if (!currentCompany?.id) return;
    setLoading(true);

    try {
      const [year, month] = selectedPeriod.split('-').map(Number);
      const startDate = `${year}-${String(month).padStart(2, '0')}-01`;
      const lastDay = new Date(year, month, 0).getDate();
      const endDate = `${year}-${String(month).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;

      // Cek apakah periode sudah pernah ditutup
      const { data: existingClose } = await supabase
        .from('closing_periods')
        .select('id')
        .eq('company_id', currentCompany.id)
        .eq('period', selectedPeriod)
        .eq('status', 'closed')
        .maybeSingle();

      // 1. Ambil aset tetap yang belum disusutkan bulan ini
      const { data: assets } = await supabase
        .from('fixed_assets')
        .select('*')
        .eq('company_id', currentCompany.id)
        .eq('status', 'active');

      const activeAssets = assets || [];

      console.log('📊 Active assets:', activeAssets.length);
      console.log('📊 Assets detail:', activeAssets.map(a => ({
        id: a.id,
        code: a.code,
        name: a.name,
        type: a.asset_type,
        cost: a.acquisition_cost,
        salvage: a.salvage_value,
        useful_life: a.useful_life,
        expense_acc: a.expense_account_id,
        accumulated_acc: a.accumulated_account_id,
      })));

      // Filter aset yang belum digenerate bulan ini
      const { data: existingHistory } = await supabase
        .from('depreciation_history')
        .select('asset_id')
        .eq('period', selectedPeriod);

      console.log('📊 Existing history period', selectedPeriod, ':', existingHistory);

      const existingAssetIds = new Set(existingHistory?.map(h => h.asset_id) || []);
      const dueAssets = activeAssets.filter(a => !existingAssetIds.has(a.id));

      console.log('📊 Due assets:', dueAssets.length);

      const tangibleAssets = dueAssets.filter(a => a.asset_type === 'tangible');
      const intangibleAssets = dueAssets.filter(a => a.asset_type === 'intangible');

      // Hitung total penyusutan
      let depTotal = 0;
      tangibleAssets.forEach(a => {
        const depreciableAmount = a.acquisition_cost - (a.salvage_value || 0);
        const monthly = a.useful_life > 0 ? depreciableAmount / a.useful_life / 12 : 0;
        depTotal += Math.round(monthly);
      });

      let amortTotal = 0;
      intangibleAssets.forEach(a => {
        const depreciableAmount = a.acquisition_cost - (a.salvage_value || 0);
        const monthly = a.useful_life > 0 ? depreciableAmount / a.useful_life / 12 : 0;
        amortTotal += Math.round(monthly);
      });

      // 2. Ambil jurnal draft bulan ini
      const { data: drafts } = await supabase
        .from('journals')
        .select('id, journal_number, journal_date, description')
        .eq('company_id', currentCompany.id)
        .eq('status', 'draft')
        .gte('journal_date', startDate)
        .lte('journal_date', endDate);

      setPreview({
        depreciationCount: tangibleAssets.length,
        depreciationTotal: depTotal,
        amortizationCount: intangibleAssets.length,
        amortizationTotal: amortTotal,
        draftJournalsCount: (drafts || []).length,
        draftJournalsList: drafts || [],
        period: selectedPeriod,
        alreadyClosed: !!existingClose,
      });

      setShowPreviewModal(true);
    } catch (error) {
      console.error('Error preview:', error);
      alert('Gagal memuat preview');
    } finally {
      setLoading(false);
    }
  };

  // 🔥 EKSEKUSI TUTUP BUKU
  const handleCloseBook = async () => {
    if (!currentCompany?.id || !preview) return;

    if (preview.alreadyClosed) {
      alert('⚠️ Periode ini sudah pernah ditutup!');
      return;
    }

    if (!canCloseBook(preview.period)) {
      alert(`⚠️ Tutup buku hanya bisa dilakukan mulai ${getStartDateText(preview.period)} s/d ${getDeadlineText(preview.period)}!`);
      return;
    }

    setGenerating(true);
    const summary: any = {
      depreciation: { count: 0, total: 0, success: 0, failed: 0 },
      amortization: { count: 0, total: 0, success: 0, failed: 0 },
      postedJournals: { count: 0, success: 0, failed: 0 },
    };

    try {
      const [year, month] = preview.period.split('-').map(Number);
      const startDate = `${year}-${String(month).padStart(2, '0')}-01`;
      const lastDay = new Date(year, month, 0).getDate();
      const endDate = `${year}-${String(month).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;

      // ============ 1. AUTO-GENERATE PENYUSUTAN & AMORTISASI ============
      const { data: assets } = await supabase
        .from('fixed_assets')
        .select('*')
        .eq('company_id', currentCompany.id)
        .eq('status', 'active');

      const activeAssets = assets || [];
      const { data: existingHistory } = await supabase
        .from('depreciation_history')
        .select('asset_id')
        .eq('period', preview.period);

      const existingAssetIds = new Set(existingHistory?.map(h => h.asset_id) || []);
      const dueAssets = activeAssets.filter(a => !existingAssetIds.has(a.id));

      // Ambil COA
      const { data: coaList } = await supabase
        .from('coa')
        .select('id, code, name, type')
        .eq('company_id', currentCompany.id);

      for (const asset of dueAssets) {
        try {
          const depreciableAmount = asset.acquisition_cost - (asset.salvage_value || 0);
          const monthly = asset.useful_life > 0 ? Math.round(depreciableAmount / asset.useful_life / 12) : 0;
          
          if (monthly <= 0) continue;

          const expenseAccount = coaList?.find(c => c.id === asset.expense_account_id);
          let accumulatedAccountId = asset.accumulated_account_id;
          
          if (!accumulatedAccountId) {
            const defaultAccCode = asset.asset_type === 'tangible' ? '1290' : '1390';
            const defaultAcc = coaList?.find(c => c.code.startsWith(defaultAccCode));
            if (defaultAcc) accumulatedAccountId = defaultAcc.id;
          }
          
          const accumulatedAccount = coaList?.find(c => c.id === accumulatedAccountId);

          if (!expenseAccount || !accumulatedAccount) {
            const key = asset.asset_type === 'tangible' ? 'depreciation' : 'amortization';
            summary[key].failed++;
            continue;
          }

          // Buat jurnal
          const entries = [
            {
              account_id: expenseAccount.id,
              account_code: expenseAccount.code,
              account_name: expenseAccount.name,
              debit: monthly,
              credit: 0,
            },
            {
              account_id: accumulatedAccount.id,
              account_code: accumulatedAccount.code,
              account_name: accumulatedAccount.name,
              debit: 0,
              credit: monthly,
            },
          ];

          const description = asset.asset_type === 'tangible' 
            ? `Penyusutan ${asset.name} (${asset.code}) - ${preview.period}`
            : `Amortisasi ${asset.name} (${asset.code}) - ${preview.period}`;

          const journalId = await createGeneralJournal(
            currentCompany.id,
            endDate,
            description,
            `CLOSING-${preview.period}`,
            'DEPRECIATION',
            asset.id,
            entries
          );

          if (!journalId) {
            const key = asset.asset_type === 'tangible' ? 'depreciation' : 'amortization';
            summary[key].failed++;
            continue;
          }

          // Update aset
          const newAccumulated = (asset.accumulated_depreciation || 0) + monthly;
          const newBookValue = asset.acquisition_cost - newAccumulated;

          await supabase
            .from('fixed_assets')
            .update({
              accumulated_depreciation: newAccumulated,
              book_value: newBookValue,
              last_depreciation_date: endDate,
              total_depreciation_generated: (asset.total_depreciation_generated || 0) + 1,
            })
            .eq('id', asset.id);

          // Catat history
          await supabase
            .from('depreciation_history')
            .insert({
              asset_id: asset.id,
              period: preview.period,
              amount: monthly,
              accumulated_depreciation: newAccumulated,
              book_value: newBookValue,
              journal_id: journalId,
            });

          const key = asset.asset_type === 'tangible' ? 'depreciation' : 'amortization';
          summary[key].count++;
          summary[key].total += monthly;
          summary[key].success++;
        } catch (err) {
          console.error('Error generating:', err);
          const key = asset.asset_type === 'tangible' ? 'depreciation' : 'amortization';
          summary[key].failed++;
        }
      }

      // ============ 2. AUTO-POST SEMUA JURNAL DRAFT ============
      const { data: drafts } = await supabase
        .from('journals')
        .select('id')
        .eq('company_id', currentCompany.id)
        .eq('status', 'draft')
        .gte('journal_date', startDate)
        .lte('journal_date', endDate);

      if (drafts && drafts.length > 0) {
        const draftIds = drafts.map(d => d.id);
        const { error: postError } = await supabase
          .from('journals')
          .update({
            status: 'posted',
            posted_by: user?.email || 'system',
            posted_at: new Date().toISOString(),
          })
          .in('id', draftIds);

        if (!postError) {
          summary.postedJournals.count = draftIds.length;
          summary.postedJournals.success = draftIds.length;
        } else {
          summary.postedJournals.failed = draftIds.length;
        }
      }

      // ============ 3. SIMPAN HISTORY ============
      await supabase
        .from('closing_periods')
        .insert({
          company_id: currentCompany.id,
          period: preview.period,
          closed_by: user?.email,
          closed_at: new Date().toISOString(),
          status: 'closed',
          summary: summary,
        });

      // ============ 4. LOCK PERIODE ============
      await supabase
        .from('locked_periods')
        .insert({
          company_id: currentCompany.id,
          period: preview.period,
          locked_by: user?.email,
        });

      setLastReport({
        period: preview.period,
        summary: summary,
        closedBy: user?.email,
        closedAt: new Date().toISOString(),
      });

      setShowPreviewModal(false);
      setShowConfirmModal(false);
      setShowReportModal(true);
      fetchHistories();
    } catch (error) {
      console.error('Error closing book:', error);
      alert('❌ Gagal tutup buku: ' + (error instanceof Error ? error.message : 'Unknown error'));
    } finally {
      setGenerating(false);
    }
  };

  // 🔥 REVERSE (BUKA KEMBALI) - HANYA SUPER ADMIN
  const handleReverse = async (history: ClosingHistory) => {
    if (user?.role !== 'super_admin') {
      alert('⚠️ Hanya Super Admin yang bisa membuka kembali periode!');
      return;
    }

    if (!confirm(`Yakin ingin membuka kembali periode ${history.period}?\n\nJurnal penyusutan yang terkait akan dihapus dan periode akan dibuka.`)) {
      return;
    }

    try {
      // 1. Ambil jurnal penyusutan periode ini
      const { data: depHistories } = await supabase
        .from('depreciation_history')
        .select('journal_id, asset_id, amount, period')
        .eq('period', history.period);

      const journalIds = (depHistories || []).map(h => h.journal_id).filter(Boolean);

      // 2. Hapus jurnal & lines
      if (journalIds.length > 0) {
        await supabase.from('journal_lines').delete().in('journal_id', journalIds);
        await supabase.from('journals').delete().in('id', journalIds);
      }

      // 3. Kembalikan nilai aset (kurangi accumulated)
      for (const h of depHistories || []) {
        const { data: asset } = await supabase
          .from('fixed_assets')
          .select('accumulated_depreciation, acquisition_cost, total_depreciation_generated')
          .eq('id', h.asset_id)
          .single();

        if (asset) {
          const newAccumulated = Math.max(0, (asset.accumulated_depreciation || 0) - h.amount);
          const newBookValue = asset.acquisition_cost - newAccumulated;
          
          await supabase
            .from('fixed_assets')
            .update({
              accumulated_depreciation: newAccumulated,
              book_value: newBookValue,
              total_depreciation_generated: Math.max(0, (asset.total_depreciation_generated || 1) - 1),
            })
            .eq('id', h.asset_id);
        }
      }

      // 4. Hapus history penyusutan periode ini
      await supabase
        .from('depreciation_history')
        .delete()
        .eq('period', history.period);

      // 5. Update status closing
      await supabase
        .from('closing_periods')
        .update({ 
          status: 'reopened',
          notes: `Reversed by ${user?.email} at ${new Date().toISOString()}`
        })
        .eq('id', history.id);

      // 6. Hapus lock
      await supabase
        .from('locked_periods')
        .delete()
        .eq('company_id', history.company_id)
        .eq('period', history.period);

      alert(`✅ Periode ${history.period} berhasil dibuka kembali!`);
      fetchHistories();
    } catch (error) {
      console.error('Error reverse:', error);
      alert('❌ Gagal membuka kembali: ' + (error instanceof Error ? error.message : 'Unknown error'));
    }
  };

  const handleViewReport = (history: ClosingHistory) => {
    setSelectedHistory(history);
    setShowReportModal(true);
  };

  const formatDate = (date: string) => {
    return new Date(date).toLocaleDateString('id-ID', {
      day: 'numeric',
      month: 'long',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const formatPeriod = (period: string) => {
    const [year, month] = period.split('-').map(Number);
    const bulan = ['Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni', 'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'];
    return `${bulan[month - 1]} ${year}`;
  };

  if (!canAccess) {
    return (
      <div className="flex justify-center py-12">
        <div className="bg-danger/10 border border-danger/30 rounded-xl p-6 max-w-md text-center">
          <AlertTriangle className="w-12 h-12 text-danger mx-auto mb-3" />
          <p className="text-danger font-semibold">Akses Ditolak</p>
          <p className="text-sm text-text-muted mt-1">Hanya Finance, Super Admin, dan Direktur yang bisa mengakses Tutup Buku.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="animate-slide-in-up">
        <h1 className="font-display text-3xl font-bold text-text">Tutup Buku</h1>
        <p className="text-text-muted mt-1">Proses tutup buku akhir bulan dengan auto-generate penyusutan & posting jurnal</p>
      </div>

      {/* Info Panel */}
      <div className="bg-info/10 border border-info/30 rounded-xl p-5">
        <div className="flex items-start gap-3">
          <AlertTriangle className="w-5 h-5 text-info flex-shrink-0 mt-0.5" />
          <div className="text-sm">
            <p className="font-semibold text-info mb-1">ℹ️ Informasi</p>
            <ul className="text-text-muted space-y-1 list-disc list-inside">
              <li>Tutup buku hanya bisa dilakukan mulai <strong>tanggal 28 s/d H+7 setelah akhir bulan (23:59)</strong></li>
              <li>Contoh: Periode Juli 2026 → bisa ditutup dari <strong>28 Juli s/d 7 Agustus 2026, 23:59</strong></li>
              <li>Proses ini akan otomatis: <strong>generate penyusutan, amortisasi, dan posting semua jurnal draft</strong></li>
              <li>Setelah tutup buku, periode akan <strong>terkunci</strong> - tidak bisa edit jurnal bulan itu</li>
              <li>Hanya <strong>Super Admin</strong> yang bisa membuka kembali (reverse)</li>
            </ul>
          </div>
        </div>
      </div>

      {/* Form Tutup Buku */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="bg-surface rounded-xl border border-border p-6"
      >
        <h2 className="font-display text-xl font-bold text-text mb-4">🔒 Proses Tutup Buku</h2>
        
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 items-end">
          <div>
            <label className="block text-sm font-medium mb-2">Pilih Periode</label>
            <input
              type="month"
              value={selectedPeriod}
              onChange={(e) => setSelectedPeriod(e.target.value)}
              className="w-full px-4 py-2.5 border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-accent"
            />
          </div>
          <div className="md:col-span-2 flex flex-col gap-2">
            <div className="flex gap-3">
              <button
                onClick={handlePreview}
                disabled={loading}
                className="flex items-center gap-2 px-6 py-2.5 bg-info/10 text-info border border-info/30 rounded-lg hover:bg-info/20 transition-colors disabled:opacity-50"
              >
                <Eye className="w-5 h-5" />
                Preview
              </button>
            </div>
            
            {/* 🔥 INFO STATUS DEADLINE */}
            {canCloseBook(selectedPeriod) ? (
              <div className="flex items-center text-success text-xs gap-2">
                <CheckCircle className="w-3 h-3" />
                ✅ Bisa tutup buku. Deadline: {getDeadlineText(selectedPeriod)}
              </div>
            ) : isPastDeadline(selectedPeriod) ? (
              <div className="flex items-center text-danger text-xs gap-2">
                <XCircle className="w-3 h-3" />
                ❌ Batas waktu sudah lewat (deadline: {getDeadlineText(selectedPeriod)})
              </div>
            ) : (
              <div className="flex items-center text-warning text-xs gap-2">
                <AlertTriangle className="w-3 h-3" />
                ⏳ Belum waktunya. Bisa dijalankan mulai {getStartDateText(selectedPeriod)} s/d {getDeadlineText(selectedPeriod)}
              </div>
            )}
          </div>
        </div>
      </motion.div>

      {/* History */}
      <div className="bg-surface rounded-xl border border-border overflow-hidden">
        <div className="px-6 py-4 border-b border-border">
          <h2 className="font-display text-xl font-bold text-text flex items-center gap-2">
            <History className="w-5 h-5" />
            History Tutup Buku
          </h2>
        </div>
        
        {loading ? (
          <div className="flex justify-center py-12">
            <Loader2 className="w-8 h-8 animate-spin text-accent" />
          </div>
        ) : histories.length === 0 ? (
          <div className="text-center py-12 text-text-muted">
            <History className="w-12 h-12 mx-auto mb-3 opacity-30" />
            <p>Belum ada history tutup buku</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-background">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-semibold text-text-muted uppercase">Periode</th>
                  <th className="px-6 py-3 text-left text-xs font-semibold text-text-muted uppercase">Ditutup Oleh</th>
                  <th className="px-6 py-3 text-left text-xs font-semibold text-text-muted uppercase">Tanggal</th>
                  <th className="px-6 py-3 text-center text-xs font-semibold text-text-muted uppercase">Status</th>
                  <th className="px-6 py-3 text-right text-xs font-semibold text-text-muted uppercase">Aksi</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {histories.map((h) => (
                  <tr key={h.id} className="hover:bg-background">
                    <td className="px-6 py-4 text-sm font-semibold">{formatPeriod(h.period)}</td>
                    <td className="px-6 py-4 text-sm">{h.closed_by}</td>
                    <td className="px-6 py-4 text-sm">{formatDate(h.closed_at)}</td>
                    <td className="px-6 py-4 text-center">
                      <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium ${
                        h.status === 'closed' 
                          ? 'bg-success/10 text-success' 
                          : 'bg-warning/10 text-warning'
                      }`}>
                        {h.status === 'closed' ? (
                          <><Lock className="w-3 h-3" /> Tertutup</>
                        ) : (
                          <><Unlock className="w-3 h-3" /> Dibuka</>
                        )}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-right">
                      <div className="flex justify-end gap-2">
                        <button
                          onClick={() => handleViewReport(h)}
                          className="p-2 text-text-muted hover:text-info hover:bg-info/10 rounded-lg"
                          title="Lihat Laporan"
                        >
                          <FileText className="w-4 h-4" />
                        </button>
                        {h.status === 'closed' && canReverse && (
                          <button
                            onClick={() => handleReverse(h)}
                            className="p-2 text-text-muted hover:text-warning hover:bg-warning/10 rounded-lg"
                            title="Buka Kembali (Super Admin)"
                          >
                            <Unlock className="w-4 h-4" />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Modal Preview */}
      {showPreviewModal && preview && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 overflow-auto">
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="bg-surface rounded-xl p-6 w-full max-w-2xl my-8"
          >
            <div className="flex justify-between items-center mb-4">
              <h2 className="font-display text-xl font-bold">
                📋 Preview Tutup Buku - {formatPeriod(preview.period)}
              </h2>
              <button onClick={() => setShowPreviewModal(false)} className="text-text-muted hover:text-text">
                <XCircle className="w-5 h-5" />
              </button>
            </div>

            {preview.alreadyClosed && (
              <div className="bg-danger/10 border border-danger/30 rounded-lg p-4 mb-4">
                <p className="text-danger text-sm font-semibold">
                  ⚠️ Periode ini sudah pernah ditutup!
                </p>
              </div>
            )}

            <div className="space-y-4">
              {/* Penyusutan */}
              <div className="bg-background rounded-lg p-4">
                <div className="flex justify-between items-center mb-2">
                  <p className="font-semibold text-text">Penyusutan Aset Tetap</p>
                  <p className="text-lg font-bold text-info">{preview.depreciationCount} aset</p>
                </div>
                <p className="text-sm text-text-muted">Total: {formatCurrency(preview.depreciationTotal)}</p>
              </div>

              {/* Amortisasi */}
              <div className="bg-background rounded-lg p-4">
                <div className="flex justify-between items-center mb-2">
                  <p className="font-semibold text-text">Amortisasi Aset Tidak Berwujud</p>
                  <p className="text-lg font-bold text-purple-600">{preview.amortizationCount} aset</p>
                </div>
                <p className="text-sm text-text-muted">Total: {formatCurrency(preview.amortizationTotal)}</p>
              </div>

              {/* Jurnal Draft */}
              <div className="bg-background rounded-lg p-4">
                <div className="flex justify-between items-center mb-2">
                  <p className="font-semibold text-text">Jurnal Draft yang Akan Diposting</p>
                  <p className="text-lg font-bold text-success">{preview.draftJournalsCount} jurnal</p>
                </div>
                {preview.draftJournalsCount > 0 && (
                  <div className="mt-3 max-h-40 overflow-y-auto space-y-1">
                    {preview.draftJournalsList.map((d: any) => (
                      <div key={d.id} className="text-xs text-text-muted flex justify-between">
                        <span>{d.journal_number} - {d.description}</span>
                        <span>{d.journal_date}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Total */}
              <div className="bg-accent/10 border border-accent/30 rounded-lg p-4">
                <div className="flex justify-between items-center">
                  <p className="font-bold text-text">TOTAL AKAN DIJURNAL</p>
                  <p className="text-xl font-bold text-accent">
                    {formatCurrency(preview.depreciationTotal + preview.amortizationTotal)}
                  </p>
                </div>
              </div>
            </div>

            <div className="flex justify-between items-center mt-6">
              <div>
                {!preview.alreadyClosed && canCloseBook(preview.period) && (
                  <div className="text-xs text-success flex items-center gap-1">
                    <CheckCircle className="w-3 h-3" />
                    Deadline: {getDeadlineText(preview.period)}
                  </div>
                )}
                {!preview.alreadyClosed && !canCloseBook(preview.period) && (
                  <div className="text-xs text-warning flex items-center gap-1">
                    <AlertTriangle className="w-3 h-3" />
                    {isPastDeadline(preview.period) 
                      ? `Batas waktu sudah lewat (${getDeadlineText(preview.period)})`
                      : `Bisa dijalankan mulai ${getStartDateText(preview.period)}`
                    }
                  </div>
                )}
              </div>
              <div className="flex gap-3">
                <button
                  onClick={() => setShowPreviewModal(false)}
                  className="px-4 py-2 border border-border rounded-lg hover:bg-background"
                >
                  Batal
                </button>
                {!preview.alreadyClosed && canCloseBook(preview.period) && (
                  <button
                    onClick={() => {
                      setShowPreviewModal(false);
                      setShowConfirmModal(true);
                    }}
                    className="flex items-center gap-2 px-6 py-2 bg-accent text-white rounded-lg hover:bg-accent-hover"
                  >
                    <Lock className="w-4 h-4" />
                    Tutup Buku Sekarang
                  </button>
                )}
              </div>
            </div>
          </motion.div>
        </div>
      )}

      {/* Modal Konfirmasi */}
      {showConfirmModal && preview && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="bg-surface rounded-xl p-6 w-full max-w-md"
          >
            <div className="text-center mb-4">
              <div className="w-16 h-16 bg-warning/10 rounded-full flex items-center justify-center mx-auto mb-3">
                <AlertTriangle className="w-8 h-8 text-warning" />
              </div>
              <h2 className="font-display text-xl font-bold text-text">Konfirmasi Tutup Buku</h2>
              <p className="text-sm text-text-muted mt-2">
                Yakin ingin menutup buku periode <strong>{formatPeriod(preview.period)}</strong>?
              </p>
            </div>

            <div className="bg-background rounded-lg p-4 space-y-2 text-sm mb-4">
              <div className="flex justify-between">
                <span>Penyusutan:</span>
                <span className="font-semibold">{preview.depreciationCount} aset</span>
              </div>
              <div className="flex justify-between">
                <span>Amortisasi:</span>
                <span className="font-semibold">{preview.amortizationCount} aset</span>
              </div>
              <div className="flex justify-between">
                <span>Jurnal diposting:</span>
                <span className="font-semibold">{preview.draftJournalsCount} jurnal</span>
              </div>
              <div className="flex justify-between pt-2 border-t border-border">
                <span className="font-semibold">Total:</span>
                <span className="font-bold text-accent">
                  {formatCurrency(preview.depreciationTotal + preview.amortizationTotal)}
                </span>
              </div>
            </div>

            <p className="text-xs text-danger text-center mb-4">
              ⚠️ Setelah tutup buku, periode akan <strong>terkunci</strong>. Hanya Super Admin yang bisa membuka kembali.
            </p>

            <div className="flex justify-end gap-3">
              <button
                onClick={() => setShowConfirmModal(false)}
                disabled={generating}
                className="px-4 py-2 border border-border rounded-lg hover:bg-background disabled:opacity-50"
              >
                Batal
              </button>
              <button
                onClick={handleCloseBook}
                disabled={generating}
                className="flex items-center gap-2 px-6 py-2 bg-danger text-white rounded-lg hover:bg-danger/80 disabled:opacity-50"
              >
                {generating ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Memproses...
                  </>
                ) : (
                  <>
                    <Lock className="w-4 h-4" />
                    Ya, Tutup Buku
                  </>
                )}
              </button>
            </div>
          </motion.div>
        </div>
      )}

      {/* Modal Laporan */}
      {showReportModal && (lastReport || selectedHistory) && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 overflow-auto">
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="bg-surface rounded-xl p-6 w-full max-w-2xl my-8"
          >
            <div className="flex justify-between items-center mb-4">
              <h2 className="font-display text-xl font-bold flex items-center gap-2">
                <CheckCircle className="w-6 h-6 text-success" />
                Laporan Tutup Buku
              </h2>
              <button 
                onClick={() => { setShowReportModal(false); setLastReport(null); setSelectedHistory(null); }} 
                className="text-text-muted hover:text-text"
              >
                <XCircle className="w-5 h-5" />
              </button>
            </div>

            {(() => {
              const report = lastReport?.summary || selectedHistory?.summary;
              const period = lastReport?.period || selectedHistory?.period;
              const closedBy = lastReport?.closedBy || selectedHistory?.closed_by;
              const closedAt = lastReport?.closedAt || selectedHistory?.closed_at;
              
              return (
                <div className="space-y-4">
                  <div className="bg-background rounded-lg p-4">
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <p className="text-xs text-text-muted">Periode</p>
                        <p className="font-semibold">{period ? formatPeriod(period) : '-'}</p>
                      </div>
                      <div>
                        <p className="text-xs text-text-muted">Ditutup Oleh</p>
                        <p className="font-semibold">{closedBy}</p>
                      </div>
                      <div className="col-span-2">
                        <p className="text-xs text-text-muted">Waktu Tutup</p>
                        <p className="font-semibold">{closedAt ? formatDate(closedAt) : '-'}</p>
                      </div>
                    </div>
                  </div>

                  {report?.depreciation && (
                    <div className="bg-info/10 rounded-lg p-4 border border-info/30">
                      <p className="font-semibold text-info mb-2">📊 Penyusutan Aset Tetap</p>
                      <div className="grid grid-cols-3 gap-3 text-sm">
                        <div>
                          <p className="text-xs text-text-muted">Berhasil</p>
                          <p className="font-bold text-success">{report.depreciation.success || 0}</p>
                        </div>
                        <div>
                          <p className="text-xs text-text-muted">Gagal</p>
                          <p className="font-bold text-danger">{report.depreciation.failed || 0}</p>
                        </div>
                        <div>
                          <p className="text-xs text-text-muted">Total</p>
                          <p className="font-bold">{formatCurrency(report.depreciation.total || 0)}</p>
                        </div>
                      </div>
                    </div>
                  )}

                  {report?.amortization && (
                    <div className="bg-purple-50 rounded-lg p-4 border border-purple-300">
                      <p className="font-semibold text-purple-600 mb-2">📊 Amortisasi Aset Tidak Berwujud</p>
                      <div className="grid grid-cols-3 gap-3 text-sm">
                        <div>
                          <p className="text-xs text-text-muted">Berhasil</p>
                          <p className="font-bold text-success">{report.amortization.success || 0}</p>
                        </div>
                        <div>
                          <p className="text-xs text-text-muted">Gagal</p>
                          <p className="font-bold text-danger">{report.amortization.failed || 0}</p>
                        </div>
                        <div>
                          <p className="text-xs text-text-muted">Total</p>
                          <p className="font-bold">{formatCurrency(report.amortization.total || 0)}</p>
                        </div>
                      </div>
                    </div>
                  )}

                  {report?.postedJournals && (
                    <div className="bg-success/10 rounded-lg p-4 border border-success/30">
                      <p className="font-semibold text-success mb-2">📊 Jurnal Draft Diposting</p>
                      <div className="grid grid-cols-2 gap-3 text-sm">
                        <div>
                          <p className="text-xs text-text-muted">Berhasil</p>
                          <p className="font-bold text-success">{report.postedJournals.success || 0}</p>
                        </div>
                        <div>
                          <p className="text-xs text-text-muted">Gagal</p>
                          <p className="font-bold text-danger">{report.postedJournals.failed || 0}</p>
                        </div>
                      </div>
                    </div>
                  )}

                  <div className="bg-accent/10 border border-accent/30 rounded-lg p-4">
                    <div className="flex justify-between items-center">
                      <p className="font-bold">TOTAL DIJURNAL</p>
                      <p className="text-xl font-bold text-accent">
                        {formatCurrency((report?.depreciation?.total || 0) + (report?.amortization?.total || 0))}
                      </p>
                    </div>
                  </div>
                </div>
              );
            })()}

            <div className="flex justify-end mt-6">
              <button
                onClick={() => { setShowReportModal(false); setLastReport(null); setSelectedHistory(null); }}
                className="px-6 py-2 bg-accent text-white rounded-lg hover:bg-accent-hover"
              >
                Tutup
              </button>
            </div>
          </motion.div>
        </div>
      )}
    </div>
  );
}
