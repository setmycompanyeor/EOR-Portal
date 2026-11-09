"use client";

import { createContext, useCallback, useContext, useEffect, useId, useRef, useState, type ReactNode } from "react";
import { X } from "lucide-react";

const DoneContext = createContext<((message?: string) => void) | null>(null);

/**
 * For a form rendered inside a SlideOver: once its action succeeds (a message and
 * no error), close the panel, reset the form and show the message beside the button.
 * Outside a SlideOver it does nothing.
 */
export function useCloseOnSuccess(state: { error?: string; message?: string }) {
  const done = useContext(DoneContext);
  useEffect(() => {
    if (done && state.message && !state.error) done(state.message);
  }, [done, state]);
}

/**
 * A button that opens its children in a panel sliding in from the right.
 * Built on the native <dialog>, so focus is trapped, Escape closes it and the
 * page behind is inert while it is open.
 */
export function SlideOver({
  label,
  title,
  description,
  primary = true,
  small = false,
  defaultOpen = false,
  children,
}: {
  label: ReactNode;
  title: string;
  description?: ReactNode;
  primary?: boolean;
  small?: boolean;
  /** Open as soon as the page loads, e.g. when a link pre-fills the form. */
  defaultOpen?: boolean;
  children: ReactNode;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  // Bumped after a successful submit so the form inside remounts empty.
  const [generation, setGeneration] = useState(0);
  const [notice, setNotice] = useState<string | undefined>();

  const open = useCallback(() => {
    const dialog = ref.current;
    if (!dialog || dialog.open) return;
    setNotice(undefined);
    dialog.showModal();
    // Start in the first field rather than on the close button.
    dialog.querySelector<HTMLElement>("input:not([type=hidden]), select, textarea")?.focus();
  }, []);

  const done = useCallback((message?: string) => {
    ref.current?.close();
    setGeneration((g) => g + 1);
    setNotice(message);
  }, []);

  useEffect(() => {
    if (defaultOpen) open();
  }, [defaultOpen, open]);

  return (
    <>
      {notice && (
        <span role="status" className="self-center text-[13px] text-green-ink">
          {notice}
        </span>
      )}
      <button type="button" className={`btn ${primary ? "btn-primary" : ""} ${small ? "btn-sm" : ""}`} onClick={open}>
        {label}
      </button>
      <dialog
        ref={ref}
        aria-labelledby={titleId}
        // A click on the dialog element itself is a click on the backdrop.
        onClick={(e) => e.target === ref.current && ref.current?.close()}
        className="slide-over fixed inset-y-0 right-0 left-auto m-0 h-dvh max-h-none w-full max-w-md flex-col border-l border-line bg-surface p-0 text-ink shadow-2xl backdrop:bg-navy/40 open:flex"
      >
        <div className="flex items-start justify-between gap-3 border-b border-line-soft px-5 py-4">
          <div>
            <h2 id={titleId} className="text-base font-semibold">
              {title}
            </h2>
            {description && <p className="text-[13px] text-ink-muted">{description}</p>}
          </div>
          <button type="button" aria-label="Close" className="btn btn-sm px-2" onClick={() => ref.current?.close()}>
            <X size={16} aria-hidden="true" />
          </button>
        </div>
        <div key={generation} className="flex-1 overflow-y-auto px-5 py-4">
          <DoneContext value={done}>{children}</DoneContext>
        </div>
      </dialog>
    </>
  );
}

/** Stand-in for a SlideOver button while its data streams in. */
export function SlideOverPending({ label, primary = true }: { label: ReactNode; primary?: boolean }) {
  return (
    <button type="button" className={`btn ${primary ? "btn-primary" : ""}`} disabled>
      {label}
    </button>
  );
}
