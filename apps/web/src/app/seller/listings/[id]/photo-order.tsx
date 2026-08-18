'use client';

import { useState, useTransition } from 'react';
import { reorderPhotos } from '../../actions';

export interface SellerPhoto {
  id: string;
  url: string;
  sortOrder: number;
}

/**
 * Photo ordering for a seller.
 *
 * Buttons rather than drag-and-drop. Dragging is the obvious choice and the
 * wrong one here: it is unusable by keyboard, awkward on the phones most Indian
 * sellers list from, and needs a fallback anyway. Move-left / move-right and an
 * explicit "Make cover" are operable by everyone and read unambiguously.
 *
 * Order is applied optimistically and rolled back if the server rejects it, so
 * repositioning several photos does not mean waiting for a round trip each time.
 */
export function PhotoOrder({
  listingId,
  photos,
  canEdit,
}: {
  listingId: string;
  photos: SellerPhoto[];
  /** False once verified — reordering stays allowed, deleting does not. */
  canEdit: boolean;
}) {
  const [order, setOrder] = useState(photos);
  const [error, setError] = useState<string | undefined>();
  const [pending, startTransition] = useTransition();

  function apply(next: SellerPhoto[]) {
    const previous = order;
    setOrder(next);
    setError(undefined);

    startTransition(async () => {
      const result = await reorderPhotos(
        listingId,
        next.map((photo) => photo.id),
      );
      if (result.error) {
        setOrder(previous);
        setError(result.error);
      }
    });
  }

  function move(index: number, delta: number) {
    const target = index + delta;
    if (target < 0 || target >= order.length) {
      return;
    }
    const next = [...order];
    const [moved] = next.splice(index, 1);
    next.splice(target, 0, moved!);
    apply(next);
  }

  function makeCover(index: number) {
    if (index === 0) {
      return;
    }
    const next = [...order];
    const [chosen] = next.splice(index, 1);
    apply([chosen!, ...next]);
  }

  if (order.length === 0) {
    return null;
  }

  return (
    <div>
      <div className="flex items-baseline justify-between gap-3">
        <h3 className="text-[0.9375rem] font-semibold text-ink">
          Photos <span className="font-normal text-muted tabular">({order.length})</span>
        </h3>
        {pending && <span className="text-[0.75rem] text-faint">Saving order…</span>}
      </div>

      <p className="mt-1 text-[0.8125rem] text-muted">
        The first photo is what buyers see in search results.
      </p>

      {error && (
        <p role="alert" className="mt-2 border-l-2 border-seal bg-seal-soft px-3 py-2 text-[0.8125rem] text-ink">
          {error}
        </p>
      )}

      <ul className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
        {order.map((photo, index) => (
          <li key={photo.id} className="group">
            <div className="relative aspect-[4/3] overflow-hidden rounded-card border border-line bg-canvas-deep">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={photo.url} alt="" className="h-full w-full object-cover" />

              {index === 0 && (
                <span className="absolute left-2 top-2 rounded-full bg-action px-2 py-0.5 text-[0.625rem] font-semibold uppercase tracking-wider text-white">
                  Cover
                </span>
              )}
            </div>

            <div className="mt-1.5 flex items-center justify-between gap-1">
              <div className="flex gap-1">
                <OrderButton
                  label="Move earlier"
                  glyph="←"
                  disabled={index === 0 || pending}
                  onClick={() => move(index, -1)}
                />
                <OrderButton
                  label="Move later"
                  glyph="→"
                  disabled={index === order.length - 1 || pending}
                  onClick={() => move(index, 1)}
                />
              </div>

              {index !== 0 && (
                <button
                  type="button"
                  onClick={() => makeCover(index)}
                  disabled={pending}
                  className="text-[0.75rem] text-muted underline-offset-4 transition-colors hover:text-ink hover:underline disabled:opacity-50"
                >
                  Make cover
                </button>
              )}
            </div>
          </li>
        ))}
      </ul>

      {!canEdit && (
        <p className="mt-3 text-[0.75rem] leading-relaxed text-faint">
          You can reorder photos on a live listing, but adding or removing them
          would change what the verification officer checked — that needs a fresh
          review.
        </p>
      )}
    </div>
  );
}

function OrderButton({
  label,
  glyph,
  disabled,
  onClick,
}: {
  label: string;
  glyph: string;
  disabled: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      className="flex h-7 w-7 items-center justify-center rounded-control border border-line text-[0.8125rem] text-ink transition-colors hover:bg-canvas-deep disabled:cursor-not-allowed disabled:opacity-35"
    >
      <span aria-hidden="true">{glyph}</span>
    </button>
  );
}
