import React from 'react';

const stats = [
  { title: 'Ταξίδια σήμερα', value: '12' },
  { title: 'Εκκρεμείς κρατήσεις', value: '5' },
  { title: 'Σύνολο πελατών', value: '142' },
  { title: 'Ολοκληρωμένα', value: '8' },
];

const DashboardPage = () => {
  return (
    <div className="space-y-8">
      <section className="bg-[#222222] border border-[#C29C71]/20 rounded-xl p-8">
        <h1 className="text-3xl font-black text-white">
          Καλησπέρα, <span className="text-[#C29C71]">Giannis!</span>
        </h1>
        <p className="mt-3 text-xs font-bold tracking-widest text-[#ACAFAE]">
          ΚΑΛΩΣ ΟΡΙΣΑΤΕ ΣΤΟ SEM PMS CONTROL CENTER
        </p>
      </section>

      <section className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-6">
        {stats.map((stat) => (
          <div key={stat.title} className="bg-[#222222] rounded-xl p-6 border border-[#C29C71]/10">
            <div className="text-[10px] font-bold text-[#ACAFAE]/70 uppercase tracking-widest">
              {stat.title}
            </div>
            <div className="mt-8 text-3xl font-black text-white">
              {stat.value}
            </div>
          </div>
        ))}
      </section>

      <section className="bg-[#222222] rounded-xl border border-[#C29C71]/10 overflow-hidden">
        <div className="px-6 py-5 border-b border-[#0A0A0A] flex justify-between">
          <h2 className="text-xs font-bold text-[#C29C71] tracking-widest">
            ΠΡΟΣΦΑΤΕΣ ΚΡΑΤΗΣΕΙΣ
          </h2>
          <button className="text-[10px] font-bold text-[#C29C71]">
            ΠΡΟΒΟΛΗ ΟΛΩΝ
          </button>
        </div>

        <div className="p-10 text-center text-[#ACAFAE]/50 text-sm">
          Δεν βρέθηκαν πρόσφατες κρατήσεις.
        </div>
      </section>
    </div>
  );
};

export default DashboardPage;