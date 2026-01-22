"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import {
  LayoutDashboard,
  Receipt,
  Upload,
  CreditCard,
  Tags,
  BarChart3,
  Settings,
  RefreshCw,
  Trash2,
  FileText,
} from "lucide-react";

const navigation = [
  { name: "Dashboard", href: "/", icon: LayoutDashboard },
  { name: "Transações", href: "/transactions", icon: Receipt },
  { name: "Faturas", href: "/bills", icon: FileText },
  { name: "Recorrentes", href: "/recurring", icon: RefreshCw },
  { name: "Parcelas", href: "/installments", icon: CreditCard },
  { name: "Importar", href: "/import", icon: Upload },
  { name: "Categorias", href: "/categories", icon: Tags },
  { name: "Relatórios", href: "/reports", icon: BarChart3 },
  { name: "Lixeira", href: "/trash", icon: Trash2 },
];

export function Sidebar() {
  const pathname = usePathname();
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

  return (
    <div className="flex h-full w-64 flex-col border-r bg-white">
      <div className="flex h-16 items-center border-b px-6">
        <h1 className="text-xl font-bold text-gray-900">Finanças</h1>
      </div>
      <nav className="flex-1 space-y-1 px-3 py-4">
        {navigation.map((item) => {
          const isActive =
            pathname === item.href ||
            (item.href !== "/" && pathname.startsWith(item.href));
          const showAlertBadge = item.href === "/" && alertCount > 0;

          return (
            <Link
              key={item.name}
              href={item.href}
              className={cn(
                "flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
                isActive
                  ? "bg-gray-100 text-gray-900"
                  : "text-gray-600 hover:bg-gray-50 hover:text-gray-900"
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
          className="flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium text-gray-600 transition-colors hover:bg-gray-50 hover:text-gray-900"
        >
          <Settings className="h-5 w-5" />
          Configurações
        </Link>
      </div>
    </div>
  );
}
