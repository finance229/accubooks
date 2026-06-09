import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider } from './contexts/AuthContext';
import { CompanyProvider } from './contexts/CompanyContext';
import Dashboard from './pages/Dashboard';
import Transactions from './pages/Transactions';
import Reports from './pages/Reports';
import Contacts from './pages/Contacts';
import Documents from './pages/Documents';
import ChartOfAccounts from './pages/ChartOfAccounts';
import JournalEntries from './pages/JournalEntries';
import Ledger from './pages/Ledger';
import Invoices from './pages/Invoices';
import PaymentRequests from './pages/PaymentRequests';
import FixedAssets from './pages/FixedAssets';
import Settings from './pages/Settings';
import Projects from './pages/Projects';
import Login from './pages/Login';
import SelectCompany from './pages/SelectCompany';
import Layout from './components/Layout';
import ProtectedRoute from './components/ProtectedRoute';
import Vendors from './pages/Vendors';
import PurchaseInvoices from './pages/PurchaseInvoices';
// TAMBAHKAN IMPORT INI
import IncomeStatement from './pages/IncomeStatement';
import BalanceSheet from './pages/BalanceSheet';
import RecurringTransactions from './pages/RecurringTransactions';

function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <CompanyProvider>
          <Routes>
            <Route path="/login" element={<Login />} />
            <Route path="/select-company" element={<SelectCompany />} />
            <Route path="/" element={
              <ProtectedRoute>
                <Layout />
              </ProtectedRoute>
            }>
              <Route index element={<Navigate to="/dashboard" replace />} />
              <Route path="dashboard" element={<Dashboard />} />
              <Route path="transactions" element={<Transactions />} />
              <Route path="reports" element={<Reports />} />
              <Route path="contacts" element={<Contacts />} />
              <Route path="documents" element={<Documents />} />
              <Route path="chart-of-accounts" element={<ChartOfAccounts />} />
              <Route path="journal-entries" element={<JournalEntries />} />
              <Route path="ledger" element={<Ledger />} />
              <Route path="invoices" element={<Invoices />} />
              <Route path="payment-requests" element={<PaymentRequests />} />
              <Route path="fixed-assets" element={<FixedAssets />} />
              <Route path="settings" element={<Settings />} />
              <Route path="projects" element={<Projects />} />
              <Route path="vendors" element={<Vendors />} />
              <Route path="purchase-invoices" element={<PurchaseInvoices />} />
              {/* TAMBAHKAN ROUTE INI */}
              <Route path="income-statement" element={<IncomeStatement />} />
              <Route path="balance-sheet" element={<BalanceSheet />} />
              <Route path="recurring-transactions" element={<RecurringTransactions />} />
            </Route>
          </Routes>
        </CompanyProvider>
      </AuthProvider>
    </BrowserRouter>
  );
}

export default App;
