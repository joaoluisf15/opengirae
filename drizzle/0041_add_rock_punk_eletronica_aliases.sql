INSERT INTO discoteca_genre_aliases ("genreId", alias)
SELECT id, 'rock' FROM discoteca_genres WHERE name = 'Punk/Rock'
UNION ALL
SELECT id, 'punk' FROM discoteca_genres WHERE name = 'Punk/Rock'
UNION ALL
SELECT id, 'eletronica' FROM discoteca_genres WHERE name = 'Eletrônica'
UNION ALL
SELECT id, 'eletronico' FROM discoteca_genres WHERE name = 'Eletrônica'
ON CONFLICT (alias) DO UPDATE SET "genreId" = EXCLUDED."genreId";
