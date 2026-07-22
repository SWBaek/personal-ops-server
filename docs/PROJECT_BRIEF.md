# Project Brief

## Background

The owner originally chose a synced personal knowledge vault mainly because the same information could be viewed from a home computer, phone, and tablet. Over time, the legacy vault accumulated project schemas, dashboards, reviews, generated morning briefings, duplicated task surfaces, and agent skills that required maintenance.

The problem was not lack of data. The problem was that operating the system became another job:

- too many projects were marked active at once;
- a large backlog of open project actions competed for attention;
- planned dates were sparse and often overdue;
- generated briefings created parallel checklists and approval queues;
- canonical skills and runtime skill mirrors drifted apart;
- the human was asked to manage metadata, focus, reviews, and the system itself.

The desired direction is not a better PKM specification. It is a smaller personal service that hides storage mechanics and lets the owner interact through a few natural operations.

## Product outcome

From any personal device, the owner can:

1. capture a thought in seconds;
2. see no more than one to three current actions;
3. complete or defer an action without knowing storage syntax;
4. search project and reference context;
5. ask Codex or Grok for assistance through installed CLIs;
6. review and approve meaningful changes;
7. recover or export all data without the application.

## Human contract

The interface should support phrases such as:

- "잡아둬"
- "오늘 뭐 해야 해?"
- "이거 완료"
- "금요일에 다시 보여줘"
- "이 프로젝트 상태를 설명해줘"

The service translates those intentions into deterministic domain operations. The owner should not need to maintain frontmatter, folders, tags, dashboards, or agent skills.

## Hard constraints

- API usage is absolutely prohibited. Do not add OpenAI API, xAI API, or any other model API integration.
- AI is available only through official subscription-authenticated CLIs installed on the home computer.
- The first supported providers are Codex CLI and Grok Build CLI.
- The server and primary data live on the home computer.
- Remote access is private and authenticated; public port forwarding is out of scope.
- Core workflows remain available when AI usage limits, authentication, or providers fail.
- Any existing legacy vault remains an independent read-only archive until a later, explicitly approved migration.

## Product principles

### AI is an interpreter, not the database owner

For mutations, AI returns a structured proposal such as:

```json
{
  "operation": "reschedule_task",
  "taskId": "task_123",
  "scheduledOn": "2026-07-24"
}
```

The service validates and applies the operation. The model must not receive unrestricted database or shell access.

### One source, few views

There is one canonical Task store. Today is a filtered view, not a copied list. Reports and AI responses never create parallel executable checkboxes.

### Progressive capability

Start with Capture, Today, complete, defer, and search. Add AI, remote access, automation, and migration only after the previous layer is reliable.

### Replaceable providers

Codex and Grok integrations are adapters. Product data and workflows must not depend on one provider's session or proprietary memory.

## Explicit non-goals for the MVP

- reproducing a general-purpose knowledge-management vault;
- building a general PKM engine;
- autonomous multi-agent orchestration;
- public SaaS or multi-user tenancy;
- arbitrary plugin or skill marketplaces;
- general browser-accessible terminal control;
- full historical vault migration;
- offline multi-master synchronization.
