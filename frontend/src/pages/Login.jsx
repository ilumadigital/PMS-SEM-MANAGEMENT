import React, { useState, useContext } from 'react';
import { AuthContext } from '../context/AuthContext';

const Login = () => {
    const { loginStep1, loginStep2 } = useContext(AuthContext);
    
    // Form States
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [code, setCode] = useState('');
    const [rememberDevice, setRememberDevice] = useState(false);
    
    // UI Flow States
    const [is2FAStep, setIs2FAStep] = useState(false);
    const [userId, setUserId] = useState(null);
    const [error, setError] = useState('');

    // Submit για Email / Password
    const handlePasswordSubmit = async (e) => {
        e.preventDefault();
        setError('');
        try {
            const data = await loginStep1(email, password);
            setUserId(data.userId);
            setIs2FAStep(true);
        } catch (err) {
            setError(err.response?.data?.error || 'Σφάλμα κατά τη σύνδεση');
        }
    };

    // Submit για τον 6ψήφιο 2FA
    const handle2FASubmit = async (e) => {
        e.preventDefault();
        setError('');
        try {
            await loginStep2(userId, code, rememberDevice);
        } catch (err) {
            setError(err.response?.data?.error || 'Μη έγκυρος κωδικός 2FA');
        }
    };

    return (
        <div style={{ maxWidth: '400px', margin: '100px auto', padding: '25px', border: '1px solid #e0e0e0', borderRadius: '12px', fontFamily: 'Arial, sans-serif', boxShadow: '0 4px 12px rgba(0,0,0,0.05)' }}>
            <h2 style={{ textAlign: 'center', color: '#333', marginBottom: '20px' }}>SEM PMS Portal</h2>
            
            {error && <div style={{ background: '#fef2f2', color: '#dc2626', padding: '10px', borderRadius: '6px', marginBottom: '15px', fontSize: '14px', border: '1px solid #fee2e2' }}>{error}</div>}

            {!is2FAStep ? (
                /* ΦΟΡΜΑ Α: EMAIL & PASSWORD */
                <form onSubmit={handlePasswordSubmit}>
                    <div style={{ marginBottom: '15px' }}>
                        <label style={{ fontWeight: 'bold', fontSize: '14px' }}>Email Υπαλλήλου:</label>
                        <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required style={{ width: '100%', padding: '10px', marginTop: '6px', borderRadius: '6px', border: '1px solid #ccc', boxSizing: 'border-box' }} placeholder="e.g. admin@sem.gr" />
                    </div>
                    <div style={{ marginBottom: '20px' }}>
                        <label style={{ fontWeight: 'bold', fontSize: '14px' }}>Κωδικός Πρόσβασης:</label>
                        <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required style={{ width: '100%', padding: '10px', marginTop: '6px', borderRadius: '6px', border: '1px solid #ccc', boxSizing: 'border-box' }} placeholder="••••••••" />
                    </div>
                    <button type="submit" style={{ width: '100%', padding: '12px', background: '#007BFF', color: 'white', border: 'none', borderRadius: '6px', fontWeight: 'bold', cursor: 'pointer', transition: 'background 0.2s' }}>
                        Έλεγχος Στοιχείων
                    </button>
                </form>
            ) : (
                /* ΦΟΡΜΑ Β: ΕΠΑΛΗΘΕΥΣΗ 2FA ΚΛΕΙΔΑΡΙΑΣ */
                <form onSubmit={handle2FASubmit}>
                    <p style={{ fontSize: '13px', color: '#666', textAlign: 'center', marginBottom: '20px' }}>
                        🔒 Ένας κωδικός ασφαλείας στάλθηκε στο email σας. <br/><strong>(Δες το terminal του Backend!)</strong>
                    </p>
                    <div style={{ marginBottom: '15px' }}>
                        <label style={{ fontWeight: 'bold', fontSize: '14px', display: 'block', textAlign: 'center' }}>Εισάγετε τον 6ψήφιο κωδικό:</label>
                        <input type="text" maxLength="6" value={code} onChange={(e) => setCode(e.target.value)} required style={{ width: '100%', padding: '10px', marginTop: '8px', borderRadius: '6px', border: '1px solid #ccc', boxSizing: 'border-box', textAlign: 'center', fontSize: '22px', fontWeight: 'bold', letterSpacing: '6px' }} placeholder="000000" />
                    </div>
                    <div style={{ marginBottom: '20px' }}>
                        <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', fontSize: '14px', color: '#444' }}>
                            <input type="checkbox" checked={rememberDevice} onChange={(e) => setRememberDevice(e.target.checked)} />
                            Έμπιστη συσκευή (Παράκαμψη 2FA για 30 μέρες)
                        </label>
                    </div>
                    <button type="submit" style={{ width: '100%', padding: '12px', background: '#10b981', color: 'white', border: 'none', borderRadius: '6px', fontWeight: 'bold', cursor: 'pointer' }}>
                        Επαλήθευση & Είσοδος
                    </button>
                </form>
            )}
        </div>
    );
};

export default Login;