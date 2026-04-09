import { LoginButton } from "@/components/auth/login-button";

export default function LoginPage() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-4">
      <div className="w-full max-w-sm space-y-8">
        <div className="text-center space-y-2">
          <h1 className="text-3xl font-bold tracking-tight">One Piece TCG</h1>
          <p className="text-muted-foreground">Track your card collection</p>
        </div>
        <div className="space-y-3">
          <LoginButton provider="google" />
          <LoginButton provider="apple" />
          <LoginButton provider="discord" />
        </div>
        <p className="text-center text-xs text-muted-foreground">
          Sign in to start tracking your collection
        </p>
      </div>
    </div>
  );
}
