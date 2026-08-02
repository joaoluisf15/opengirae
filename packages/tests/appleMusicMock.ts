import { mock } from "bun:test"

// the only place that mocks this specifier - bun test shares one module registry per run
export interface AppleMusicMockState {
  shouldThrow: boolean
  searchResult: { results: any }
  albumResult: { data: any[] }
  songResult: { data: any[] }
  lastSongParams: any
}

const state: AppleMusicMockState = {
  shouldThrow: false,
  searchResult: { results: {} },
  albumResult: { data: [] },
  songResult: { data: [] },
  lastSongParams: null,
}

mock.module("@syncfm/applemusic-api", () => ({
  AuthType: { Scraped: 0 },
  Region: { US: 'us' },
  ResourceType: { Albums: 'albums', Songs: 'songs' },
  AlbumsEndpointTypes: { IncludeOption: { Tracks: 'tracks', Artists: 'artists' } },
  SongsEndpointTypes: { IncludeOption: { Albums: 'albums', Artists: 'artists' } },
  AppleMusic: class {
    Search = { search: async () => { if (state.shouldThrow) throw new Error('boom'); return state.searchResult } }
    Albums = { get: async () => { if (state.shouldThrow) throw new Error('boom'); return state.albumResult } }
    Songs = { get: async (params: any) => { state.lastSongParams = params; if (state.shouldThrow) throw new Error('boom'); return state.songResult } }
    async init() {}
  },
}))

export function mockAppleMusic(): AppleMusicMockState {
  return state
}
