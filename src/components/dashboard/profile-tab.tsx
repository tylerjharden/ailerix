"use client";

import Link from "next/link";
import { LogOut } from "lucide-react";
import { Show, useClerk, useUser } from "@clerk/nextjs";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { authEnabled } from "@/lib/auth-config";

function initialsFrom(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0][0]}${parts[1][0]}`.toUpperCase();
}

function SignInPromptCard({ reason }: { reason: string }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Profile</CardTitle>
        <CardDescription>{reason}</CardDescription>
      </CardHeader>
      <CardContent>
        <Button asChild>
          <Link href="/sign-in">Go to sign in</Link>
        </Button>
      </CardContent>
    </Card>
  );
}

function SignedInProfile() {
  const { user, isLoaded } = useUser();
  const { signOut } = useClerk();

  if (!isLoaded) {
    return (
      <Card>
        <CardContent className="py-12 text-center text-sm text-muted-foreground">
          Loading profile…
        </CardContent>
      </Card>
    );
  }

  const displayName =
    user?.fullName ||
    user?.username ||
    user?.primaryEmailAddress?.emailAddress ||
    "Account";
  const email =
    user?.primaryEmailAddress?.emailAddress ??
    user?.emailAddresses[0]?.emailAddress ??
    "";
  const userId = user?.id ?? "";

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Profile</CardTitle>
        <CardDescription>Your signed-in Clerk identity on this deployment.</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-6 sm:flex-row sm:items-start">
        <Avatar className="size-20 shrink-0">
          {user?.imageUrl ? (
            <AvatarImage src={user.imageUrl} alt={displayName} />
          ) : null}
          <AvatarFallback className="bg-primary/10 text-lg text-primary">
            {initialsFrom(displayName)}
          </AvatarFallback>
        </Avatar>
        <div className="min-w-0 flex-1 space-y-3">
          <div>
            <p className="truncate text-lg font-medium">{displayName}</p>
            {email ? (
              <p className="truncate text-sm text-muted-foreground">{email}</p>
            ) : null}
          </div>
          {userId ? (
            <div className="rounded-md border border-border bg-muted/30 px-3 py-2">
              <p className="text-xs font-medium text-muted-foreground">User ID</p>
              <p className="break-all font-mono text-xs">{userId}</p>
            </div>
          ) : null}
          <Button
            variant="outline"
            className="w-fit text-destructive hover:text-destructive"
            onClick={() => signOut({ redirectUrl: "/" })}
          >
            <LogOut className="size-4" />
            Sign out
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

export function ProfileTab() {
  if (!authEnabled()) {
    return (
      <SignInPromptCard
        reason="Authentication is not configured on this deployment. Sign-in is unavailable until Clerk keys are set."
      />
    );
  }

  return (
    <>
      <Show when="signed-in">
        <SignedInProfile />
      </Show>
      <Show when="signed-out">
        <SignInPromptCard reason="Sign in to view your profile, credits, and API keys." />
      </Show>
    </>
  );
}
