import { SignIn } from "@clerk/react";

// Strip trailing slash so we can safely append paths.
// e.g. "/genhal/" → "/genhal", "/" → ""
const base = import.meta.env.BASE_URL.replace(/\/$/, "");

export default function SignInPage() {
  return (
    <div className="grid min-h-dvh place-items-center bg-background px-4 py-10">
      <div className="w-full max-w-md space-y-6">
        {/* Branding */}
        <div className="text-center space-y-2">
          <img
            src={`${base}/genhal-logo.webp`}
            onError={(e) => { (e.target as HTMLImageElement).src = `${base}/genhal-logo.png`; }}
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
              /* Keep primary brand colour only. Do NOT set colorBackground /
               * colorText here — Clerk's internal component styles (card
               * heading, subtitle, divider, labels) use their own theming and
               * ignore those variables, so setting a dark background while
               * leaving Clerk's text dark makes the form unreadable in dark
               * mode. Auth forms stay light universally (Google, GitHub, etc.
               * do the same). */
              colorPrimary: "hsl(15 80% 41%)",
              borderRadius: "0.75rem",
            },
          }}
        />
      </div>
    </div>
  );
}
