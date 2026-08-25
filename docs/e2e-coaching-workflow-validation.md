# End-to-End Coaching Workflow Validation

**Validation date:** 25 August 2026  
**Baseline:** `origin/main` at merge commit `02f2283`  
**Environment:** Fresh local PostgreSQL database with migrations `migrate.sql` and `migrate_002` through `migrate_014` applied in order.  
**Execution:** `verify_complete_coaching_workflow_local.js` against an authenticated local API.

## Objective

Validate the connected coach journey from Programme configuration through session participation, time-credit handling, manual income recording, package enrolment, renewal tracking, analytics, and manual credit resolution. The test deliberately checks that time owed, attendance, income and renewal records remain separate.

## Scenario summary

A fresh test coach has two active Player Register entries: **Jamie North** and **Morgan East**. The workflow creates a pair Programme, logs a shared session, confirms Jamie as attended and Morgan as excused, records a 30-minute weather credit for Jamie, records £360 already received, creates a Programme-linked package, enrols Jamie, records a renewal period, checks analytics and then manually resolves the credit.

| Stage | Expected behaviour | Result |
|---|---|---|
| **Schema setup** | A fresh database accepts migrations through Package and Renewal migration 014. | **Pass** |
| **Programme management** | A structured Pair Programme stores weekdays, start time, duration, location and capacity. | **Pass** |
| **Session logging** | A Programme-linked Pair session stores both Player Register entries and keeps the legacy group-session flag compatible with the structured Pair type. | **Pass** |
| **Participation** | Reflection preserves Jamie as attended and Morgan as excused; the completed session reports one attendance and zero absences. | **Pass** |
| **Session Credit** | A 90-minute planned session with 60 minutes delivered produces a 30-minute weather credit for Jamie. | **Pass** |
| **Attendance separation** | Creating credit leaves Jamie attended and Morgan excused. | **Pass** |
| **Manual income** | A £360 bank-transfer record is stored as manual income and displays the separate 30-minute credit context. | **Pass** |
| **Package enrolment** | An 84-day, Programme-linked package creates a Player Register enrolment with a derived renewal date. | **Pass** |
| **Renewal** | Renewing creates a new linked period, preserves the source record as renewed, and derives a new end date from package duration. | **Pass** |
| **Player Register** | Jamie’s profile retains two enrolment periods, Programme assignment, session history and credit context. | **Pass** |
| **Activity analytics** | Programme activity includes one completed session in the last 30 days; each participant can retrieve the shared session history. | **Pass** |
| **Manual credit resolution** | Resolving the time credit clears only the open minute balance; income remains £360 and participation statuses remain unchanged. | **Pass** |

## Persisted end state

| Data point | Verified value |
|---|---|
| Active structured Programmes | 1 |
| Completed Programme-linked sessions | 1 |
| Attended participation rows | 1 |
| Excused participation rows | 1 |
| Manual income records | £360.00 |
| Package enrolment periods | 2 |
| Final open Session Credit balance | 0 minutes, after manual resolution |

## Separation checks

> **Attendance was not used to represent time owed.** Jamie remained attended while the 30-minute Session Credit was open and after it was resolved.

> **Income was not used to resolve a credit.** The £360 manual income record remained unchanged when the coach manually marked make-up time as delivered.

> **Renewal was not used to mark money as received.** The new package period was recorded independently of the income entry.

## Test correction recorded

The first test fixture attempted to submit `outdoor` as a session `environment_type`. The production schema correctly restricts that field to its configured enum values; the fixture was changed to valid value `club` and the full workflow was rerun successfully. This was a test-fixture correction, not a product defect.

## Re-run instructions

The local verification requires PostgreSQL, backend dependencies and a local coach token secret. It intentionally uses an isolated test database.

```bash
createdb cg_tennis_e2e_test
# Apply migrate.sql and migrate_002 through migrate_014 in order.
psql -d cg_tennis_e2e_test -f /home/ubuntu/cg-tennis-e2e-seed.sql

cd backend
DB_HOST=/var/run/postgresql \
DB_NAME=cg_tennis_e2e_test \
DB_USER=ubuntu \
DB_SSL=false \
JWT_SECRET=<test-secret> \
PORT=3106 \
node src/server.js

# In a second terminal:
cd ..
JWT_SECRET=<test-secret> \
CGT_E2E_API_URL=http://127.0.0.1:3106 \
node verify_complete_coaching_workflow_local.js
```

The test should report `complete coaching workflow: PASS`.

---

**Owner:** CG Tennis OS engineering and coaching operations
