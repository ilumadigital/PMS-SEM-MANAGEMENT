import React from 'react';

const bookings = [
  {
    id: 'BK-1001',
    customer: 'Maria Papadopoulou',
    route: 'Airport → Georgali Hotel',
    date: '08/07/2026',
    time: '14:30',
    status: 'Εκκρεμεί',
  },
  {
    id: 'BK-1002',
    customer: 'John Smith',
    route: 'Port → Villa Artemis',
    date: '08/07/2026',
    time: '18:00',
    status: 'Επιβεβαιωμένη',
  },
];

const BookingsPage = () => {
  return (
    <Page title="Κρατήσεις" subtitle="Διαχείριση αφίξεων, αναχωρήσεων και transfers">
      <div className="flex justify-between mb-6">
        <input
          className="bg-[#0A0A0A] border border-[#C29C71]/20 rounded-lg px-4 py-2 text-sm text-white w-80"
          placeholder="Αναζήτηση κράτησης..."
        />
        <button className="bg-[#C29C71] text-[#0A0A0A] px-5 py-2 rounded-lg font-bold text-sm">
          Νέα Κράτηση
        </button>
      </div>

      <Table
        columns={['ID', 'Πελάτης', 'Διαδρομή', 'Ημερομηνία', 'Ώρα', 'Κατάσταση']}
        rows={bookings.map((b) => [
          b.id,
          b.customer,
          b.route,
          b.date,
          b.time,
          b.status,
        ])}
      />
    </Page>
  );
};

const Page = ({ title, subtitle, children }) => (
  <div className="space-y-6">
    <div>
      <h1 className="text-3xl font-black text-white">{title}</h1>
      <p className="mt-2 text-sm text-[#ACAFAE]/70">{subtitle}</p>
    </div>
    <div className="bg-[#222222] border border-[#C29C71]/10 rounded-xl p-6">
      {children}
    </div>
  </div>
);

const Table = ({ columns, rows }) => (
  <div className="overflow-x-auto">
    <table className="w-full text-left">
      <thead>
        <tr className="border-b border-[#0A0A0A]">
          {columns.map((col) => (
            <th key={col} className="px-4 py-4 text-xs text-[#C29C71] tracking-widest uppercase">
              {col}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {rows.map((row, index) => (
          <tr key={index} className="border-b border-[#0A0A0A]/60 hover:bg-[#0A0A0A]/30">
            {row.map((cell, i) => (
              <td key={i} className="px-4 py-4 text-sm text-[#ACAFAE]">
                {cell}
              </td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  </div>
);

export default BookingsPage;