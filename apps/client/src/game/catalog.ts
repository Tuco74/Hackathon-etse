export interface PublicObject {
  id: string;
  name: string;
  category: string;
  silhouette: string;
  sprite: string;
  hints: string[];
}

export interface PublicCatalog {
  objects: PublicObject[];
}

/** Public names/icons only. Never contains values or rarity. */
export async function fetchPublicCatalog(url: string): Promise<PublicCatalog> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`No se pudo cargar el catálogo (${res.status})`);
  return (await res.json()) as PublicCatalog;
}
