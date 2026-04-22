"use client";

import { Button } from "@/components/ui/button";
import { auth } from "@/lib/firebase";
import { GoogleAuthProvider, signInWithPopup } from "firebase/auth";
import { useRouter } from "next/navigation";
import { useState } from "react";

type Provider = "google";

const providerConfig: Record<Provider, { label: string; icon: string }> = {
  google: { label: "Google", icon: "G" },
};

export function LoginButton({ provider }: { provider: Provider }) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const config = providerConfig[provider];

  const handleLogin = async () => {
    setLoading(true);
    try {
      await signInWithPopup(auth, new GoogleAuthProvider());
      router.push("/collection");
    } catch (error) {
      console.error("Login failed:", error);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Button
      variant="outline"
      size="lg"
      className="w-full gap-3 h-12 text-base"
      onClick={handleLogin}
      disabled={loading}
    >
      <span className="text-lg font-bold">{config.icon}</span>
      Continue with {config.label}
    </Button>
  );
}
