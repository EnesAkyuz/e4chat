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
    <div className="flex min-h-screen flex-col items-center justify-center bg-background p-4 font-sans text-foreground">
      <div className="w-full max-w-sm space-y-8 text-center">
        <div className="space-y-2">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-xl bg-primary/10 text-primary ring-1 ring-inset ring-primary/20">
            <KeyRound className="h-6 w-6" />
          </div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground sm:text-3xl">
            Welcome back
          </h1>
          <p className="text-sm text-muted-foreground">
            Sign in to access your secure chatrooms
          </p>
        </div>

        <div className="space-y-3">
          <Button
            variant="outline"
            className="group relative flex w-full items-center justify-center gap-2 overflow-hidden rounded-lg border-border bg-secondary/50 px-4 py-5 text-sm font-medium text-secondary-foreground transition-all hover:bg-secondary hover:text-foreground"
            onClick={() => signInWith("github")}
          >
            <Github className="h-4 w-4 text-muted-foreground transition-colors group-hover:text-foreground" />
            Continue with GitHub
          </Button>

          <Button
            variant="outline"
            className="group relative flex w-full items-center justify-center gap-2 overflow-hidden rounded-lg border-border bg-secondary/50 px-4 py-5 text-sm font-medium text-secondary-foreground transition-all hover:bg-secondary hover:text-foreground"
            onClick={() => signInWith("google")}
          >
            <svg className="h-4 w-4" viewBox="0 0 24 24">
              <title>Google Logo</title>
              <path
                d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                fill="#4285F4"
              />
              <path
                d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                fill="#34A853"
              />
              <path
                d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z"
                fill="#FBBC05"
              />
              <path
                d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
                fill="#EA4335"
              />
            </svg>
            Continue with Google
          </Button>
        </div>

        <p className="px-8 text-center text-xs text-muted-foreground">
          By clicking continue, you agree to our{" "}
          <a
            href="/"
            className="underline underline-offset-4 hover:text-foreground"
          >
            Terms of Service
          </a>{" "}
          and{" "}
          <a
            href="/"
            className="underline underline-offset-4 hover:text-foreground"
          >
            Privacy Policy
          </a>
          .
        </p>
      </div>
    </div>
  );
}
