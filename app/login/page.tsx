"use client";

import { Github, KeyRound } from "lucide-react";
import { Button } from "@/components/ui/button";
import { createClient } from "@/utils/supabase/client";

export default function LoginPage() {
  const supabase = createClient();

  async function signInWith(provider: "github" | "google") {
    await supabase.auth.signInWithOAuth({
      provider,
      options: {
        redirectTo: `${process.env.NEXT_PUBLIC_APP_URL}/auth/callback`,
      },
    });
  }

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-zinc-950 p-4 font-sans text-zinc-100">
      <div className="w-full max-w-sm space-y-8 text-center">
        <div className="space-y-2">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-xl bg-indigo-500/10 text-indigo-400 ring-1 ring-inset ring-indigo-500/20">
            <KeyRound className="h-6 w-6" />
          </div>
          <h1 className="text-2xl font-bold tracking-tight text-white sm:text-3xl">
            Welcome back
          </h1>
          <p className="text-sm text-zinc-400">
            Sign in to access your secure chatrooms
          </p>
        </div>

        <div className="space-y-3">
          <Button
            variant="outline"
            className="group relative flex w-full items-center justify-center gap-2 overflow-hidden rounded-lg border-zinc-800 bg-zinc-900/50 px-4 py-5 text-sm font-medium text-zinc-200 transition-all hover:bg-zinc-800 hover:text-white"
            onClick={() => signInWith("github")}
          >
            <Github className="h-4 w-4 text-zinc-400 transition-colors group-hover:text-white" />
            Continue with GitHub
          </Button>
        </div>

        <p className="px-8 text-center text-xs text-zinc-500">
          By clicking continue, you agree to our{" "}
          <a
            href="/"
            className="underline underline-offset-4 hover:text-zinc-400"
          >
            Terms of Service
          </a>{" "}
          and{" "}
          <a
            href="/"
            className="underline underline-offset-4 hover:text-zinc-400"
          >
            Privacy Policy
          </a>
          .
        </p>
      </div>
    </div>
  );
}
