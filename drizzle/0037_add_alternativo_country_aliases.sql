INSERT INTO discoteca_genre_aliases ("genreId", alias)
SELECT id, 'alt' FROM discoteca_genres WHERE name = 'Alternativo'
UNION ALL
SELECT id, 'alternative' FROM discoteca_genres WHERE name = 'Alternativo'
UNION ALL
SELECT id, 'folk' FROM discoteca_genres WHERE name = 'Alternativo'
UNION ALL
SELECT id, 'bluegrass' FROM discoteca_genres WHERE name = 'Country'
UNION ALL
SELECT id, 'americana' FROM discoteca_genres WHERE name = 'Country'
ON CONFLICT (alias) DO UPDATE SET "genreId" = EXCLUDED."genreId";
