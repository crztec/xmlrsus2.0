"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

export default function RootDashboardPage() {
  const router = useRouter();

  useEffect(() => {
    router.replace("/dashboard");
  }, [router]);

  return (
    <div className="flex min-h-[400px] items-center justify-center">
      <div className="h-8 w-8 animate-spin rounded-full border-2 border-gax-blue border-t-transparent"></div>
    </div>
  );
}
