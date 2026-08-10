import { SignUp } from "@clerk/react";

export default function SignUpPage() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <div className="w-full max-w-md space-y-6">
        {/* Branding */}
        <div className="text-center space-y-2">
          <img
            src="/genhal/genhal-logo.png"
            alt="GenHaL"
            className="h-20 w-auto mx-auto object-contain drop-shadow-md"
          />
          <p className="text-sm text-muted-foreground">
            Create one account — use it across <strong>GenHaL</strong>,{" "}
            <strong>Awa Biz Suite</strong>, and the <strong>Awajimaa App Store</strong>.
          </p>
        </div>

        <SignUp
          routing="path"
          path="/sign-up"
          signInUrl="/sign-in"
          forceRedirectUrl="/"
          appearance={{
            variables: {
              colorPrimary: "hsl(var(--primary))",
              colorBackground: "hsl(var(--card))",
              borderRadius: "0.75rem",
            },
          }}
        />
      </div>
    </div>
  );
}
