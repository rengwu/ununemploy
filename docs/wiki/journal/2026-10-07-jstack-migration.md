---
title: jstack adoption and documentation migration
section: Journal
updated: 2026-10-07
---
# jstack adoption and documentation migration

User request: “can we adopt jstack (../jstack) for this project? migrate all docs to wiki format”. Adoption applies to project documentation and verification; the application's React/Kumo/Fastify/SQLite runtime remains unchanged.

## Migration

The former README was split into [local development](../guides/local-development.md), [workflow](../guides/workflow.md), feature pages, [backups](../guides/backups.md), [verification setup](../verification/setup.md) and [limits](../reference/limitations.md). Root README now links here. Existing substantive project documents moved as follows:

| Former path | Wiki destination |
| --- | --- |
| `docs/ASSISTANT.md` | [features/assistant.md](../features/assistant.md) |
| `docs/BUILD_PLAN.md` | [reference/architecture.md](../reference/architecture.md) |
| `docs/COVERAGE_EXPANSION.md` | [reference/source-coverage.md](../reference/source-coverage.md) |
| `docs/MATCHING_AND_LISTING_QUALITY.md` | [features/matching.md](../features/matching.md) |
| `docs/JEV.md` | [features/jev.md](../features/jev.md) |
| `docs/SOURCE_EVALUATION.md` | [journal/2026-09-16-source-evaluation.md](2026-09-16-source-evaluation.md) |
| `docs/UI_DESIGN.md` | [decisions/dashboard-ui.md](../decisions/dashboard-ui.md) |
| `docs/VERIFICATION.md` | [verification/history.md](../verification/history.md) |
| `deploy/unraid/README.md` | [guides/unraid.md](../guides/unraid.md) |
| `data/geography/README.md` | [reference/geography.md](../reference/geography.md) |

The source-coverage document was split into installed coverage and [historical research](2026-09-17-coverage-research.md). Existing verification notes were preserved, including the uncommitted 3 October automatic LaTeX setup record. No historical run was promoted into a fresh pass. Original documentation snapshots are retained privately under `.local-data/wiki-migration/originals/` for migration comparison.

## Corrections and boundaries

Current guides now reflect 57 source configurations, public-board upgrades for Wellfound/Welcome to the Jungle, cover-letter generation on Save, and the local city/country lookup. The Unraid guide no longer claims fresh installations contain a candidate profile. Candidate-specific authorization assertions were replaced with general field semantics; the local canonical profile remains untouched. These changes reconcile existing code and newer project requirements, not new product decisions.

`AGENTS.md` remains the authoritative agent entry point with updated links and a jstack maintenance section. `core/profile/skills/build-user-profile/SKILL.md` remains a runtime asset. Ignored `docs/MASTER_CV.md` and `data/candidate-profile.json` remain original local evidence. The dataset and Unraid folders retain short pointers, with GeoNames attribution kept beside its data.

The pre-existing LaTeX implementation changes remain in the working tree. This migration creates no commit, deployment, source scan or inference request. Private candidate evidence and old raw verification artifacts are not embedded in the reader.

## Validation

See the [migration run](../verification/index.md). Recipes for product features were mapped from actual scripts and historical checks, not rerun merely to reorganize documentation. External references were preserved without a new web-research pass. [Open follow-up](../discussions/open-questions.md) records the remaining configuration and verification limits.
