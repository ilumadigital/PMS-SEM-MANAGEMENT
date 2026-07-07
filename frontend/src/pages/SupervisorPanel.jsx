import React from 'react';

const SupervisorPanel = () => {
  const departments = [
    { name: 'Reception', status: 'Ομαλή λειτουργία', pending: 2 },
    { name: 'Cleaning', status: 'Χρειάζεται έλεγχος', pending: 6 },
    { name: 'Transfers', status: 'Ομαλή λειτουργία', pending: 1 },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-black text-white">Supervisor Panel</h1>
        <p className="mt-2 text-sm text-[#ACAFAE]/70">
          Κεντρική εικόνα λειτουργιών, εκκρεμοτήτων και ομάδων.
        </p>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
        {departments.map((department) => (
          <div
            key={department.name}
            className="bg-[#222222] border border-[#C29C71]/10 rounded-xl p-6"
          >
            <div className="text-xs text-[#C29C71] font-bold tracking-widest">
              {department.name.toUpperCase()}
            </div>

            <div className="mt-5 text-white font-bold">
              {department.status}
            </div>

            <div className="mt-6 text-sm text-[#ACAFAE]/70">
              Εκκρεμότητες
            </div>

            <div className="mt-1 text-4xl text-white font-black">
              {department.pending}
            </div>

            <button className="mt-6 w-full bg-[#0A0A0A] border border-[#C29C71]/20 text-[#C29C71] py-3 rounded-lg font-bold text-sm">
              Προβολή
            </button>
          </div>
        ))}
      </div>
    </div>
  );
};

export default SupervisorPanel;