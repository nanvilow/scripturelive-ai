'use client'

// v0.7.125 — App-styled confirmation dialog (replaces window.confirm).
//
// Operator screenshot diffs (https://ibb.co/PZwwp7qN +
// https://ibb.co/YTt9ytv2) showed two raw Chromium dialogs in the
// License flow — one labelled "@workspace/imported-app" with bare
// OK/Cancel buttons (Move-to-PC pre-confirm) and a second native
// alert that revealed the activation code in plain Windows chrome.
// Both are window.confirm() / window.alert() callsites that bypass
// our Radix design system and look amateurish to congregants /
// volunteers seated next to the operator.
//
// This module ships a Promise-based replacement so existing code can
// migrate from:
//
//     if (!confirm('Are you sure?')) return
//
// to:
//
//     const ok = await confirm({ title: '…', description: '…' })
//     if (!ok) return
//
// Implementation:
//
//   <ConfirmDialogProvider> mounts a single Radix AlertDialog at the
//   root of the tree. useConfirm() returns a function that resolves
//   to a boolean once the user clicks Confirm or Cancel. The dialog
//   is fully unmounted between uses so there is no zombie state.
//
//   We deliberately use Radix AlertDialog (NOT Sonner toast — the
//   path-aware-toaster has been globally silenced since v0.7.114, so
//   any toast-based confirmation would never paint) and NOT plain
//   Dialog (AlertDialog enforces the focus trap + Esc-to-cancel +
//   role=alertdialog semantics expected for destructive prompts).
//
//   For the deactivate / move-to-pc flows the surrounding code path
//   does NOT mutate license state until AFTER the confirm resolves,
//   so the v0.7.102 chrome-error race (Dialog rendered DURING a
//   license-context mutation) cannot occur here. The post-transfer
//   success notification is handled separately by
//   <TransferSuccessDialog>, which mounts on the FRESH page load
//   after a hard-reload — same proven pattern as
//   <ActivationSuccessDialog>.

import { createContext, useCallback, useContext, useRef, useState } from 'react'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'

export type ConfirmOptions = {
  title: string
  /** Plain text or pre-formatted multi-line string. Newlines are
   *  rendered as paragraph breaks. */
  description?: string
  confirmText?: string
  cancelText?: string
  /** Adds a red tint to the confirm button to signal destructive
   *  intent (deactivate, remove, transfer). Default false. */
  destructive?: boolean
}

type ConfirmFn = (opts: ConfirmOptions) => Promise<boolean>

const Ctx = createContext<ConfirmFn | null>(null)

export function useConfirm(): ConfirmFn {
  const fn = useContext(Ctx)
  if (!fn) {
    throw new Error('useConfirm must be inside <ConfirmDialogProvider>')
  }
  return fn
}

type PendingState = {
  options: ConfirmOptions
  resolve: (value: boolean) => void
}

export function ConfirmDialogProvider({ children }: { children: React.ReactNode }) {
  const [pending, setPending] = useState<PendingState | null>(null)
  // Latch ensures we resolve exactly once even if the user double-
  // clicks Confirm or onOpenChange fires twice during the close
  // animation.
  const resolvedRef = useRef(false)

  const confirm = useCallback<ConfirmFn>((options) => {
    return new Promise<boolean>((resolve) => {
      resolvedRef.current = false
      setPending({ options, resolve })
    })
  }, [])

  const finish = useCallback((result: boolean) => {
    if (!pending) return
    if (resolvedRef.current) return
    resolvedRef.current = true
    pending.resolve(result)
    setPending(null)
  }, [pending])

  // Render description: split on \n\n into paragraphs, preserve
  // single \n as <br /> so the migrated multi-line confirm text
  // (which used \n\n liberally) keeps its visual rhythm.
  const renderDescription = (text?: string) => {
    if (!text) return null
    const paragraphs = text.split('\n\n')
    return paragraphs.map((p, i) => (
      <p key={i} className={i === 0 ? '' : 'mt-2'}>
        {p.split('\n').map((line, j, arr) => (
          <span key={j}>
            {line}
            {j < arr.length - 1 && <br />}
          </span>
        ))}
      </p>
    ))
  }

  return (
    <Ctx.Provider value={confirm}>
      {children}
      <AlertDialog
        open={pending !== null}
        onOpenChange={(open) => {
          // Esc / overlay click → treat as cancel.
          if (!open) finish(false)
        }}
      >
        {pending && (
          <AlertDialogContent className="sm:max-w-md">
            <AlertDialogHeader>
              <AlertDialogTitle>{pending.options.title}</AlertDialogTitle>
              {pending.options.description && (
                <AlertDialogDescription asChild>
                  <div className="text-sm text-muted-foreground">
                    {renderDescription(pending.options.description)}
                  </div>
                </AlertDialogDescription>
              )}
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel onClick={() => finish(false)}>
                {pending.options.cancelText ?? 'Cancel'}
              </AlertDialogCancel>
              <AlertDialogAction
                onClick={() => finish(true)}
                className={
                  pending.options.destructive
                    ? 'bg-red-600 text-white hover:bg-red-500'
                    : undefined
                }
              >
                {pending.options.confirmText ?? 'Confirm'}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        )}
      </AlertDialog>
    </Ctx.Provider>
  )
}
