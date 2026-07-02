import React, { useContext } from 'react';
import { AuthProvider, AuthContext } from './context/AuthContext';
import Login from './pages/Login';

const MainLayout = () => {
    const { user, logout } = useContext(AuthContext);

    // Αν δεν έχει γίνει login, δείξε την οθόνη Login
    if (!user) {
        return <Login />;
    }

    // Αν έχει γίνει επιτυχές login, δείξε το welcome screen
    return (
        <div style={{ padding: '40px', fontFamily: 'Arial, sans-serif', textAlign: 'center' }}>
            <div style={{ maxWidth: '500px', margin: '0 auto', padding: '30px', border: '1px solid #d1fae5', background: '#ecfdf5', borderRadius: '12px' }}>
                <h1 style={{ color: '#065f46', margin: '0 0 10px 0' }}>🎉 Σύνδεση Επιτυχής!</h1>
                <p style={{ fontSize: '18px', color: '#047857' }}>
                    Καλώς ήρθες στο PMS, <strong>{user.firstName} {user.lastName}</strong>
                </p>
                <div style={{ margin: '20px 0', padding: '10px', background: 'white', borderRadius: '6px', border: '1px solid #b1f1d1', display: 'inline-block' }}>
                    Επίπεδο Πρόσβασης: <span style={{ fontWeight: 'bold', textTransform: 'uppercase', color: '#007BFF' }}>{user.role}</span>
                </div>
                <br />
                <button onClick={logout} style={{ padding: '10px 25px', background: '#ef4444', color: 'white', border: 'none', borderRadius: '6px', fontWeight: 'bold', cursor: 'pointer', marginTop: '10px' }}>
                    Έξοδος (Logout)
                </button>
            </div>
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