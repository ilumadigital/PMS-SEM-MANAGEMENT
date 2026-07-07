import React from 'react';

const customers = [
  { name: 'Maria Papadopoulou', email: 'maria@example.com', phone: '+30 6900000001', bookings: 3 },
  { name: 'John Smith', email: 'john@example.com', phone: '+44 7700000000', bookings: 1 },
];

const CustomersPage = () => {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-black text-white">Πελάτες</h1>
        <p className="mt-2 text-sm text-[#ACAFAE]/70">
          Λίστα πελατών και ιστορικό κρατήσεων.
        </p>
      </div>

      <div className="bg-[#222222] border border-[#C29C71]/10 rounded-xl p-6">
        <div className="flex justify-between mb-6">
          <input
            className="bg-[#0A0A0A] border border-[#C29C71]/20 rounded-lg px-4 py-2 text-sm text-white w-80"
            placeholder="Αναζήτηση πελάτη..."
          />
          <button className="bg-[#C29C71] text-[#0A0A0A] px-5 py-2 rounded-lg font-bold text-sm">
            Νέος Πελάτης
          </button>
        </div>

        <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
          {customers.map((customer) => (
            <div key={customer.email} className="bg-[#0A0A0A] border border-[#C29C71]/10 rounded-xl p-5">
              <div className="text-white font-bold">{customer.name}</div>
              <div className="text-sm text-[#ACAFAE]/70 mt-2">{customer.email}</div>
              <div className="text-sm text-[#ACAFAE]/70">{customer.phone}</div>
              <div className="mt-4 text-xs text-[#C29C71] font-bold tracking-widest">
                {customer.bookings} ΚΡΑΤΗΣΕΙΣ
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

export default CustomersPage;