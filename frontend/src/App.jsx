import React, { useContext } from 'react';
import { AuthProvider, AuthContext } from './context/AuthContext';
import Login from './pages/Login';
import ManagementDash from './pages/ManagementDash'; // <-- Κάνουμε import το νέο Dashboard

const MainLayout = () => {
    const { user, logout } = useContext(AuthContext);

    // Αν δεν έχει γίνει login, δείξε την οθόνη Login
    if (!user) {
        return <Login />;
    }

    // Αν έχει γίνει επιτυχές login, δείξε το Dashboard
    return (
        <div style={{ position: 'relative' }}>
            {/* Κουμπί Έξοδου τοποθετημένο πάνω δεξιά πάνω από το Dashboard */}
            <button 
                onClick={logout} 
                style={{ 
                    position: 'absolute', 
                    top: '35px', 
                    right: '30px', 
                    padding: '8px 16px', 
                    background: '#ef4444', 
                    color: 'white', 
                    border: 'none', 
                    borderRadius: '6px', 
                    fontWeight: 'bold', 
                    cursor: 'pointer',
                    zIndex: 1000,
                    boxShadow: '0 4px 6px -1px rgba(0,0,0,0.2)'
                }}
            >
                Έξοδος ({user.firstName})
            </button>
            
            {/* Το νέο εντυπωσιακό UI */}
            <ManagementDash />
        </div>
    );
};

function App() {
    return (
        <AuthProvider>
            <MainLayout />
        </AuthProvider>
    );
}

export default App;