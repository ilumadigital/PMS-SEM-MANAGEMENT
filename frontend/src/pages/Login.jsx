import React, { useContext, useState } from 'react';
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

    const handlePasswordSubmit = async (event) => {
        event.preventDefault();
        setError('');
        try {
            const data = await loginStep1(email, password);
            setUserId(data.userId);
            setIs2FAStep(true);
        } catch (err) {
            setError(err.response?.data?.error || 'Σφάλμα κατά τη σύνδεση');
        }
    };

    const handle2FASubmit = async (event) => {
        event.preventDefault();
        setError('');
        try {
            await loginStep2(userId, code, rememberDevice);
        } catch (err) {
            setError(err.response?.data?.error || 'Μη έγκυρος κωδικός 2FA');
        }
    };

    return (
        <div style={styles.page}>
            <div style={styles.glowOne} />
            <div style={styles.glowTwo} />
            <div style={styles.card}>
                <div style={styles.logoBox}><div style={styles.logo}>SEM</div></div>
                <h1 style={styles.title}>SEM PMS</h1>
                <p style={styles.subtitle}>Property operations, reservations and guest management in one workspace.</p>

                {error && <div style={styles.errorBox}>{error}</div>}

                {!is2FAStep ? (
                    <form onSubmit={handlePasswordSubmit} style={styles.form}>
                        <div style={styles.fieldGroup}>
                            <label style={styles.label}>Email</label>
                            <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required style={styles.input} placeholder="admin@sem.gr" />
                        </div>
                        <div style={styles.fieldGroup}>
                            <label style={styles.label}>Password</label>
                            <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required style={styles.input} placeholder="••••••••" />
                        </div>
                        <button type="submit" style={styles.primaryButton}>Continue</button>
                    </form>
                ) : (
                    <form onSubmit={handle2FASubmit} style={styles.form}>
                        <div style={styles.infoBox}>
                            <strong style={{ fontWeight: 600 }}>Security verification</strong>
                            <span>A 6-digit code was sent to your email.</span>
                        </div>
                        <div style={styles.fieldGroup}>
                            <label style={{ ...styles.label, textAlign: 'center' }}>Enter the 6-digit code</label>
                            <input type="text" inputMode="numeric" maxLength="6" value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))} required style={styles.codeInput} placeholder="000000" />
                        </div>
                        <label style={styles.checkboxLabel}>
                            <input type="checkbox" checked={rememberDevice} onChange={(e) => setRememberDevice(e.target.checked)} />
                            Trust this device for 30 days
                        </label>
                        <button type="submit" style={styles.primaryButton}>Verify and sign in</button>
                        <button type="button" onClick={() => { setIs2FAStep(false); setCode(''); setError(''); }} style={styles.secondaryButton}>Back to sign in</button>
                    </form>
                )}
            </div>
        </div>
    );
};

const font = '"Google Sans", "Google Sans Text", Arial, sans-serif';
const styles = {
    page: {
        minHeight: '100vh', width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: '24px', background: 'linear-gradient(180deg, #f8faff 0%, #f2f5fb 100%)', fontFamily: font,
        boxSizing: 'border-box', position: 'relative', overflow: 'hidden', color: '#0f172a',
    },
    glowOne: { position: 'absolute', width: '520px', height: '520px', borderRadius: '999px', background: 'rgba(37,99,235,.11)', filter: 'blur(80px)', top: '-260px', right: '-160px' },
    glowTwo: { position: 'absolute', width: '420px', height: '420px', borderRadius: '999px', background: 'rgba(14,165,233,.08)', filter: 'blur(90px)', bottom: '-260px', left: '-120px' },
    card: {
        width: '100%', maxWidth: '430px', background: 'rgba(255,255,255,.96)', border: '1px solid #e2e8f0',
        borderRadius: '24px', padding: '36px', boxShadow: '0 28px 80px rgba(15,23,42,.12)',
        boxSizing: 'border-box', position: 'relative', backdropFilter: 'blur(18px)',
    },
    logoBox: { display: 'flex', justifyContent: 'center', marginBottom: '18px' },
    logo: {
        width: '58px', height: '58px', borderRadius: '17px', display: 'flex', alignItems: 'center', justifyContent: 'center',
        background: 'linear-gradient(145deg, #3b82f6, #1d4ed8)', color: '#fff', fontWeight: 700, fontSize: '16px',
        letterSpacing: '.04em', boxShadow: '0 12px 26px rgba(37,99,235,.28)', fontFamily: font,
    },
    title: { margin: 0, textAlign: 'center', color: '#0f172a', fontSize: '28px', lineHeight: 1.15, fontWeight: 700, letterSpacing: '-.03em', fontFamily: font },
    subtitle: { margin: '10px auto 28px', maxWidth: '330px', textAlign: 'center', color: '#64748b', fontSize: '14px', lineHeight: 1.55, fontWeight: 400 },
    form: { display: 'flex', flexDirection: 'column', gap: '18px' },
    fieldGroup: { display: 'flex', flexDirection: 'column', gap: '7px' },
    label: { color: '#334155', fontWeight: 600, fontSize: '13px' },
    input: {
        width: '100%', padding: '13px 14px', borderRadius: '12px', border: '1px solid #cbd5e1', background: '#fff',
        color: '#0f172a', fontSize: '15px', fontWeight: 400, outline: 'none', boxSizing: 'border-box', fontFamily: font,
    },
    codeInput: {
        width: '100%', padding: '14px', borderRadius: '12px', border: '1px solid #cbd5e1', background: '#fff', color: '#0f172a',
        textAlign: 'center', fontSize: '24px', fontWeight: 600, letterSpacing: '7px', outline: 'none', boxSizing: 'border-box', fontFamily: font,
    },
    primaryButton: {
        width: '100%', padding: '14px', background: 'linear-gradient(180deg, #2f6fed, #2563eb)', color: '#fff',
        border: '1px solid #1d4ed8', borderRadius: '12px', fontWeight: 600, fontSize: '15px', cursor: 'pointer',
        boxShadow: '0 10px 22px rgba(37,99,235,.22)', fontFamily: font,
    },
    secondaryButton: {
        width: '100%', padding: '12px', background: '#f8fafc', color: '#334155', border: '1px solid #e2e8f0',
        borderRadius: '12px', fontWeight: 600, fontSize: '14px', cursor: 'pointer', fontFamily: font,
    },
    errorBox: { background: '#fff1f2', color: '#be123c', padding: '12px 14px', borderRadius: '12px', marginBottom: '18px', fontSize: '13px', border: '1px solid #fecdd3' },
    infoBox: { display: 'flex', flexDirection: 'column', gap: '5px', background: '#eff6ff', color: '#1d4ed8', padding: '14px', borderRadius: '14px', fontSize: '13px', border: '1px solid #bfdbfe', textAlign: 'center' },
    checkboxLabel: { display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', fontSize: '13px', color: '#475569', fontWeight: 400 },
};

export default Login;
