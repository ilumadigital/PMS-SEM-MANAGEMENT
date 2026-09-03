import React, { useContext } from 'react';
import {
  BrowserRouter,
  Routes,
  Route,
  Navigate,
} from 'react-router-dom';

import { AuthProvider, AuthContext } from './context/AuthContext';
import { CloudbedsDataProvider } from './context/CloudbedsDataContext';
import Login from './pages/Login';
import AppShell from './components/AppShell';

import DashboardPage from './pages/DashboardPage';
import BookingsPage from './pages/BookingsPage';
import CustomersPage from './pages/CustomersPage';
import RoomsPage from './pages/RoomsPage';
import StatisticsPage from './pages/StatisticsPage';
import SettingsPage from './pages/SettingsPage';

import ReceptionDash from './pages/ReceptionDash';
import SupervisorPanel from './pages/SupervisorPanel';
import CleaningMobile from './pages/CleaningMobile';

import ShuttlePage from './pages/ShuttlePage';

const ProtectedApp = () => {
  const { user } = useContext(AuthContext);

  if (!user) {
    return <Login />;
  }

  return (
    <CloudbedsDataProvider>
      <BrowserRouter>
      <Routes>
        <Route path="/" element={<AppShell />}>
          <Route index element={<Navigate to="/dashboard" replace />} />

          <Route path="dashboard" element={<DashboardPage />} />
          <Route path="bookings" element={<BookingsPage />} />
          <Route path="customers" element={<CustomersPage />} />
          <Route path="rooms" element={<RoomsPage />} />
          <Route path="statistics" element={<StatisticsPage />} />
          <Route path="settings" element={<SettingsPage />} />

          <Route path="reception" element={<ReceptionDash />} />
          <Route path="supervisor" element={<SupervisorPanel />} />
          <Route path="cleaning-mobile" element={<CleaningMobile />} />
          <Route path="shuttle" element={<ShuttlePage />} />
        </Route>

        <Route path="*" element={<Navigate to="/dashboard" replace />} />
      </Routes>
      </BrowserRouter>
    </CloudbedsDataProvider>
  );
};

function App() {
  return (
    <AuthProvider>
      <ProtectedApp />
    </AuthProvider>
  );
}

export default App;