import { Routes, Route, Navigate } from 'react-router-dom';
import { Layout } from './components/Layout';
import RoutePage from './pages/RoutePage';
import ScanPage from './pages/ScanPage';
import CapturePage from './pages/CapturePage';
import ReviewPage from './pages/ReviewPage';
import MetersPage from './pages/MetersPage';
import ExportPage from './pages/ExportPage';
import SettingsPage from './pages/SettingsPage';
import ReadingDetailPage from './pages/ReadingDetailPage';

export default function App() {
  return (
    <Layout>
      <Routes>
        <Route path="/" element={<RoutePage />} />
        <Route path="/scan" element={<ScanPage />} />
        <Route path="/capture/:meterId" element={<CapturePage />} />
        <Route path="/review" element={<ReviewPage />} />
        <Route path="/reading/:id" element={<ReadingDetailPage />} />
        <Route path="/meters" element={<MetersPage />} />
        <Route path="/export" element={<ExportPage />} />
        <Route path="/settings" element={<SettingsPage />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </Layout>
  );
}
