# Project Brief

## Product definition

WorkOS is an AI-operated personal executive office for one owner.

The owner speaks naturally and supplies fragments of the real world: thoughts, requests, meeting material, documents, questions, commitments, and corrections. A chief assistant understands the intent, recovers the relevant context, delegates specialist work when useful, and manages schedule, projects, knowledge, decisions, and follow-up through an application-owned operational ledger.

This is not a task manager with an optional chat panel. AI is the operating intelligence of the product. When supported AI is unavailable, intelligent work stops or waits; the application preserves state and reports the interruption honestly.

## Background

The legacy WorkOS vault contains more than tasks. It joins projects, meetings, decisions, technical and operational knowledge, personal thinking, dates, relationships, and agent procedures. Its useful insight was that the owner should be able to provide raw context while an AI operator performs the classification, connection, maintenance, and follow-up.

The first version of this repository retained only Capture, Today, task completion, deferral, and optional read-only AI chat. That implementation proved useful infrastructure—private remote access, durable CLI jobs, SQLite, streaming, and browser verification—but narrowed the product until it no longer represented the intended professional-assistant relationship.

The refoundation restores the original center: the system exists to understand and operate the owner's work, not merely display a small checklist.

## Problem

The owner's work arrives through many channels and has several coupled dimensions:

- calendar events and time commitments;
- projects, outcomes, actions, dependencies, risks, and stakeholders;
- meetings, messages, files, and other evidence;
- decisions and the reasoning behind them;
- reusable technical and operational knowledge;
- personal preferences, priorities, and corrections.

Ordinary tools split these dimensions across task lists, calendars, folders, chat histories, and the owner's memory. The owner then pays the cost of categorizing inputs, restoring context, deciding where information belongs, and checking whether follow-up happened.

WorkOS should absorb that coordination cost.

## Human and assistant relationship

### Owner

The owner provides purpose, values, boundaries, raw evidence, corrections, and final authority for consequential actions. The owner should not have to maintain internal schemas or route every request to a specialist.

### Chief assistant

The chief assistant is the single conversational front door. It triages incoming material, protects the owner's attention, assembles context, delegates specialist work, reconciles results, and presents one concise operational answer.

### Specialist roles

- The project manager maintains project state, plans, actions, dependencies, risks, decisions, meetings, and follow-up.
- The knowledge researcher investigates questions, retrieves internal and external sources, distinguishes evidence from inference, and builds reusable knowledge.
- Calendar, communication, or other specialists are introduced only after their distinct tools and authority boundaries are demonstrated.

Specialists share one canonical operational world. Their separation is for expertise, context, and permissions—not separate copies of the owner's data.

## Core operating loop

```text
Capture or request
      ↓
Chief assistant interprets intent and retrieves context
      ↓
Specialists investigate, plan, or propose
      ↓
Application validates authority and domain invariants
      ↓
Commit, receipt, and inspectable result
      ↓
Follow-up, correction, and learned preference
```

## Primary user outcomes

From any personal device, the owner can:

1. provide an unstructured request or source without choosing its storage destination;
2. ask what deserves attention and receive an evidence-based answer;
3. ask about a project and recover its outcome, current state, decisions, risks, and next moves;
4. provide meeting material and have decisions, knowledge, and follow-up routed correctly;
5. research a question and retain a source-backed reusable result;
6. request bounded operational changes in natural language;
7. inspect what changed, why it changed, which evidence was used, and how to undo it;
8. receive proactive reminders or reviews when a commitment, risk, or dependency needs attention.

## Product principles

### AI is the operator; the application is the trusted substrate

AI interprets language, retrieves context, exercises judgment, and coordinates roles. Deterministic application code owns authorization, validation, transactionality, scheduling, idempotency, indexing, and recovery.

### Conversation is not the database

Conversation directs work and explains results. Durable facts belong in the operational ledger, original material belongs in evidence, and reusable conclusions belong in source-backed knowledge.

### One world, multiple views

Projects, Schedule, Knowledge, Inbox, Review, and chat are views over one shared state. Reports and agent responses do not create parallel commitments.

### Evidence before confidence

Material facts, decisions, actions, and knowledge should point back to their sources. Imported or retrieved content remains untrusted and may contain prompt injection.

### Bounded initiative

The assistant should notice and propose work proactively. It may perform clearly requested low-risk operations without duplicate approval. Destructive, external, bulk, or policy-changing actions require a separate visible approval.

### Provider independence

Product state and role definitions do not depend on one model provider, provider thread, or hidden memory format. The first supported runtimes remain official subscription-authenticated Codex and Grok CLIs.

### Recovery over offline substitution

The product does not promise useful assistant operation without AI. It does promise that outages, restarts, and failed jobs do not corrupt evidence or canonical state and that data remains exportable.

## Success signals

- The owner can issue most ordinary requests without naming a tool, schema, file, or specialist.
- Answers about projects and commitments cite current operational state and relevant evidence.
- Meeting and source ingestion produce no duplicate commitments.
- Important open loops have an owner, state, and next review condition.
- The owner can distinguish fact, inference, proposal, and committed change.
- Every committed agent mutation has a receipt and bounded undo path.
- Corrections change future behavior without rewriting source evidence.
- The system becomes more useful as its shared operational history grows without requiring growing manual maintenance.

## Explicit non-goals

- a generic consumer chatbot;
- a standalone task-list replacement;
- a clone of Obsidian, Notion, or a file manager;
- a general-purpose multi-agent framework;
- autonomous access to the owner's whole computer;
- separate systems of record per agent;
- unrestricted self-modifying agents or an automatic skill marketplace;
- public SaaS or multi-user tenancy;
- direct model APIs or API-key-based inference;
- a big-bang rewrite or unreviewed migration of the legacy WorkOS vault.
