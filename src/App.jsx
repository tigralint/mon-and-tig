import { Routes, Route, Navigate } from 'react-router-dom';
import Layout from './components/Layout/Layout';
import DashboardPage from './features/dashboard/pages/DashboardPage';
import DocumentsPage from './features/documents/pages/DocumentsPage';
import DocumentViewPage from './features/documents/pages/DocumentViewPage';

import FlashcardsPage from './features/flashcards/pages/FlashcardsPage';
import StudySessionPage from './features/flashcards/pages/StudySessionPage';

import SearchPage from './features/search/pages/SearchPage';
import ConstellationPage from './features/constellation/pages/ConstellationPage';
import BillingPage from './features/billing/pages/BillingPage';

function App() {
  return (
    <Routes>
      <Route path="/" element={<Layout />}>
        <Route index element={<Navigate to="/dashboard" replace />} />
        <Route path="dashboard" element={<DashboardPage />} />
        <Route path="documents" element={<DocumentsPage />} />
        <Route path="documents/:id" element={<DocumentViewPage />} />
        <Route path="flashcards" element={<FlashcardsPage />} />
        <Route path="flashcards/study" element={<StudySessionPage />} />
        <Route path="search" element={<SearchPage />} />
        <Route path="constellation" element={<ConstellationPage />} />
        <Route path="billing" element={<BillingPage />} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

export default App;
