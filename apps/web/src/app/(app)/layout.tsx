import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import { Menu, Bell } from "lucide-react";

const navItems = [
  { href: "/tasks", label: "My Tasks" },
  { href: "/payments", label: "Payments" },
  { href: "/activity", label: "Activity" },
  { href: "/settings", label: "Settings" },
];

function SidebarNav() {
  return (
    <nav className="grid gap-2 text-sm font-medium">
      {navItems.map((item) => (
        <Link
          key={item.href}
          href={item.href}
          className="flex items-center gap-3 rounded-lg px-3 py-2 text-muted-foreground transition-all hover:text-primary"
        >
          {item.label}
        </Link>
      ))}
    </nav>
  );
}

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="grid min-h-screen w-full md:grid-cols-[220px_1fr] lg:grid-cols-[280px_1fr]">
      <div className="hidden border-r bg-muted/40 md:block">
        <div className="flex h-full max-h-screen flex-col gap-2">
          <div className="flex h-14 items-center border-b px-4 lg:h-[60px] lg:px-6">
            <Link href="/" className="flex items-center gap-2 font-semibold">
              <span>WorkPay</span>
            </Link>
            <Button variant="outline" size="icon" className="ml-auto h-8 w-8">
              <Bell className="h-4 w-4" />
              <span className="sr-only">Notifications</span>
            </Button>
          </div>
          <div className="flex-1">
            <div className="px-3 py-2 lg:px-4">
              <SidebarNav />
            </div>
          </div>
        </div>
      </div>
      <div className="flex flex-col">
        <header className="flex h-14 items-center gap-4 border-b bg-muted/40 px-4 lg:h-[60px] lg:px-6">
          <Sheet>
            <SheetTrigger asChild>
              <Button variant="outline" size="icon" className="shrink-0 md:hidden">
                <Menu className="h-5 w-5" />
                <span className="sr-only">Toggle navigation menu</span>
              </Button>
            </SheetTrigger>
            <SheetContent side="left" className="flex flex-col">
              <SidebarNav />
            </SheetContent>
          </Sheet>
          <div className="w-full flex-1" />
          <Button variant="outline" size="icon" className="h-8 w-8 md:hidden">
            <Bell className="h-4 w-4" />
            <span className="sr-only">Notifications</span>
          </Button>
        </header>
        <main className="flex flex-1 flex-col gap-4 p-4 lg:gap-6 lg:p-6">{children}</main>
      </div>
    </div>
  );
}
