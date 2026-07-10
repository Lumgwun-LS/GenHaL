import { useState } from "react";
import { useUser, useClerk } from "@clerk/react";
import { useLocation } from "wouter";
import { useOnboardVendor } from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { CountrySelect } from "@/components/country-select";
import { findCountryByName } from "@/lib/countries";
import { Loader2, Store } from "lucide-react";
import { toast } from "sonner";

type FormState = {
  name: string;
  country: string;
  phoneLocal: string;
};

type FieldErrors = Partial<Record<keyof FormState, string>>;

function validate(form: FormState): FieldErrors {
  const errors: FieldErrors = {};

  if (!form.name.trim()) {
    errors.name = "Enter your full name.";
  } else if (form.name.trim().length < 2) {
    errors.name = "Name must be at least 2 characters.";
  }

  if (!form.country) {
    errors.country = "Select your country.";
  }

  const digits = form.phoneLocal.replace(/\D/g, "");
  if (!digits) {
    errors.phoneLocal = "Enter your phone number.";
  } else if (digits.length < 4 || digits.length > 14) {
    errors.phoneLocal = "Enter a valid phone number.";
  }

  return errors;
}

export default function Onboarding() {
  const { user } = useUser();
  const { signOut } = useClerk();
  const [, setLocation] = useLocation();
  const onboardVendor = useOnboardVendor();

  const [form, setForm] = useState<FormState>({
    name: user?.fullName?.trim() || "",
    country: "",
    phoneLocal: "",
  });
  const [errors, setErrors] = useState<FieldErrors>({});

  const selectedCountry = findCountryByName(form.country);
  const email = user?.primaryEmailAddress?.emailAddress ?? "";

  function updateField<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((f) => ({ ...f, [key]: value }));
    setErrors((e) => ({ ...e, [key]: undefined }));
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const fieldErrors = validate(form);
    setErrors(fieldErrors);
    if (Object.keys(fieldErrors).length > 0) return;

    const phone = `${selectedCountry!.dialCode}${form.phoneLocal.replace(/\D/g, "")}`;

    onboardVendor.mutate(
      { data: { name: form.name.trim(), country: form.country, phone } },
      {
        onSuccess: () => {
          toast.success("Welcome to VendorHub!");
          setLocation("/dashboard");
        },
        onError: (err: any) => toast.error(err?.message ?? "Could not complete signup. Please try again."),
      },
    );
  }

  return (
    <div className="flex min-h-[100dvh] items-center justify-center bg-background px-4 py-10 relative overflow-hidden">
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,_var(--tw-gradient-stops))] from-primary/10 via-background to-background -z-10" />
      <Card className="w-full max-w-md">
        <CardHeader className="space-y-2 text-center">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-xl bg-primary/10 text-primary">
            <Store className="h-6 w-6" />
          </div>
          <CardTitle className="text-2xl">Welcome to VendorHub</CardTitle>
          <CardDescription>Just a few details to finish setting up your vendor account.</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4" noValidate>
            <div className="space-y-1.5">
              <Label htmlFor="onboarding-name">Full name</Label>
              <Input
                id="onboarding-name"
                value={form.name}
                onChange={(e) => updateField("name", e.target.value)}
                placeholder="Jane Doe"
                aria-invalid={Boolean(errors.name)}
                className={errors.name ? "border-destructive" : undefined}
              />
              {errors.name && <p className="text-xs text-destructive">{errors.name}</p>}
            </div>

            <div className="space-y-1.5">
              <Label>Email</Label>
              <Input value={email} disabled readOnly />
              <p className="text-xs text-muted-foreground">From your VendorHub account — can't be changed here.</p>
            </div>

            <div className="space-y-1.5">
              <Label>Country</Label>
              <CountrySelect value={form.country} onChange={(v) => updateField("country", v)} invalid={Boolean(errors.country)} />
              {errors.country && <p className="text-xs text-destructive">{errors.country}</p>}
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="onboarding-phone">Phone number</Label>
              <div className="flex gap-2">
                <div className="flex w-20 shrink-0 items-center justify-center rounded-md border bg-muted text-sm text-muted-foreground">
                  {selectedCountry ? selectedCountry.dialCode : "+--"}
                </div>
                <Input
                  id="onboarding-phone"
                  value={form.phoneLocal}
                  onChange={(e) => updateField("phoneLocal", e.target.value)}
                  placeholder={selectedCountry ? "801 234 5678" : "Select a country first"}
                  inputMode="tel"
                  aria-invalid={Boolean(errors.phoneLocal)}
                  className={errors.phoneLocal ? "border-destructive" : undefined}
                />
              </div>
              {errors.phoneLocal && <p className="text-xs text-destructive">{errors.phoneLocal}</p>}
              <p className="text-xs text-muted-foreground">The country code is added automatically based on your selection.</p>
            </div>

            <Button type="submit" className="w-full" disabled={onboardVendor.isPending}>
              {onboardVendor.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Complete signup
            </Button>

            <button
              type="button"
              onClick={() => signOut({ redirectUrl: "/" })}
              className="w-full text-center text-xs text-muted-foreground hover:text-foreground"
            >
              Sign out and use a different account
            </button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
