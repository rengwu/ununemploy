---
title: Documentation maintenance
section: Guides
updated: 2026-10-07
---
# Documentation maintenance

The project adopts the cooperating skills from the sibling `../jstack` checkout. Reusable skills remain there; project-specific Markdown, decisions, recipes and runs live here. No plugin package installation or application dependency change is required to use this checkout's skills.

## Skill selection

| Task | Skill source relative to the repository root |
| --- | --- |
| Clarify a requested design | `../jstack/skills/grill-me/SKILL.md` |
| Present an offline interview form | `../jstack/skills/grill-form/SKILL.md` |
| Discuss scope and decisions | `../jstack/skills/plan/SKILL.md` |
| Edit pages, links and reader | `../jstack/skills/wiki/SKILL.md` |
| Describe behavior and recipes | `../jstack/skills/feature-map/SKILL.md` |
| Exercise a selected change | `../jstack/skills/verify-change/SKILL.md` |
| Repair verification drift | `../jstack/skills/maintain-verification/SKILL.md` |

Read the applicable skill and `../jstack/references/stack-contract.md`. These are task-specific tools, not a mandatory sequence for every change. Existing user authorization and project boundaries continue to govern actions. No delegation, deployment, external messaging or product changes are implied by adoption.

## Edit and build

Markdown is authoritative. Keep one current feature record and link to it from decisions and guides. Historical research and old verification notes retain their dates and limits. Use relative `.md` links within the wiki; repository source paths outside the wiki are shown as code because the offline reader only embeds wiki pages. Root README, agent instructions and directory pointers remain outside as entry points; runtime skills remain at their executable paths.

```sh
node docs/wiki/_build.mjs
node docs/wiki/_build.mjs --check
```

The generated `index.html` is a snapshot. Rebuild after source or attachment changes; do not edit it directly. It opens offline and has no runtime network or package dependency. Share the reader with its `evidence/` or `attachments/` directories when linked files are needed.

## Verification records

Use a stable feature ID and a unique timestamped run ID. New reports go in `verification/runs/` with flat frontmatter and `result: Passed`, `Failed` or `Untested`. Include scope, exact revision plus dirty-tree fingerprint, environment/instance, expected and observed outcomes, evidence, and limits. Passed covers only the selected scenarios; any exercised failed expectation makes the run Failed, otherwise an incomplete selected scenario makes it Untested. Keep failures and later fixes as separate attempts.

Validate metadata with `node ../jstack/skills/verify-change/scripts/check-reports.mjs docs/wiki`. The checker establishes report format, and wiki build/check establishes structure and snapshot freshness; neither proves a product claim. Older [verification history](../verification/history.md) is retained as provenance, not fabricated into reports with missing revisions.

## Privacy and evidence

`data/candidate-profile.json`, `docs/MASTER_CV.md`, databases, generated CVs, application records, secrets and raw development logs remain local and outside this wiki. Do not copy private artifacts into a shareable reader or publish them to Slopchan. New evidence must be reviewed before copying. The original local evidence paths remain intact because they are candidate records, not public project guides.

## Reader provenance

`_build.mjs` is copied unchanged from `../jstack/skills/wiki/assets/_build.mjs` at jstack revision `4a3109a2e4fd3be9836b7a14a2bf76ce14ce567d` on 7 October 2026. Its bundled dependency licenses are preserved. Compare with the upstream asset before future upgrades and preserve any intentional local customizations. No jstack examples or project facts were copied.
