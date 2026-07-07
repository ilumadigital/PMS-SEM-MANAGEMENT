import React from 'react';

const rooms = [
  { number: '101', type: 'Deluxe Suite', status: 'Καθαρό', guest: 'Maria Papadopoulou' },
  { number: '102', type: 'Standard Room', status: 'Χρειάζεται καθαρισμό', guest: '-' },
  { number: '201', type: 'Family Room', status: 'Κατειλημμένο', guest: 'John Smith' },
];

const RoomsPage = () => {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-black text-white">Δωμάτια</h1>
        <p className="mt-2 text-sm text-[#ACAFAE]/70">
          Κατάσταση δωματίων, πελατών και cleaning tasks.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
        {rooms.map((room) => (
          <div key={room.number} className="bg-[#222222] border border-[#C29C71]/10 rounded-xl p-6">
            <div className="flex justify-between items-start">
              <div>
                <div className="text-[#C29C71] text-xs font-bold tracking-widest">
                  ΔΩΜΑΤΙΟ
                </div>
                <div className="text-3xl text-white font-black mt-2">
                  {room.number}
                </div>
              </div>
              <span className="text-xs bg-[#0A0A0A] text-[#ACAFAE] px-3 py-1 rounded-full">
                {room.status}
              </span>
            </div>

            <div className="mt-6 text-sm text-[#ACAFAE]/70">{room.type}</div>
            <div className="mt-2 text-sm text-white">{room.guest}</div>
          </div>
        ))}
      </div>
    </div>
  );
};

export default RoomsPage;