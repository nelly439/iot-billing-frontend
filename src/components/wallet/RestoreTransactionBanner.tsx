'use client';

import { useState } from 'react';
import { loadSavedModal } from '@/components/wallet/TransactionModal';
import { TransactionModal } from '@/components/wallet/TransactionModal';

/**
 * Shown at the top of the dashboard when sessionStorage contains a saved
 * transaction modal state — e.g. after a spurious popstate closed the modal.
 * Lets the user re-open their in-progress transaction without losing context.
 */
export function RestoreTransactionBanner() {
  const [saved, setSaved] = useState<ReturnType<typeof loadSavedModal>>(() => loadSavedModal());
  const [restored, setRestored] = useState(false);

  if (!saved || restored) return null;

  return (
    <>
      <div
        data-testid="restore-banner"
        className="mb-4 flex items-center justify-between rounded border border-yellow-600/40 bg-yellow-950/30 px-4 py-2 text-sm text-yellow-300"
      >
        <span>Your transaction was interrupted. Restore it?</span>
        <div className="flex gap-2">
          <button
            onClick={() => setRestored(true)}
            className="rounded bg-yellow-600 px-3 py-1 text-xs font-medium text-white hover:bg-yellow-500"
          >
            Restore
          </button>
          <button
            onClick={() => {
              try {
                sessionStorage.removeItem('txModal:saved');
              } catch {
                /* noop */
              }
              setSaved(null);
            }}
            className="rounded bg-gray-700 px-3 py-1 text-xs text-gray-300 hover:bg-gray-600"
          >
            Dismiss
          </button>
        </div>
      </div>

      {restored && (
        <TransactionModal
          type={saved.type}
          contractId={saved.contractId}
          asset={saved.asset}
          onClose={() => {
            setRestored(false);
            setSaved(null);
            try {
              sessionStorage.removeItem('txModal:saved');
            } catch {
              /* noop */
            }
          }}
        />
      )}
    </>
  );
}
