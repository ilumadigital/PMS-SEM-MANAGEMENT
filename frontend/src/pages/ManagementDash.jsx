import React, { useState, useEffect } from 'react';
import api from '../services/api'; // Το api.js που φτιάξαμε πριν

const ManagementDash = () => {
  const [stats, setStats] = useState({
    occupancy: 0,
    arrivals: 0,
    departures: 0,
    revenue: 0
  });
  const [loading, setLoading] = useState(true);

  // Εδώ μελλοντικά θα τραβάμε τα αληθινά δεδομένα από το backend
  useEffect(() => {
    const fetchStats = async () => {
      try {
        // Προσωρινά βάζουμε mock data μέχρι να φτιάξουμε τα API endpoints
        setTimeout(() => {
          setStats({
            occupancy: 85,
            arrivals: 12,
            departures: 8,
            revenue: 3450
          });
          setLoading(false);
        }, 800);
      } catch (error) {
        console.error("Σφάλμα κατά τη φόρτωση των στατιστικών", error);
      }
    };
    fetchStats();
  }, []);

  if (loading) {
    return (
      <div style={styles.loadingContainer}>
        <h2 style={{ color: '#deff9a' }}>Φόρτωση SEM Portal...</h2>
      </div>
    );
  }

  return (
    <div style={styles.dashboardContainer}>
      {/* Header */}
      <div style={styles.header}>
        <h1 style={styles.title}>Management <span style={{ color: '#deff9a' }}>Overview</span></h1>
        <p style={styles.subtitle}>Ημερήσια Στατιστικά & KPI's</p>
      </div>

      {/* KPI Widgets */}
      <div style={styles.grid}>
        {/* Widget 1: Πληρότητα */}
        <div style={styles.card}>
          <div style={styles.cardHeader}>
            <span style={styles.cardIcon}>📊</span>
            <h3 style={styles.cardTitle}>Πληρότητα</h3>
          </div>
          <div style={styles.cardNumber}>{stats.occupancy}%</div>
          <div style={styles.progressBar}>
            <div style={{ ...styles.progressFill, width: `${stats.occupancy}%` }}></div>
          </div>
        </div>

        {/* Widget 2: Αφίξεις */}
        <div style={styles.card}>
          <div style={styles.cardHeader}>
            <span style={styles.cardIcon}>🛬</span>
            <h3 style={styles.cardTitle}>Αφίξεις Σήμερα</h3>
          </div>
          <div style={styles.cardNumber}>{stats.arrivals}</div>
          <p style={styles.cardSubtext}>Εκκρεμούν 4 check-ins</p>
        </div>

        {/* Widget 3: Αναχωρήσεις */}
        <div style={styles.card}>
          <div style={styles.cardHeader}>
            <span style={styles.cardIcon}>🛫</span>
            <h3 style={styles.cardTitle}>Αναχωρήσεις Σήμερα</h3>
          </div>
          <div style={styles.cardNumber}>{stats.departures}</div>
          <p style={styles.cardSubtext}>Έχουν ολοκληρωθεί 6</p>
        </div>

        {/* Widget 4: Έσοδα */}
        <div style={styles.card}>
          <div style={styles.cardHeader}>
            <span style={styles.cardIcon}>💶</span>
            <h3 style={styles.cardTitle}>Ημερήσια Έσοδα</h3>
          </div>
          <div style={styles.cardNumber}>€{stats.revenue}</div>
          <p style={styles.cardSubtext}>+12% από χθες</p>
        </div>
      </div>

      {/* Quick Actions / Tables Area */}
      <div style={styles.bottomSection}>
        <div style={styles.recentActivity}>
          <h3 style={styles.sectionTitle}>Τελευταία Δραστηριότητα</h3>
          <ul style={styles.activityList}>
            <li style={styles.activityItem}>
              <span style={{ color: '#deff9a' }}>●</span> Δωμάτιο 104: Ολοκληρώθηκε το Check-in
            </li>
            <li style={styles.activityItem}>
              <span style={{ color: '#9affb2' }}>●</span> Δωμάτιο 201: Καθαρίστηκε (Housekeeping)
            </li>
            <li style={styles.activityItem}>
              <span style={{ color: '#f87171' }}>●</span> Δωμάτιο 305: Αναφορά βλάβης (Κλιματισμός)
            </li>
          </ul>
        </div>
      </div>
    </div>
  );
};

// --- STYLES (Inline για να παίξουν 100% αμέσως χωρίς εξωτερικά CSS) ---
const styles = {
  loadingContainer: {
    display: 'flex',
    height: '100vh',
    backgroundColor: '#111827',
    justifyContent: 'center',
    alignItems: 'center',
    fontFamily: 'sans-serif'
  },
  dashboardContainer: {
    padding: '30px',
    backgroundColor: '#111827', // Σκούρο μπλε/μαύρο
    minHeight: '100vh',
    color: '#f3f4f6',
    fontFamily: 'sans-serif'
  },
  header: {
    marginBottom: '40px'
  },
  title: {
    fontSize: '32px',
    fontWeight: 'bold',
    margin: '0 0 10px 0'
  },
  subtitle: {
    color: '#9ca3af',
    margin: 0,
    fontSize: '16px'
  },
  grid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))',
    gap: '20px',
    marginBottom: '40px'
  },
  card: {
    backgroundColor: '#1f2937', // Ελαφρώς πιο ανοιχτό σκούρο
    padding: '20px',
    borderRadius: '12px',
    border: '1px solid rgba(222, 255, 154, 0.1)',
    boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)'
  },
  cardHeader: {
    display: 'flex',
    alignItems: 'center',
    marginBottom: '15px'
  },
  cardIcon: {
    fontSize: '24px',
    marginRight: '10px'
  },
  cardTitle: {
    margin: 0,
    fontSize: '16px',
    color: '#d1d5db'
  },
  cardNumber: {
    fontSize: '36px',
    fontWeight: 'bold',
    color: '#ffffff',
    marginBottom: '10px'
  },
  cardSubtext: {
    margin: 0,
    fontSize: '14px',
    color: '#9ca3af'
  },
  progressBar: {
    height: '8px',
    backgroundColor: '#374151',
    borderRadius: '4px',
    overflow: 'hidden',
    marginTop: '10px'
  },
  progressFill: {
    height: '100%',
    backgroundColor: '#deff9a', // Neon Green
    borderRadius: '4px'
  },
  bottomSection: {
    display: 'grid',
    gridTemplateColumns: '1fr',
    gap: '20px'
  },
  recentActivity: {
    backgroundColor: '#1f2937',
    padding: '20px',
    borderRadius: '12px',
    border: '1px solid rgba(222, 255, 154, 0.1)'
  },
  sectionTitle: {
    margin: '0 0 20px 0',
    fontSize: '18px',
    borderBottom: '1px solid #374151',
    paddingBottom: '10px'
  },
  activityList: {
    listStyleType: 'none',
    padding: 0,
    margin: 0
  },
  activityItem: {
    padding: '12px 0',
    borderBottom: '1px solid rgba(255,255,255,0.05)',
    display: 'flex',
    gap: '10px',
    alignItems: 'center',
    fontSize: '15px'
  }
};

export default ManagementDash;