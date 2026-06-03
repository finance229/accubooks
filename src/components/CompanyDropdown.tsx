import { useState, useRef, useEffect } from 'react';
import { ChevronDown, Building2, Check } from 'lucide-react';
import { useCompany } from '../contexts/CompanyContext';
import { useAuth } from '../contexts/AuthContext';

export default function CompanyDropdown() {
  const { user } = useAuth();
  const { companies, currentCompany, setCurrentCompany } = useCompany();
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Hanya tampilkan untuk role super_admin dan direktur
  const canSwitchCompany = user?.role === 'super_admin' || user?.role === 'direktur';
  
  // Jika hanya punya 1 perusahaan, tidak perlu dropdown
  const showDropdown = canSwitchCompany && companies.length > 1;

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  if (!showDropdown || !currentCompany) {
    return null;
  }

  return (
    <div className="relative" ref={dropdownRef}>
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center gap-2 px-3 py-2 bg-background border border-border rounded-lg hover:border-accent transition-colors"
      >
        <Building2 className="w-4 h-4 text-accent" />
        <span className="text-sm font-medium text-text">{currentCompany.name}</span>
        <ChevronDown className={`w-4 h-4 text-text-muted transition-transform ${isOpen ? 'rotate-180' : ''}`} />
      </button>

      {isOpen && (
        <div className="absolute right-0 mt-2 w-64 bg-surface border border-border rounded-lg shadow-lg z-50 overflow-hidden">
          <div className="py-2">
            <div className="px-3 py-2 text-xs font-semibold text-text-muted uppercase border-b border-border">
              Pilih Perusahaan
            </div>
            {companies.map((company) => (
              <button
                key={company.id}
                onClick={() => {
                  setCurrentCompany(company);
                  setIsOpen(false);
                }}
                className={`w-full flex items-center justify-between px-4 py-2.5 text-sm hover:bg-background transition-colors ${
                  currentCompany.id === company.id ? 'text-accent font-medium' : 'text-text'
                }`}
              >
                <span>{company.name}</span>
                {currentCompany.id === company.id && <Check className="w-4 h-4" />}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
