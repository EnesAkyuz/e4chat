# e4chat

A modern chat application built with Next.js 16, Supabase, and AI SDK, centered around the **"Robot in the Room"** paradigm.

## The Concept

e4chat is designed for those who are tired of switching between different AI windows, chats, or models. Instead of separate silos, e4chat brings multiple AI models and multiple humans into the **same room** at the same time.

### Why e4chat?

- **No Switching**: Stop jumping between GPT-4, Gemini, and your team chat. Have them all in one place.
- **Dynamic Interaction**: Invite models to a room, kick them out, or @mention them for specific answers.
- **Robot in the Room**: AI isn't just a separate tab; it's a participant that can jump in, debate with other models, and assist humans in real-time.

## Core Features

- **Multi-Model Support**: Invite multiple AI models (GPT-4o, GPT-4o Mini, Gemini, etc.) to the same chat room.
- **Multi-User Real-time Chat**: Bring people into the room with live indicators for typing, online status, and active participation.
- **Dynamic Room Management**: Owners can dynamically add or remove models and human participants while the chat is running.
- **@Mentions**: Direct traffic by mentioning specific models (e.g., `@GPT-4o`) for targeted responses.
- **Secure Room Sharing**: Kahoot-style invite codes, live status, and password protection for private rooms.
- **Markdown Rendering**: Full support for rich text and code snippets in chat messages.

## Advanced Mechanics

### 1. "Jumping In" (Unprompted Participation)

AI models don't just wait to be called. They can decide to speak based on the conversation flow:

- **The Trigger**: Every time a human sends a message, there is a chance an AI will jump in.
- **The Calculation**: The probability increases as the conversation "gap" grows. If humans haven't heard from an AI in a while, the chance of an AI intervening scales up to 80%.
- **Contextual Awareness**: AIs read the recent transcript to decide if they have something unique to contribute.

### 2. Traffic Control (Global Busy Lock)

To prevent AIs from talking over each other or ignoring each other's input:

- **Strict Serialization**: We implement a "Global Busy Lock". Only one participant (AI) can "grab the mic" at a time.
- **Sequential Context**: If multiple AIs are triggered, they are queued. Each subsequent AI reads what the previous ones just said before formulating its response, ensuring a coherent debate.

### 3. The Token System (The Battery)

To prevent models from yapping indefinitely or eating up your API budget:

- **Refillable Battery**: Rooms have an `ai_tokens` pool (e.g., 0/10).
- **Charging**: Every human message "charges" the battery.
- **Exhaustion**: AI responses consume tokens. If the battery is dead, the AIs stay silent until a human speaks and refills it.

### 4. Stopping & Mention Control

AIs are instructed to stop if a topic is covered and only mention other AIs if explicitly needed. If they ignore these rules, a hard rate limit (e.g., max 10 consecutive AI turns) forces them to stop.

---

## Prerequisites

- **Node.js**: v25.3.0 (Locked in `.nvmrc`)
- **Bun**: Latest version
- **Supabase CLI**: Installed via Homebrew (`brew install supabase/tap/supabase`)

## Getting Started

### 1. Repository Setup

Clone the repository and install dependencies:

```bash
bun install
```

### 2. Supabase Setup

#### Create Account and Project

1. Go to [Supabase](https://supabase.com/) and create a new project.
2. Note your **Project Ref** (Settings > General).

#### Link Project and Run Migrations

```bash
# Login to Supabase CLI
supabase login

# Link the project
supabase link --project-ref <your-project-ref>

# Push existing migrations to the remote database
# This sets up the schema, RLS policies, and triggers
supabase db push
```

#### Authentication Configuration

This app uses **GitHub** and **Google** OAuth. Email auth is disabled.

**In the Supabase Dashboard:**

1. **GitHub**: Enable in Authentication > Providers, add your Client ID/Secret.
2. **Google**: Enable in Authentication > Providers, add your Client ID/Secret.
3. **URL Configuration**: Set Site URL to `http://localhost:3000` and add production URLs to Redirect URLs.

### 3. Environment Variables

Copy `.example.env` to `.env.local` and fill in the values:

```bash
cp .example.env .env.local
```

### 4. Local Development

```bash
# Ensure you are on Node v25.3.0
nvm use
bun dev
```

---

### 5. Should Look Something Like This

All the names and identifiable information has been blocked by black bars
<img width="1390" height="754" alt="Screenshot 2026-01-27 at 11 45 47 PM" src="https://github.com/user-attachments/assets/25aa22d9-35ac-4be1-8560-90a3fc2876ba" />
<img width="1389" height="752" alt="Screenshot 2026-01-27 at 11 46 17 PM" src="https://github.com/user-attachments/assets/8c72314e-59a5-4c53-a6f4-2a7079d97b90" />



## Customization

### Adding Your Own AI Models

To add or modify AI models:

1. Open `lib/models.ts`.
2. Add a new entry to the `AVAILABLE_MODELS` array.
3. Supported providers are `openai` and `google`. You can create your own provider by implementing the `AIProvider` interface.
   _(Note: I am a student and Anthropic's API is too expensive for me! :))_

## Deployment

### Deploying to Vercel

1. Push your code to GitHub and import to Vercel.
2. Add all environment variables from `.env.local` to Vercel Settings.
3. Update `NEXT_PUBLIC_APP_URL` to your deployment URL.
4. Add the Vercel URL to Supabase's **Redirect URLs**.

## Quality Control

```bash
# Fix linting issues
bun lint:fix

# Format code
bun format
```


