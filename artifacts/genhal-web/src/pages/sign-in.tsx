import { SignIn } from "@clerk/react";

// Strip trailing slash so we can safely append paths.
// e.g. "/genhal/" → "/genhal", "/" → ""
const base = import.meta.env.BASE_URL.replace(/\/$/, "");

export default function SignInPage() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <div className="w-full max-w-md space-y-6">
        {/* Branding */}
        <div className="text-center space-y-2">
          <img
            src={`${base}/genhal-logo.png`}
            alt="GenHaL"
            className="h-20 w-auto mx-auto object-contain drop-shadow-md"
          />
          <p className="text-sm text-muted-foreground">
            Sign in to access your family trees, heritage records, and language tools.
            <br />
            Your account also works on <strong>Awa Biz Suite</strong> and the <strong>App Store</strong>.
          </p>
        </div>

        <SignIn
          routing="path"
          path={`${base}/sign-in`}
          signUpUrl={`${base}/sign-up`}
          forceRedirectUrl={base || "/"}
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
