INSERT INTO discoteca_genre_aliases ("genreId", alias)
SELECT id, 'electronic' FROM discoteca_genres WHERE name = 'Eletrônica'
ON CONFLICT (alias) DO UPDATE SET "genreId" = EXCLUDED."genreId";
