# CGTennisOS.Info Publication Guide

**Purpose:** This note prepares the coach reference materials for publication on CGTennisOS.Info.

## Current hosting status

The public domain [cgtennisos.info](https://cgtennisos.info) currently displays a 123 Reg parked-domain page rather than a CG Tennis OS website. The domain therefore has no live content environment into which documentation can be published yet. This guide is ready for use as soon as the domain is connected to a hosted site or documentation platform.

> Do not publish live player names, guardian contact details, income amounts, Session Credit balances or screenshots containing real coaching data on the public website. Use anonymised examples only.

## Reference content prepared in this repository

| File | Recommended public use |
|---|---|
| `docs/coach-package-renewals-and-financial-tracking.md` | Main coach guide for Programmes, session participation, Session Credit, Income, packages and renewals. |
| `docs/e2e-coaching-workflow-validation.md` | Technical trust note or internal release-validation reference. |
| `verify_complete_coaching_workflow_local.js` | Developer-only regression test; do not expose on a public site. |

## Recommended information architecture

Create a **Coach Guides** section on CGTennisOS.Info. The first guide should use the following public route and navigation placement.

| Item | Recommendation |
|---|---|
| **Route** | `/guides/packages-renewals-financial-tracking/` |
| **Navigation** | `Resources` → `Coach Guides` → `Packages, renewals and financial tracking` |
| **Page title** | `Packages, Renewals and Financial Tracking for Tennis Coaches \| CG Tennis OS` |
| **Audience** | Existing or prospective CG Tennis OS coaches and academy directors. |
| **Primary CTA** | `Open CG Tennis OS` |
| **Secondary CTA** | `Explore coach guides` |
| **Access** | Public reference content; keep application actions behind the normal CG Tennis OS sign-in. |

## Publishing method

The coach guide is written in GitHub-flavoured Markdown and can be used in any of the following ways after a site is available.

| Destination | Implementation approach |
|---|---|
| **Static website repository** | Copy the Markdown into the site’s content collection and apply the metadata in the coach guide’s final table. |
| **Headless CMS** | Paste the guide body into a rich-text or Markdown field, using H2 headings as section anchors. |
| **Knowledge-base platform** | Import the Markdown directly, then set the page path and navigation label above. |
| **Hosted docs generator** | Include the file under the guides directory and add the route to its navigation configuration. |

## Visual and content requirements

The public reference page should use the same operational clarity as the app. Use a strong title, readable hierarchy, colour-coded callouts for the four distinct records, and clear CTA buttons. The page should make the following boundaries unmistakable.

| Visual treatment | Meaning |
|---|---|
| **Green or teal information card** | Money already received and recorded manually. |
| **Sky-blue information card** | Session Credit or make-up time owed. |
| **Violet information card** | Packages and renewal periods. |
| **Amber information card** | Attendance or a coaching decision requiring review. |

Do not label a Session Credit as a refund, discount or payment adjustment. Do not suggest that an active package means the player has paid. Do not show a live payment control in the guide.

## Launch checklist

| Check | Completion criterion |
|---|---|
| **Domain connection** | CGTennisOS.Info resolves to the intended website host rather than a parked page. |
| **HTTPS** | The public guide is served over HTTPS. |
| **Guide route** | The published guide is reachable at the proposed route or an approved equivalent. |
| **Navigation** | The guide is discoverable from the public Resources or Coach Guides area. |
| **CTA target** | `Open CG Tennis OS` links to the intended authenticated app entry point. |
| **Privacy review** | Examples and screenshots contain no real player, guardian or financial data. |
| **Accessibility** | Headings are sequential, colour is not the only distinction, contrast is sufficient, and CTA labels are explicit. |
| **Change control** | The public page identifies CG Tennis OS as owner and records a review date. |

## Suggested launch copy

> **Coach confidently from one connected record.** CG Tennis OS helps you link Programmes, session participation, make-up-time credits, manual income records and renewal periods—while keeping every coaching and financial decision in your hands.

---

**Publication owner:** CG Tennis OS

**Prepared:** 25 August 2026

**Source guide:** `docs/coach-package-renewals-and-financial-tracking.md`
