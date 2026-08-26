export type ResourceType = "equipamento" | "tanque" | "produto" | "custom_sheet";

type ResourcePermsState = {
  isAdmin: boolean;
  loading: boolean;
  allowed: (type: ResourceType, id: string) => boolean;
  filter: <T extends { id: string }>(type: ResourceType, rows: T[] | undefined | null) => T[];
};

/**
 * Permissões por recurso liberadas: todo usuário autenticado vê todos os
 * recursos da sua empresa (isolamento garantido pelo RLS multitenant).
 */
export function useResourcePermissions(): ResourcePermsState {
  return {
    isAdmin: true,
    loading: false,
    allowed: () => true,
    filter: (_type, rows) => rows ?? [],
  };
}
