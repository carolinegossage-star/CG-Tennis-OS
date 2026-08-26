# CG Tennis OS Coach Guide: Packages, Renewals and Financial Tracking

**Audience:** Coaches and academy directors using CG Tennis OS to manage player coaching periods, time owed, and money already received.

**Purpose:** This guide explains how to use the Programme, Player Register, Session Participation, Session Credit, Income and Renewals workflows as one connected coaching operating system. It is designed for publishing as a public or authenticated reference page on CGTennisOS.Info.

> **Core principle:** Attendance answers **“Did the player show up and engage?”** Session Credit answers **“Do we owe the player time?”** Income answers **“What money has the coach already received?”** A renewal answers **“Has the coach recorded the next coaching period?”** These are deliberately separate records.

| Area | What it records | What it never does automatically |
|---|---|---|
| **Participation** | Scheduled, attended, absent or excused status for each player in a session. | It does not create time credit, income, discounts or renewals. |
| **Session Credit** | Make-up time owed in minutes because a session was shortened, cancelled or unavailable. | It does not change attendance, retention, income, invoices, refunds or payments. |
| **Income** | Money the coach has already received and entered manually. | It does not collect payment, open checkout, apply a credit, issue an invoice or change a renewal. |
| **Package and renewal** | A structured coaching period linked to a player and, where relevant, a Programme. | It does not charge a player, mark money as paid or resolve a Session Credit. |

## 1. Start with a Coaching Programme

Open **Programmes** from the main navigation and select **Create Programme**. A Programme is a reusable coaching schedule, not a free-text session label. It keeps the programme name, type, weekday or weekdays, start time, duration, location, capacity and coaching notes together.

Use **Individual** for one-to-one coaching, **Pair** for two-player sessions, and **Group** for larger sessions. Where the Programme is used in a session, CG Tennis OS carries its structured context into the session record. Pair Programmes retain their precise Pair type while remaining compatible with historic group-session reporting.

| Field | Coaching use |
|---|---|
| **Name** | Use a recognisable operating name, such as “Tuesday Advanced Pair”. |
| **Type** | Select Individual, Pair or Group so session structure is clear. |
| **Days and time** | Record the normal delivery rhythm for planning and renewal conversations. |
| **Duration** | Use the expected session length; it provides useful context when recording a shortfall. |
| **Location and capacity** | Make delivery logistics and programme scale visible. |

> **Good practice:** Create a Programme once and reuse it. Do not recreate the same coaching schedule as a one-off text description for every session.

## 2. Keep each player in the Player Register

Open **Players** and create or maintain the player’s shared profile. Record player and guardian contacts, enrolment date, active or inactive status, and relevant coaching identifiers. Assign existing Coaching Programmes through the structured Programme selector.

The Player Register is the connection point for the rest of the system. Session participation, Session Credit, Income records and package enrolments all link to the same player record. This prevents parallel lists and keeps a coach’s decisions in one place.

The player profile also displays the current Programme assignment, participation history, Session Credit balance and package/renewal history. Use it as the starting point for an informed coaching conversation, rather than a payment screen.

## 3. Log a session and confirm participation

Open **Sessions** and select **Log session**. Choose a lead player and add additional Player Register participants for a Pair or Group session. Select the relevant Programme whenever one applies. Use the ad-hoc session-type fallback only when the session is genuinely outside an existing Programme.

At reflection time, open the session and confirm each participant’s status. Use the following statuses consistently.

| Status | Use when | Effect on activity history |
|---|---|---|
| **Scheduled** | The session is logged but participation has not yet been confirmed. | It remains awaiting confirmation. |
| **Attended** | The player took part in the session. | It contributes to the player’s completed activity history. |
| **Absent** | The player did not attend. | It remains visible as an absence. |
| **Excused** | The player did not attend, but the absence was agreed or expected. | It is recorded separately from an attended session and is not a Session Credit. |

> **Do not use attendance to express a make-up entitlement.** If time is owed, keep the attendance status truthful and create a separate Session Credit.

## 4. Record Session Credit when time is owed

The **Session Credit** section appears alongside participation when reflecting on a session. It is optional. Use it only when the coach owes time, for example because weather ended a session early, a facility closed, or the coach cancelled.

You can record a credit in either of two ways. Enter the planned and actual delivered minutes so CG Tennis OS calculates the shortfall, or enter a direct number of minutes owed. Choose the affected player or players, select a reason, and add a short explanation.

### Worked example

A Pair Programme is planned for **90 minutes**. Weather allows **60 minutes** of coaching. Mark the player who attended as **Attended**, then record a **30-minute** Session Credit with the reason **Weather**. The attendance status stays Attended. The credit remains open until the coach manually records that make-up time has been delivered.

