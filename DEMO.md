# SellEasy24 — demonstration walkthrough

Everything below runs locally against real code. Where something is stood in for
rather than built, it says so plainly.

---

## Before you start

```bash
npm run infra:up      # Postgres + Redis (only if Docker was restarted)
npm run dev:api       # http://localhost:4000
npm run dev:web       # http://localhost:3000
npm run dev:admin     # http://localhost:3001   (verification console)
```

**Port note.** Another project of yours (`PGPlatform`) currently holds port
3000. Either stop it first, or start the web app on another port:

```bash
npm run dev --workspace @kamala/web -- -p 3002
```

If the demo listings ever look wrong: `npm run db:seed:demo`.

## Sign-in details

| Role | Email | Password |
|---|---|---|
| Seller (owner) | `owner@kamalainfra.dev` | `DevPassword123!` |
| Seller (broker) | `broker@kamalainfra.dev` | `DevPassword123!` |
| Verification officer | `verifier@kamalainfra.dev` | `DevPassword123!` |
| Buyer | `buyer@kamalainfra.dev` | `DevPassword123!` |

## Files to upload during the demo

In `demo-files/` — drag these in when the form asks:

- `photo-1-exterior.jpg`, `photo-2-bedroom.jpg`, `photo-3-kitchen.jpg`
- `sale-deed.pdf`, `id-proof.pdf`, `property-tax-receipt.pdf`

The PDFs are marked **Specimen — not valid** on their face. They are shaped like
the real documents so the officer's review screen has something realistic to
show, and they carry no legal weight.

---

## 1. Buyer — no account needed

Start here. It is the part that shows what the product is *for*.

1. **Home page.** Twelve verified homes. Every card carries a verified mark with
   the date it was checked.
2. **Search and filter.** Open *More filters* — availability, furnishing,
   facing, approving authority (GHMC / HMDA / DTCP), amenities, floor, age.
   Amenities combine with **and**, not or: tick Lift and Gym and you get the two
   homes that have both, not the eight that have either.
3. **Applied filters** appear as chips. Each removes only itself.
4. **Open a listing.** Point out:
   - the same fixed set of facts on every listing, so two can be compared
   - unanswered fields read *Not specified* rather than being hidden — a thin
     listing cannot pass for a thorough one
   - **Listed N days ago** comes from a date that cannot be reset. Re-approving
     or editing a listing does not make it look new. This is the direct answer
     to the stale-listing complaint about the incumbents.
   - the **verification record**: which checks passed, and on what date,
     readable without an account
5. **Compare.** Tick *Compare* on three cards, then open the bar at the bottom.
   Rows where all three answer the same are dimmed, so differences stand out.
6. **Save.** Press the heart — it asks you to sign in, because a shortlist has to
   follow you between devices.
7. **Enquire.** Send an enquiry **without an account**. Note the promise under
   the form: the number goes to that one seller.

## 2. Seller

Sign in as `owner@kamalainfra.dev`.

1. **Verify your phone** — `/seller/phone`.
   Enter a number, press *Send code*. The code appears on screen in a panel
   headed **Demonstration mode — no SMS sent**.

   > **Say this plainly:** the verification logic is real — codes are hashed,
   > expire in ten minutes, are destroyed after five wrong guesses, and cannot be
   > reused. Only *delivery* is outstanding, because that needs an SMS or
   > WhatsApp provider. Connecting one is a configuration change, not a rebuild.

2. **List a property** — *List your property*. Five steps: basic details,
   location, size and layout, property profile, price and contact.
   - The **Listing strength** meter climbs as optional fields are filled.
     Ownership type and approving authority score highest, because those are what
     the verification officer checks.
   - Leave and come back — the form remembers where you were.
3. **Photographs.** Upload the three sample photos. Reorder them, then press
   *Make cover* on another one.
4. **Documents.** Upload the three sample PDFs. They are encrypted before they
   are stored.
5. **Submit for review.** It becomes *Pending review* and is **not** public. Open
   it in another tab to show it is not there.

## 3. Verification officer

Sign in to the console on **port 3001** as `verifier@kamalainfra.dev`.

1. **Queue**, oldest first. There is already one waiting:
   *3 BHK in Gachibowli, awaiting verification*.
2. **Open it.** The seller's claims sit beside their documents.
3. **Open a document.** Every view is recorded — not just decisions, views.
4. **Work the four checks**: owner name matches the deed, deed registered and
   stamped, property tax current, address matches the documents.
5. **Approve.** Then switch back to the buyer tab and refresh — it is now public,
   with its verification record readable by anyone.

Worth mentioning: an officer **cannot approve a listing they own themselves**,
and approval is refused if any of the four checks is missing or failed.

---

## What is real, and what is not

**Real:** accounts and sessions, the whole listing lifecycle, document encryption
at rest, the verification workflow and its audit trail, search and filtering,
comparison, shortlists, enquiries, and the phone-verification logic.

**Stood in for:**

| | Status |
|---|---|
| OTP delivery | Code shown on screen. Needs an SMS or WhatsApp provider. |
| Email delivery | Written to the server log rather than sent. |
| Photographs | Stock images. Real listings carry seller-uploaded photos. |

**Not built yet:** saved searches with alerts, site-visit requests, buyer
preferences, and admin platform metrics.

## If asked "how do we know it works?"

```bash
npm test
```

58 automated tests. They cover the boundaries that fail silently: that one
seller cannot read another's listing or documents, that nothing unverified
reaches a buyer, that the first-listed date cannot be moved, that an officer
cannot approve their own listing, and that a one-time code cannot be replayed,
brute-forced or read from the database.
