// Mock data for the Child/Trusted Representative dashboard.
// Shape reflects future real schema. Replace with API calls when ready.

// ─── Types ────────────────────────────────────────────────────────────────────

export interface User {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
}

export type RoleType = 'child' | 'trusted_rep';
export type PhotoTag = 'obituary' | 'funeral_program';
export type AiDraftTone = 'traditional' | 'warm_personal' | 'newspaper';

export interface AskedQuestion {
  id: string;
  question: string;
  askedAt: string;
}

export interface PaymentTransferRequest {
  id: string;
  requesterFirstName: string;
  requestedAt: string;
  isSelfRequest: boolean;
}

export interface ObituaryPhoto {
  tag: PhotoTag;
  uploadedAt: string;
}

export interface ParentRelationship {
  parentId: string;
  guideId: string | null;
  parentFirstName: string;
  parentLastName: string;
  roles: RoleType[];
  isCurrentPayer: boolean;
  // The PARENT guide's subscription is active+unexpired. A TI can only release while
  // this is true; an expired/unpaid guide must be reactivated first.
  guideSubscriptionActive: boolean;
  designatedAt: string;
  status: {
    lastCheckInAt: string;
    nextCheckInDueAt: string;
    isOverdue: boolean;
    daysUntilNextCheckIn: number;
    secondTrustedRepExists: boolean;
  };
  obituary: {
    parentWrittenContent: string | null;
    parentWrittenAt: string | null;
    aiDraftContent: string | null;
    aiDraftTone: AiDraftTone | null;
    aiDraftGeneratedAt: string | null;
    kidVersionContent: string | null;
    kidVersionUpdatedAt: string | null;
    photos: ObituaryPhoto[];
    hasMemorialVideo: boolean;
  };
  parentGuide: {
    lastSavedAt: string;
    askedQuestions: AskedQuestion[];
  };
  pendingPaymentTransfers: PaymentTransferRequest[];
  pendingShareAcknowledgmentFromOtherTR: boolean;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function daysFromNow(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d.toISOString();
}

function daysAgo(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() - days);
  return d.toISOString();
}

// ─── Mock Data ────────────────────────────────────────────────────────────────

export const MOCK_USER: User = {
  id: 'mock-user-sarah-001',
  firstName: 'Sarah',
  lastName: 'Mitchell',
  email: 'sarah_mitchell@email.com',
  phone: '555-0199',
};

