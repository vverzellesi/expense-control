"use client";

// Re-export pro path histórico. A implementação real vive em
// @/contexts/SpacePermissionsContext pra compartilhar 1 fetch via Provider
// em toda página autenticada (evita duplicação no mount do Dashboard).
export { useSpacePermissions } from "@/contexts/SpacePermissionsContext";
