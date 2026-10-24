import Link from "next/link";
import { WorkPayLogoMark } from "@/components/brand/logo";

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen flex flex-col justify-center items-center p-4 sm:p-6 bg-gradient-to-br from-background via-muted/30 to-background">
      <div className="w-full max-w-md flex flex-col items-center mb-6">
        <Link href="/" className="flex items-center gap-3 font-semibold group mb-2">
          <WorkPayLogoMark size={40} className="shadow-md transition-transform group-hover:scale-105" />
          <div className="flex flex-col">
            <div className="flex items-center gap-1.5">
              <span className="text-xl font-bold tracking-tight text-foreground">WorkPay</span>
              <span className="rounded bg-primary/10 px-1.5 py-0.5 text-[10px] font-bold text-primary">
                RUNTIME
              </span>
            </div>
            <span className="text-xs text-muted-foreground">Economic Execution System</span>
          </div>
        </Link>
      </div>

      <div className="w-full max-w-md">{children}</div>
    </div>
  );
}
