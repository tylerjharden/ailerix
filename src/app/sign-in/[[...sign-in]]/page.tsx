import { SignIn } from "@clerk/nextjs";
import { redirect } from "next/navigation";
import { authEnabled } from "@/lib/auth-config";
import { Card, CardContent } from "@/components/ui/card";

const clerkAppearance = {
  variables: {
    colorPrimary: "hsl(var(--primary))",
    colorBackground: "hsl(var(--background))",
    colorInputBackground: "hsl(var(--background))",
    colorInputText: "hsl(var(--foreground))",
    colorText: "hsl(var(--foreground))",
    colorTextSecondary: "hsl(var(--muted-foreground))",
    borderRadius: "var(--radius)",
  },
  elements: {
    card: "shadow-none border-0 bg-transparent",
    headerTitle: "text-foreground",
    headerSubtitle: "text-muted-foreground",
    formButtonPrimary:
      "bg-primary text-primary-foreground hover:bg-primary/90",
    footerActionLink: "text-primary hover:text-primary/90",
  },
};

export default function SignInPage() {
  if (!authEnabled()) {
    redirect("/");
  }

  return (
    <div className="flex flex-1 items-center justify-center px-4 py-16">
      <Card className="w-full max-w-md border-border shadow-sm">
        <CardContent className="flex justify-center pt-6">
          <SignIn appearance={clerkAppearance} />
        </CardContent>
      </Card>
    </div>
  );
}