The Player Register, Income ledger and Renewals workspace show the open balance as **informational context**. A coach decides what to offer and records a make-up manually. CG Tennis OS does not turn minutes into a discount, refund, invoice adjustment or payment action.

## 5. Record income only after it has been received

Open **Income** and select **Record income**. Choose a Player Register record, enter the amount actually received, the date received, the method, and an optional note. The Income Ledger is intentionally manual; it is a bookkeeping record of money already received.

| Field | Guidance |
|---|---|
| **Player** | Select the player connected to the received money. |
| **Amount** | Enter the amount actually received, not an expected amount. |
| **Received date** | Use the date the coach received the money. |
| **Received via** | Select the coach’s manual record of the method, such as bank transfer or cash. |
| **Note** | Add brief context, for example “Autumn pair package received”. |

If a player has Session Credit, the form displays it in a separate information panel. You can use that context in your conversation and notes, but recording income does not reduce or resolve the credit balance.

## 6. Create a package and enrol the player

Open **Renewals** and use the **Package library** to create a structured coaching offer. A package can link to a Coaching Programme and contains a duration in days, optional price reference, optional included session count, and description.

The price is a private coach reference. It helps the coach recognise the intended offer, but it does not create a charge, invoice, checkout or payment confirmation.

Next, select **Add enrolment**. Choose the Player Register entry, select an active package, confirm the start date and renewal or expiry date, and add an optional coach note. The initial renewal date is proposed from the package duration, but the coach can review it before saving.

When a package has a linked Programme, saving the enrolment also maintains the player’s structured Programme assignment. The Player Register profile then shows the package, linked Programme, period dates and status.

## 7. Record a renewal period

The **Renewal tracker** highlights upcoming, overdue and active periods with separate colours and clear action buttons. Review the player’s session activity, open Session Credit balance, Income Ledger and coaching context before deciding what to offer.

Select **Renew period** to create the next coaching period. CG Tennis OS preserves the earlier enrolment as historical record and links the new period back to it. The new period uses the package duration to suggest its end date.

> Recording a renewal means only that the coach has recorded the next coaching period. It does **not** mean payment has been collected, a discount has been applied, or a Session Credit has been settled.

## 8. Run a weekly coaching and business review

A simple review rhythm keeps coaching delivery and financial context aligned without automating a coach’s judgement.

| Review point | Suggested action |
|---|---|
| **After each session** | Confirm attendance and add reflection context. Record Session Credit only when time is genuinely owed. |
| **Weekly** | Review open Session Credit balances in Player profiles and the Income Ledger. Arrange make-up time manually where appropriate. |
| **Monthly** | Check Income records for completeness and review Programme activity. Confirm that recorded income reflects money already received. |
| **30 days before renewal** | Use Renewals to identify upcoming conversations. Review the player’s package, activity, credit context and coaching plan. |
| **At renewal** | Record the next period only after the coach has decided the package and dates. Record any received money separately in Income. |

## Quick troubleshooting

| Situation | What to do |
|---|---|
| A player needs make-up time after a shortened session. | Keep attendance accurate, then add a separate Session Credit in minutes. |
| A player was absent but no time is owed. | Record **Absent** or **Excused** as appropriate. Do not create a Session Credit. |
| A payment has arrived. | Add a manual Income record. Do not assume an active package or renewal means money was received. |
| A package needs updating for future use. | Edit the Package Library record. Existing player enrolments retain their historical package terms. |
| A package is no longer offered. | Archive it. Historical enrolments remain visible. |
| A player’s renewal is due but a credit is open. | Use the credit balance as context and decide the arrangement manually. Do not expect the system to apply a deduction. |

## Coach-control commitments

CG Tennis OS keeps the following decisions with the coach:

- whether a player attended, was absent or was excused;
- whether time is owed and how much;
- whether and when make-up time has been delivered;
- whether money has been received and how it was recorded;
- what package a player should take next; and
- what action, if any, should follow a renewal conversation.

The system supports consistent records and visible context. It does not make payment, refund, discount, credit-settlement or retention decisions on the coach’s behalf.

## Publishing metadata for CGTennisOS.Info

| Item | Suggested value |
|---|---|
| **Page title** | Packages, Renewals and Financial Tracking for Tennis Coaches \| CG Tennis OS |
| **URL path** | `/guides/packages-renewals-financial-tracking/` |
| **Meta description** | Learn how CG Tennis OS helps tennis coaches manage Programmes, session participation, make-up-time credits, manual income records and player renewals—without automating financial decisions. |
| **Primary CTA** | `Open CG Tennis OS` |
| **Secondary CTA** | `Read the coaching workflow` |
| **Access model** | Publish as a reference page. Keep screenshots and any live player information anonymised. |

---

**Document owner:** CG Tennis OS

**Last reviewed:** 25 August 2026

**Related reference:** `docs/cgtennisos-info-publication-guide.md`
