# CentaurOS

CentaurOS is a "Democratic Workflow Engine" designed for **Fractional Foundries**. It treats AI Agents as first-class citizens alongside human experts, enabling a hybrid workforce.

## Features
- **Task Engine**: Real-time task tracking with "Democratic" state machine (Accept/Reject/Forward/Amend).
- **AI Integration**:
    - **Voice-to-Task**: Speak to create tasks using OpenAI Whisper.
    - **Ghost Agents**: Autonomous AI workers (Edge Functions) that execute tasks and submit work for approval.
- **Marketplace**: Connect with external Service Providers and verified Manufacturing partners.
- **Gantt Timeline**: Interactive project timeline with optimizations for large datasets.

## Tech Stack
- **Frontend**: Next.js 15 (App Router), Tailwind CSS, Shadcn UI, Framer Motion.
- **Backend**: Supabase (Postgres, Auth, Realtime, Edge Functions).
- **AI**: OpenAI GPT-4o, Whisper.
- **Testing**: Jest, React Testing Library.

## Setup

1. **Clone & Install**
   ```bash
   git clone <repo>
   npm install --legacy-peer-deps
   ```

2. **Environment Variables**
   Create `.env.local`:
   ```env
   NEXT_PUBLIC_SUPABASE_URL=your_project_url
   NEXT_PUBLIC_SUPABASE_ANON_KEY=your_anon_key
   SUPABASE_SERVICE_ROLE_KEY=your_service_key
   OPENAI_API_KEY=your_openai_key
   ```

3. **Database**
   - Run migrations via Supabase Dashboard or CLI.
   - Seed initial data:
     ```bash
     npx ts-node scripts/seed-large-dataset.ts
     ```

4. **Run Development Server**
   ```bash
   npm run dev
   ```

## Docker
Run the full stack (if using local database):
```bash
docker-compose up -d --build
```

## Testing
Run the automated test suite:
```bash
npm test
```
