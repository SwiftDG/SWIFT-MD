# Swift

Swift is a study platform built for University of Lagos engineering students. It brings course materials, practice questions and academic tools into one place instead of leaving students to search through scattered class drives and chats.

## Live site

[swift-md.vercel.app](https://swift-md.vercel.app/)

## What students can do

- Browse materials by level and course
- Open supported study documents
- Practise multiple-choice and fill-in-the-blank questions
- Work through theory-style study checks
- Calculate CGPA
- Sign in and manage their learning flow

The available subjects and question banks depend on the material currently added to the platform. AI-generated study support can be wrong, so important answers should be checked against the original course material.

## Repository structure

- `frontend/`: React and Vite interface
- `backend/`: FastAPI services for document processing and study-question workflows
- `scripts/`: development and content-generation utilities

## Frontend setup

```bash
cd frontend
npm install
npm run dev
```

Create a production build with:

```bash
npm run build
```

## Backend setup

```bash
cd backend
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
uvicorn main:app --reload
```

On Windows, activate the environment with `.venv\Scripts\activate`.

## Configuration

The application uses Supabase and optional AI providers. Copy the relevant example environment files where available and configure your own credentials. Never commit provider keys or service-role secrets.

## Stack

React, Vite, Tailwind CSS, Supabase, FastAPI and Python.

## Scope

Swift is an academic support tool. It does not replace lecturers, official course outlines or verified university records.
