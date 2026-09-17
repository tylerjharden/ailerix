export function authEnabled(): boolean {
  return Boolean(
    process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY ||
      process.env.CLERK_SECRET_KEY ||
      process.env.NODE_ENV === "development", // Clerk Keyless works in dev
  );
}
