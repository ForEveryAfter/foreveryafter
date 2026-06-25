import React from 'react';
export const dynamic = 'force-dynamic';
import SharedInterviewEngine from '@/components/dashboard/SharedInterviewEngine';

export default async function MyStoryPage() {
  const userId = '74656c6c-6d65-4123-8123-123456789012';

  return (
    <SharedInterviewEngine 
      userId={userId} 
      section="mystory"
      title="My Story"
      subtitle="Record your life's journey, one chapter at a time."
      audioPromptFolder="mystory"
      completionMessage="Chapter walk-through complete! Great job."
    />
  );
}
