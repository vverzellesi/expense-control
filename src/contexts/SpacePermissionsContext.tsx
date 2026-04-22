"use client";

import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";

export type Permissions = {
  canViewTransactions: boolean;
  canEditTransactions: boolean;
  canViewAllTransactions: boolean;
  canViewInvestments: boolean;
  canViewBudgets: boolean;
  canManageSpace: boolean;
  canViewIncomes: boolean;
  isSpaceContext: boolean;
  role: string | null;
};

export type PermissionsState = Permissions & { loading: boolean };

const DEFAULT_PERMISSIONS: Permissions = {
  canViewTransactions: true,
  canEditTransactions: true,
  canViewAllTransactions: true,
  canViewInvestments: true,
  canViewBudgets: true,
  canManageSpace: false,
  canViewIncomes: true,
  isSpaceContext: false,
  role: null,
};

// null = sem Provider no ancestral (fallback silencioso pro hook).
const SpacePermissionsContext = createContext<PermissionsState | null>(null);

export function SpacePermissionsProvider({ children }: { children: ReactNode }) {
  const [permissions, setPermissions] = useState<Permissions>(DEFAULT_PERMISSIONS);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/spaces/active/permissions")
      .then((res) => {
        if (!res.ok) throw new Error("Failed to fetch permissions");
        return res.json();
      })
      .then(setPermissions)
      .catch(() => {
        // Mantém defaults em caso de erro.
      })
      .finally(() => setLoading(false));
  }, []);

  return (
    <SpacePermissionsContext.Provider value={{ ...permissions, loading }}>
      {children}
    </SpacePermissionsContext.Provider>
  );
}

// Hook compartilhado por todas as páginas autenticadas. Se chamado fora do
// Provider (ex: em testes que não montam o AppLayout), retorna os defaults
// com loading=false pra não travar a UI.
export function useSpacePermissions(): PermissionsState {
  const ctx = useContext(SpacePermissionsContext);
  if (ctx !== null) return ctx;
  return { ...DEFAULT_PERMISSIONS, loading: false };
}
