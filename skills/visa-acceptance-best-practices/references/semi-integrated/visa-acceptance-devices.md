# Visa Acceptance Devices — PAX Semi-Integrated Solution

This guide drives the CyberSource PAX Semi-Integrated solution setup. It is the device-integration playbook referenced from the root [`SKILL.md`](../../SKILL.md) under "Project-Specific Guides".

The Semi-Integrated solution connects a POS system (any platform — Java, Node.js, Python, .NET, Go) to a PAX terminal over the network using WebSocket (local) or HTTPS (cloud).

The workflow and all supporting resources (activities, troubleshooting) are bundled in this directory alongside this file.

> **Important — this guide is designed to run from a consumer project.**
> All integration work happens in the project directory from which the skill is
> invoked. The skill's own files are read-only references.

---

## Step 1 — Establish the project root

Your **working directory for all implementation work** is the project — the
directory from which this skill was invoked:

```bash
PROJECT_ROOT=$(pwd)
```

---

## Step 2 — Load and execute the workflow

Read the full contents of [`workflow.md`](workflow.md) (the file alongside this guide),
then execute every step it defines.

### Path resolution

All paths in the workflow are relative to this `semi-integrated/` directory unless
explicitly stated otherwise. Project artefacts are relative to `PROJECT_ROOT`.

| Path in workflow | Resolves to |
|----------------------|-------------|
| `activities/act_SI_*.md` | Skill directory (`semi-integrated/activities/`) |
| `troubleshooting.md` | Skill directory (`semi-integrated/`) |
| `project-plan.md` | `$PROJECT_ROOT/project-plan.md` |

---

## Acceptance criteria

This guide is complete when the workflow's Step 2 Summary is printed and the project
compiles successfully with the new dependencies.
