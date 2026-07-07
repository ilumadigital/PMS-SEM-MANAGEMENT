import React, { useState, useContext } from 'react';
import { AuthContext } from '../context/AuthContext';

const Login = () => {
    const { loginStep1, loginStep2 } = useContext(AuthContext);

    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [code, setCode] = useState('');
    const [rememberDevice, setRememberDevice] = useState(false);

    const [is2FAStep, setIs2FAStep] = useState(false);
    const [userId, setUserId] = useState(null);
    const [error, setError] = useState('');

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
        <div style={styles.page}>
            <div style={styles.card}>
                <div style={styles.logoBox}>
                    <div style={styles.logo}>SEM</div>
                </div>

                <h1 style={styles.title}>SEM PMS Portal</h1>
                <p style={styles.subtitle}>
                    Συνδεθείτε για πρόσβαση στη διαχείριση λειτουργιών.
                </p>

                {error && (
                    <div style={styles.errorBox}>
                        {error}
                    </div>
                )}

                {!is2FAStep ? (
                    <form onSubmit={handlePasswordSubmit} style={styles.form}>
                        <div style={styles.fieldGroup}>
                            <label style={styles.label}>Email Υπαλλήλου</label>
                            <input
                                type="email"
                                value={email}
                                onChange={(e) => setEmail(e.target.value)}
                                required
                                style={styles.input}
                                placeholder="admin@sem.gr"
                            />
                        </div>

                        <div style={styles.fieldGroup}>
                            <label style={styles.label}>Κωδικός Πρόσβασης</label>
                            <input
                                type="password"
                                value={password}
                                onChange={(e) => setPassword(e.target.value)}
                                required
                                style={styles.input}
                                placeholder="••••••••"
                            />
                        </div>

                        <button type="submit" style={styles.primaryButton}>
                            Έλεγχος Στοιχείων
                        </button>
                    </form>
                ) : (
                    <form onSubmit={handle2FASubmit} style={styles.form}>
                        <div style={styles.infoBox}>
                            <strong>Επαλήθευση ασφαλείας</strong>
                            <span>
                                Ένας 6ψήφιος κωδικός στάλθηκε στο email σας.
                            </span>
                        </div>

                        <div style={styles.fieldGroup}>
                            <label style={{ ...styles.label, textAlign: 'center' }}>
                                Εισάγετε τον 6ψήφιο κωδικό
                            </label>
                            <input
                                type="text"
                                maxLength="6"
                                value={code}
                                onChange={(e) => setCode(e.target.value)}
                                required
                                style={styles.codeInput}
                                placeholder="000000"
                            />
                        </div>

                        <label style={styles.checkboxLabel}>
                            <input
                                type="checkbox"
                                checked={rememberDevice}
                                onChange={(e) => setRememberDevice(e.target.checked)}
                            />
                            Έμπιστη συσκευή για 30 ημέρες
                        </label>

                        <button type="submit" style={styles.successButton}>
                            Επαλήθευση & Είσοδος
                        </button>

                        <button
                            type="button"
                            onClick={() => {
                                setIs2FAStep(false);
                                setCode('');
                                setError('');
                            }}
                            style={styles.secondaryButton}
                        >
                            Πίσω στη σύνδεση
                        </button>
                    </form>
                )}
            </div>
        </div>
    );
};

const styles = {
    page: {
        minHeight: '100vh',
        width: '100%',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '24px',
        background: 'linear-gradient(135deg, #eef2ff 0%, #f8fafc 45%, #e0f2fe 100%)',
        fontFamily: 'Inter, Arial, sans-serif',
        boxSizing: 'border-box',
    },
    card: {
        width: '100%',
        maxWidth: '430px',
        background: '#ffffff',
        border: '1px solid #e5e7eb',
        borderRadius: '22px',
        padding: '36px',
        boxShadow: '0 24px 70px rgba(15, 23, 42, 0.14)',
        boxSizing: 'border-box',
    },
    logoBox: {
        display: 'flex',
        justifyContent: 'center',
        marginBottom: '18px',
    },
    logo: {
        width: '64px',
        height: '64px',
        borderRadius: '18px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'linear-gradient(135deg, #2563eb, #4f46e5)',
        color: '#ffffff',
        fontWeight: '800',
        fontSize: '18px',
        letterSpacing: '1px',
        boxShadow: '0 12px 30px rgba(37, 99, 235, 0.35)',
    },
    title: {
        margin: '0',
        textAlign: 'center',
        color: '#111827',
        fontSize: '26px',
        fontWeight: '800',
    },
    subtitle: {
        margin: '10px 0 28px',
        textAlign: 'center',
        color: '#6b7280',
        fontSize: '14px',
        lineHeight: '1.5',
    },
    form: {
        display: 'flex',
        flexDirection: 'column',
        gap: '18px',
    },
    fieldGroup: {
        display: 'flex',
        flexDirection: 'column',
        gap: '8px',
    },
    label: {
        color: '#374151',
        fontWeight: '700',
        fontSize: '14px',
    },
    input: {
        width: '100%',
        padding: '13px 14px',
        borderRadius: '12px',
        border: '1px solid #d1d5db',
        background: '#ffffff',
        color: '#111827',
        fontSize: '15px',
        outline: 'none',
        boxSizing: 'border-box',
    },
    codeInput: {
        width: '100%',
        padding: '14px',
        borderRadius: '12px',
        border: '1px solid #d1d5db',
        background: '#ffffff',
        color: '#111827',
        textAlign: 'center',
        fontSize: '24px',
        fontWeight: '800',
        letterSpacing: '8px',
        outline: 'none',
        boxSizing: 'border-box',
    },
    primaryButton: {
        width: '100%',
        padding: '14px',
        background: 'linear-gradient(135deg, #2563eb, #4f46e5)',
        color: '#ffffff',
        border: 'none',
        borderRadius: '12px',
        fontWeight: '800',
        fontSize: '15px',
        cursor: 'pointer',
        boxShadow: '0 14px 30px rgba(37, 99, 235, 0.28)',
    },
    successButton: {
        width: '100%',
        padding: '14px',
        background: 'linear-gradient(135deg, #059669, #10b981)',
        color: '#ffffff',
        border: 'none',
        borderRadius: '12px',
        fontWeight: '800',
        fontSize: '15px',
        cursor: 'pointer',
        boxShadow: '0 14px 30px rgba(16, 185, 129, 0.24)',
    },
    secondaryButton: {
        width: '100%',
        padding: '12px',
        background: '#f3f4f6',
        color: '#374151',
        border: '1px solid #e5e7eb',
        borderRadius: '12px',
        fontWeight: '700',
        cursor: 'pointer',
    },
    errorBox: {
        background: '#fef2f2',
        color: '#b91c1c',
        padding: '12px 14px',
        borderRadius: '12px',
        marginBottom: '18px',
        fontSize: '14px',
        border: '1px solid #fecaca',
    },
    infoBox: {
        display: 'flex',
        flexDirection: 'column',
        gap: '6px',
        background: '#eff6ff',
        color: '#1e40af',
        padding: '14px',
        borderRadius: '14px',
        fontSize: '14px',
        border: '1px solid #bfdbfe',
        textAlign: 'center',
    },
    checkboxLabel: {
        display: 'flex',
        alignItems: 'center',
        gap: '8px',
        cursor: 'pointer',
        fontSize: '14px',
        color: '#4b5563',
    },
};

export default Login;