import { Suspense } from "react";
import { OpsSidebar } from "@/components/portal-nav";
import { UserMenu } from "@/components/user-menu";

export default function OpsLayout({ children }: LayoutProps<"/ops">) {
  return (
    <div className="flex min-h-screen flex-col md:flex-row">
      <OpsSidebar />
      <main className="flex min-w-0 flex-1 flex-col gap-5 px-4 py-6 md:px-8">
        <div className="flex justify-end">
          <Suspense fallback={<div className="h-[34px]" />}>
            <UserMenu />
          </Suspense>
        </div>
        {children}
      </main>
    </div>
  );
}
