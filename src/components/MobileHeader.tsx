"use client";

import { useSession } from "next-auth/react";
import { User } from "lucide-react";

interface MobileHeaderProps {
  onMenuToggle: () => void;
}

export function MobileHeader({ onMenuToggle }: MobileHeaderProps) {
  const { data: session } = useSession();

  return (
    <header className="flex h-14 items-center justify-between border-b bg-white px-4 md:hidden">
      {/* Hamburger menu button */}
      <button
        onClick={onMenuToggle}
        className="flex h-10 w-10 flex-col items-center justify-center gap-1.5 rounded-lg hover:bg-gray-100"
        aria-label="Abrir menu"
      >
        <div className="h-0.5 w-5 bg-gray-600" />
        <div className="h-0.5 w-5 bg-gray-600" />
        <div className="h-0.5 w-5 bg-gray-600" />
      </button>

      {/* App name */}
      <h1 className="text-lg font-bold text-gray-900">MyPocket</h1>

      {/* User avatar */}
      <div className="flex h-8 w-8 items-center justify-center rounded-full bg-emerald-100">
        {session?.user?.image ? (
          <img
            src={session.user.image}
            alt={session.user.name || ""}
            className="h-8 w-8 rounded-full"
          />
        ) : (
          <User className="h-4 w-4 text-emerald-600" />
        )}
      </div>
    </header>
  );
}
