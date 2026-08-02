import { ResourceType } from "@syncfm/applemusic-api";
import { getClient } from "./client";
import { warn } from "@girae/common/logger";

interface ArtworkLike {
  url?: string;
}

export function resolveArtworkUrl(artwork: ArtworkLike | undefined, size: number): string | undefined {
  if (!artwork?.url) return undefined;
  return artwork.url.replace('{w}', String(size)).replace('{h}', String(size)).replace('{f}', 'jpg');
}

export interface AppleMusicSearchCandidate {
  id: string;
  name: string;
  artistName: string;
  artworkUrl?: string;
  releaseDate?: string;
}

function toCandidate(resource: { id: string; attributes: { name?: string; artistName?: string; artwork?: ArtworkLike; releaseDate?: string } }): AppleMusicSearchCandidate {
  return {
    id: resource.id,
    name: resource.attributes.name ?? '',
    artistName: resource.attributes.artistName ?? '',
    artworkUrl: resolveArtworkUrl(resource.attributes.artwork, 300),
    releaseDate: resource.attributes.releaseDate,
  };
}

// collapses Apple Music's separate clean/explicit resources down to one candidate
function dedupeCandidates(candidates: AppleMusicSearchCandidate[]): AppleMusicSearchCandidate[] {
  const seen = new Set<string>();
  const result: AppleMusicSearchCandidate[] = [];
  for (const c of candidates) {
    const key = `${c.name.trim().toLowerCase()}|${c.artistName.trim().toLowerCase()}|${c.releaseDate ?? ''}`;
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(c);
  }
  return result;
}

export async function searchAlbums(term: string): Promise<AppleMusicSearchCandidate[]> {
  try {
    const client = await getClient();
    const response = await client.Search.search({ term, types: [ResourceType.Albums] });
    return dedupeCandidates((response.results.albums?.data ?? []).map(toCandidate));
  } catch (e) {
    warn('apple-music', `searchAlbums(${term}) failed: ${e}`);
    return [];
  }
}

export async function searchSongs(term: string): Promise<AppleMusicSearchCandidate[]> {
  try {
    const client = await getClient();
    const response = await client.Search.search({ term, types: [ResourceType.Songs] });
    return dedupeCandidates((response.results.songs?.data ?? []).map(toCandidate));
  } catch (e) {
    warn('apple-music', `searchSongs(${term}) failed: ${e}`);
    return [];
  }
}
