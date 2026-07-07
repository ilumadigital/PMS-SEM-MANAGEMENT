import React from 'react';

const ReceptionDash = () => {
  const today = [
    { time: '11:30', guest: 'Maria Papadopoulou', action: 'Check-in', room: '101' },
    { time: '14:30', guest: 'John Smith', action: 'Transfer', room: '201' },
    { time: '18:00', guest: 'Anna Brown', action: 'Check-out', room: '102' },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-black text-white">Reception Dashboard</h1>
        <p className="mt-2 text-sm text-[#ACAFAE]/70">
          Ημερήσια εικόνα αφίξεων, αναχωρήσεων και ενεργειών υποδοχής.
        </p>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
        <Card title="Αφίξεις σήμερα" value="8" />
        <Card title="Αναχωρήσεις σήμερα" value="5" />
        <Card title="Εκκρεμότητες" value="3" />
      </div>

      <div className="bg-[#222222] border border-[#C29C71]/10 rounded-xl overflow-hidden">
        <div className="px-6 py-5 border-b border-[#0A0A0A]">
          <h2 className="text-xs font-bold text-[#C29C71] tracking-widest">
            ΣΗΜΕΡΙΝΟ ΠΡΟΓΡΑΜΜΑ
          </h2>
        </div>

        <table className="w-full text-left">
          <thead>
            <tr className="border-b border-[#0A0A0A]">
              <th className="px-6 py-4 text-xs text-[#C29C71]">ΩΡΑ</th>
              <th className="px-6 py-4 text-xs text-[#C29C71]">ΠΕΛΑΤΗΣ</th>
              <th className="px-6 py-4 text-xs text-[#C29C71]">ΕΝΕΡΓΕΙΑ</th>
              <th className="px-6 py-4 text-xs text-[#C29C71]">ΔΩΜΑΤΙΟ</th>
            </tr>
          </thead>
          <tbody>
            {today.map((item) => (
              <tr key={`${item.time}-${item.guest}`} className="border-b border-[#0A0A0A]/60">
                <td className="px-6 py-4 text-sm text-white">{item.time}</td>
                <td className="px-6 py-4 text-sm text-[#ACAFAE]">{item.guest}</td>
                <td className="px-6 py-4 text-sm text-[#ACAFAE]">{item.action}</td>
                <td className="px-6 py-4 text-sm text-[#C29C71] font-bold">{item.room}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};

const Card = ({ title, value }) => (
  <div className="bg-[#222222] border border-[#C29C71]/10 rounded-xl p-6">
    <div className="text-xs text-[#ACAFAE]/60 font-bold tracking-widest">
      {title}
    </div>
    <div className="mt-6 text-4xl text-white font-black">
      {value}
    </div>
  </div>
);

export default ReceptionDash;