export const MOCK_RELATIONSHIPS: ParentRelationship[] = [
  {
    parentId: 'mock-parent-dorothy-001',
    guideId: null,
    guideSubscriptionActive: true,
    parentFirstName: 'Dorothy',
    parentLastName: 'Mitchell',
    roles: ['child', 'trusted_rep'],
    isCurrentPayer: false,
    designatedAt: '2026-01-15T00:00:00.000Z',
    status: {
      lastCheckInAt: daysAgo(25),
      nextCheckInDueAt: daysFromNow(5),
      isOverdue: false,
      daysUntilNextCheckIn: 5,
      secondTrustedRepExists: true,
    },
    obituary: {
      parentWrittenContent: 'Dorothy Ann Mitchell was born on March 12, 1948, in Cedar Rapids, Iowa, to James and Helen Porter. She grew up in a home filled with music, laughter, and the smell of her mother\'s apple pie cooling on the windowsill. She attended Lincoln High School, where she was voted "Most Likely to Make You Smile" — a title she carried with grace for the rest of her life.\n\nShe married Richard Mitchell in the summer of 1971, and together they built a life defined by generosity, faith, and an open front door. Dorothy was a devoted mother to Sarah, Kevin, and James, and later a grandmother who never missed a birthday, a school play, or a chance to sneak extra cookies to her grandchildren.\n\nDorothy spent 28 years as a librarian at Westside Public Library, where she ran the children\'s reading program and was known to every child in the neighborhood simply as "Miss Dorothy." She believed that a good book could change a life, and she proved it hundreds of times over.\n\nIn her final years, Dorothy found peace in her garden, her church choir, and long phone calls with her children. She passed quietly, surrounded by the people she loved most, leaving behind a legacy of kindness that will outlast us all.',
      parentWrittenAt: daysAgo(30),
      aiDraftContent: 'Dorothy Ann Mitchell, 78, of Cedar Rapids, Iowa, passed away peacefully on a quiet spring morning, surrounded by her children Sarah, Kevin, and James, and the sound of birdsong from the garden she tended for forty years.\n\nBorn March 12, 1948, to James and Helen Porter, Dorothy grew up believing that kindness was not a trait but a practice — something you did every day, whether anyone noticed or not. She carried that belief from her childhood home on Elm Street to Lincoln High School, through twenty-eight years as a beloved librarian at Westside Public Library, and into every room she ever entered.\n\nShe married Richard Mitchell in 1971, and together they raised three children in a house with an open front door and a kitchen table that always had room for one more. Dorothy was a woman who remembered every birthday, attended every school play, and never let a neighbor go without a meal during hard times. She is survived by her children, seven grandchildren, and a community that will feel her absence for years to come.',
      aiDraftTone: 'warm_personal',
      aiDraftGeneratedAt: daysAgo(3),
      kidVersionContent: null,
      kidVersionUpdatedAt: null,
      photos: [
        { tag: 'obituary', uploadedAt: daysAgo(10) },
        { tag: 'funeral_program', uploadedAt: daysAgo(10) },
      ],
      hasMemorialVideo: true,
    },
    parentGuide: {
      lastSavedAt: daysAgo(3),
      askedQuestions: [
        { id: 'dq-001', question: 'What was your favorite thing about growing up in Cedar Rapids?', askedAt: daysAgo(14) },
        { id: 'dq-002', question: 'Is there anything you wish you had told Grandpa before he passed?', askedAt: daysAgo(7) },
        { id: 'dq-003', question: 'What do you hope we remember most about you?', askedAt: daysAgo(3) },
      ],
    },
    pendingPaymentTransfers: [
      { id: 'ptr-001', requesterFirstName: 'Kevin', requestedAt: daysAgo(2), isSelfRequest: false },
    ],
    pendingShareAcknowledgmentFromOtherTR: false,
  },
  {
    parentId: 'mock-parent-robert-001',
    guideId: null,
    guideSubscriptionActive: true,
    parentFirstName: 'Robert',
    parentLastName: 'Mitchell',
    roles: ['child'],
    isCurrentPayer: false,
    designatedAt: '',
    status: {
      lastCheckInAt: daysAgo(5),
      nextCheckInDueAt: daysFromNow(25),
      isOverdue: false,
      daysUntilNextCheckIn: 25,
      secondTrustedRepExists: false,
    },
    obituary: {
      parentWrittenContent: null,
      parentWrittenAt: null,
      aiDraftContent: null,
      aiDraftTone: null,
      aiDraftGeneratedAt: null,
      kidVersionContent: null,
      kidVersionUpdatedAt: null,
      photos: [],
      hasMemorialVideo: false,
    },
    parentGuide: {
      lastSavedAt: daysAgo(12),
      askedQuestions: [
        { id: 'rq-001', question: 'What was the best advice your father ever gave you?', askedAt: daysAgo(20) },
      ],
    },
    pendingPaymentTransfers: [],
    pendingShareAcknowledgmentFromOtherTR: false,
  },
];

// ─── Computed helpers ─────────────────────────────────────────────────────────

export function getParentById(parentId: string): ParentRelationship | undefined {
  return MOCK_RELATIONSHIPS.find(r => r.parentId === parentId);
}

export function getCheckInStatus(status: ParentRelationship['status']): {
  color: 'neutral' | 'yellow' | 'red';
  label: string;
} {
  if (status.isOverdue || status.daysUntilNextCheckIn < 0) {
    const overdueDays = Math.abs(status.daysUntilNextCheckIn);
    return { color: 'red', label: `Check-in overdue by ${overdueDays} day${overdueDays !== 1 ? 's' : ''}` };
  }
  if (status.daysUntilNextCheckIn <= 7) {
    return { color: 'yellow', label: `Next check-in in ${status.daysUntilNextCheckIn} day${status.daysUntilNextCheckIn !== 1 ? 's' : ''}` };
  }
  return { color: 'neutral', label: `Next check-in in ${status.daysUntilNextCheckIn} days` };
}

export function hasPendingActions(rel: ParentRelationship): boolean {
  return rel.pendingPaymentTransfers.length > 0 || rel.pendingShareAcknowledgmentFromOtherTR;
}

export function relativeTime(isoDate: string): string {
  const now = new Date();
  const then = new Date(isoDate);
  const diffMs = now.getTime() - then.getTime();
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

  if (diffDays < 0) {
    const futureDays = Math.abs(diffDays);
    if (futureDays === 0) return 'today';
    if (futureDays === 1) return 'tomorrow';
    return `in ${futureDays} days`;
  }
  if (diffDays === 0) return 'today';
  if (diffDays === 1) return 'yesterday';
  if (diffDays < 7) return `${diffDays} days ago`;
  if (diffDays < 30) {
    const weeks = Math.floor(diffDays / 7);
    return `${weeks} week${weeks !== 1 ? 's' : ''} ago`;
  }
  const months = Math.floor(diffDays / 30);
  return `${months} month${months !== 1 ? 's' : ''} ago`;
}
