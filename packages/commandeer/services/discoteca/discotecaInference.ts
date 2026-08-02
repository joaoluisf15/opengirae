import { generateJson } from '@girae/common/mistral'

export async function inferDiscotecaRarity(
  name: string,
  artistName: string,
  type: 'single' | 'album',
  knownRarities: string[],
): Promise<string | null> {
  const system = 'Você avalia o impacto cultural de músicas/álbuns para atribuir uma raridade em um jogo de colecionáveis de música. Considere fama do artista, alcance comercial, prêmios e reconhecimento cultural duradouro. Responda apenas com uma das raridades conhecidas, escolhendo a mais adequada.'

  const fewShot = [
    { role: 'user' as const, content: 'Artista: The Beatles. Item (álbum): Abbey Road' },
    { role: 'assistant' as const, content: '{"rarity":"Lendário"}' },
    { role: 'user' as const, content: 'Artista: uma banda indie local desconhecida. Item (single): Demo Faixa 3' },
    { role: 'assistant' as const, content: '{"rarity":"Comum"}' },
  ]

  const result = await generateJson<{ rarity: string }>({
    logTag: 'discotecaInference',
    system,
    messages: [...fewShot, { role: 'user', content: `Artista: ${artistName}. Item (${type === 'album' ? 'álbum' : 'single'}): ${name}` }],
    responseSchema: {
      type: 'object',
      properties: { rarity: { type: 'string', enum: knownRarities } },
      required: ['rarity'],
    },
    maxOutputTokens: 50,
  })
  return result?.rarity ?? null
}
