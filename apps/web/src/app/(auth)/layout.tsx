import Link from "next/link";
import { TenfoLogo } from "@/components/brand/logo";

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen flex flex-col justify-center items-center p-4 sm:p-6 bg-gradient-to-br from-background via-muted/30 to-background">
      <div className="w-full max-w-md flex flex-col items-center mb-6">
        <Link href="/" className="flex items-center gap-2.5 font-semibold group mb-2">
          <TenfoLogo
            size={34}
            markClassName="shadow-sm"
            wordmarkClassName="text-2xl text-foreground"
          />
        </Link>
      </div>

      <div className="w-full max-w-md">{children}</div>
    </div>
  );
}
