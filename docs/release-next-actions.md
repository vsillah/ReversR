# ReversR Rebuild Release Next Actions

Generated at: 2026-06-13T03:43:59.479Z
Release status generated at: 2026-06-13T03:43:59.475Z

This generated packet is the external-operator action list for the clone release. It does not mark the app store-ready; it preserves the pending hosted, EAS, native QA, screenshot, and store-console gates.

## Summary

- Pass: 8
- Pending: 1
- Blocked: 0
- Warn: 0
- Next recommended gate: store-console-records

## 1. Store console final review and submission gates are resolved

- Gate ID: store-console-records
- Group: store-console
- Status: pending
- Owner: Store release operator
- Phase: Store console final review
- Next action: Resolve the remaining App Store Connect and Google Play review/signoff gates without starting public submission.

Current gate evidence:

docs/store-console-evidence.json exists and records Apple/Google app records; remaining gates: TestFlight tester/review readiness, final signoff.

Current gate next step:

Complete TestFlight tester/review readiness, final signoff before any public submission.

Steps:

1. Use the recorded App Store Connect app record and Apple ID in docs/store-console-evidence.json.
2. Follow docs/external-release-setup-runbook.md sections 2 and 3.
3. Use the recorded Google Play Console app dashboard URL in docs/store-console-evidence.json.
4. Run npm run store:submission:preflight:local and confirm docs/store-submission-smoke-evidence.json is updated.
5. Run npm run store:console:preflight:local and confirm docs/store-console-pending-evidence.json is updated.
6. Review the saved App Store Connect metadata, age rating, content rights, and configured App Privacy answers.
7. Only after explicit approval, publish App Privacy and complete any Apple legal/accuracy attestation.
8. Complete TestFlight tester/group readiness or explicitly decide to proceed without TestFlight tester expansion.
9. Review the saved Google Play metadata, Data Safety, App Content, content rating, target audience, Advertising ID, and internal-testing release.
10. Only after explicit approval, complete Google Play internal-testing tester access/review readiness and any Send for review action.
11. Update docs/store-console-evidence.json with final console task results, review-gate, and signoff fields.
12. Run npm run store:console:preflight:local for pending-safe proof; run strict npm run store:console:preflight only after final signoff fields are complete.

Evidence required:

- docs/store-submission-smoke-evidence.json records App Store metadata, Google Play metadata, privacy/data-safety answers, native screenshot requirements, and open gates.
- docs/store-console-pending-evidence.json records pending App Store Connect and Google Play setup requirements.
- docs/store-console-evidence.json exists with both console records.
- npm run store:console:preflight:local passes with only explicitly gated warnings until final signoff is complete.

