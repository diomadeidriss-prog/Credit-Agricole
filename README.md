# Souverain Hub — app bancaire fullstack (projet de démonstration)

**Stack** : Node.js · Express · SQLite (better-sqlite3) · JWT · bcrypt · Tailwind (front mobile-first)

## Lancer
```bash
npm install
npm start          # http://localhost:3000
```
Compte démo : `demo@souverain.dev` / `demo1234`
Variables : `JWT_SECRET` (obligatoire en prod), `PORT`, `DB_FILE`.

## Ce que le projet démontre
- Authentification JWT + hash bcrypt + limitation des tentatives de login
- API REST : `/api/auth/login`, `/me`, `/accounts`, `/transactions?q=&account=`, `/beneficiaries`, `/transfers`, `/messages`
- Virements **atomiques** (transaction SQL : débit + crédit + écritures, ou rien), montants en centimes
- Requêtes préparées (anti-injection SQL), échappement HTML côté client (anti-XSS), validation IBAN/montants
- Recherche et filtrage serveur, messagerie conseiller

## Pistes d'évolution
Tests (Vitest/Supertest), TypeScript, migration PostgreSQL, Docker, CI GitHub Actions, refresh tokens, 2FA.

> Application fictive : aucune donnée ni marque réelle.
