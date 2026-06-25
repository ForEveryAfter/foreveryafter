import React from 'react';
export const dynamic = 'force-dynamic';
import SharedInterviewEngine from '@/components/dashboard/SharedInterviewEngine';

export default async function HealthLegacyPage() {
  const userId = '74656c6c-6d65-4123-8123-123456789012';

  return (
    <SharedInterviewEngine 
      userId={userId} 
      section="health_legacy"
      title="Family Health Legacy"
      subtitle="The health history your family carries forward"
      icon="🧬"
      audioPromptFolder="health"
      completionMessage="Thank you. This is one of the most important gifts you can leave your family."
    />
  );
}
