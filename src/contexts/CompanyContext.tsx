import { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from './AuthContext';

type Company = {
  id: number;
  name: string;
};

type CompanyContextType = {
  companies: Company[];
  currentCompany: Company | null;
  setCurrentCompany: (company: Company) => void;
  isLoading: boolean;
  fetchCompanies: () => Promise<void>;
};

const CompanyContext = createContext<CompanyContextType | undefined>(undefined);

export function CompanyProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const [companies, setCompanies] = useState<Company[]>([]);
  const [currentCompany, setCurrentCompany] = useState<Company | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const fetchCompanies = async () => {
    if (!user) {
      setCompanies([]);
      setIsLoading(false);
      return;
    }

    try {
      // Ambil daftar perusahaan yang boleh diakses user
      const { data, error } = await supabase
        .from('user_companies')
        .select('company_id, companies(id, name)')
        .eq('user_id', user.id);

      if (error) throw error;

      const companyList = (data || []).map(item => ({
        id: item.company_id,
        name: item.companies?.name || `Company ${item.company_id}`,
      }));

      setCompanies(companyList);

      // Set perusahaan default (yang pertama)
      if (companyList.length > 0 && !currentCompany) {
        setCurrentCompany(companyList[0]);
      }
    } catch (error) {
      console.error('Error fetching companies:', error);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (user) {
      fetchCompanies();
    } else {
      setCompanies([]);
      setCurrentCompany(null);
      setIsLoading(false);
    }
  }, [user]);

  return (
    <CompanyContext.Provider
      value={{
        companies,
        currentCompany,
        setCurrentCompany,
        isLoading,
        fetchCompanies,
      }}
    >
      {children}
    </CompanyContext.Provider>
  );
}

export function useCompany() {
  const context = useContext(CompanyContext);
  if (context === undefined) {
    throw new Error('useCompany must be used within a CompanyProvider');
  }
  return context;
}
