import React, { useContext } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, AuthContext } from './context/AuthContext';
import { CloudbedsDataProvider } from './context/CloudbedsDataContext';
import Login from './pages/Login';
import AppShell from './components/AppShell';
import DashboardPage from './pages/DashboardPage';
import BookingsPage from './pages/BookingsPage';
import CalendarPage from './pages/CalendarPage';
import CustomersPage from './pages/CustomersPage';
import RoomsPage from './pages/RoomsPage';
import StatisticsPage from './pages/StatisticsPage';
import SettingsPage from './pages/SettingsPage';
import GuestPortalPage from './pages/GuestPortalPage';
import GuestPortalAdminPage from './pages/GuestPortalAdminPage';
import ReceptionDash from './pages/ReceptionDash';
import SupervisorPanel from './pages/SupervisorPanel';
import CleaningMobile from './pages/CleaningMobile';
import ShuttlePage from './pages/ShuttlePage';
import CleanerSchedulePage from './pages/CleanerSchedulePage';
import DriverSchedulePage from './pages/DriverSchedulePage';

const role = (user) => String(user?.role || '').toLowerCase();
const allowed = (user, roles) => roles.includes(role(user));
const Gate = ({ user, roles, children }) => allowed(user, roles) ? children : <Navigate to="/dashboard" replace />;
const ALL_STAFF = ['admin','manager','management','reception','supervisor','cleaneradmin','cleaner','cleaning','driversadmin','driver','dispatcher'];
const COMPANY_MANAGERS = ['admin','manager','management'];

const RoleHome = ({ user }) => {
  const r=role(user);
  if (['cleaner','cleaning'].includes(r)) return <Navigate to="/my-cleaning" replace />;
  if (r==='cleaneradmin') return <Navigate to="/cleaning-mobile" replace />;
  if (r==='driver') return <Navigate to="/my-shuttles" replace />;
  if (['driversadmin','dispatcher'].includes(r)) return <Navigate to="/shuttle" replace />;
  return <DashboardPage />;
};

const ProtectedRoutes = () => {
  const { user } = useContext(AuthContext);
  if (!user) return <Login />;
  return <CloudbedsDataProvider><Routes>
    <Route path="/" element={<AppShell />}>
      <Route index element={<Navigate to="/dashboard" replace />} />
      <Route path="dashboard" element={<Gate user={user} roles={ALL_STAFF}><RoleHome user={user} /></Gate>} />
      <Route path="reception" element={<Gate user={user} roles={[...COMPANY_MANAGERS,'reception']}><ReceptionDash /></Gate>} />
      <Route path="calendar" element={<Gate user={user} roles={[...COMPANY_MANAGERS,'reception','supervisor']}><CalendarPage /></Gate>} />
      <Route path="bookings" element={<Gate user={user} roles={[...COMPANY_MANAGERS,'reception','supervisor']}><BookingsPage /></Gate>} />
      <Route path="guest-management" element={<Gate user={user} roles={[...COMPANY_MANAGERS,'reception','supervisor']}><GuestPortalAdminPage /></Gate>} />
      <Route path="customers" element={<Gate user={user} roles={[...COMPANY_MANAGERS,'reception']}><CustomersPage /></Gate>} />
      <Route path="rooms" element={<Gate user={user} roles={[...COMPANY_MANAGERS,'reception','supervisor']}><RoomsPage /></Gate>} />
      <Route path="statistics" element={<Gate user={user} roles={[...COMPANY_MANAGERS,'supervisor']}><StatisticsPage /></Gate>} />
      <Route path="settings" element={<Gate user={user} roles={['admin']}><SettingsPage /></Gate>} />
      <Route path="supervisor" element={<Gate user={user} roles={[...COMPANY_MANAGERS,'supervisor']}><SupervisorPanel /></Gate>} />
      <Route path="my-cleaning" element={<Gate user={user} roles={['cleaner','cleaning']}><CleanerSchedulePage /></Gate>} />
      <Route path="my-shuttles" element={<Gate user={user} roles={['driver']}><DriverSchedulePage /></Gate>} />
      <Route path="cleaning-mobile" element={<Gate user={user} roles={[...COMPANY_MANAGERS,'supervisor','cleaneradmin']}><CleaningMobile /></Gate>} />
      <Route path="shuttle" element={<Gate user={user} roles={[...COMPANY_MANAGERS,'reception','supervisor','driversadmin','dispatcher']}><ShuttlePage /></Gate>} />
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
