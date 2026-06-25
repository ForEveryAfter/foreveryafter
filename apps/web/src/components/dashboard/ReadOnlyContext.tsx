'use client';

import { createContext, useContext } from 'react';

// Why the guide is read-only for the current view (null = fully editable).
export type ReadOnlyReason = 'trial' | 'no_payment' | null;

export interface GuideReadOnlyState {
  // True when actions on the CURRENT page should be blocked. Already accounts for
  // route scoping (payments + the child-side surfaces are never read-only here).
  readOnly: boolean;
  reason: ReadOnlyReason;
}

const GuideReadOnlyContext = createContext<GuideReadOnlyState>({ readOnly: false, reason: null });

export const GuideReadOnlyProvider = GuideReadOnlyContext.Provider;

// Components that render custom (non-form) controls — div-based dropzones, onClick
// handlers, links that delete — can read this to disable themselves, since the
// layout's <fieldset disabled> only catches native form elements.
export function useGuideReadOnly(): GuideReadOnlyState {
  return useContext(GuideReadOnlyContext);
}
