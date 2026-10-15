---
title: Integration design decisions — 8 October 2026
section: Journal
updated: 2026-10-08
status: Accepted
---
# Integration design decisions — 8 October 2026

The user completed the first grill-form round after the [integration audit](2026-10-08-integration-audit.md). The [unaltered answer transcript](2026-10-08-grill-066239f1-0297-4959-931f-86fe2f48422e.md) is the source for these decisions. The current behavior specification and acceptance scenarios live in [Discovery and sources](../features/discovery.md#accepted-corrective-design-8-october-2026); this journal preserves the rationale accepted before implementation. The later [implementation run](../verification/runs/2026-10-08T075217Z-integration-implementation.md) records completion. The user subsequently removed The Muse entirely from scope; the original five-source decision below is preserved as history, not pending work.

## Scope and functional boundaries

The user chose the four audit targets plus shared pure rules, ordinary TypeScript with a functional core, and existing tables for the first pass. The selected queue fairness and discovery-failure behavior are also included. Broader architecture/policy consolidation, queue schema changes and cache retention work are deferred.

Use a few cohesive functions to calculate content, precedence and next queue state from explicit inputs. Keep the effects in existing orchestration and persistence code. Pass the current time where a decision needs it; avoid callbacks or database handles that hide effects inside supposedly pure functions. Reuse types and helpers where they remove conflicting knowledge. Function names and file layout are implementation choices, not new architecture requirements. There is no requirement for a new effects library, event-sourcing system or generic state-machine framework.

## A material correction to the audit

For question 4, the user selected **“Keep detail-page metadata until the detail page is refreshed.”** This rejects the audit's proposed newest-card-wins policy. Preserving detail-page title/salary through an excerpt refresh is therefore intended. The earlier synthetic failure remains part of the historical audit, but its expected result must not become a regression test for the new design. The new check must instead protect detail precedence and prove that a later successful full-detail refresh can update it.

This changes the diagnosis from four bugs requiring the audit's suggested fixes to three demonstrated defects plus a merge-policy consistency target. It does not remove the need to prevent stale details from being indefinitely starved of revalidation.

## Keep uncertain cases simple

For conflicting hiring evidence, the user chose to preserve both statements and mark eligibility uncertain, adding: **“whatever is the simplest and lightest. its fine to not be super accurate here.”** This favors preserving evidence and using existing uncertainty/review concepts for obvious conflicts. It does not justify inventing work authorization, dropping restrictions or building a comprehensive geography inference system.

For reopening, the user chose closure-reason/current-evidence rules and added: **“keep it simple here.”** Distinguish HTTP removal from explicit expiry only as far as needed to revalidate safely. A rediscovered link alone cannot reopen a job. Use existing persistence structures; avoid generalizing this into an event history or elaborate transition framework.

The user also chose one reserved overdue revalidation request and continued known-detail processing after a parsing-only discovery failure. Total budgets, host cooldowns, destination checks and vacancy identity checks remain unchanged. Record partial discovery honestly.

## Next work and deferred branches

The interview has enough clarity to implement and test this bounded design; no second round is needed for routine choices such as helper placement or internal type names. Add meaningful core input/output cases and shell persistence/restart/error checks, then run the selected parser replay and bounded live verification again. Preserve the original audit and record subsequent outcomes separately.

At the time of this interview, five source additions were authorized after the corrective work: Working Nomads, WordPress Jobs, RemoteJobs.com, Dynamite Jobs and The Muse. That authorization was subsequently superseded: all Muse-related work is out of scope. Reddit remains explicitly deferred. Source-specific access problems such as Glints identity binding remain separate follow-up unless directly affected by the shared corrections.

Only planning documentation changed in this interview turn. No new source, data migration, application-code change, production-data cleanup or deployment was performed.
