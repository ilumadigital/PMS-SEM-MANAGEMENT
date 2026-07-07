import React from 'react';

const SettingsPage = () => {
  return (
    <div className="space-y-6 max-w-4xl">
      <div>
        <h1 className="text-3xl font-black text-white">Ρυθμίσεις</h1>
        <p className="mt-2 text-sm text-[#ACAFAE]/70">
          Βασικές ρυθμίσεις πλατφόρμας και επιχείρησης.
        </p>
      </div>

      <div className="bg-[#222222] border border-[#C29C71]/10 rounded-xl p-6 space-y-5">
        <Field label="Όνομα επιχείρησης" value="SEM Management" />
        <Field label="Email επικοινωνίας" value="info@sem-management.com" />
        <Field label="API URL" value="https://api.sem-management.com" />

        <button className="bg-[#C29C71] text-[#0A0A0A] px-5 py-3 rounded-lg font-bold text-sm">
          Αποθήκευση Ρυθμίσεων
        </button>
      </div>
    </div>
  );
};

const Field = ({ label, value }) => (
  <div>
    <label className="block text-xs text-[#C29C71] font-bold tracking-widest mb-2">
      {label}
    </label>
    <input
      defaultValue={value}
      className="w-full bg-[#0A0A0A] border border-[#C29C71]/20 rounded-lg px-4 py-3 text-sm text-white focus:outline-none focus:border-[#C29C71]"
    />
  </div>
);

export default SettingsPage;