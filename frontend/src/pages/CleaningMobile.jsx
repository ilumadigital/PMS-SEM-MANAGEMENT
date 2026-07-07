import React from 'react';

const CleaningMobile = () => {
  const tasks = [
    { room: '101', status: 'Προς καθαρισμό', priority: 'Υψηλή' },
    { room: '102', status: 'Σε εξέλιξη', priority: 'Κανονική' },
    { room: '201', status: 'Έτοιμο για έλεγχο', priority: 'Κανονική' },
  ];

  return (
    <div className="space-y-6 max-w-2xl">
      <div>
        <h1 className="text-3xl font-black text-white">Cleaning Mobile</h1>
        <p className="mt-2 text-sm text-[#ACAFAE]/70">
          Mobile-friendly προβολή εργασιών καθαρισμού ανά δωμάτιο.
        </p>
      </div>

      <div className="space-y-4">
        {tasks.map((task) => (
          <div
            key={task.room}
            className="bg-[#222222] border border-[#C29C71]/10 rounded-xl p-5"
          >
            <div className="flex items-center justify-between">
              <div>
                <div className="text-xs text-[#C29C71] font-bold tracking-widest">
                  ΔΩΜΑΤΙΟ
                </div>
                <div className="text-3xl text-white font-black mt-1">
                  {task.room}
                </div>
              </div>

              <span className="bg-[#0A0A0A] text-[#ACAFAE] text-xs px-3 py-1 rounded-full">
                {task.priority}
              </span>
            </div>

            <div className="mt-5 text-sm text-[#ACAFAE]">
              Κατάσταση: <span className="text-white font-bold">{task.status}</span>
            </div>

            <button className="mt-5 w-full bg-[#C29C71] text-[#0A0A0A] py-3 rounded-lg font-bold text-sm">
              Ενημέρωση Κατάστασης
            </button>
          </div>
        ))}
      </div>
    </div>
  );
};

export default CleaningMobile;