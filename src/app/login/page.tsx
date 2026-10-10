import { Suspense } from "react";
import { Logo } from "@/components/Logo";
import { AuthForm } from "./AuthForm";

export default function LoginPage() {
  return (
    <div className="relative grid min-h-screen place-items-center px-5">
      <div className="glow pointer-events-none absolute inset-x-0 top-0 h-[500px]" />
      <div className="relative w-full max-w-sm">
        <div className="mb-8 flex justify-center">
          <Logo />
        </div>
        <Suspense>
          <AuthForm />
        </Suspense>
      </div>
    </div>
  );
}
