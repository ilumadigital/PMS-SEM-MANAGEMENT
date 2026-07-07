import React from 'react';

const StatisticsPage = () => {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-black text-white">Στατιστικά</h1>
        <p className="mt-2 text-sm text-[#ACAFAE]/70">
          Επισκόπηση κρατήσεων, πληρότητας και λειτουργικής απόδοσης.
        </p>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
        <Metric title="Μηνιαίες Κρατήσεις" value="248" change="+12%" />
        <Metric title="Πληρότητα" value="76%" change="+8%" />
        <Metric title="Transfers" value="93" change="+5%" />
      </div>

      <div className="bg-[#222222] border border-[#C29C71]/10 rounded-xl p-8 h-80 flex items-center justify-center text-[#ACAFAE]/50">
        Εδώ θα μπει γράφημα κρατήσεων / πληρότητας.
      </div>
    </div>
  );
};

const Metric = ({ title, value, change }) => (
  <div className="bg-[#222222] border border-[#C29C71]/10 rounded-xl p-6">
    <div className="text-xs text-[#ACAFAE]/60 font-bold tracking-widest">{title}</div>
    <div className="mt-6 text-4xl text-white font-black">{value}</div>
    <div className="mt-3 text-sm text-[#C29C71] font-bold">{change}</div>
  </div>
);

export default StatisticsPage;