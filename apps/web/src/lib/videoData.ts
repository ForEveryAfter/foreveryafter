export type VideoItem = {
  id: string;
  title: string;
  subtitle: string;
  category: string;
  duration: string;
  gradientFrom: string;
  gradientTo: string;
  script: string;
  videoUrl?: string;
};

export type VideoCluster = {
  title: string;
  role: 'parent' | 'child';
  videos: VideoItem[];
};

export const VIDEO_CLUSTERS: VideoCluster[] = [
  // ── PARENT (Harold) CLUSTERS ──
  {
    title: 'Getting started',
    role: 'parent',
    videos: [
      {
        id: 'v1', title: 'Welcome to ForEveryAfter', subtitle: 'An introduction to your guide',
        category: 'Getting started', duration: '1:30',
        gradientFrom: '#4A5E52', gradientTo: '#2D6A4F',
        videoUrl: '/parent/Legacy Bridge_ Parent Intro_1080p_caption.mp4',
        script: `Welcome to ForEveryAfter. This is a space built just for you — a private, guided way to organize the stories, information, and wishes your family will one day need.\n\nThink of it as a living letter to the people you love most. Not a legal document. Not a chore. Just a gentle, structured way to make sure nothing important is lost.\n\nYou'll work at your own pace. There are no deadlines, no pressure, and everything stays private until you say otherwise. Your guide is encrypted and locked — only you control who sees what, and when.\n\nIn this guide, you'll find sections for your life story, your accounts and important locations, health information, final wishes, letters to loved ones, and even messages for special occasions.\n\nLet's get started. Your family will thank you.`,
      },
      {
        id: 'v2', title: 'Who receives your guide', subtitle: 'Understanding access and recipients',
        category: 'Getting started', duration: '2:00',
        gradientFrom: '#607A6A', gradientTo: '#7A9488',
        script: `Your guide is for the people you trust most. When you set it up, you chose recipients — the family members or friends who will receive access to your guide when the time comes.\n\nRecipients cannot see your guide right now. They only know it exists. They'll receive access according to the rules you set — typically after a series of missed check-ins.\n\nYou can add or remove recipients at any time from your Family & Friends settings. You can also change who gets notified and who is designated as your primary contact.\n\nThe important thing to remember: nothing is shared until you allow it. You are always in control.`,
      },
      {
        id: 'v3', title: 'Who is your Trusted Representative', subtitle: 'The role of your first contact',
        category: 'Getting started', duration: '2:15',
        gradientFrom: '#3D5A4A', gradientTo: '#4A6E5A',
        script: `Your Trusted Representative is the person you've designated as your primary point of contact. In most families, this is an adult child or a spouse.\n\nTheir role is simple: when you can no longer respond to check-ins, your Trusted Representative is the first person we notify. They coordinate with the rest of your recipients to ensure everyone has what they need.\n\nYour Trusted Representative can also request early access in certain situations — for example, if you become incapacitated. But they cannot view your guide without your permission under normal circumstances.\n\nYou can change your Trusted Representative at any time in Settings.`,
      },
      {
        id: 'v4', title: 'How the check-in works', subtitle: 'Staying connected and secure',
        category: 'Getting started', duration: '1:45',
        gradientFrom: '#2D6A3A', gradientTo: '#3D5E4A',
        script: `Check-ins are how ForEveryAfter knows you're okay. At regular intervals — you chose every 6 months — we'll send you a simple notification asking you to confirm you're still here.\n\nAll you have to do is tap a button. That's it. If you miss a check-in, we'll try again. If you miss several in a row, we'll reach out to your Trusted Representative.\n\nThis system ensures your guide is released only when it should be — not a moment sooner. Your check-in cadence can be changed at any time in Settings.`,
      },
    ],
  },
  {
    title: 'Your guide sections',
    role: 'parent',
    videos: [
      {
        id: 'v5', title: 'Your life story — how the interview works', subtitle: 'Recording what matters most',
        category: 'Your guide', duration: '3:00',
        gradientFrom: '#4A5E52', gradientTo: '#607A6A',
        script: `Your life story is the heart of your guide. This section uses gentle, guided prompts to help you capture the moments, values, and memories that define who you are.\n\nYou can type your answers, record your voice, or simply jot down notes. There's no right or wrong way to do this. Some people write paragraphs. Some people write a sentence. Both are perfect.\n\nThe prompts cover your childhood, your career, your marriage, your children, your values, and the lessons you'd most want to pass on. You can skip any question and come back to it later.\n\nYour family will treasure this more than you know.`,
      },
      {
        id: 'v6', title: 'The obituary — what your family receives', subtitle: 'A prepared tribute',
        category: 'Your guide', duration: '1:45',
        gradientFrom: '#607A6A', gradientTo: '#7A9488',
        script: `One of the most stressful tasks a family faces is writing an obituary under time pressure. ForEveryAfter takes care of this for you.\n\nBased on the stories and information you provide in your life story section, we can generate a draft obituary that captures your voice, your achievements, and your personality.\n\nYour family can use it as-is, or edit it to add their own reflections. Either way, they won't be starting from a blank page during the hardest week of their lives.`,
      },
      {
        id: 'v7', title: 'How your guide stays locked', subtitle: 'Security and privacy',
        category: 'Access & privacy', duration: '1:45',
        gradientFrom: '#3D5247', gradientTo: '#4A5E52',
        script: `Your guide is encrypted from the moment you create it. No one at ForEveryAfter can read your information. Not our engineers, not our support team, no one.\n\nYour guide is locked and will remain locked as long as you continue responding to check-ins. If you stop responding — and only then — your Trusted Representative is notified and the release process begins.\n\nYou can also manually unlock specific sections for specific people at any time. For example, you might want your spouse to see your health information now, but keep your letters private until later.\n\nYou're always in control.`,
      },
      {
        id: 'v8', title: 'What happens if you miss a check-in', subtitle: 'The safety net explained',
        category: 'Access & privacy', duration: '2:00',
        gradientFrom: '#4A5E52', gradientTo: '#3D5247',
        script: `Missing a check-in doesn't trigger anything immediately. We understand that life gets busy. Here's what happens:\n\nFirst missed check-in: We send a reminder. That's all.\nSecond missed check-in: We send another reminder, this time with a slightly more urgent tone.\nGrace period: After the second miss, a grace period begins. During this time, we'll try to reach you through multiple channels.\n\nOnly after the full grace period expires do we contact your Trusted Representative. Even then, they don't get immediate access — they begin a verification process.\n\nThe system is designed to be patient, secure, and respectful of your privacy.`,
      },
    ],
  },
  {
    title: 'Getting started',
    role: 'parent',
    videos: [
      {
        id: 'v14', title: 'How to release the guide as Trusted Representative', subtitle: 'For your designated contact',
        category: 'For your family', duration: '1:45',
        gradientFrom: '#4A5E52', gradientTo: '#607A6A',
        script: `If you've been designated as someone's Trusted Representative, you play an important role. When the time comes, you'll receive a notification from ForEveryAfter letting you know that your loved one has stopped responding to check-ins.\n\nFrom there, you'll go through a simple verification process. This is designed to prevent accidental or unauthorized access. Once verified, the guide will be released to all designated recipients.\n\nYou don't need to do anything now. Just know that when the moment comes, we'll walk you through every step.`,
      },
      {
        id: 'v15', title: 'How to generate an obituary', subtitle: 'Creating a tribute',
        category: 'For your family', duration: '1:30',
        gradientFrom: '#607A6A', gradientTo: '#7A9488',
        script: `When the guide is released, recipients can generate a draft obituary from the Dashboard. This obituary is built from the stories, milestones, and personal details your loved one shared in their Life Story section.\n\nThe draft is designed to be a starting point — warm, personal, and accurate. You can edit it, add to it, or use it as-is.\n\nThis feature exists because we know that writing an obituary during grief is one of the hardest things a family has to do. Your loved one wanted to make it easier for you.`,
      },
      {
        id: 'v16', title: 'What happens to the subscription when the guide opens', subtitle: 'Billing after release',
        category: 'Billing', duration: '1:45',
        gradientFrom: '#3D5A4A', gradientTo: '#4A6E5A',
        script: `When a guide is released, the subscription continues for the remainder of its current term. No additional charges are applied.\n\nAfter the term ends, the guide enters a read-only archive state. All content remains accessible to recipients, but no new content can be added.\n\nIf the family wants to maintain the guide in an active state beyond the original term — for example, to continue adding stories or updating information — they can renew the subscription at the standard rate.\n\nThere are no surprise charges. Everything is transparent.`,
      },
    ],
  },

  // ── CHILD (Myron) CLUSTERS ──
  {
    title: 'Getting started',
    role: 'child',
    videos: [
      {
        id: 'cv1', title: 'Welcome to ForEveryAfter', subtitle: "An introduction to your parent's guide",
        category: 'Getting started', duration: '2:30',
        gradientFrom: '#1E3A5F', gradientTo: '#2D5A8F',
        script: `Welcome to ForEveryAfter. Someone in your family — most likely a parent — has set up a guide to make sure nothing important is lost when the time comes.\n\nThis isn't something to worry about. It's actually the opposite — it's a gift. Your parent has taken the time to organize their stories, their wishes, their accounts, and their messages to you.\n\nRight now, you can't see any of that. The guide is locked and private. Your role is simply to be aware that it exists, and to know that when the time comes, everything you need will be waiting for you.\n\nIn the meantime, you can explore this dashboard to understand what the guide contains, what your role is, and how the system works.`,
      },
      {
        id: 'cv2', title: 'Who receives the guide', subtitle: 'Understanding your role',
        category: 'Getting started', duration: '2:00',
        gradientFrom: '#2D5A8F', gradientTo: '#3D6A9F',
        script: `Your parent has designated specific people to receive their guide. You're one of them.\n\nAs a recipient, you'll be notified when the guide is released. You'll have access to everything your parent chose to share — their stories, their accounts, their wishes, and their personal messages.\n\nIf you've been designated as the Trusted Representative, you have an additional responsibility: you're the first point of contact when your parent stops responding to check-ins. We'll guide you through everything when the time comes.`,
      },
      {
        id: 'cv3', title: 'What ForEveryAfter is and your role in it', subtitle: 'The big picture',
        category: 'Getting started', duration: '2:30',
        gradientFrom: '#1E3A5F', gradientTo: '#4A6A9F',
        script: `ForEveryAfter is a private, secure platform that helps families organize what matters most — stories, information, and wishes — so that nothing is lost when it matters most.\n\nYour parent has created a guide. Think of it as a comprehensive, personal letter to their family, combined with a secure vault of important information.\n\nYour role right now is passive. You don't need to do anything. But understanding how the system works will help you feel prepared and reassured.\n\nYou can also set up your own guide whenever you're ready. As a family member, you receive a 20% discount.`,
      },
    ],
  },
  {
    title: 'Your role as first contact',
    role: 'child',
    videos: [
      {
        id: 'cv10', title: 'Your role as Trusted Representative', subtitle: 'What it means and what to expect',
        category: 'Access & privacy', duration: '1:45',
        gradientFrom: '#1E3A5F', gradientTo: '#2D5A8F',
        script: `As Trusted Representative, you're the first person ForEveryAfter contacts when your parent stops responding to check-ins.\n\nThis doesn't mean anything has happened. It simply means the system couldn't reach them, and it needs a human to help figure out what's going on.\n\nYou might find that your parent simply forgot, or changed their phone number, or is on vacation without service. In those cases, you can help extend the check-in window.\n\nBut if something has happened, you'll be the one to initiate the guide release process. We'll walk you through every step.`,
      },
      {
        id: 'cv11', title: 'Your role as first contact', subtitle: 'Coordinating with the family',
        category: 'Access & privacy', duration: '2:15',
        gradientFrom: '#2D5A8F', gradientTo: '#3D6A9F',
        script: `Being the first contact means you're the coordinator. When the guide is released, all recipients get access — but you're the one the family will look to for guidance.\n\nYou don't need special training. The platform will guide you through everything. But here's what to expect:\n\n1. You'll receive a notification that the guide is ready.\n2. You'll verify your identity through a simple process.\n3. Once verified, all recipients will be notified and given access.\n4. You can generate the obituary draft for the family.\n\nIt's designed to be as simple as possible during an incredibly difficult time.`,
      },
      {
        id: 'cv12', title: 'What happens when a check-in is missed', subtitle: 'The notification process',
        category: 'Access & privacy', duration: '2:00',
        gradientFrom: '#1E3A5F', gradientTo: '#2D5A8F',
        script: `When your parent misses a check-in, here's what happens from your perspective:\n\nFirst: Nothing. We try to reach them again.\nSecond miss: Still nothing on your end. We try one more time.\nGrace period: After two missed check-ins, a grace period begins. During this time, we make every effort to reach your parent.\n\nOnly after the full grace period expires will you receive a notification. At that point, you'll be asked to help us determine what's going on.\n\nThe system is designed to be patient. False alarms are rare, and we never release a guide prematurely.`,
      },
      {
        id: 'cv13', title: 'How to request access to the guide', subtitle: 'Early access procedures',
        category: 'Access & privacy', duration: '1:30',
        gradientFrom: '#2D5A8F', gradientTo: '#3D6A9F',
        script: `In certain situations, you may need access to the guide before the normal release process. For example, if your parent is incapacitated but hasn't missed enough check-ins to trigger a release.\n\nYou can request early access from your dashboard. This sends a notification to your parent (if they're able to respond) or initiates a verification process.\n\nEarly access requests are logged and audited. This is for everyone's protection — your parent's privacy, and your family's security.\n\nThe process is straightforward, and we're here to help every step of the way.`,
      },
    ],
  },
  {
    title: 'When the time comes',
    role: 'child',
    videos: [
      {
        id: 'cv14', title: 'How to release the guide as Trusted Representative', subtitle: 'Step-by-step process',
        category: 'When the time comes', duration: '1:45',
        gradientFrom: '#1E3A5F', gradientTo: '#2D5A8F',
        script: `When the time comes, you'll receive a notification from ForEveryAfter. Here's the step-by-step process:\n\n1. Open the notification and log in to your dashboard.\n2. You'll see a prompt to begin the release process.\n3. Verify your identity using the method you set up during onboarding.\n4. Confirm that you want to release the guide.\n5. All recipients are notified and given access.\n\nThe entire process takes about 5 minutes. Everything is guided, and you can contact support at any time if you need help.\n\nYour parent wanted this to be easy for you. That's why they set it up.`,
      },
      {
        id: 'cv15', title: 'How to generate an obituary', subtitle: 'Creating a tribute from the guide',
        category: 'When the time comes', duration: '1:30',
        gradientFrom: '#2D5A8F', gradientTo: '#3D6A9F',
        script: `Once the guide is released, you can generate an obituary draft from the dashboard. This draft is built from your parent's life story — their milestones, their career, their family, their passions.\n\nThe draft is warm, personal, and accurate. You can edit it, add your own reflections, or use it as-is.\n\nMany families tell us this was the most helpful feature during their most difficult week. Your parent knew this would be hard, and they wanted to make it easier.`,
      },
      {
        id: 'cv16', title: 'What happens to the subscription when the guide opens', subtitle: 'After the guide is released',
        category: 'When the time comes', duration: '1:45',
        gradientFrom: '#1E3A5F', gradientTo: '#2D5A8F',
        script: `After the guide is released, the subscription continues through the end of its current term. No new charges are applied.\n\nWhen the term ends, the guide enters a read-only archive. All content remains accessible, but no changes can be made.\n\nIf you'd like to keep the guide active — to add your own reflections, update information, or share it with additional family members — you can renew the subscription.\n\nThere are no surprise charges. Everything is transparent and straightforward.`,
      },
    ],
  },
];
