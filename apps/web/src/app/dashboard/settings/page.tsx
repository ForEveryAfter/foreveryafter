'use client';

import AccountSettings from '@/components/dashboard/AccountSettings';
import NotificationSettings from '@/components/dashboard/NotificationSettings';
import TrustedIndividualsSettings from '@/components/dashboard/TrustedIndividualsSettings';

export default function SettingsPage() {
  return (
    <div className="max-w-4xl mx-auto px-6 py-10 font-inter text-navy">
      <div className="mb-10">
        <h1 className="font-playfair text-3xl font-black mb-2">Settings</h1>
        <p className="text-zinc-500">Manage your guide preferences and security.</p>
      </div>

      <div className="space-y-8">
        {/* Access — Trusted Individuals, check-in cadence, guide lock status */}
        <TrustedIndividualsSettings />

        {/* Notifications */}
        <NotificationSettings />

        {/* Account — name (editable) + login email */}
        <AccountSettings />
      </div>
    </div>
  );
}
