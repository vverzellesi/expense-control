"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useSession, signOut } from "next-auth/react";
import { cn } from "@/lib/utils";
import { useScrollLock } from "@/lib/hooks";
import {
  LayoutDashboard,
  Receipt,
  Upload,
  CreditCard,
  Tags,
  BarChart3,
  Settings,
  RefreshCw,
  TrendingUp,
  Trash2,
  FileText,
  LogOut,
  User,
  X,
} from "lucide-react";

const navigation = [
  { name: "Dashboard", href: "/dashboard", icon: LayoutDashboard },
  { name: "Transações", href: "/transactions", icon: Receipt },
  { name: "Faturas", href: "/bills", icon: FileText },
  { name: "Recorrentes", href: "/recurring", icon: RefreshCw },
  { name: "Parcelas", href: "/installments", icon: CreditCard },
  { name: "Projeção", href: "/projection", icon: TrendingUp },
  { name: "Importar", href: "/import", icon: Upload },
  { name: "Categorias", href: "/categories", icon: Tags },
  { name: "Relatórios", href: "/reports", icon: BarChart3 },
  { name: "Lixeira", href: "/trash", icon: Trash2 },
];

interface SidebarProps {
  isOpen?: boolean;
  onClose?: () => void;
}

export function Sidebar({ isOpen = false, onClose }: SidebarProps) {
  const pathname = usePathname();
  const { data: session } = useSession();
  const [alertCount, setAlertCount] = useState(0);

  useEffect(() => {
    async function fetchAlerts() {
      try {
        const now = new Date();
        const res = await fetch(
          `/api/summary?month=${now.getMonth() + 1}&year=${now.getFullYear()}`
        );
        const data = await res.json();
        setAlertCount(data.budgetAlerts?.length || 0);
      } catch (error) {
        console.error("Error fetching alerts:", error);
      }
    }

    fetchAlerts();
    // Refresh every 5 minutes
    const interval = setInterval(fetchAlerts, 5 * 60 * 1000);
    return () => clearInterval(interval);
  }, []);

  // Prevent body scroll when mobile drawer is open
  useScrollLock(isOpen);

  const handleNavClick = () => {
    if (onClose) {
      onClose();
    }
  };

  const sidebarContent = (
    <div className="flex h-full w-64 flex-col border-r bg-white">
      {/* Header with close button on mobile */}
      <div className="flex h-16 items-center justify-between border-b px-6">
        <h1 className="text-xl font-bold text-gray-900">MyPocket</h1>
        {/* Close button - only visible in mobile drawer */}
        <button
          onClick={onClose}
          className="flex h-8 w-8 items-center justify-center rounded-lg hover:bg-gray-100 md:hidden"
          aria-label="Fechar menu"
        >
          <X className="h-5 w-5 text-gray-600" />
        </button>
      </div>
      <nav className="flex-1 space-y-1 overflow-y-auto px-3 py-4">
        {navigation.map((item) => {
          const isActive =
            pathname === item.href ||
            pathname.startsWith(item.href + "/");
          const showAlertBadge = item.href === "/dashboard" && alertCount > 0;

          return (
            <Link
              key={item.name}
              href={item.href}
              onClick={handleNavClick}
              className={cn(
                "flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
                isActive
                  ? "bg-emerald-50 text-emerald-700 border-l-2 border-emerald-600 -ml-[2px]"
                  : "text-gray-600 hover:bg-emerald-50/50 hover:text-gray-900"
              )}
            >
              <item.icon className="h-5 w-5" />
              <span className="flex-1">{item.name}</span>
              {showAlertBadge && (
                <span className="flex h-5 w-5 items-center justify-center rounded-full bg-orange-500 text-xs font-bold text-white">
                  {alertCount}
                </span>
              )}
            </Link>
          );
        })}
      </nav>
      <div className="border-t p-3">
        <Link
          href="/settings"
          onClick={handleNavClick}
          className="flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium text-gray-600 transition-colors hover:bg-emerald-50/50 hover:text-gray-900"
        >
          <Settings className="h-5 w-5" />
          Configurações
        </Link>
      </div>

      {/* User section */}
      {session?.user && (
        <div className="border-t p-3">
          <div className="flex items-center gap-3 px-3 py-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-full bg-emerald-100">
              {session.user.image ? (
                <img
                  src={session.user.image}
                  alt={session.user.name || ""}
                  className="h-8 w-8 rounded-full"
                />
              ) : (
                <User className="h-4 w-4 text-emerald-600" />
              )}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-gray-900 truncate">
                {session.user.name || "Usuário"}
              </p>
              <p className="text-xs text-gray-500 truncate">
                {session.user.email}
              </p>
            </div>
          </div>
          <button
            onClick={() => signOut({ callbackUrl: "/auth/login" })}
            className="mt-2 flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium text-gray-600 transition-colors hover:bg-emerald-50/50 hover:text-gray-900"
          >
            <LogOut className="h-5 w-5" />
            Sair
          </button>
        </div>
      )}
    </div>
  );

  return (
    <>
      {/* Desktop sidebar - always visible, hidden on mobile */}
      <aside className="hidden md:block">
        {sidebarContent}
      </aside>

      {/* Mobile drawer */}
      <div className="md:hidden">
        {/* Overlay */}
        <div
          className={cn(
            "fixed inset-0 z-40 bg-black/50 transition-opacity duration-300",
            isOpen ? "opacity-100" : "opacity-0 pointer-events-none"
          )}
          onClick={onClose}
          aria-hidden="true"
        />

        {/* Drawer */}
        <aside
          className={cn(
            "fixed inset-y-0 left-0 z-50 transform transition-transform duration-300 ease-in-out",
            isOpen ? "translate-x-0" : "-translate-x-full"
          )}
        >
          {sidebarContent}
        </aside>
      </div>
    </>
  );
}
