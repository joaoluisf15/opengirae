INSERT INTO discoteca_genres (name) VALUES
  ('Pop'),
  ('K-Pop'),
  ('J-Pop'),
  ('C-Pop'),
  ('V-Pop'),
  ('Thai-Pop'),
  ('Soundtracks'),
  ('Alternativo'),
  ('Punk/Rock'),
  ('R&B/Soul'),
  ('Jazz'),
  ('Latin/Reggaeton'),
  ('Funk'),
  ('Samba/Pagode'),
  ('MPB'),
  ('Sertanejo'),
  ('Hip-Hop/Rap'),
  ('Música Religiosa'),
  ('Country'),
  ('Eletrônica')
ON CONFLICT DO NOTHING;
--> statement-breakpoint
INSERT INTO discoteca_subcategories ("genreId", "isAlbum", name, emoji)
SELECT id, true, 'Álbuns de ' || name, '💽' FROM discoteca_genres
ON CONFLICT DO NOTHING;
--> statement-breakpoint
INSERT INTO discoteca_subcategories ("genreId", "isAlbum", name, emoji)
SELECT id, false, 'Singles de ' || name, '🎵' FROM discoteca_genres
ON CONFLICT DO NOTHING;
--> statement-breakpoint
INSERT INTO discoteca_genre_aliases ("genreId", alias)
SELECT id, 'kpop' FROM discoteca_genres WHERE name = 'K-Pop'
UNION ALL
SELECT id, 'jpop' FROM discoteca_genres WHERE name = 'J-Pop'
UNION ALL
SELECT id, 'cpop' FROM discoteca_genres WHERE name = 'C-Pop'
UNION ALL
SELECT id, 'thaipop' FROM discoteca_genres WHERE name = 'Thai-Pop'
UNION ALL
SELECT id, 'tpop' FROM discoteca_genres WHERE name = 'Thai-Pop'
UNION ALL
SELECT id, 'vpop' FROM discoteca_genres WHERE name = 'V-Pop'
UNION ALL
SELECT id, 'soundtrack' FROM discoteca_genres WHERE name = 'Soundtracks'
ON CONFLICT (alias) DO UPDATE SET "genreId" = EXCLUDED."genreId";
