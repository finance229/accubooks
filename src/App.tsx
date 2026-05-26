import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
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
import Layout from './components/Layout';

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Layout />}>
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
        </Route>
      </Routes>
    </BrowserRouter>
  );
}

export default App;
