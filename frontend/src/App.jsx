import React, { useContext } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
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
import GuestPortalPage from './pages/GuestPortalPage';
import ReceptionDash from './pages/ReceptionDash';
import SupervisorPanel from './pages/SupervisorPanel';
import CleaningMobile from './pages/CleaningMobile';
import ShuttlePage from './pages/ShuttlePage';

const role = (user) => String(user?.role || '').toLowerCase();
const allowed = (user, roles) => roles.includes(role(user));
const Gate = ({ user, roles, children }) => allowed(user, roles) ? children : <Navigate to="/dashboard" replace />;
const ALL_STAFF = ['admin','management','reception','supervisor','cleaner','cleaning','driver','dispatcher'];

const ProtectedRoutes = () => {
  const { user } = useContext(AuthContext);
  if (!user) return <Login />;
  return <CloudbedsDataProvider><Routes>
    <Route path="/" element={<AppShell />}>
      <Route index element={<Navigate to="/dashboard" replace />} />
      <Route path="dashboard" element={<Gate user={user} roles={ALL_STAFF}><DashboardPage /></Gate>} />
      <Route path="bookings" element={<Gate user={user} roles={['admin','management','reception','supervisor']}><BookingsPage /></Gate>} />
      <Route path="customers" element={<Gate user={user} roles={['admin','management','reception']}><CustomersPage /></Gate>} />
      <Route path="rooms" element={<Gate user={user} roles={['admin','management','reception','supervisor','cleaner','cleaning']}><RoomsPage /></Gate>} />
      <Route path="statistics" element={<Gate user={user} roles={['admin','management','supervisor']}><StatisticsPage /></Gate>} />
      <Route path="settings" element={<Gate user={user} roles={['admin','management']}><SettingsPage /></Gate>} />
      <Route path="reception" element={<Gate user={user} roles={['admin','management','reception']}><ReceptionDash /></Gate>} />
      <Route path="supervisor" element={<Gate user={user} roles={['admin','management','supervisor']}><SupervisorPanel /></Gate>} />
      <Route path="cleaning-mobile" element={<Gate user={user} roles={['admin','management','supervisor','cleaner','cleaning']}><CleaningMobile /></Gate>} />
      <Route path="shuttle" element={<Gate user={user} roles={['admin','management','reception','supervisor','driver','dispatcher']}><ShuttlePage /></Gate>} />
    </Route>
    <Route path="*" element={<Navigate to="/dashboard" replace />} />
  </Routes></CloudbedsDataProvider>;
};

function App() {
  return <BrowserRouter><Routes>
    <Route path="/guest/:token" element={<GuestPortalPage />} />
    <Route path="/guest/:token/check-in" element={<GuestPortalPage forceCheckin />} />
    <Route path="/*" element={<AuthProvider><ProtectedRoutes /></AuthProvider>} />
  </Routes></BrowserRouter>;
}
export default App;
