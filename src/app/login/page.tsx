import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import { Suspense } from "react";
import { Logo } from "@/components/Logo";
import { AuthForm } from "./AuthForm";

export default function LoginPage() {
  return (
    <div className="relative grid min-h-screen place-items-center px-5">
      <div className="glow pointer-events-none absolute inset-x-0 top-0 h-[500px]" />
      <Link
        href="/"
        className="absolute left-4 top-4 flex items-center gap-1 rounded-lg px-2 py-1.5 text-sm text-muted transition hover:bg-white/5 hover:text-fg sm:left-6 sm:top-6"
      >
        <ArrowLeft className="h-4 w-4" /> 返回首页
      </Link>
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
