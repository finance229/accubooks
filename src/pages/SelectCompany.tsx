import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { useCompany } from '../contexts/CompanyContext';
import { Building2, Loader2 } from 'lucide-react';

export default function SelectCompany() {
  const { user } = useAuth();
  const { companies, currentCompany, setCurrentCompany, isLoading, fetchCompanies } = useCompany();
  const navigate = useNavigate();

  useEffect(() => {
    if (!user) {
      navigate('/login');
    }
    fetchCompanies();
  }, [user]);

  const handleSelectCompany = (company: typeof companies[0]) => {
    setCurrentCompany(company);
    navigate('/dashboard');
  };

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-900 to-slate-800">
        <Loader2 className="w-8 h-8 animate-spin text-accent" />
      </div>
    );
  }

  if (companies.length === 0) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-900 to-slate-800">
        <div className="bg-white rounded-2xl p-8 text-center max-w-md">
          <p className="text-slate-600">Anda tidak memiliki akses ke perusahaan manapun.</p>
          <button onClick={() => navigate('/login')} className="mt-4 text-accent">Kembali ke Login</button>
        </div>
      </div>
    );
  }

  if (companies.length === 1) {
    // Langsung ke dashboard jika hanya 1 perusahaan
    setCurrentCompany(companies[0]);
    navigate('/dashboard');
    return null;
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-900 to-slate-800">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-8 m-4">
        <div className="text-center mb-8">
          <div className="w-16 h-16 bg-accent rounded-2xl flex items-center justify-center mx-auto mb-4">
            <Building2 className="w-8 h-8 text-white" />
          </div>
          <h1 className="font-display text-2xl font-bold text-slate-900">Pilih Perusahaan</h1>
          <p className="text-slate-500 text-sm mt-1">Halo, {user?.name || user?.email}</p>
        </div>

        <div className="space-y-3">
          {companies.map((company) => (
            <button
              key={company.id}
              onClick={() => handleSelectCompany(company)}
              className="w-full flex items-center gap-4 p-4 border border-slate-200 rounded-xl hover:border-accent hover:bg-accent/5 transition-all text-left"
            >
              <div className="w-12 h-12 rounded-xl bg-accent/10 flex items-center justify-center">
                <Building2 className="w-6 h-6 text-accent" />
              </div>
              <div className="flex-1">
                <p className="font-semibold text-slate-900">{company.name}</p>
                <p className="text-xs text-slate-500">Klik untuk memilih</p>
              </div>
            </button>
          ))}
        </div>

        <button
          onClick={() => navigate('/login')}
          className="w-full mt-6 text-center text-sm text-slate-500 hover:text-slate-700"
        >
          Logout
        </button>
      </div>
    </div>
  );
}
