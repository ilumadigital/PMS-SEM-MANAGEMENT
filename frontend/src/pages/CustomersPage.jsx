import React, { useContext, useMemo, useState } from 'react';
import { CloudbedsDataContext } from '../context/CloudbedsDataContext';

const CustomersPage = () => {
  const { customers, loading, error, status, refresh, connect } = useContext(CloudbedsDataContext);
  const [searchTerm, setSearchTerm] = useState('');

  const filteredCustomers = useMemo(() => {
    const term = searchTerm.trim().toLowerCase();
    if (!term) return customers;

    return customers.filter((customer) =>
      [customer.name, customer.email, customer.phone]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(term))
    );
  }, [customers, searchTerm]);

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-4">
        <div>
          <div className="text-[10px] uppercase tracking-[0.28em] text-[#C9A46A] font-bold">
            Cloudbeds Sandbox
          </div>
          <h1 className="mt-2 text-3xl font-black text-white">Πελάτες</h1>
          <p className="mt-2 text-sm text-[#ACAFAE]/70">
            Live guest list derived from the connected Cloudbeds test reservations.
          </p>
        </div>

        <button
          onClick={status?.connected ? refresh : connect}
          className="rounded-full border border-[#C9A46A]/25 px-4 py-2 text-[10px] uppercase tracking-[0.22em] text-[#C9A46A]"
        >
          {status?.connected ? 'Refresh Cloudbeds' : 'Connect Sandbox'}
        </button>
      </div>

      <div className="bg-[#222222] border border-[#C29C71]/10 rounded-xl p-6">
        <div className="flex justify-between mb-6">
          <input
            value={searchTerm}
            onChange={(event) => setSearchTerm(event.target.value)}
            className="bg-[#0A0A0A] border border-[#C29C71]/20 rounded-lg px-4 py-2 text-sm text-white w-full md:w-80"
            placeholder="Αναζήτηση πελάτη..."
          />
        </div>

        {error && (
          <div className="mb-5 rounded-xl border border-[#F0D6A5]/25 bg-[#F0D6A5]/10 p-4 text-sm text-[#F0D6A5]">
            {error}
          </div>
        )}

        <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
          {filteredCustomers.map((customer) => (
            <div key={customer.id} className="bg-[#0A0A0A] border border-[#C29C71]/10 rounded-xl p-5">
              <div className="text-white font-bold">{customer.name}</div>
              <div className="text-sm text-[#ACAFAE]/70 mt-2">{customer.email || 'No email from Cloudbeds'}</div>
              <div className="text-sm text-[#ACAFAE]/70">{customer.phone || 'No phone from Cloudbeds'}</div>
              <div className="mt-4 text-xs text-[#C29C71] font-bold tracking-widest">
                {customer.bookings} ΚΡΑΤΗΣΕΙΣ
              </div>
            </div>
          ))}
        </div>

        {!loading && filteredCustomers.length === 0 && (
          <div className="py-10 text-center text-sm text-[#ACAFAE]/70">
            {status?.connected ? 'No Cloudbeds guests found.' : 'Connect the Cloudbeds sandbox to load guests.'}
          </div>
        )}
      </div>
    </div>
  );
};

export default CustomersPage;
